/**
 * Emotion Planet — Entry and routing.
 * / → Main: full-screen dot-map with 3D blob previews at (v,a). Click blob → /display.
 * /display → Full-screen heat map + wireframe.
 */

import * as THREE from 'three';
import { createEmptyState, type EmotionState } from './state/store';
import { hashFromText } from './math/hash';
import { createPrng } from './math/prng';
import {
  generateCoefficients,
  fillMapBuffer,
  getMapRange,
  getMapStddev,
  applySigmaScale,
  applySpikeShaping,
  applyArousalAmplitude,
  applyArousalPeakSharpening,
  valenceToTilt,
  AXIS_ALIGNED_THRESHOLD,
} from './math/fourierMap';
import { classifyEmotion, roundTo2 } from './ai/axisAgent';
import { initAxis3D } from './viz/axisView3D';
import { buildHeatMapSurface, disposeHeatMapSurface } from './viz/mapView3D';
import {
  buildWireframeModel,
  updateWireframeTime,
  disposeWireframeModel,
} from './viz/modelView3D';
import {
  buildWatercolorBlob,
  updateWatercolorTime,
  disposeWatercolorBlob,
} from './viz/watercolorBlob';
import {
  broadcast,
  subscribe,
  persistState,
  loadPersistedState,
  payloadFromState,
  stateFromPayload,
} from './comm/channel';
import {
  getResponseLog,
  getResponseLogExportJson,
  clearResponseLog,
} from './ai/responseLog';

const K = 10;
const L = 10;
const DECAY_P = 1.2;
/** Fixed mode count so map has good u/v variation; spiky vs round from amplitude & peak sharpening. */
const FIXED_MODE_COUNT = 30;
/** Min modes with |k-l| >= threshold so map varies on both u and v axes. */
const DEFAULT_AXIS_ALIGNED_MIN = 10;
/** Gamma at arousal -1 for peak/valley sharpening (lower = steeper). */
const DEFAULT_GAMMA_MIN_NEG_AROUSAL = 0.08;
const MAX_EMOTIONS = 25;
const BLOB_SCALE = 0.14;

export interface MapBuildOptions {
  axisAlignedMin?: number;
  gammaMinNegArousal?: number;
}

function buildMapState(
  seed: number,
  valence: number,
  arousal: number,
  label: string,
  options?: MapBuildOptions
): EmotionState {
  const state = createEmptyState();
  const v = roundTo2(valence);
  const a = roundTo2(arousal);
  state.seed = seed;
  state.valence = v;
  state.arousal = a;
  state.label = label;

  const axisAlignedMin =
    options?.axisAlignedMin ??
    Math.floor(createPrng(seed)() * (FIXED_MODE_COUNT + 1));
  const gammaOverride = options?.gammaMinNegArousal;

  const tilt = valenceToTilt(v);
  const coeffs = generateCoefficients({
    K,
    L,
    decayP: DECAY_P,
    M: FIXED_MODE_COUNT,
    tilt,
    seed,
    axisAlignedMin,
  });

  fillMapBuffer(state.mapData, state.mapWidth, state.mapHeight, coeffs);
  const sigma = getMapStddev(state.mapData);
  applySigmaScale(state.mapData, sigma);
  applySpikeShaping(state.mapData, v);
  applyArousalAmplitude(state.mapData, a);
  applyArousalPeakSharpening(state.mapData, a, gammaOverride);
  const range = getMapRange(state.mapData);
  state.mapMin = range.min;
  state.mapMax = range.max;
  return state;
}

function runController(): void {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = '';
  root.className = 'controller';

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;background:#fafaf9;font-family:sans-serif;';
  root.appendChild(container);

  const axisWrap = document.createElement('div');
  axisWrap.style.cssText = 'flex:1;position:relative;min-height:0;';
  container.appendChild(axisWrap);

  const axis3D = initAxis3D(axisWrap);

  const hoverTooltip = document.createElement('div');
  hoverTooltip.style.cssText =
    'position:fixed;pointer-events:none;z-index:10;color:#1c1917;font-size:13px;font-family:sans-serif;display:none;';
  document.body.appendChild(hoverTooltip);

  axisWrap.addEventListener('mousemove', (e: MouseEvent) => {
    const index = axis3D.pick(e.clientX, e.clientY);
    if (index != null && index >= 0 && index < emotions.length) {
      hoverTooltip.textContent = emotions[index].label || '';
      hoverTooltip.style.display = hoverTooltip.textContent ? 'block' : 'none';
      hoverTooltip.style.left = `${e.clientX + 12}px`;
      hoverTooltip.style.top = `${e.clientY + 12}px`;
    } else {
      hoverTooltip.style.display = 'none';
    }
  });
  axisWrap.addEventListener('mouseleave', () => {
    hoverTooltip.style.display = 'none';
  });

  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'flex:0 0 auto;padding:12px 16px;display:flex;gap:8px;align-items:center;background:rgba(250,250,249,0.95);border-top:1px solid #e7e5e4;';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Enter emotional state...';
  input.style.cssText = 'flex:1;min-width:120px;padding:10px 14px;border:1px solid #e7e5e4;border-radius:10px;font-size:14px;';
  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Process';
  submitBtn.style.cssText = 'padding:10px 20px;background:#1c1917;color:#fafaf9;border:none;border-radius:10px;font-weight:bold;cursor:pointer;font-size:13px;';
  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:11px;color:#a8a29e;';
  hint.textContent = 'Click a blob on the map to open full view';
  inputRow.appendChild(input);
  inputRow.appendChild(submitBtn);
  inputRow.appendChild(hint);
  container.appendChild(inputRow);

  const debugPanel = document.createElement('div');
  debugPanel.style.cssText = 'flex:0 0 auto;max-height:200px;overflow:auto;padding:8px 16px;background:#1c1917;color:#e7e5e4;font-family:monospace;font-size:11px;border-top:1px solid #444;';
  debugPanel.innerHTML = [
    '<div style="margin-bottom:4px;font-weight:bold;">Debug: axis = arousal (pos/neg, X) · valence (active/passive, Y)</div>',
    '<pre id="debug-gemini-raw" style="margin:0 0 6px 0;white-space:pre-wrap;word-break:break-all;"></pre>',
    '<div id="debug-blobs" style="margin:0 0 6px 0;"></div>',
    '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">',
    '<span id="debug-log-count" style="color:#a8a29e;"></span>',
    '<button type="button" id="debug-download-btn" style="padding:4px 10px;font-size:10px;cursor:pointer;background:#444;color:#fff;border:none;border-radius:4px;">Download responses.json</button>',
    '<button type="button" id="debug-clear-log-btn" style="padding:4px 10px;font-size:10px;cursor:pointer;background:#444;color:#fff;border:none;border-radius:4px;">Clear log</button>',
    '</div>',
  ].join('');
  container.appendChild(debugPanel);

  let emotions: EmotionState[] = [];
  let lastAgentRaw = '';
  let blobMeshes: THREE.Mesh[] = [];
  let animationId: number | null = null;

  function updateDebugPanel(): void {
    const rawEl = document.getElementById('debug-gemini-raw');
    const blobsEl = document.getElementById('debug-blobs');
    const countEl = document.getElementById('debug-log-count');
    if (rawEl) rawEl.textContent = lastAgentRaw ? `Last OpenAI JSON:\n${lastAgentRaw}` : '(no response yet)';
    if (blobsEl) {
      blobsEl.innerHTML = emotions.length
        ? 'Blobs (label · valence · arousal · maturity): ' +
          emotions
            .map((e) => `${e.label || '?'} (${Number(e.valence).toFixed(2)}, ${Number(e.arousal).toFixed(2)}, ${Number(e.maturity ?? 0).toFixed(2)})`)
            .join('  |  ')
        : '(no blobs)';
    }
    if (countEl) {
      const n = getResponseLog().length;
      countEl.textContent = `Response log: ${n} entr${n === 1 ? 'y' : 'ies'}`;
    }
  }

  function downloadResponseLog(): void {
    const blob = new Blob([getResponseLogExportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'emotion-planet-responses.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('debug-download-btn')?.addEventListener('click', () => {
    downloadResponseLog();
  });
  document.getElementById('debug-clear-log-btn')?.addEventListener('click', () => {
    clearResponseLog();
    updateDebugPanel();
  });

  function resizeAxis(): void {
    const w = axisWrap.clientWidth;
    const h = axisWrap.clientHeight;
    if (w > 0 && h > 0) axis3D.resize(w, h);
  }

  function buildBlobScene(): void {
    blobMeshes.forEach((m) => disposeWireframeModel(m));
    blobMeshes = [];
    emotions.forEach((state) => {
      const { mesh } = buildWireframeModel(state, { scrollU: 0.02, scrollV: 0.01 });
      mesh.scale.setScalar(BLOB_SCALE);
      blobMeshes.push(mesh);
    });
    axis3D.setBlobPositions(blobMeshes, emotions);
  }

  function render(): void {
    blobMeshes.forEach((m) => updateWireframeTime(m, performance.now() * 0.001));
    axis3D.render();
  }

  function animate(): void {
    animationId = requestAnimationFrame(animate);
    render();
  }

  axisWrap.addEventListener('click', (e: MouseEvent) => {
    const index = axis3D.pick(e.clientX, e.clientY);
    if (index == null || index < 0 || index >= emotions.length) return;
    const state = emotions[index];
    persistState(payloadFromState(state));
    broadcast(payloadFromState(state));
    window.open('/display', '_blank', 'noopener');
  });

  async function onSubmit(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    submitBtn.textContent = '…';
    try {
      const { result, rawJson } = await classifyEmotion(text);
      lastAgentRaw = rawJson;
      const seed = hashFromText(text);
      let v = result.valence;
      let a = result.arousal;
      if (v === 0 && a === 0) {
        const u = (seed >>> 0) / 0xffffffff;
        const u2 = ((seed * 1103515245 + 12345) >>> 0) / 0xffffffff;
        v = roundTo2((u * 2 - 1) * 0.8);
        a = roundTo2((u2 * 2 - 1) * 0.8);
      } else {
        // Deterministic nudge from seed so same text gets consistent 2-decimal variety (e.g. 0.80 → 0.82)
        const nudgeV = ((seed >>> 0) % 41) / 41 * 0.04 - 0.02;
        const nudgeA = (((seed * 1103515245 + 12345) >>> 0) % 41) / 41 * 0.04 - 0.02;
        v = roundTo2(Math.max(-1, Math.min(1, v + nudgeV)));
        a = roundTo2(Math.max(-1, Math.min(1, a + nudgeA)));
      }
      const state = buildMapState(seed, v, a, result.label);
      state.maturity = result.maturity;
      emotions = [state, ...emotions].slice(0, MAX_EMOTIONS);
      updateDebugPanel();
      resizeAxis();
      buildBlobScene();
      input.value = '';
    } catch (e) {
      console.error(e);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Process';
    }
  }

  submitBtn.addEventListener('click', onSubmit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') onSubmit();
  });

  window.addEventListener('resize', resizeAxis);
  const ro = new ResizeObserver(resizeAxis);
  ro.observe(axisWrap);

  const persisted = loadPersistedState();
  if (persisted) {
    const data = stateFromPayload(persisted);
    const state = createEmptyState();
    state.seed = data.seed;
    state.valence = roundTo2(Number(data.valence));
    state.arousal = roundTo2(Number(data.arousal));
    state.maturity = Number(data.maturity) ?? 0;
    state.label = data.label;
    state.mapData = data.mapData;
    state.mapWidth = data.mapWidth;
    state.mapHeight = data.mapHeight;
    state.mapMin = data.mapMin;
    state.mapMax = data.mapMax;
    emotions = [state];
  }

  updateDebugPanel();
  resizeAxis();
  buildBlobScene();
  animate();
}

function runDisplay(): void {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = '';
  root.className = 'display';

  const container = document.createElement('div');
  container.style.cssText = 'width:100vw;height:100vh;position:relative;background:#fafaf9;';
  root.appendChild(container);

  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let wireframeMesh: ReturnType<typeof buildWireframeModel>['mesh'] | null = null;
  let heatMesh: ReturnType<typeof buildHeatMapSurface> | null = null;
  let heatGroup: THREE.Group | null = null;
  let wireframeGroup: THREE.Group | null = null;

  const heatRot = { rotX: 0, rotY: 0 };
  const wireRot = { rotX: 0, rotY: 0 };
  const drag = { isDragging: false, prevX: 0, prevY: 0, target: null as 'heat' | 'wire' | null };
  function onPointerDown(e: PointerEvent): void {
    drag.isDragging = true;
    drag.prevX = e.clientX;
    drag.prevY = e.clientY;
    drag.target = e.clientX < window.innerWidth / 2 ? 'heat' : 'wire';
    if (renderer) renderer.domElement.style.cursor = 'grabbing';
  }
  function onPointerMove(e: PointerEvent): void {
    if (!drag.isDragging || !drag.target) return;
    const dx = (e.clientX - drag.prevX) * 0.005;
    const dy = (e.clientY - drag.prevY) * 0.005;
    drag.prevX = e.clientX;
    drag.prevY = e.clientY;
    const clamp = (v: number) => Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, v));
    if (drag.target === 'heat' && heatGroup) {
      heatRot.rotY += dx;
      heatRot.rotX = clamp(heatRot.rotX + dy);
      heatGroup.rotation.order = 'YXZ';
      heatGroup.rotation.y = heatRot.rotY;
      heatGroup.rotation.x = heatRot.rotX;
    } else if (drag.target === 'wire' && wireframeGroup) {
      wireRot.rotY += dx;
      wireRot.rotX = clamp(wireRot.rotX + dy);
      wireframeGroup.rotation.order = 'YXZ';
      wireframeGroup.rotation.y = wireRot.rotY;
      wireframeGroup.rotation.x = wireRot.rotX;
    }
  }
  function onPointerUp(): void {
    drag.isDragging = false;
    drag.target = null;
    if (renderer) renderer.domElement.style.cursor = 'grab';
  }

  function buildScene(state: EmotionState): void {
    if (wireframeMesh && wireframeGroup) {
      wireframeGroup.remove(wireframeMesh);
      disposeWireframeModel(wireframeMesh);
      wireframeMesh = null;
    }
    if (heatMesh && heatGroup) {
      heatGroup.remove(heatMesh);
      disposeHeatMapSurface(heatMesh);
      heatMesh = null;
    }

    if (!scene) {
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
      camera.position.set(0, 0, 2.8);
      camera.lookAt(0, 0, 0);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setClearColor(0xfafaf9, 1);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      const canvas = renderer.domElement;
      canvas.style.cursor = 'grab';
      container.appendChild(canvas);
      canvas.addEventListener('pointerdown', onPointerDown as (e: Event) => void);
      window.addEventListener('pointermove', onPointerMove as (e: Event) => void);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointerleave', onPointerUp);
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(3, 3, 2);
      scene.add(dir);
    }

    const scale = 0.85;
    if (!heatGroup) {
      heatGroup = new THREE.Group();
      heatGroup.position.set(-1.1, 0, 0);
      heatGroup.scale.setScalar(scale);
      scene.add(heatGroup);
    }
    heatGroup.rotation.order = 'YXZ';
    heatGroup.rotation.x = heatRot.rotX;
    heatGroup.rotation.y = heatRot.rotY;

    if (!wireframeGroup) {
      wireframeGroup = new THREE.Group();
      wireframeGroup.position.set(1.1, 0, 0);
      wireframeGroup.scale.setScalar(scale);
      scene.add(wireframeGroup);
    }
    wireframeGroup.rotation.order = 'YXZ';
    wireframeGroup.rotation.x = wireRot.rotX;
    wireframeGroup.rotation.y = wireRot.rotY;

    heatMesh = buildHeatMapSurface(state);
    heatGroup.add(heatMesh);

    const { mesh } = buildWireframeModel(state, { scrollU: 0.03, scrollV: 0.02 });
    wireframeMesh = mesh;
    wireframeGroup.add(mesh);
  }

  function onPayload(payload: import('./comm/channel').ChannelPayload): void {
    const data = stateFromPayload(payload);
    const state = createEmptyState();
    state.seed = data.seed;
    state.valence = roundTo2(data.valence);
    state.arousal = roundTo2(data.arousal);
    state.maturity = data.maturity ?? 0;
    state.label = data.label;
    state.mapData = data.mapData;
    state.mapWidth = data.mapWidth;
    state.mapHeight = data.mapHeight;
    state.mapMin = data.mapMin;
    state.mapMax = data.mapMax;
    buildScene(state);
  }

  subscribe(onPayload);
  const persisted = loadPersistedState();
  if (persisted) onPayload(persisted);

  function animate(): void {
    requestAnimationFrame(animate);
    if (wireframeMesh && renderer && scene && camera) {
      updateWireframeTime(wireframeMesh, performance.now() * 0.001);
      renderer.render(scene, camera);
    }
  }
  animate();

  window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

const DEBUG_SEED = 42;

function runDebug(): void {
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = '';
  root.className = 'debug';

  let valence = 0;
  let arousal = -0.8;
  let debugAxisAlignedMin = DEFAULT_AXIS_ALIGNED_MIN;
  let debugGammaMinNegArousal = DEFAULT_GAMMA_MIN_NEG_AROUSAL;
  let debugBlobNearestFilter = true;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let heatGroup: THREE.Group | null = null;
  let wireframeGroup: THREE.Group | null = null;
  let heatMesh: ReturnType<typeof buildHeatMapSurface> | null = null;
  let wireframeMesh: ReturnType<typeof buildWireframeModel>['mesh'] | null = null;
  let watercolorMesh: THREE.Mesh | null = null;
  let watercolorOutlineMesh: THREE.Mesh | null = null;
  let debugWatercolorBlob = false;
  let debugRimThickness = 0.3;
  let dirLight: THREE.DirectionalLight | null = null;
  let shadowGroundMesh: THREE.Mesh | null = null;

  const container = document.createElement('div');
  container.style.cssText = 'width:100vw;height:100vh;display:flex;flex-direction:column;background:#fafaf9;font-family:sans-serif;';
  root.appendChild(container);

  const panel = document.createElement('div');
  panel.style.cssText = 'flex:0 0 auto;padding:12px 16px;display:flex;flex-wrap:wrap;align-items:center;gap:16px;background:rgba(250,250,249,0.95);border-bottom:1px solid #e7e5e4;';
  container.appendChild(panel);

  const labelVal = document.createElement('label');
  labelVal.textContent = 'Valence (Y, active/passive): ';
  labelVal.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const inputVal = document.createElement('input');
  inputVal.type = 'range';
  inputVal.min = '-1';
  inputVal.max = '1';
  inputVal.step = '0.05';
  inputVal.value = String(valence);
  inputVal.style.width = '120px';
  const spanVal = document.createElement('span');
  spanVal.style.minWidth = '48px';
  labelVal.appendChild(inputVal);
  labelVal.appendChild(spanVal);
  panel.appendChild(labelVal);

  const labelAro = document.createElement('label');
  labelAro.textContent = 'Arousal (X, pos/neg): ';
  labelAro.style.cssText = 'display:flex;align-items:center;gap:8px;';
  const inputAro = document.createElement('input');
  inputAro.type = 'range';
  inputAro.min = '-1';
  inputAro.max = '1';
  inputAro.step = '0.05';
  inputAro.value = String(arousal);
  inputAro.style.width = '120px';
  const spanAro = document.createElement('span');
  spanAro.style.minWidth = '48px';
  labelAro.appendChild(inputAro);
  labelAro.appendChild(spanAro);
  panel.appendChild(labelAro);

  const labelAxis = document.createElement('label');
  labelAxis.style.cssText = 'display:flex;align-items:center;gap:8px;';
  labelAxis.textContent = 'Axis-aligned min: ';
  const inputAxis = document.createElement('input');
  inputAxis.type = 'range';
  inputAxis.min = '0';
  inputAxis.max = '20';
  inputAxis.step = '1';
  inputAxis.value = String(debugAxisAlignedMin);
  inputAxis.style.width = '80px';
  const spanAxis = document.createElement('span');
  spanAxis.style.minWidth = '24px';
  labelAxis.appendChild(inputAxis);
  labelAxis.appendChild(spanAxis);
  panel.appendChild(labelAxis);

  const labelGamma = document.createElement('label');
  labelGamma.style.cssText = 'display:flex;align-items:center;gap:8px;';
  labelGamma.textContent = 'Gamma min (neg): ';
  const inputGamma = document.createElement('input');
  inputGamma.type = 'range';
  inputGamma.min = '0.05';
  inputGamma.max = '0.35';
  inputGamma.step = '0.01';
  inputGamma.value = String(debugGammaMinNegArousal);
  inputGamma.style.width = '80px';
  const spanGamma = document.createElement('span');
  spanGamma.style.minWidth = '36px';
  labelGamma.appendChild(inputGamma);
  labelGamma.appendChild(spanGamma);
  panel.appendChild(labelGamma);

  const labelBlob = document.createElement('label');
  labelBlob.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const inputBlob = document.createElement('input');
  inputBlob.type = 'checkbox';
  inputBlob.checked = debugBlobNearestFilter;
  labelBlob.appendChild(inputBlob);
  labelBlob.appendChild(document.createTextNode('Blob nearest filter (arousal<0)'));
  panel.appendChild(labelBlob);

  const labelWatercolor = document.createElement('label');
  labelWatercolor.style.cssText = 'display:flex;align-items:center;gap:6px;';
  const inputWatercolor = document.createElement('input');
  inputWatercolor.type = 'checkbox';
  inputWatercolor.checked = debugWatercolorBlob;
  labelWatercolor.appendChild(inputWatercolor);
  labelWatercolor.appendChild(document.createTextNode('Watercolor blob'));
  panel.appendChild(labelWatercolor);

  const labelRim = document.createElement('label');
  labelRim.style.cssText = 'display:flex;align-items:center;gap:8px;';
  labelRim.textContent = 'Rim thickness: ';
  const inputRim = document.createElement('input');
  inputRim.type = 'range';
  inputRim.min = '0';
  inputRim.max = '2';
  inputRim.step = '0.05';
  inputRim.value = String(debugRimThickness);
  inputRim.style.width = '80px';
  const spanRim = document.createElement('span');
  spanRim.style.minWidth = '32px';
  labelRim.appendChild(inputRim);
  labelRim.appendChild(spanRim);
  panel.appendChild(labelRim);

  const caption = document.createElement('span');
  caption.style.cssText = 'font-size:11px;color:#78716c;';
  caption.textContent = 'Map (left) · Blob (right)';
  panel.appendChild(caption);

  const info = document.createElement('div');
  info.style.cssText = 'font-size:12px;color:#57534e;width:100%;';
  panel.appendChild(info);

  function updateInfo(): void {
    const ampScale = 0.2 + 0.8 * Math.min(1, Math.abs(arousal));
    spanVal.textContent = valence.toFixed(2);
    spanAro.textContent = arousal.toFixed(2);
    spanAxis.textContent = String(debugAxisAlignedMin);
    spanGamma.textContent = debugGammaMinNegArousal.toFixed(2);
    spanRim.textContent = debugRimThickness.toFixed(2);
    info.textContent = `Modes: ${FIXED_MODE_COUNT} · Axis-aligned min: ${debugAxisAlignedMin} (|k-l|≥${AXIS_ALIGNED_THRESHOLD}) · Gamma min: ${debugGammaMinNegArousal.toFixed(2)} · Amplitude: ${ampScale.toFixed(2)} · Blob nearest: ${debugBlobNearestFilter ? 'on' : 'off'} · Watercolor: ${debugWatercolorBlob ? 'on' : 'off'} · Rim: ${debugRimThickness.toFixed(2)}`;
  }

  const canvasWrap = document.createElement('div');
  canvasWrap.style.cssText = 'flex:1;position:relative;min-height:0;';
  container.appendChild(canvasWrap);

  function buildScene(): void {
    const state = buildMapState(DEBUG_SEED, valence, arousal, 'debug', {
      axisAlignedMin: debugAxisAlignedMin,
      gammaMinNegArousal: debugGammaMinNegArousal,
    });

    if (wireframeMesh && wireframeGroup) {
      wireframeGroup.remove(wireframeMesh);
      disposeWireframeModel(wireframeMesh);
      wireframeMesh = null;
    }
    if (watercolorMesh && wireframeGroup) {
      if (watercolorOutlineMesh) {
        wireframeGroup.remove(watercolorOutlineMesh);
      }
      wireframeGroup.remove(watercolorMesh);
      disposeWatercolorBlob(watercolorMesh, watercolorOutlineMesh ?? undefined);
      watercolorMesh = null;
      watercolorOutlineMesh = null;
    }
    if (heatMesh && heatGroup) {
      heatGroup.remove(heatMesh);
      disposeHeatMapSurface(heatMesh);
      heatMesh = null;
    }

    if (!scene) {
      scene = new THREE.Scene();
      const w = canvasWrap.clientWidth || 800;
      const h = canvasWrap.clientHeight || 600;
      camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
      camera.position.set(0, 0, 2.8);
      camera.lookAt(0, 0, 0);
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setClearColor(0xfafaf9, 1);
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // #region agent log
      renderer.debug = { checkShaderErrors: true };
      renderer.debug.onShaderError = (
        gl: WebGLRenderingContext,
        _program: WebGLProgram,
        vShader: WebGLShader,
        fShader: WebGLShader
      ) => {
        const vLog = (gl.getShaderInfoLog(vShader) || '').slice(0, 800);
        const fLog = (gl.getShaderInfoLog(fShader) || '').slice(0, 800);
        const pLog = (gl.getProgramInfoLog(_program) || '').slice(0, 800);
        fetch('http://127.0.0.1:7242/ingest/e5c5e27a-60f2-4511-bd09-253ca487968d', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            location: 'app.ts:runDebug onShaderError',
            message: 'shader compile/link error',
            data: { vertexLog: vLog, fragmentLog: fLog, programLog: pLog },
            timestamp: Date.now(),
            hypothesisId: 'H6',
          }),
        }).catch(() => {});
      };
      // #endregion
      canvasWrap.appendChild(renderer.domElement);
      scene.add(new THREE.AmbientLight(0xffffff, 0.5));
      dirLight = new THREE.DirectionalLight(0xffffff, 0.9);
      dirLight.position.set(3, 3, 2);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.set(2048, 2048);
      dirLight.shadow.camera.left = -2;
      dirLight.shadow.camera.right = 4;
      dirLight.shadow.camera.top = 2;
      dirLight.shadow.camera.bottom = -2;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 10;
      scene.add(dirLight);

      const groundGeom = new THREE.PlaneGeometry(8, 8);
      const groundVertexShader = `
        uniform mat4 uShadowMatrix;
        varying vec4 vShadowCoord;
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPos.xyz;
          vShadowCoord = uShadowMatrix * worldPos;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `;
      const groundFragmentShader = `
        uniform sampler2D uShadowMap;
        uniform mat4 uShadowMatrix;
        uniform vec3 uGroundColor;
        varying vec4 vShadowCoord;
        varying vec3 vWorldPos;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise2D(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        void main() {
          vec4 coord = vShadowCoord;
          coord.xyz /= coord.w;
          float sum = 0.0;
          float r = 0.003;
          for (int i = 0; i < 12; i++) {
            float angle = float(i) * 0.5236;
            vec2 off = r * vec2(cos(angle), sin(angle)) * (0.7 + 0.6 * noise2D(vWorldPos.xz * 10.0 + float(i)));
            float d = texture2D(uShadowMap, coord.xy + off).r;
            sum += (coord.z <= d + 0.0001) ? 1.0 : 0.0;
          }
          float shadow = sum / 12.0;
          vec3 col = mix(uGroundColor * 0.4, uGroundColor, shadow);
          gl_FragColor = vec4(col, 1.0);
        }
      `;
      const groundMat = new THREE.ShaderMaterial({
        uniforms: {
          uShadowMap: { value: null as THREE.Texture | null },
          uShadowMatrix: { value: new THREE.Matrix4() },
          uGroundColor: { value: new THREE.Color(0xfafaf9) },
        },
        vertexShader: groundVertexShader,
        fragmentShader: groundFragmentShader,
      });
      shadowGroundMesh = new THREE.Mesh(groundGeom, groundMat);
      shadowGroundMesh.rotation.x = -Math.PI / 2;
      shadowGroundMesh.position.set(0, -1.2, 0);
      shadowGroundMesh.receiveShadow = true;
      scene.add(shadowGroundMesh);

      heatGroup = new THREE.Group();
      heatGroup.position.set(-1.1, 0, 0);
      heatGroup.scale.setScalar(0.85);
      scene.add(heatGroup);

      wireframeGroup = new THREE.Group();
      wireframeGroup.position.set(1.1, 0, 0);
      wireframeGroup.scale.setScalar(0.85);
      scene.add(wireframeGroup);
    }

    heatMesh = buildHeatMapSurface(state);
    heatGroup.add(heatMesh);

    if (debugWatercolorBlob) {
      const { mesh, outlineMesh } = buildWatercolorBlob(state, {
        scrollU: 0.03,
        scrollV: 0.02,
        rimThickness: debugRimThickness,
      });
      watercolorMesh = mesh;
      watercolorOutlineMesh = outlineMesh;
      mesh.castShadow = false;
      outlineMesh.castShadow = false;
      wireframeGroup.add(outlineMesh);
      wireframeGroup.add(mesh);
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/e5c5e27a-60f2-4511-bd09-253ca487968d', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'app.ts:runDebug buildScene watercolor',
          message: 'watercolor mesh added to scene',
          data: {
            meshVisible: mesh.visible,
            meshLayers: mesh.layers.mask,
            parentName: wireframeGroup?.type,
            childrenCount: wireframeGroup?.children?.length ?? 0,
          },
          timestamp: Date.now(),
          hypothesisId: 'C',
        }),
      }).catch(() => {});
      // #endregion
    } else {
      const { mesh } = buildWireframeModel(state, {
        scrollU: 0.03,
        scrollV: 0.02,
        useNearestFilter: debugBlobNearestFilter,
      });
      wireframeMesh = mesh;
      wireframeGroup.add(mesh);
    }

    if (renderer && camera) {
      renderer.setSize(canvasWrap.clientWidth, canvasWrap.clientHeight);
      camera.aspect = canvasWrap.clientWidth / canvasWrap.clientHeight;
      camera.updateProjectionMatrix();
    }
  }

  let watercolorFrameLogged = false;
  let watercolorFrameCount = 0;
  function animate(): void {
    requestAnimationFrame(animate);
    if (renderer && scene && camera) {
      if (watercolorMesh) {
        updateWatercolorTime(watercolorMesh, performance.now() * 0.001, watercolorOutlineMesh ?? undefined);
        // #region agent log
        const mat = watercolorMesh.material as THREE.ShaderMaterial;
        const prog = mat.program;
        if (!watercolorFrameLogged) {
          watercolorFrameLogged = true;
          scene.updateMatrixWorld(true);
          const worldPos = new THREE.Vector3();
          watercolorMesh.getWorldPosition(worldPos);
          const uBase = mat.uniforms?.uBaseColor?.value;
          const uRim = mat.uniforms?.uRimColor?.value;
          fetch('http://127.0.0.1:7242/ingest/e5c5e27a-60f2-4511-bd09-253ca487968d', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'app.ts:animate watercolor first frame',
              message: 'first frame with watercolor mesh',
              data: {
                hasProgram: !!prog,
                meshInScene: scene?.children?.some((c) => (c as THREE.Group).children?.includes(watercolorMesh!)),
                worldX: worldPos.x,
                worldY: worldPos.y,
                worldZ: worldPos.z,
                depthWrite: mat.depthWrite,
                transparent: mat.transparent,
                renderOrder: watercolorMesh.renderOrder,
                uBaseR: uBase?.x,
                uBaseG: uBase?.y,
                uBaseB: uBase?.z,
                uRimR: uRim?.x,
                uRimG: uRim?.y,
                uRimB: uRim?.z,
              },
              timestamp: Date.now(),
              hypothesisId: 'A',
            }),
          }).catch(() => {});
        }
        watercolorFrameCount += 1;
        if (watercolorFrameCount === 10) {
          const groundMat = shadowGroundMesh?.material as THREE.ShaderMaterial | undefined;
          fetch('http://127.0.0.1:7242/ingest/e5c5e27a-60f2-4511-bd09-253ca487968d', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              location: 'app.ts:animate watercolor frame 10',
              message: 'frame 10 program and ground',
              data: {
                hasProgram: !!mat.program,
                groundTransparent: groundMat?.transparent,
                groundRenderOrder: shadowGroundMesh?.renderOrder,
              },
              timestamp: Date.now(),
              hypothesisId: 'H1',
            }),
          }).catch(() => {});
        }
        // #endregion
      } else if (wireframeMesh) {
        updateWireframeTime(wireframeMesh, performance.now() * 0.001);
      }
      if (shadowGroundMesh && dirLight) {
        dirLight.shadow.updateMatrices(dirLight);
        if (dirLight.shadow.map) {
          const mat = shadowGroundMesh.material as THREE.ShaderMaterial;
          mat.uniforms.uShadowMap.value = dirLight.shadow.map.texture;
          mat.uniforms.uShadowMatrix.value.copy(dirLight.shadow.matrix);
        }
      }
      renderer.render(scene, camera);
    }
  }

  inputVal.addEventListener('input', () => {
    valence = Number(inputVal.value);
    updateInfo();
    buildScene();
  });
  inputAro.addEventListener('input', () => {
    arousal = Number(inputAro.value);
    updateInfo();
    buildScene();
  });
  inputAxis.addEventListener('input', () => {
    debugAxisAlignedMin = Number(inputAxis.value);
    updateInfo();
    buildScene();
  });
  inputGamma.addEventListener('input', () => {
    debugGammaMinNegArousal = Number(inputGamma.value);
    updateInfo();
    buildScene();
  });
  inputBlob.addEventListener('change', () => {
    debugBlobNearestFilter = inputBlob.checked;
    updateInfo();
    buildScene();
  });
  inputWatercolor.addEventListener('change', () => {
    debugWatercolorBlob = inputWatercolor.checked;
    updateInfo();
    buildScene();
  });
  inputRim.addEventListener('input', () => {
    debugRimThickness = Number(inputRim.value);
    updateInfo();
    buildScene();
  });

  updateInfo();
  buildScene();
  animate();

  window.addEventListener('resize', () => {
    if (!camera || !renderer || !canvasWrap) return;
    const w = canvasWrap.clientWidth || 800;
    const h = canvasWrap.clientHeight || 600;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
}

function init(): void {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/display') {
    runDisplay();
  } else if (path === '/debug') {
    runDebug();
  } else {
    runController();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
