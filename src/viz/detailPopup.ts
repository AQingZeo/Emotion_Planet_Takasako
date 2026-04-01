/**
 * Lazy-loaded detail overlay: GLB + painted textures + text (matrix screen).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SubmissionRecord } from '../data/types';
import { loadGlb } from './glbLoader';
import { applyHeightRampColorToMeshes, applyPaintTextureToMeshes } from './paintSystem';
import { getEmotionArchetype } from '../config/emotions';
import { loadTextureAsync } from './textureFromDataUrl';
import { frameCameraToObject } from './cameraFraming';

const FIT_SIZE = 1.35;
/** Same max dimension for blob and terrain so they share one coordinate scale; Y is set from bounding boxes. */
const DETAIL_SHARED_FIT = FIT_SIZE * 1.5;
const DETAIL_FRAME_MARGIN = 1.28;
/** World-space gap between terrain top and blob bottom after stacking. */
const DETAIL_STACK_GAP = 0.5;

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

/** Right panel: `-- Name` when present, else `--- N/A`. */
function formatNameDetail(participantName: string | null | undefined): string {
  const t = participantName?.trim();
  if (!t) return '--- N/A';
  return `-- ${t}`;
}

/** Scale to target max extent; center only in XZ (midpoint of AABB in the horizontal plane), leave Y unchanged. */
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
  group.position.x -= c.x;
  group.position.z -= c.z;
}

/**
 * Terrain bottom at y=0; blob bottom flush above terrain top. Does not reset X/Z — keeps fitObjectToUnit xz centering.
 */
function stackBlobAboveTerrain(blob: THREE.Object3D, terrain: THREE.Object3D, gap: number): void {
  blob.updateMatrixWorld(true);
  terrain.updateMatrixWorld(true);
  const tBox = new THREE.Box3().setFromObject(terrain);
  if (tBox.isEmpty()) return;
  terrain.position.y -= tBox.min.y;
  terrain.updateMatrixWorld(true);
  const tTop = new THREE.Box3().setFromObject(terrain).max.y;
  blob.updateMatrixWorld(true);
  const bBox = new THREE.Box3().setFromObject(blob);
  if (bBox.isEmpty()) return;
  blob.position.y = tTop + gap - bBox.min.y;
}

/** After stacking, move each root so world-space XZ midpoint of its AABB is (0, 0) — shared vertical axis. */
function alignXZPlaneCentersToOrigin(blob: THREE.Object3D, terrain: THREE.Object3D): void {
  for (const obj of [terrain, blob]) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) continue;
    const c = new THREE.Vector3();
    box.getCenter(c);
    obj.position.x -= c.x;
    obj.position.z -= c.z;
  }
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
    'display:flex;flex-direction:row;align-items:stretch;max-width:min(960px,100%);width:100%;height:min(560px,85vh);background:#fafaf9;border-radius:16px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.2);font-family:var(--font-display);';

  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText =
    'flex:1;position:relative;min-width:320px;min-height:400px;background:#fafafa;';

  const side = document.createElement('div');
  side.style.cssText =
    'flex:0 0 min(320px,40%);min-width:240px;min-height:0;display:flex;flex-direction:column;padding:0;border-left:1px solid #e7e5e4;background:#fafaf9;';

  const headlineWrap = document.createElement('div');
  headlineWrap.style.cssText =
    'flex:1 1 50%;min-height:0;overflow:auto;padding:20px 20px 12px;box-sizing:border-box;display:flex;flex-direction:column;';

  const nameDetail = document.createElement('div');
  nameDetail.style.cssText =
    'font-size:13px;color:#44403c;line-height:1.55;margin:0;margin-top:auto;padding-top:12px;word-break:break-word;font-family:var(--font-display);text-align:right;width:100%;';

  const bottomWrap = document.createElement('div');
  bottomWrap.style.cssText =
    'flex:1 1 50%;min-height:0;overflow:auto;display:flex;flex-direction:column;justify-content:flex-start;align-items:flex-start;gap:8px;padding:12px 20px 20px;border-top:1px solid #e7e5e4;box-sizing:border-box;';

  const title = document.createElement('div');
  title.style.cssText =
    'font-weight:700;font-size:17px;line-height:1.35;color:#1c1917;margin:0;word-break:break-word;font-family:var(--font-display);';

  const emotionLabel = document.createElement('div');
  emotionLabel.textContent = 'emotion:';
  emotionLabel.style.cssText =
    'font-size:13px;color:#44403c;line-height:1.55;margin:0;word-break:break-word;font-family:var(--font-display);align-self:flex-start;text-align:left;width:100%;';

  const emotionDetail = document.createElement('div');
  emotionDetail.style.cssText =
    'font-weight:700;font-size:26px;line-height:1.25;color:#1c1917;margin:0;word-break:break-word;font-family:var(--font-display);align-self:flex-start;text-align:left;width:100%;';

  const emotionTopBlock = document.createElement('div');
  emotionTopBlock.style.cssText =
    'display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;text-align:left;';

  const textBlock = document.createElement('div');
  textBlock.style.cssText =
    'font-size:13px;color:#44403c;line-height:1.55;display:flex;flex-direction:column;gap:6px;word-break:break-word;font-family:var(--font-display);align-self:stretch;width:100%;text-align:left;';

  const metaSmall = document.createElement('div');
  metaSmall.style.cssText =
    'font-size:11px;color:#a8a29e;line-height:1.5;font-family:var(--font-secondary);align-self:flex-start;text-align:left;width:100%;';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.innerHTML =
    '<span style="font-family:var(--font-display)">閉じる</span> <span style="opacity:0.9">Close</span>';
  closeBtn.style.cssText =
    'margin-top:auto;align-self:stretch;width:100%;box-sizing:border-box;padding:14px 18px;background:#1c1917;color:#fafaf9;border:none;border-radius:14px;font-weight:600;cursor:pointer;font-size:15px;font-family:var(--font-display);';

  headlineWrap.appendChild(title);
  headlineWrap.appendChild(nameDetail);
  emotionTopBlock.appendChild(emotionLabel);
  emotionTopBlock.appendChild(emotionDetail);
  bottomWrap.appendChild(emotionTopBlock);
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
      nameDetail.textContent = formatNameDetail(record.participant_name);
      emotionDetail.textContent = record.ai_result.emotion_label || record.ai_result.emotion_id;
      textBlock.textContent = '';
      const warn = document.createElement('div');
      warn.style.cssText = 'font-size:13px;color:#78716c;';
      warn.textContent = `Unknown archetype: ${record.ai_result.emotion_id}`;
      textBlock.appendChild(warn);
      metaSmall.textContent = `Valence ${record.ai_result.valence.toFixed(2)} · Activation ${record.ai_result.activation.toFixed(2)} · ${record.ai_result.emotion_id}`;
      return;
    }

    title.textContent = record.input_text;
    nameDetail.textContent = formatNameDetail(record.participant_name);
    const emotionWord = record.ai_result.emotion_label || arch.label;
    emotionDetail.textContent = emotionWord;
    textBlock.textContent = '';
    const line = (t: string, small = true): void => {
      const d = document.createElement('div');
      d.textContent = t;
      if (small) d.style.cssText = 'font-size:13px;color:#44403c;';
      textBlock.appendChild(d);
    };
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

    fitObjectToUnit(blobLoaded.scene, DETAIL_SHARED_FIT);
    fitObjectToUnit(terrainLoaded.scene, DETAIL_SHARED_FIT);
    stackBlobAboveTerrain(blobLoaded.scene, terrainLoaded.scene, DETAIL_STACK_GAP);
    alignXZPlaneCentersToOrigin(blobLoaded.scene, terrainLoaded.scene);

    applyPaintTextureToMeshes(blobLoaded.meshes, blobMap);
    applyHeightRampColorToMeshes(terrainLoaded.meshes, record.paint_result.terrain_base_color);

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
    frameCameraToObject(camera, controls, rootGroup, DETAIL_FRAME_MARGIN);

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
