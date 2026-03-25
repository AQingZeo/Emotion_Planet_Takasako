/**
 * Matrix display: valence (X) × activation (Y), billboard sprites from PNG data URLs.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { MatrixEntry } from '../data/types';
import { loadTextureAsync } from './textureFromDataUrl';

const MIN = -1;
const MAX = 1;
/** Dark enough to read on light background; drawn after sprites with depthTest off. */
const AXIS_COLOR = 0x1c1917;
const GRID_COLOR = 0xd6d3d1;
/** Depth separation along Z for entries sharing the same valence × activation (newer → more +Z). */
const Z_FROM_TIME_SPAN = 0.55;
const DEFAULT_SPRITE_SCALE = 0.22;

export interface MatrixView3DOptions {
  maxVisible?: number;
  spriteScale?: number;
}

export interface MatrixView3DHandle {
  setEntries(entries: MatrixEntry[]): void;
  getEntries(): MatrixEntry[];
  setOnEntryClick(handler: ((entryId: string) => void) | null): void;
  resize(w: number, h: number): void;
  render(): void;
  dispose(): void;
}

interface SpriteItem {
  entryId: string;
  sprite: THREE.Sprite;
  baseX: number;
  baseY: number;
  baseZ: number;
  phase: number;
}

export function createMatrixView3D(
  container: HTMLElement,
  options?: MatrixView3DOptions
): MatrixView3DHandle {
  const maxVisible = options?.maxVisible ?? 300;
  const spriteScale = options?.spriteScale ?? DEFAULT_SPRITE_SCALE;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafaf9);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0.15, 2.8);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const labelOverlay = document.createElement('div');
  labelOverlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
  container.appendChild(labelOverlay);
  const css2DRenderer = new CSS2DRenderer({ element: labelOverlay });
  css2DRenderer.setSize(container.clientWidth, container.clientHeight);

  const labelStyle =
    'color:#1c1917;font-size:11px;font-family:sans-serif;background:none;border:none;white-space:nowrap;';
  function makeLabel(text: string): THREE.Object3D & { element: HTMLDivElement; isCSS2DObject: true } {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = labelStyle;
    return new CSS2DObject(div) as THREE.Object3D & { element: HTMLDivElement; isCSS2DObject: true };
  }

  const labelNeg = makeLabel('Negative');
  labelNeg.position.set(MIN, 0, 0);
  scene.add(labelNeg);
  const labelPos = makeLabel('Positive');
  labelPos.position.set(MAX, 0, 0);
  scene.add(labelPos);
  const labelPassive = makeLabel('Passive');
  labelPassive.position.set(0, MIN, 0);
  scene.add(labelPassive);
  const labelActive = makeLabel('Active');
  labelActive.position.set(0, MAX, 0);
  scene.add(labelActive);

  const axisLabelValence = makeLabel('Valence →');
  axisLabelValence.position.set(0.35, -1.18, 0);
  scene.add(axisLabelValence);
  const axisLabelActivation = makeLabel('Activation ↑');
  axisLabelActivation.position.set(-1.2, 0.35, 0);
  scene.add(axisLabelActivation);

  const axisGeometry = new THREE.BufferGeometry();
  const axisPositions = new Float32Array([
    MIN, 0, 0, MAX, 0, 0,
    0, MIN, 0, 0, MAX, 0,
  ]);
  axisGeometry.setAttribute('position', new THREE.BufferAttribute(axisPositions, 3));
  const axisMaterial = new THREE.LineBasicMaterial({
    color: AXIS_COLOR,
    depthTest: false,
    depthWrite: false,
  });
  const axisLines = new THREE.LineSegments(axisGeometry, axisMaterial);
  axisLines.renderOrder = 100;

  const gridPoints: number[] = [];
  for (let t = MIN; t <= MAX; t += 0.5) {
    gridPoints.push(t, MIN, 0, t, MAX, 0);
    gridPoints.push(MIN, t, 0, MAX, t, 0);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMaterial = new THREE.LineBasicMaterial({
    color: GRID_COLOR,
    transparent: true,
    opacity: 0.75,
    depthTest: false,
    depthWrite: false,
  });
  const gridLines = new THREE.LineSegments(gridGeometry, gridMaterial);
  gridLines.renderOrder = 99;

  const spriteGroup = new THREE.Group();
  scene.add(spriteGroup);
  scene.add(gridLines);
  scene.add(axisLines);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.target.set(0, 0, 0);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let items: SpriteItem[] = [];
  let currentEntries: MatrixEntry[] = [];
  let onEntryClick: ((entryId: string) => void) | null = null;
  /** Cancels stale async texture loads when setEntries is called again quickly. */
  let entriesLoadGeneration = 0;

  function clearSprites(): void {
    for (const it of items) {
      spriteGroup.remove(it.sprite);
      const mat = it.sprite.material as THREE.SpriteMaterial;
      if (mat.map) mat.map.dispose();
      mat.dispose();
    }
    items = [];
  }

  function hashPhase(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
    return ((h >>> 0) % 1000) / 1000;
  }

  function zFromCreatedAt(iso: string, tMin: number, tMax: number, entryId: string): number {
    const t = new Date(iso).getTime();
    let z = 0;
    if (Number.isFinite(t) && tMax > tMin) {
      const u = (t - tMin) / (tMax - tMin);
      z = (u - 0.5) * Z_FROM_TIME_SPAN;
    }
    /** Tiny spread per entry so identical valence/activation/time still separate slightly in Z. */
    const jitter = (hashPhase(entryId) - 0.5) * 0.12;
    return z + jitter;
  }

  function setEntries(entries: MatrixEntry[]): void {
    const gen = ++entriesLoadGeneration;
    clearSprites();
    currentEntries = entries.slice(0, maxVisible);
    const times = currentEntries.map((e) => new Date(e.created_at).getTime());
    const finite = times.filter((x) => Number.isFinite(x));
    const tMin = finite.length ? Math.min(...finite) : 0;
    const tMax = finite.length ? Math.max(...finite) : 1;

    void (async () => {
      for (const e of currentEntries) {
        if (gen !== entriesLoadGeneration) return;
        const url = e.sprite_png_data_url?.trim();
        const urlOk =
          !!url &&
          (url.startsWith('data:') ||
            url.startsWith('http://') ||
            url.startsWith('https://') ||
            url.startsWith('blob:'));
        if (!urlOk) {
          console.warn('[matrixView3D] skip entry, bad sprite url', e.entry_id);
          continue;
        }
        try {
          const tex = await loadTextureAsync(url);
          if (gen !== entriesLoadGeneration) {
            tex.dispose();
            return;
          }
          const img = tex.image as HTMLImageElement | ImageBitmap | undefined;
          const iw =
            img && 'naturalWidth' in img ? img.naturalWidth : img && 'width' in img ? img.width : 0;
          if (!iw || iw <= 0) {
            console.warn('[matrixView3D] texture has no image data', e.entry_id);
            tex.dispose();
            continue;
          }
          const mat = new THREE.SpriteMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            opacity: 0.92,
          });
          const sprite = new THREE.Sprite(mat);
          const vx = THREE.MathUtils.clamp(e.valence, MIN, MAX);
          const vy = THREE.MathUtils.clamp(e.activation, MIN, MAX);
          const vz = zFromCreatedAt(e.created_at, tMin, tMax, e.entry_id);
          sprite.position.set(vx, vy, vz);
          sprite.scale.set(spriteScale, spriteScale, spriteScale);
          sprite.userData.entryId = e.entry_id;
          spriteGroup.add(sprite);
          items.push({
            entryId: e.entry_id,
            sprite,
            baseX: vx,
            baseY: vy,
            baseZ: vz,
            phase: hashPhase(e.entry_id) * Math.PI * 2,
          });
        } catch (err) {
          console.warn('[matrixView3D] sprite load failed', e.entry_id, err);
        }
      }
    })();
  }

  function setOnEntryClick(handler: ((entryId: string) => void) | null): void {
    onEntryClick = handler;
  }

  function pick(clientX: number, clientY: number): string | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const sprites = items.map((i) => i.sprite);
    const hits = raycaster.intersectObjects(sprites, false);
    if (hits.length === 0) return null;
    const id = hits[0].object.userData.entryId as string | undefined;
    return id ?? null;
  }

  renderer.domElement.addEventListener('click', (ev: MouseEvent) => {
    if (!onEntryClick) return;
    const id = pick(ev.clientX, ev.clientY);
    if (id) onEntryClick(id);
  });

  function tick(): void {
    const t = performance.now() / 1000;
    for (const it of items) {
      const wobble = 0.02 * Math.sin(t * 1.2 + it.phase);
      it.sprite.position.x = it.baseX + wobble;
      it.sprite.position.y = it.baseY + 0.015 * Math.sin(t * 0.9 + it.phase * 1.3);
      it.sprite.position.z = it.baseZ + 0.012 * Math.sin(t * 1.05 + it.phase * 0.7);
      const mat = it.sprite.material as THREE.SpriteMaterial;
      mat.opacity = 0.92;
    }
  }

  function render(): void {
    tick();
    controls.update();
    renderer.render(scene, camera);
    css2DRenderer.render(scene, camera);
  }

  function resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    css2DRenderer.setSize(w, h);
  }

  function dispose(): void {
    entriesLoadGeneration += 1;
    controls.dispose();
    clearSprites();
    renderer.dispose();
    axisGeometry.dispose();
    axisMaterial.dispose();
    gridGeometry.dispose();
    gridMaterial.dispose();
    if (labelOverlay.parentElement) labelOverlay.parentElement.removeChild(labelOverlay);
    if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
  }

  return {
    setEntries,
    getEntries: () => currentEntries.slice(),
    setOnEntryClick,
    resize,
    render,
    dispose,
  };
}
