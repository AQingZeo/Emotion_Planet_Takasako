/**
 * Small terrain-only preview for input screen: top-right decorative overview (non-paintable).
 */

import * as THREE from 'three';
import { MOUSE } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getEmotionArchetype } from '../config/emotions';
import { loadGlb } from './glbLoader';
import { applyHeightRampColorToMeshes } from './paintSystem';

const PREVIEW_TERRAIN_SCALE = 2.5;
const CAMERA_DIR = new THREE.Vector3(.8, .8, 1.0).normalize();
const PREVIEW_MARGIN = 1.12;
const PREVIEW_DISTANCE_MULTIPLIER = 0.8;

function fitObjectToUnit(group: THREE.Object3D, targetMax: number): void {
  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  const s = targetMax / maxDim;
  group.scale.setScalar(s);
  group.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(group);
  const c = new THREE.Vector3();
  box2.getCenter(c);
  group.position.sub(c);
}

export interface TerrainPreview3DHandle {
  readonly domElement: HTMLElement;
  loadEmotionArchetype(emotionId: string): Promise<void>;
  setBaseColor(hex: string): void;
  resize(): void;
  clearScene(): void;
  dispose(): void;
}

export function createTerrainPreview3D(container: HTMLElement): TerrainPreview3DHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f4);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 80);
  camera.position.set(1.2, 1.8, 1.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf5f5f4, 1);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.82));
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8b0a8, 0.4);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(2.4, 3.8, 2.8);
  scene.add(key);

  const root = new THREE.Group();
  scene.add(root);
  let terrainRoot: THREE.Group | null = null;
  let terrainMeshes: THREE.Mesh[] = [];
  let terrainBaseColor = '#5F9569';

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enabled = true;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.enableZoom = false;
  const NO_MOUSE_ACTION = 4;
  controls.mouseButtons = {
    LEFT: NO_MOUSE_ACTION,
    MIDDLE: MOUSE.ROTATE,
    RIGHT: NO_MOUSE_ACTION,
  };

  function frameTerrainCamera(): void {
    if (!terrainRoot) return;
    terrainRoot.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(terrainRoot);
    if (box.isEmpty()) return;
    const center = new THREE.Vector3();
    box.getCenter(center);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const radius = Math.max(0.05, sphere.radius);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const fitFov = Math.min(vFov, hFov);
    const dist = ((radius * PREVIEW_MARGIN) / Math.tan(fitFov / 2)) * PREVIEW_DISTANCE_MULTIPLIER;
    camera.position.copy(center.clone().add(CAMERA_DIR.clone().multiplyScalar(dist)));
    camera.near = Math.max(0.01, dist * 0.01);
    camera.far = Math.max(80, dist * 20);
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
  }

  function resize(): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    frameTerrainCamera();
  }

  let raf = 0;
  function animate(): void {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function clearScene(): void {
    if (!terrainRoot) {
      terrainMeshes = [];
      return;
    }
    root.remove(terrainRoot);
    terrainRoot.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry?.dispose();
        const mat = o.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      }
    });
    terrainRoot = null;
    terrainMeshes = [];
  }

  async function loadEmotionArchetype(emotionId: string): Promise<void> {
    const arch = getEmotionArchetype(emotionId);
    if (!arch) throw new Error(`Unknown emotion id: ${emotionId}`);
    clearScene();
    const loaded = await loadGlb(arch.terrainModel, 'terrain');
    terrainRoot = loaded.scene;
    terrainMeshes = loaded.meshes;
    fitObjectToUnit(terrainRoot, PREVIEW_TERRAIN_SCALE);
    terrainRoot.position.set(0, 0, 0);
    root.add(terrainRoot);
    applyHeightRampColorToMeshes(terrainMeshes, terrainBaseColor);
    resize();
    frameTerrainCamera();
  }

  resize();

  return {
    domElement: container,
    loadEmotionArchetype,
    setBaseColor(hex: string): void {
      terrainBaseColor = hex;
      applyHeightRampColorToMeshes(terrainMeshes, terrainBaseColor);
    },
    resize,
    clearScene,
    dispose(): void {
      cancelAnimationFrame(raf);
      controls.dispose();
      clearScene();
      renderer.dispose();
      if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
    },
  };
}
