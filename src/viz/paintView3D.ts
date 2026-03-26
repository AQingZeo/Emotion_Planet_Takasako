/**
 * 3D paint viewer: GLB blob + terrain, UV paint (left drag); orbit (middle drag); wheel zoom.
 */

import * as THREE from 'three';
import { MOUSE } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getEmotionArchetype } from '../config/emotions';
import { loadGlb } from './glbLoader';
import { applyPaintTextureToMeshes, PaintSystem } from './paintSystem';
import { frameCameraToObject } from './cameraFraming';
import { cropDataUrlToOpaqueBounds, sanitizeSpriteAlpha } from '../util/cropAlphaImage';
import { BLOB_SCENE_Y, TERRAIN_SCENE_Y } from './sceneLayout';

const FIT_SIZE = 1.35;

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

export interface PaintView3DOptions {
  /** Unused: idle spin removed so orbit/paint feel predictable. */
  idleRotateSpeed?: number;
}

export interface PaintView3DHandle {
  readonly domElement: HTMLElement;
  setPaintingEnabled(on: boolean): void;
  isPaintingEnabled(): boolean;
  loadEmotionArchetype(emotionId: string): Promise<void>;
  getBlobPaintDataUrl(): string;
  getTerrainPaintDataUrl(): string;
  setBrushRadius(radiusPx: number): void;
  setBrushColor(hex: string): void;
  setBaseColor(hex: string): void;
  undo(): void;
  clearPaint(): void;
  /** Remove blob/terrain models and paint layers (empty canvas until next load). */
  clearScene(): void;
  resize(): void;
  dispose(): void;
  getScene(): THREE.Scene;
  getBlobRoot(): THREE.Group | null;
  getTerrainRoot(): THREE.Group | null;
  getCamera(): THREE.PerspectiveCamera;
  getRenderer(): THREE.WebGLRenderer;
  captureBlobSpriteDataUrl(): Promise<string>;
}

export function createPaintView3D(
  container: HTMLElement,
  _options?: PaintView3DOptions
): PaintView3DHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfafafa);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
  camera.position.set(0.85, 0.55, 2.1);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    /** Improves PNG readback with transparent clear (avoids all-black sprite when alpha is misinterpreted). */
    premultipliedAlpha: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xfafafa, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.78));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a8, 0.35));
  const key = new THREE.DirectionalLight(0xffffff, 1.45);
  key.position.set(2.2, 3.8, 2.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.52);
  fill.position.set(-2.2, 1.8, -1.2);
  scene.add(fill);

  const root = new THREE.Group();
  scene.add(root);

  let blobRoot: THREE.Group | null = null;
  let terrainRoot: THREE.Group | null = null;
  let blobMeshes: THREE.Mesh[] = [];
  let terrainMeshes: THREE.Mesh[] = [];

  let blobPaint: PaintSystem | null = null;
  let terrainPaint: PaintSystem | null = null;

  let paintingEnabled = true;
  let isDraggingPaint = false;
  let lastInteract = performance.now();
  const paintHistory: Array<'blob' | 'terrain'> = [];

  let lastStroke: { u: number; v: number; mesh: THREE.Mesh; kind: 'blob' | 'terrain' } | null = null;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 0.05, 0);
  controls.minDistance = 0.45;
  controls.maxDistance = 12;
  controls.enableRotate = true;
  controls.enablePan = false;
  /** Wheel uses custom dolly; Orbit only rotates (middle button). */
  controls.enableZoom = false;
  controls.enabled = true;
  /** Left = paint only; middle = orbit (see OrbitControls default switch + MOUSE). */
  const NO_MOUSE_ACTION = 4;
  controls.mouseButtons = {
    LEFT: NO_MOUSE_ACTION,
    MIDDLE: MOUSE.ROTATE,
    RIGHT: NO_MOUSE_ACTION,
  };

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function syncPointer(clientX: number, clientY: number): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function paintFromEvent(clientX: number, clientY: number): void {
    if (!paintingEnabled || (!blobPaint && !terrainPaint)) return;
    syncPointer(clientX, clientY);
    raycaster.setFromCamera(pointer, camera);
    const candidates = [...blobMeshes, ...terrainMeshes];
    const hits = raycaster.intersectObjects(candidates, true);
    if (hits.length === 0) return;
    const hit = hits[0];
    if (!hit.uv) return;
    const uv = hit.uv;
    const mesh = hit.object instanceof THREE.Mesh ? hit.object : null;
    if (!mesh) return;

    if (blobMeshes.includes(mesh) && blobPaint) {
      if (
        lastStroke &&
        lastStroke.kind === 'blob' &&
        lastStroke.mesh === mesh &&
        blobPaint
      ) {
        blobPaint.paintSegmentUv(lastStroke.u, lastStroke.v, uv.x, uv.y);
        paintHistory.push('blob');
      } else {
        blobPaint.paintAtUv(uv.x, uv.y);
        paintHistory.push('blob');
      }
      lastStroke = { u: uv.x, v: uv.y, mesh, kind: 'blob' };
    } else if (terrainMeshes.includes(mesh) && terrainPaint) {
      if (
        lastStroke &&
        lastStroke.kind === 'terrain' &&
        lastStroke.mesh === mesh &&
        terrainPaint
      ) {
        terrainPaint.paintSegmentUv(lastStroke.u, lastStroke.v, uv.x, uv.y);
        paintHistory.push('terrain');
      } else {
        terrainPaint.paintAtUv(uv.x, uv.y);
        paintHistory.push('terrain');
      }
      lastStroke = { u: uv.x, v: uv.y, mesh, kind: 'terrain' };
    }
  }

  function onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !paintingEnabled) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    isDraggingPaint = true;
    lastInteract = performance.now();
    lastStroke = null;
    paintFromEvent(e.clientX, e.clientY);
  }

  function onPointerMove(e: PointerEvent): void {
    if (!isDraggingPaint) return;
    lastInteract = performance.now();
    paintFromEvent(e.clientX, e.clientY);
  }

  function onPointerUp(e: PointerEvent): void {
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    isDraggingPaint = false;
    lastStroke = null;
  }

  function onWheelZoom(e: WheelEvent): void {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.07 : 0.93;
    const offset = camera.position.clone().sub(controls.target);
    let dist = offset.length() * factor;
    dist = Math.max(controls.minDistance, Math.min(controls.maxDistance, dist));
    offset.normalize().multiplyScalar(dist);
    camera.position.copy(controls.target.clone().add(offset));
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', onPointerUp);
  renderer.domElement.addEventListener('wheel', onWheelZoom, { passive: false });

  let raf = 0;
  function animate(): void {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.setClearColor(0xfafafa, 1);
    renderer.render(scene, camera);
  }
  animate();

  /** Tight margin so matrix billboard is mostly blob; 2D crop removes empty transparent margins. */
  const SPRITE_CAPTURE_MARGIN = 1.12;
  /** Opaque greenscreen; post-process removes key color connected to edges (see cropAlphaImage). */
  const GREENSCREEN = 0x00ff00;

  async function captureBlobSpriteDataUrl(): Promise<string> {
    if (!blobRoot || !terrainRoot) return '';
    const prevVis = terrainRoot.visible;
    const prevBg = scene.background;
    const prevClear = new THREE.Color();
    renderer.getClearColor(prevClear);
    const prevAlpha = renderer.getClearAlpha();
    const prevShadowMap = renderer.shadowMap.enabled;
    const prevKeyCast = key.castShadow;

    terrainRoot.visible = false;
    scene.background = new THREE.Color(GREENSCREEN);
    renderer.setClearColor(GREENSCREEN, 1);
    renderer.shadowMap.enabled = false;
    key.castShadow = false;

    const prevPos = camera.position.clone();
    const prevQuat = camera.quaternion.clone();
    const prevTarget = controls.target.clone();
    const prevNear = camera.near;
    const prevFar = camera.far;

    blobRoot.updateMatrixWorld(true);
    frameCameraToObject(camera, controls, blobRoot, SPRITE_CAPTURE_MARGIN);

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    renderer.render(scene, camera);
    const gl = renderer.getContext() as WebGLRenderingContext | WebGL2RenderingContext;
    gl?.finish?.();
    const rawUrl = renderer.domElement.toDataURL('image/png');
    const cleaned = await sanitizeSpriteAlpha(rawUrl);
    const url = await cropDataUrlToOpaqueBounds(cleaned);

    terrainRoot.visible = prevVis;
    scene.background = prevBg;
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.enabled = prevShadowMap;
    key.castShadow = prevKeyCast;
    camera.position.copy(prevPos);
    camera.quaternion.copy(prevQuat);
    camera.near = prevNear;
    camera.far = prevFar;
    camera.updateProjectionMatrix();
    controls.target.copy(prevTarget);
    controls.update();

    return url;
  }

  function clearSceneModels(): void {
    if (blobPaint) {
      blobPaint.dispose();
      blobPaint = null;
    }
    if (terrainPaint) {
      terrainPaint.dispose();
      terrainPaint = null;
    }
    if (blobRoot) {
      root.remove(blobRoot);
      blobRoot.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose();
        }
      });
      blobRoot = null;
    }
    if (terrainRoot) {
      root.remove(terrainRoot);
      terrainRoot.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const m = o.material;
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose();
        }
      });
      terrainRoot = null;
    }
    blobMeshes = [];
    terrainMeshes = [];
    lastStroke = null;
    paintHistory.length = 0;
  }

  async function loadEmotionArchetype(emotionId: string): Promise<void> {
    const arch = getEmotionArchetype(emotionId);
    if (!arch) throw new Error(`Unknown emotion id: ${emotionId}`);

    clearSceneModels();

    const [blobLoaded, terrainLoaded] = await Promise.all([
      loadGlb(arch.blobModel, 'blob'),
      loadGlb(arch.terrainModel, 'terrain'),
    ]);

    blobRoot = blobLoaded.scene;
    terrainRoot = terrainLoaded.scene;
    blobMeshes = blobLoaded.meshes;
    terrainMeshes = terrainLoaded.meshes;
    if (blobMeshes.length === 0) {
      console.warn('[paintView3D] blob.glb has no mesh objects; scene may be empty or use unsupported types.');
    }
    if (terrainMeshes.length === 0) {
      console.warn('[paintView3D] terrain.glb has no mesh objects.');
    }

    blobRoot.name = 'blob';
    terrainRoot.name = 'terrain';

    fitObjectToUnit(blobRoot, FIT_SIZE);
    fitObjectToUnit(terrainRoot, FIT_SIZE * 1.25);

    blobRoot.position.set(0, BLOB_SCENE_Y, 0);
    terrainRoot.position.set(0, TERRAIN_SCENE_Y, 0);

    root.add(blobRoot);
    root.add(terrainRoot);

    blobPaint = new PaintSystem({ brushRadiusScale: 2.6 });
    /** Planar terrain UV spreads strokes; slightly larger + segment fill helps continuity. */
    terrainPaint = new PaintSystem({ brushRadiusScale: 2.1 });
    paintHistory.length = 0;
    applyPaintTextureToMeshes(blobMeshes, blobPaint.texture);
    applyPaintTextureToMeshes(terrainMeshes, terrainPaint.texture);

    resize();
    /** Slightly tighter than default 1.5 — closer framing on the input canvas. */
    frameCameraToObject(camera, controls, root, 1.28);
    lastInteract = performance.now();
  }

  function resize(): void {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  resize();

  return {
    domElement: container,
    setPaintingEnabled(on: boolean): void {
      paintingEnabled = on;
    },
    isPaintingEnabled(): boolean {
      return paintingEnabled;
    },
    loadEmotionArchetype,
    getBlobPaintDataUrl(): string {
      return blobPaint?.getDataUrl() ?? '';
    },
    getTerrainPaintDataUrl(): string {
      return terrainPaint?.getDataUrl() ?? '';
    },
    setBrushRadius(r: number): void {
      blobPaint?.setBrushSize(r);
      terrainPaint?.setBrushSize(r);
    },
    setBrushColor(hex: string): void {
      blobPaint?.setBrushColor(hex);
      terrainPaint?.setBrushColor(hex);
    },
    setBaseColor(hex: string): void {
      blobPaint?.setBaseColor(hex);
      terrainPaint?.setBaseColor(hex);
    },
    undo(): void {
      const last = paintHistory.pop();
      if (last === 'blob') blobPaint?.undo();
      else if (last === 'terrain') terrainPaint?.undo();
    },
    clearPaint(): void {
      paintHistory.length = 0;
      blobPaint?.clearToNeutral();
      terrainPaint?.clearToNeutral();
    },
    clearScene(): void {
      clearSceneModels();
      resize();
    },
    resize,
    dispose(): void {
      cancelAnimationFrame(raf);
      controls.dispose();
      clearSceneModels();
      renderer.dispose();
      renderer.domElement.removeEventListener('wheel', onWheelZoom);
      if (renderer.domElement.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement);
      }
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', onPointerUp);
    },
    getScene(): THREE.Scene {
      return scene;
    },
    getBlobRoot(): THREE.Group | null {
      return blobRoot;
    },
    getTerrainRoot(): THREE.Group | null {
      return terrainRoot;
    },
    getCamera(): THREE.PerspectiveCamera {
      return camera;
    },
    getRenderer(): THREE.WebGLRenderer {
      return renderer;
    },
    captureBlobSpriteDataUrl,
  };
}
