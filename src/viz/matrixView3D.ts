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
/** Axis lines (X/Y/Z); grey so sprites stay visually primary. */
const AXIS_COLOR = 0xa8a29e;
const DEFAULT_SPRITE_SCALE = 0.22;
/** Canvas / scene background (matches installation shell). */
const MATRIX_SCENE_BG = 0xfffbf7;
/** Subtle Z spread so same-second entries remain pickable. */
const Z_TIME_JITTER = 0.05;
const HALF_DAY_MS = 12 * 60 * 60 * 1000;

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
  scene.background = new THREE.Color(MATRIX_SCENE_BG);

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

  function makeCornerLabel(
    ja: string,
    en: string
  ): THREE.Object3D & { element: HTMLDivElement; isCSS2DObject: true } {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;line-height:1.25;background:none;border:none;white-space:normal;max-width:8em;';
    const top = document.createElement('div');
    top.textContent = ja;
    top.style.cssText =
      'font-size:16px;font-weight:600;color:#1c1917;font-family:var(--font-display);letter-spacing:0.02em;';
    const bottom = document.createElement('div');
    bottom.textContent = en;
    bottom.style.cssText =
      'margin-top:3px;font-size:13px;font-weight:500;color:#57534e;font-family:var(--font-secondary);';
    wrap.appendChild(top);
    wrap.appendChild(bottom);
    return new CSS2DObject(wrap) as THREE.Object3D & { element: HTMLDivElement; isCSS2DObject: true };
  }

  const labelNeg = makeCornerLabel('ネガティブ', 'Negative');
  labelNeg.position.set(MIN, 0, 0);
  scene.add(labelNeg);
  const labelPos = makeCornerLabel('ポジティブ', 'Positive');
  labelPos.position.set(MAX, 0, 0);
  scene.add(labelPos);
  const labelPassive = makeCornerLabel('パッシブ', 'Passive');
  labelPassive.position.set(0, MIN, 0);
  scene.add(labelPassive);
  const labelActive = makeCornerLabel('アクティブ', 'Active');
  labelActive.position.set(0, MAX, 0);
  scene.add(labelActive);

  /** Time (Z) axis: label at +Z end, slight XY nudge so text doesn’t sit exactly on the line origin. */
  const labelTime = makeCornerLabel('時間', 'Time');
  labelTime.position.set(0.04, -0.05, MAX);
  scene.add(labelTime);

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

  const zAxisGeometry = new THREE.BufferGeometry();
  /** Same span as X and Y axes (MIN→MAX = length 2). */
  const zAxisPositions = new Float32Array([0, 0, MIN, 0, 0, MAX]);
  zAxisGeometry.setAttribute('position', new THREE.BufferAttribute(zAxisPositions, 3));
  const zAxisMaterial = new THREE.LineBasicMaterial({
    color: AXIS_COLOR,
    depthTest: false,
    depthWrite: false,
  });
  const zAxisLines = new THREE.LineSegments(zAxisGeometry, zAxisMaterial);
  zAxisLines.renderOrder = 100;

  const spriteGroup = new THREE.Group();
  scene.add(spriteGroup);
  scene.add(axisLines);
  scene.add(zAxisLines);

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

  /**
   * Local time mapped to [0,1) over one 12h cycle: same Z at 00:00 and 12:00, 06:00 and 18:00, etc.
   * Viewer timezone. Full Z span = 12 wall-clock hours (repeats twice per calendar day).
   */
  function fractionOfLocal12h(iso: string): number {
    const d = new Date(iso);
    const t = d.getTime();
    if (!Number.isFinite(t)) return 0.5;
    const msIntoDay =
      d.getHours() * 3600000 +
      d.getMinutes() * 60000 +
      d.getSeconds() * 1000 +
      d.getMilliseconds();
    const u = (msIntoDay % HALF_DAY_MS) / HALF_DAY_MS;
    return THREE.MathUtils.clamp(u, 0, 1);
  }

  /** Z = time axis: 12h period → MIN (-1)…MAX (+1), plus tiny jitter. */
  function zFromCreatedAt(iso: string, entryId: string): number {
    const u = fractionOfLocal12h(iso);
    const baseZ = MIN + u * (MAX - MIN);
    const jitter = (hashPhase(entryId) - 0.5) * 2 * Z_TIME_JITTER;
    return THREE.MathUtils.clamp(baseZ + jitter, MIN, MAX);
  }

  function setEntries(entries: MatrixEntry[]): void {
    const gen = ++entriesLoadGeneration;
    clearSprites();
    currentEntries = entries.slice(0, maxVisible);

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
          const vz = zFromCreatedAt(e.created_at, e.entry_id);
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
    zAxisGeometry.dispose();
    zAxisMaterial.dispose();
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
