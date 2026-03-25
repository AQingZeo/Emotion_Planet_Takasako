/**
 * Emotion Planet — Installation routes: / input+paint, /matrix billboard display.
 */

import { fetchClassify } from './api/backend';
import { roundTo2 } from './ai/axisAgent';
import type { AIClassificationResult, SubmissionRecord } from './data/types';
import { saveSubmission, getActiveEntries, getEntry } from './storage/submissions';
import {
  applySubmissionsImport,
  downloadSubmissionsBackup,
  readSubmissionsBackupFromFile,
} from './storage/submissionBackup';
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

function runInput(): void {
  const root = document.getElementById('root');
  if (!root) return;
  root.innerHTML = '';
  root.className = 'input-screen';

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:row;width:100vw;height:100vh;min-height:480px;font-family:system-ui,sans-serif;background:#fafaf9;';
  root.appendChild(wrap);

  const left = document.createElement('div');
  left.style.cssText =
    'flex:0 0 38%;max-width:420px;display:flex;flex-direction:column;padding:20px 16px;gap:12px;border-right:1px solid #e7e5e4;box-sizing:border-box;';

  const title = document.createElement('h1');
  title.style.cssText = 'font-size:18px;margin:0;color:#1c1917;font-weight:700;';
  title.textContent = 'How are you feeling?';
  left.appendChild(title);

  const input = document.createElement('textarea');
  input.rows = 4;
  input.placeholder = 'Describe your emotion (any language)…';
  input.style.cssText =
    'width:100%;padding:12px 14px;border:1px solid #e7e5e4;border-radius:10px;font-size:14px;resize:vertical;box-sizing:border-box;';

  const nameLabel = document.createElement('label');
  nameLabel.style.cssText = 'display:flex;flex-direction:column;gap:4px;font-size:12px;color:#57534e;';
  const nameCaption = document.createElement('span');
  nameCaption.textContent = 'Name (optional)';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'N/A';
  nameInput.autocomplete = 'name';
  nameInput.style.cssText =
    'width:100%;padding:8px 12px;border:1px solid #e7e5e4;border-radius:10px;font-size:13px;box-sizing:border-box;';

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;';

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.textContent = 'Classify';
  submitBtn.style.cssText =
    'padding:10px 18px;background:#1c1917;color:#fafaf9;border:none;border-radius:10px;font-weight:600;cursor:pointer;font-size:14px;';

  const openMatrixBtn = document.createElement('button');
  openMatrixBtn.type = 'button';
  openMatrixBtn.textContent = 'Open matrix';
  openMatrixBtn.style.cssText =
    'padding:10px 14px;background:#fff;color:#1c1917;border:1px solid #d6d3d1;border-radius:10px;cursor:pointer;font-size:13px;';
  openMatrixBtn.addEventListener('click', () => {
    window.open('/matrix', '_blank', 'noopener');
  });

  row.appendChild(submitBtn);
  row.appendChild(openMatrixBtn);
  nameLabel.appendChild(nameCaption);
  nameLabel.appendChild(nameInput);
  left.appendChild(input);
  left.appendChild(nameLabel);
  left.appendChild(row);

  const status = document.createElement('div');
  status.style.cssText = 'font-size:13px;color:#57534e;min-height:1.5em;';
  left.appendChild(status);

  const resultBox = document.createElement('div');
  resultBox.style.cssText =
    'font-size:12px;color:#44403c;background:#f5f5f4;padding:10px 12px;border-radius:10px;border:1px solid #e7e5e4;min-height:64px;white-space:pre-wrap;';
  resultBox.textContent = 'Classify text to load a blob and terrain to paint.';
  left.appendChild(resultBox);

  const paintControls = document.createElement('div');
  paintControls.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-top:8px;';
  paintControls.innerHTML = [
    '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#44403c;">Brush size',
    '<input type="range" id="brush-size" min="16" max="120" value="52" style="flex:1;" /></label>',
    '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#44403c;">Color ',
    '<input type="color" id="brush-color" value="#cc5533" /></label>',
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">',
    '<button type="button" id="btn-undo" style="padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;">Undo</button>',
    '<button type="button" id="btn-clear" style="padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;">Clear paint</button>',
    '</div>',
    '<p style="margin:0;font-size:11px;color:#a8a29e;line-height:1.35;">Tip: <strong>wheel</strong> zooms · <strong>middle-drag</strong> rotates the view · <strong>left-drag</strong> paints</p>',
    '<button type="button" id="btn-send" disabled style="padding:12px 16px;font-size:14px;font-weight:600;border:none;border-radius:10px;background:#78716c;color:#fff;cursor:not-allowed;">Confirm & send</button>',
  ].join('');
  left.appendChild(paintControls);

  const right = document.createElement('div');
  right.style.cssText = 'flex:1;position:relative;min-width:0;min-height:0;background:#e7e5e4;';
  wrap.appendChild(left);
  wrap.appendChild(right);

  const paint = createPaintView3D(right);
  const resize = (): void => {
    paint.resize();
  };
  window.addEventListener('resize', resize);
  const ro = new ResizeObserver(resize);
  ro.observe(right);

  let currentAi: AIClassificationResult | null = null;
  let loadedEmotionId: string | null = null;

  const brushSize = paintControls.querySelector('#brush-size') as HTMLInputElement;
  const brushColor = paintControls.querySelector('#brush-color') as HTMLInputElement;
  const btnUndo = paintControls.querySelector('#btn-undo') as HTMLButtonElement;
  const btnClear = paintControls.querySelector('#btn-clear') as HTMLButtonElement;
  const btnSend = paintControls.querySelector('#btn-send') as HTMLButtonElement;

  paint.setBrushRadius(Number(brushSize.value));
  paint.setBrushColor(brushColor.value);
  brushSize.addEventListener('input', () => paint.setBrushRadius(Number(brushSize.value)));
  brushColor.addEventListener('input', () => paint.setBrushColor(brushColor.value));
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
    status.textContent = 'Classifying…';
    try {
      const { result } = await fetchClassify(text);
      currentAi = {
        ...result,
        valence: roundTo2(result.valence),
        activation: roundTo2(result.activation),
      };
      loadedEmotionId = currentAi.emotion_id;
      await paint.loadEmotionArchetype(loadedEmotionId);
      requestAnimationFrame(() => {
        paint.resize();
      });
      resultBox.textContent = [
        `Label: ${currentAi.emotion_label}`,
        `Archetype: ${currentAi.emotion_id}`,
        `Valence: ${currentAi.valence.toFixed(2)} · Activation: ${currentAi.activation.toFixed(2)}`,
        `Confidence: ${currentAi.confidence.toFixed(2)}`,
      ].join('\n');
      setSendEnabled(true);
      status.textContent = 'Paint, then confirm.';
    } catch (e) {
      console.error(e);
      status.textContent = 'Error (is the local server running?)';
      resultBox.textContent = String(e);
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
      status.textContent = 'Saving…';
      const sprite = await captureMatrixSprite(paint);
      if (!sprite.startsWith('data:image/png')) {
        status.textContent = 'Sprite capture failed — try again after the 3D view loads.';
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
      status.textContent = saved
        ? 'Sent. Matrix updates via server (WebSocket).'
        : 'Save failed. Check server logs.';
      setSendEnabled(false);
      btnSend.style.cursor = 'not-allowed';
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
    'position:fixed;inset:0;display:flex;flex-direction:column;background:#fafaf9;font-family:system-ui,sans-serif;';
  root.appendChild(wrap);

  const bar = document.createElement('div');
  bar.style.cssText =
    'flex:0 0 auto;padding:10px 16px;font-size:13px;color:#57534e;border-bottom:1px solid #e7e5e4;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;';
  const barTitle = document.createElement('span');
  barTitle.textContent = 'Emotion matrix — click a sprite for detail';
  const barActions = document.createElement('div');
  barActions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;';
  const btnExportMatrix = document.createElement('button');
  btnExportMatrix.type = 'button';
  btnExportMatrix.textContent = 'Export JSON backup';
  btnExportMatrix.style.cssText =
    'padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;color:#1c1917;';
  const fileImportMatrix = document.createElement('input');
  fileImportMatrix.type = 'file';
  fileImportMatrix.accept = 'application/json,.json';
  fileImportMatrix.style.display = 'none';
  const btnImportMatrix = document.createElement('button');
  btnImportMatrix.type = 'button';
  btnImportMatrix.textContent = 'Import backup…';
  btnImportMatrix.style.cssText =
    'padding:6px 12px;font-size:12px;border-radius:8px;border:1px solid #d6d3d1;background:#fff;cursor:pointer;color:#1c1917;';
  btnImportMatrix.addEventListener('click', () => fileImportMatrix.click());
  fileImportMatrix.addEventListener('change', () => {
    void (async () => {
      const file = fileImportMatrix.files?.[0];
      fileImportMatrix.value = '';
      if (!file) return;
      const records = await readSubmissionsBackupFromFile(file);
      if (!records?.length) {
        window.alert('Could not read backup (invalid JSON or empty).');
        return;
      }
      const replace = window.confirm(
        'Replace ALL saved entries with this file?\n\nOK = replace entire list\nCancel = merge (same entry_id updated from file)'
      );
      const ok = await applySubmissionsImport(records, replace ? 'replace' : 'merge');
      if (!ok) window.alert('Import failed.');
      else void refreshFromServer();
    })();
  });
  btnExportMatrix.addEventListener('click', () => {
    void downloadSubmissionsBackup();
  });
  barActions.appendChild(btnExportMatrix);
  barActions.appendChild(btnImportMatrix);
  barActions.appendChild(fileImportMatrix);
  bar.appendChild(barTitle);
  bar.appendChild(barActions);
  const barHint = document.createElement('div');
  barHint.style.cssText = 'font-size:11px;color:#78716c;width:100%;';
  barHint.textContent =
    'Sprites and paint maps live in SQLite on disk (data/emotion-planet.db)—no browser export needed. Optional JSON export/import is for backup or moving machines. Matrix refreshes over WebSocket.';
  bar.appendChild(barHint);
  wrap.appendChild(bar);

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
