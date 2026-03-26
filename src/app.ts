/**
 * Emotion Planet — Installation routes: / input+paint, /matrix billboard display.
 */

import { fetchClassify } from './api/backend';
import { roundTo2 } from './ai/axisAgent';
import type { AIClassificationResult, SubmissionRecord } from './data/types';
import { saveSubmission, getActiveEntries, getEntry } from './storage/submissions';
import { connectSubmissionsSocket } from './realtime/submissionsWs';
import { createPaintView3D } from './viz/paintView3D';
import { captureMatrixSprite } from './viz/pngCapture';
import { createMatrixView3D } from './viz/matrixView3D';
import { createDetailPopup } from './viz/detailPopup';
const SESSION_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? `session_${crypto.randomUUID()}`
    : `session_${Date.now()}`;

function newEntryId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `entry_${Date.now()}`;
}

/** Empty log shell (English labels); values filled after Analyze. */
const LOG_TEMPLATE_EMPTY = [
  'Label:',
  'Archetype:',
  'Valence:',
  'Activation:',
  'Timestamp:',
  'Confidence:',
].join('\n');

function formatAiLog(ai: AIClassificationResult, timestampIso: string): string {
  const lines = [
    `Label: ${ai.emotion_label}`,
    `Archetype: ${ai.emotion_id}`,
    `Valence: ${ai.valence.toFixed(2)}`,
    `Activation: ${ai.activation.toFixed(2)}`,
    `Timestamp: ${timestampIso}`,
    `Confidence: ${ai.confidence.toFixed(2)}`,
  ];
  if (ai.reasoning_short) lines.push(`Reasoning: ${ai.reasoning_short}`);
  return lines.join('\n');
}

function runInput(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  root.className = 'input-screen';

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:relative;display:flex;flex-direction:row;width:100vw;height:100vh;min-height:480px;font-family:var(--font-display);background:#fafaf9;';
  root.appendChild(wrap);

  const left = document.createElement('div');
  left.style.cssText =
    'flex:0 0 33%;min-width:300px;max-width:460px;display:flex;flex-direction:column;min-height:0;padding:20px 18px;gap:14px;border-right:1px solid #e7e5e4;box-sizing:border-box;';

  const titleBlock = document.createElement('div');
  titleBlock.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  const titleJa = document.createElement('div');
  titleJa.style.cssText =
    'font-size:40px;font-weight:400;line-height:1.3;color:#1c1917;margin:0;font-family:var(--font-title);';
  titleJa.textContent = '今、調子はどう。';
  const titleEn = document.createElement('div');
  titleEn.style.cssText =
    'font-size:52px;font-weight:400;line-height:1.2;color:#1c1917;margin:0;font-family:var(--font-title);';
  titleEn.textContent = 'How are you feeling?';
  titleBlock.appendChild(titleJa);
  titleBlock.appendChild(titleEn);
  left.appendChild(titleBlock);

  const input = document.createElement('textarea');
  input.rows = 9;
  input.placeholder = 'Input here';
  input.style.cssText =
    'width:100%;min-height:220px;flex:0 1 auto;padding:12px 14px;border:1px solid #e7e5e4;border-radius:10px;font-size:14px;resize:vertical;box-sizing:border-box;font-family:var(--font-display);';

  const nameLabel = document.createElement('label');
  nameLabel.style.cssText =
    'display:flex;flex-direction:column;gap:6px;font-size:12px;color:#57534e;font-family:var(--font-secondary);';
  const nameCaption = document.createElement('span');
  nameCaption.innerHTML =
    '<span style="font-family:var(--font-display)">表示名</span> <span style="opacity:0.85">name</span>';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Optional';
  nameInput.autocomplete = 'name';
  nameInput.style.cssText =
    'width:100%;padding:10px 12px;border:1px solid #e7e5e4;border-radius:10px;font-size:13px;box-sizing:border-box;font-family:var(--font-display);';

  nameLabel.appendChild(nameCaption);
  nameLabel.appendChild(nameInput);
  left.appendChild(input);
  left.appendChild(nameLabel);

  const leftSpacer = document.createElement('div');
  leftSpacer.style.cssText = 'flex:1;min-height:12px;';
  left.appendChild(leftSpacer);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.innerHTML =
    '<span style="font-family:var(--font-display)">分析する</span> <span style="opacity:0.9">Analyze</span>';
  submitBtn.style.cssText =
    'width:100%;padding:14px 18px;background:#1c1917;color:#fafaf9;border:none;border-radius:14px;font-weight:600;cursor:pointer;font-size:15px;font-family:var(--font-display);';

  const btnSend = document.createElement('button');
  btnSend.type = 'button';
  btnSend.id = 'btn-send';
  btnSend.disabled = true;
  btnSend.innerHTML =
    '<span style="font-family:var(--font-display)">送信する</span> <span style="opacity:0.9">Send</span>';
  btnSend.style.cssText =
    'width:100%;padding:14px 18px;font-size:15px;font-weight:600;border:none;border-radius:14px;background:#78716c;color:#fff;cursor:not-allowed;font-family:var(--font-display);';

  const leftActions = document.createElement('div');
  leftActions.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:100%;';
  leftActions.appendChild(submitBtn);
  leftActions.appendChild(btnSend);
  left.appendChild(leftActions);

  const BASIC_COLORS = ['#5F9569', '#EAC787', '#E86E7F', '#7BB7B7', '#3F9490'] as const;

  const right = document.createElement('div');
  right.style.cssText =
    'flex:1;position:relative;min-width:0;min-height:0;padding-bottom:96px;box-sizing:border-box;background:#e7e5e4;';
  wrap.appendChild(left);
  wrap.appendChild(right);

  const statusBanner = document.createElement('div');
  statusBanner.style.cssText =
    'position:absolute;top:14px;left:50%;transform:translateX(-50%);z-index:48;max-width:min(520px,calc(100% - 32px));min-height:2.5em;padding:10px 20px;font-size:13px;font-family:var(--font-secondary);color:#44403c;background:rgba(255,255,255,0.94);border:1px solid #e7e5e4;border-radius:12px;text-align:center;box-shadow:0 8px 28px rgba(0,0,0,0.08);pointer-events:none;box-sizing:border-box;line-height:1.45;';
  statusBanner.textContent = 'Ready.';
  right.appendChild(statusBanner);

  const paint = createPaintView3D(right);

  const resultBox = document.createElement('div');
  resultBox.style.cssText =
    'position:absolute;right:16px;bottom:108px;z-index:50;pointer-events:none;max-width:min(380px,42vw);min-height:64px;font-size:10px;line-height:1.4;font-family:var(--font-secondary);color:#44403c;background:#f5f5f4;padding:10px 12px;border-radius:12px;border:1px solid #e7e5e4;white-space:pre-wrap;box-shadow:0 14px 30px rgba(0,0,0,0.10);box-sizing:border-box;';
  resultBox.textContent = LOG_TEMPLATE_EMPTY;
  right.appendChild(resultBox);

  const paletteBar = document.createElement('div');
  paletteBar.style.cssText =
    'position:absolute;bottom:0;left:0;right:0;z-index:45;display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-start;gap:12px 16px;padding:12px 14px;background:rgba(250,250,249,0.97);backdrop-filter:blur(8px);border-top:1px solid #d6d3d1;box-sizing:border-box;pointer-events:auto;';

  const undoCol = document.createElement('div');
  undoCol.style.cssText = 'display:flex;flex-direction:column;gap:5px;flex-shrink:0;';
  const btnUndo = document.createElement('button');
  btnUndo.type = 'button';
  btnUndo.id = 'btn-undo';
  btnUndo.textContent = 'Undo';
  btnUndo.style.cssText =
    'padding:5px 12px;font-size:11px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;font-family:var(--font-display);min-width:72px;';
  const btnClear = document.createElement('button');
  btnClear.type = 'button';
  btnClear.id = 'btn-clear';
  btnClear.textContent = 'Clear';
  btnClear.style.cssText =
    'padding:5px 12px;font-size:11px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;font-family:var(--font-display);min-width:72px;';
  undoCol.appendChild(btnUndo);
  undoCol.appendChild(btnClear);
  paletteBar.appendChild(undoCol);

  const brushSizeWrap = document.createElement('label');
  brushSizeWrap.style.cssText =
    'display:flex;flex-direction:column;gap:4px;min-width:120px;max-width:160px;font-size:11px;color:#44403c;';
  brushSizeWrap.innerHTML =
    '<span><span style="font-family:var(--font-display)">ブラシサイズ</span> <span style="font-family:var(--font-secondary);opacity:0.85">brush size</span></span>';
  const brushSize = document.createElement('input');
  brushSize.type = 'range';
  brushSize.id = 'brush-size';
  brushSize.min = '20';
  brushSize.max = '220';
  brushSize.value = '70';
  brushSize.style.cssText = 'width:100%;';
  brushSizeWrap.appendChild(brushSize);
  paletteBar.appendChild(brushSizeWrap);

  const brushColorWrap = document.createElement('label');
  brushColorWrap.style.cssText =
    'display:flex;flex-direction:row;align-items:center;gap:10px;flex-shrink:0;font-size:12px;color:#44403c;';
  brushColorWrap.innerHTML =
    '<span style="white-space:nowrap"><span style="font-family:var(--font-display)">ブラシカラー</span> <span style="font-family:var(--font-secondary);opacity:0.85">brush color</span></span>';
  const brushColorInput = document.createElement('input');
  brushColorInput.type = 'color';
  brushColorInput.id = 'brush-color';
  brushColorInput.value = '#5F9569';
  brushColorInput.style.cssText =
    'width:44px;height:34px;padding:2px;border:1px solid #e7e5e4;border-radius:10px;cursor:pointer;box-sizing:border-box;background:#fff;';
  brushColorWrap.appendChild(brushColorInput);
  paletteBar.appendChild(brushColorWrap);

  const baseGroup = document.createElement('div');
  baseGroup.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:10px;flex-wrap:wrap;';
  const paletteLabel = document.createElement('span');
  paletteLabel.style.cssText =
    'font-size:12px;color:#57534e;white-space:nowrap;font-family:var(--font-secondary);';
  paletteLabel.innerHTML =
    '<span style="font-family:var(--font-display)">ベースカラー</span> <span style="opacity:0.85">base color</span>';
  baseGroup.appendChild(paletteLabel);
  for (let idx = 0; idx < BASIC_COLORS.length; idx++) {
    const c = BASIC_COLORS[idx];
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.dataset.baseColor = c;
    sw.setAttribute('aria-label', `Base color ${c}`);
    sw.style.cssText = `width:34px;height:34px;border-radius:10px;border:2px solid ${
      idx === 0 ? '#1c1917' : '#e7e5e4'
    };background:${c};cursor:pointer;padding:0;box-sizing:border-box;flex-shrink:0;`;
    baseGroup.appendChild(sw);
  }
  paletteBar.appendChild(baseGroup);
  right.appendChild(paletteBar);
  const resize = (): void => {
    paint.resize();
  };
  window.addEventListener('resize', resize);
  const ro = new ResizeObserver(resize);
  ro.observe(right);

  let currentAi: AIClassificationResult | null = null;
  let loadedEmotionId: string | null = null;

  let currentBaseColor: string = BASIC_COLORS[0];

  brushColorInput.value = BASIC_COLORS[0];
  paint.setBrushRadius(Number(brushSize.value));
  paint.setBrushColor(brushColorInput.value);
  paint.setBaseColor(currentBaseColor);
  brushSize.addEventListener('input', () => paint.setBrushRadius(Number(brushSize.value)));
  brushColorInput.addEventListener('input', () => {
    paint.setBrushColor(brushColorInput.value);
  });

  const baseSwatches = paletteBar.querySelectorAll('button[data-base-color]') as NodeListOf<HTMLButtonElement>;
  for (const swatch of Array.from(baseSwatches)) {
    swatch.addEventListener('click', () => {
      const next = swatch.dataset.baseColor;
      if (!next) return;
      currentBaseColor = next;
      paint.setBaseColor(next);
      paint.clearPaint();

      for (const other of Array.from(baseSwatches)) {
        const oc = other.dataset.baseColor;
        other.style.borderColor = oc === next ? '#1c1917' : '#e7e5e4';
      }
    });
  }
  btnUndo.addEventListener('click', () => paint.undo());
  btnClear.addEventListener('click', () => paint.clearPaint());
  function setSendEnabled(on: boolean): void {
    btnSend.disabled = !on;
    btnSend.style.background = on ? '#1c1917' : '#78716c';
    btnSend.style.cursor = on ? 'pointer' : 'not-allowed';
  }

  async function onClassify(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;
    submitBtn.disabled = true;
    resultBox.textContent = LOG_TEMPLATE_EMPTY;
    statusBanner.textContent = 'Classifying…';
    try {
      const { result } = await fetchClassify(text);
      currentAi = {
        ...result,
        valence: roundTo2(result.valence),
        activation: roundTo2(result.activation),
      };
      loadedEmotionId = currentAi.emotion_id;
      await paint.loadEmotionArchetype(loadedEmotionId);
      paint.setBaseColor(currentBaseColor);
      paint.setBrushColor(brushColorInput.value);
      paint.clearPaint();
      requestAnimationFrame(() => {
        paint.resize();
      });
      const classifiedAt = new Date().toISOString();
      resultBox.textContent = formatAiLog(currentAi, classifiedAt);
      setSendEnabled(true);
      statusBanner.textContent = 'Paint, then confirm.';
    } catch (e) {
      console.error(e);
      statusBanner.textContent = 'Error (is the local server running?)';
      resultBox.textContent = LOG_TEMPLATE_EMPTY;
    } finally {
      submitBtn.disabled = false;
    }
  }

  submitBtn.addEventListener('click', onClassify);

  btnSend.addEventListener('click', () => {
    void (async () => {
      if (!currentAi || !loadedEmotionId) return;
      const text = input.value.trim();
      btnSend.disabled = true;
      btnSend.style.cursor = 'wait';
      statusBanner.textContent = 'Saving…';
      const sprite = await captureMatrixSprite(paint);
      if (!sprite.startsWith('data:image/png')) {
        statusBanner.textContent = 'Sprite capture failed — try again after the 3D view loads.';
        setSendEnabled(true);
        btnSend.style.cursor = 'pointer';
        return;
      }
      const blobTex = paint.getBlobPaintDataUrl();
      const terrainTex = paint.getTerrainPaintDataUrl();
      const created = new Date().toISOString();
      const rawName = nameInput.value.trim();
      const participant_name = rawName.length > 0 ? rawName : 'N/A';
      const record: SubmissionRecord = {
        entry_id: newEntryId(),
        created_at: created,
        session_id: SESSION_ID,
        participant_name,
        input_text: text,
        ai_result: currentAi,
        paint_result: {
          blob_texture_data_url: blobTex,
          terrain_texture_data_url: terrainTex,
        },
        matrix_render: { sprite_png_data_url: sprite },
        status: 'submitted',
      };
      const saved = await saveSubmission(record);
      if (saved) {
        statusBanner.textContent = 'Sent. Matrix updated. Ready for a new entry.';
        input.value = '';
        nameInput.value = '';
        currentAi = null;
        loadedEmotionId = null;
        resultBox.textContent = LOG_TEMPLATE_EMPTY;
        currentBaseColor = BASIC_COLORS[0];
        brushColorInput.value = BASIC_COLORS[0];
        paint.clearScene();
        paint.setBrushColor(BASIC_COLORS[0]);
        paint.setBaseColor(BASIC_COLORS[0]);
        for (const other of Array.from(baseSwatches)) {
          const oc = other.dataset.baseColor;
          other.style.borderColor = oc === BASIC_COLORS[0] ? '#1c1917' : '#e7e5e4';
        }
        setSendEnabled(false);
        btnSend.style.cursor = 'not-allowed';
        requestAnimationFrame(() => {
          paint.resize();
        });
      } else {
        statusBanner.textContent = 'Save failed. Check server logs.';
        setSendEnabled(true);
        btnSend.style.cursor = 'pointer';
      }
    })();
  });
}

function runMatrix(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  root.className = 'matrix-screen';

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;background:#fafaf9;font-family:var(--font-display);';
  root.appendChild(wrap);

  const canvasHost = document.createElement('div');
  canvasHost.style.cssText = 'flex:1;position:relative;min-height:0;';
  wrap.appendChild(canvasHost);

  const matrix = createMatrixView3D(canvasHost, { maxVisible: 400 });
  const detail = createDetailPopup();

  async function refreshFromServer(): Promise<void> {
    const entries = await getActiveEntries();
    matrix.setEntries(entries);
  }

  void refreshFromServer();

  const disconnectWs = connectSubmissionsSocket(() => {
    void refreshFromServer();
  });

  matrix.setOnEntryClick((id) => {
    void (async () => {
      const rec = await getEntry(id);
      if (rec) void detail.show(rec);
    })();
  });

  function resize(): void {
    matrix.resize(canvasHost.clientWidth, canvasHost.clientHeight);
  }
  window.addEventListener('resize', resize);
  const ro = new ResizeObserver(resize);
  ro.observe(canvasHost);

  let raf = 0;
  function animate(): void {
    raf = requestAnimationFrame(animate);
    matrix.render();
  }
  animate();

  window.addEventListener(
    'beforeunload',
    () => {
      cancelAnimationFrame(raf);
      disconnectWs();
      matrix.dispose();
      detail.dispose();
    },
    { once: true }
  );
}

function init(): void {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  if (path === '/matrix') {
    runMatrix();
  } else {
    runInput();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
