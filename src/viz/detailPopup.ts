/**
 * Lazy-loaded detail overlay: GLB + painted textures + text (matrix screen).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SubmissionRecord } from '../data/types';
import { loadGlb } from './glbLoader';
import { applyPaintTextureToMeshes } from './paintSystem';
import { getEmotionArchetype } from '../config/emotions';
import { loadTextureAsync } from './textureFromDataUrl';
import { frameCameraToObject } from './cameraFraming';
import { BLOB_SCENE_Y, TERRAIN_SCENE_Y } from './sceneLayout';

const FIT_SIZE = 1.35;

function formatSubmissionTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

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

export interface DetailPopupHandle {
  show(record: SubmissionRecord): Promise<void>;
  hide(): void;
  dispose(): void;
}

export function createDetailPopup(): DetailPopupHandle {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'display:none;position:fixed;inset:0;z-index:100;background:rgba(28,25,23,0.45);align-items:center;justify-content:center;padding:24px;box-sizing:border-box;';

  const panel = document.createElement('div');
  panel.style.cssText =
    'display:flex;flex-direction:row;align-items:stretch;max-width:min(960px,100%);width:100%;height:min(560px,85vh);background:#fafaf9;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.2);font-family:sans-serif;';

  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText =
    'flex:1;position:relative;min-width:320px;min-height:400px;background:#fafafa;';

  const side = document.createElement('div');
  side.style.cssText =
    'flex:0 0 min(320px,40%);min-width:240px;min-height:0;display:flex;flex-direction:column;padding:0;border-left:1px solid #e7e5e4;background:#fafaf9;';

  const headlineWrap = document.createElement('div');
  headlineWrap.style.cssText =
    'flex:1 1 50%;min-height:0;overflow:auto;padding:20px 20px 12px;box-sizing:border-box;display:flex;flex-direction:column;';

  const bottomWrap = document.createElement('div');
  bottomWrap.style.cssText =
    'flex:1 1 50%;min-height:0;overflow:auto;display:flex;flex-direction:column;justify-content:flex-end;gap:8px;padding:12px 20px 20px;border-top:1px solid #e7e5e4;box-sizing:border-box;';

  const title = document.createElement('div');
  title.style.cssText =
    'font-weight:700;font-size:17px;line-height:1.35;color:#1c1917;margin:0;word-break:break-word;';

  const textBlock = document.createElement('div');
  textBlock.style.cssText =
    'font-size:13px;color:#44403c;line-height:1.55;display:flex;flex-direction:column;gap:6px;word-break:break-word;';

  const metaSmall = document.createElement('div');
  metaSmall.style.cssText = 'font-size:11px;color:#a8a29e;line-height:1.5;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.style.cssText =
    'margin-top:4px;padding:8px 16px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;font-size:13px;align-self:flex-start;';

  headlineWrap.appendChild(title);
  bottomWrap.appendChild(textBlock);
  bottomWrap.appendChild(metaSmall);
  bottomWrap.appendChild(closeBtn);
  side.appendChild(headlineWrap);
  side.appendChild(bottomWrap);

  panel.appendChild(canvasWrap);
  panel.appendChild(side);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let controls: OrbitControls | null = null;
  let raf = 0;
  let rootGroup: THREE.Group | null = null;

  function disposeScene(): void {
    cancelAnimationFrame(raf);
    if (controls) {
      controls.dispose();
      controls = null;
    }
    if (rootGroup) {
      rootGroup.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const m = o.material;
          const list = Array.isArray(m) ? m : [m];
          for (const mat of list) {
            if (mat && 'map' in mat && mat.map) mat.map.dispose();
            mat?.dispose();
          }
        }
      });
      rootGroup = null;
    }
    if (renderer) {
      renderer.dispose();
      if (renderer.domElement.parentElement) renderer.domElement.parentElement.removeChild(renderer.domElement);
      renderer = null;
    }
    scene = null;
    camera = null;
    canvasWrap.innerHTML = '';
  }

  function animate(): void {
    if (!renderer || !scene || !camera || !controls) return;
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  async function show(record: SubmissionRecord): Promise<void> {
    disposeScene();
    overlay.style.display = 'flex';
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const arch = getEmotionArchetype(record.ai_result.emotion_id);
    if (!arch) {
      title.textContent = record.input_text;
      textBlock.textContent = `Unknown emotion: ${record.ai_result.emotion_id}`;
      metaSmall.textContent = `Valence ${record.ai_result.valence.toFixed(2)} · Activation ${record.ai_result.activation.toFixed(2)} · ${record.ai_result.emotion_id}`;
      return;
    }

    title.textContent = record.input_text;
    const pName = record.participant_name ?? 'N/A';
    const emotionWord = record.ai_result.emotion_label || arch.label;
    textBlock.textContent = '';
    const line = (t: string): void => {
      const d = document.createElement('div');
      d.textContent = t;
      textBlock.appendChild(d);
    };
    line(`name: ${pName}`);
    line(`emotion: ${emotionWord}`);
    line(`timestamp: ${formatSubmissionTimestamp(record.created_at)}`);
    metaSmall.textContent = '';
    metaSmall.appendChild(
      document.createTextNode(
        `Valence ${record.ai_result.valence.toFixed(2)} · Activation ${record.ai_result.activation.toFixed(2)}`
      )
    );
    metaSmall.appendChild(document.createElement('br'));
    metaSmall.appendChild(document.createTextNode(`emotion id: ${record.ai_result.emotion_id}`));

    try {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xfafafa);

    const w = Math.max(320, canvasWrap.clientWidth || 0, panel.clientWidth > 0 ? panel.clientWidth - 300 : 0);
    const h = Math.max(400, canvasWrap.clientHeight || 0);
    camera = new THREE.PerspectiveCamera(45, w / h, 0.05, 100);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(w, h);
    canvasWrap.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.78));
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b0a8, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.45);
    key.position.set(2.2, 3.8, 2.0);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.52);
    fill.position.set(-2.2, 1.8, -1.2);
    scene.add(fill);

    const [blobLoaded, terrainLoaded] = await Promise.all([
      loadGlb(arch.blobModel, 'blob'),
      loadGlb(arch.terrainModel, 'terrain'),
    ]);

    const blobMap = await loadTextureAsync(record.paint_result.blob_texture_data_url);
    const terrainMap = await loadTextureAsync(record.paint_result.terrain_texture_data_url);

    fitObjectToUnit(blobLoaded.scene, FIT_SIZE);
    fitObjectToUnit(terrainLoaded.scene, FIT_SIZE * 1.25);
    blobLoaded.scene.position.set(0, BLOB_SCENE_Y, 0);
    terrainLoaded.scene.position.set(0, TERRAIN_SCENE_Y, 0);

    applyPaintTextureToMeshes(blobLoaded.meshes, blobMap);
    applyPaintTextureToMeshes(terrainLoaded.meshes, terrainMap);

    rootGroup = new THREE.Group();
    rootGroup.add(blobLoaded.scene);
    rootGroup.add(terrainLoaded.scene);
    scene.add(rootGroup);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.45;
    controls.maxDistance = 12;
    controls.enablePan = false;
    /** Match input paint view: frame blob + terrain together. */
    frameCameraToObject(camera, controls, rootGroup, 1.5);

    animate();
    } catch (err) {
      textBlock.textContent += `\n\n(3D load error: ${String(err)})`;
    }
  }

  function hide(): void {
    overlay.style.display = 'none';
    disposeScene();
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide();
  });
  closeBtn.addEventListener('click', () => hide());

  function dispose(): void {
    hide();
    if (overlay.parentElement) overlay.parentElement.removeChild(overlay);
  }

  return { show, hide, dispose };
}
