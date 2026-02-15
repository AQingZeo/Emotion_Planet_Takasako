/**
 * 3D axis view: valence, arousal, maturity. Equal scale -1..1 on X, Y, Z.
 * X = arousal, Y = valence, Z = maturity. OrbitControls for rotation.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import type { EmotionState } from '../state/store';

const MIN = -1;
const MAX = 1;
const AXIS_COLOR = 0x444444;
const GRID_COLOR = 0xeeeeee;

export interface AxisView3DHandle {
  setBlobPositions(meshes: THREE.Mesh[], states: EmotionState[]): void;
  resize(w: number, h: number): void;
  render(): void;
  /** Returns blob index under (clientX, clientY) or null. */
  pick(clientX: number, clientY: number): number | null;
  dispose(): void;
}

export function initAxis3D(container: HTMLElement): AxisView3DHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafaf9);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(1.7, 1.7, 1.7);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

  const labelStyle = 'color:#1c1917;font-size:11px;font-family:sans-serif;background:none;border:none;white-space:nowrap;';
  function makeLabel(text: string): THREE.Object3D & { element: HTMLDivElement; isCSS2DObject: true } {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.cssText = labelStyle;
    return new CSS2DObject(div) as THREE.Object3D & { element: HTMLDivElement; isCSS2DObject: true };
  }
  const labelArousalNeg = makeLabel('Negative');
  labelArousalNeg.position.set(MIN, 0, 0);
  scene.add(labelArousalNeg);
  const labelArousalPos = makeLabel('Positive');
  labelArousalPos.position.set(MAX, 0, 0);
  scene.add(labelArousalPos);
  const labelValenceNeg = makeLabel('Passive');
  labelValenceNeg.position.set(0, MIN, 0);
  scene.add(labelValenceNeg);
  const labelValencePos = makeLabel('Active');
  labelValencePos.position.set(0, MAX, 0);
  scene.add(labelValencePos);
  const labelMaturityNeg = makeLabel('Young');
  labelMaturityNeg.position.set(0, 0, MIN);
  scene.add(labelMaturityNeg);
  const labelMaturityPos = makeLabel('Mature');
  labelMaturityPos.position.set(0, 0, MAX);
  scene.add(labelMaturityPos);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 0, 0);

  // Axis lines: X (arousal), Y (valence), Z (maturity), each -1..1
  const axisGeometry = new THREE.BufferGeometry();
  const axisPositions = new Float32Array([
    MIN, 0, 0, MAX, 0, 0,
    0, MIN, 0, 0, MAX, 0,
    0, 0, MIN, 0, 0, MAX,
  ]);
  axisGeometry.setAttribute('position', new THREE.BufferAttribute(axisPositions, 3));
  axisGeometry.computeBoundingSphere();
  const axisMaterial = new THREE.LineBasicMaterial({ color: AXIS_COLOR, linewidth: 1 });
  const axisLines = new THREE.LineSegments(axisGeometry, axisMaterial);
  scene.add(axisLines);

  // Optional grid in XZ plane (arousal × maturity) at Y=0
  const gridStep = 0.5;
  const gridPoints: number[] = [];
  for (let t = MIN; t <= MAX; t += gridStep) {
    gridPoints.push(t, 0, MIN, t, 0, MAX);
    gridPoints.push(MIN, 0, t, MAX, 0, t);
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(gridPoints, 3));
  const gridMaterial = new THREE.LineBasicMaterial({ color: GRID_COLOR, transparent: true, opacity: 0.5 });
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
  scene.add(grid);

  const blobGroup = new THREE.Group();
  scene.add(blobGroup);

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function setBlobPositions(meshes: THREE.Mesh[], states: EmotionState[]): void {
    blobGroup.clear();
    meshes.forEach((mesh, i) => {
      const state = states[i];
      if (state) {
        const a = Number(state.arousal);
        const v = Number(state.valence);
        const m = Number(state.maturity ?? 0);
        mesh.position.set(a, v, m);
        (mesh as THREE.Mesh & { userData: { blobIndex?: number } }).userData.blobIndex = i;
        blobGroup.add(mesh);
      }
    });
  }

  function resize(w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    css2DRenderer.setSize(w, h);
  }

  function render(): void {
    controls.update();
    renderer.render(scene, camera);
    css2DRenderer.render(scene, camera);
  }

  function pick(clientX: number, clientY: number): number | null {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = blobGroup.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh) as THREE.Mesh[];
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;
    const first = hits[0];
    const obj = first.object as THREE.Mesh & { userData: { blobIndex?: number } };
    return obj.userData?.blobIndex ?? null;
  }

  function dispose(): void {
    controls.dispose();
    renderer.dispose();
    axisGeometry.dispose();
    axisMaterial.dispose();
    gridGeometry.dispose();
    gridMaterial.dispose();
    if (labelOverlay.parentElement) labelOverlay.parentElement.removeChild(labelOverlay);
    if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
  }

  return { setBlobPositions, resize, render, pick, dispose };
}
