/**
 * Export / import full submission list (JSON with embedded data URLs) for backup.
 */

import type { AIClassificationResult, SubmissionRecord } from '../data/types';
import { getAllSubmissionsForDebug, importSubmissionsFromRecords } from './submissions';

const DEFAULT_FILENAME = 'emotion-planet-submissions.json';

function parseAi(raw: unknown): AIClassificationResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const ai = raw as Record<string, unknown>;
  if (typeof ai.emotion_id !== 'string') return null;
  const valence = typeof ai.valence === 'number' ? ai.valence : Number(ai.valence);
  const activation = typeof ai.activation === 'number' ? ai.activation : Number(ai.activation);
  const confidence = typeof ai.confidence === 'number' ? ai.confidence : Number(ai.confidence);
  if (!Number.isFinite(valence) || !Number.isFinite(activation) || !Number.isFinite(confidence)) return null;
  return {
    emotion_id: ai.emotion_id,
    emotion_label: typeof ai.emotion_label === 'string' ? ai.emotion_label : '—',
    confidence,
    valence,
    activation,
    reasoning_short: typeof ai.reasoning_short === 'string' ? ai.reasoning_short : undefined,
  };
}

function parseSubmissionRecordLoose(raw: unknown): SubmissionRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.entry_id !== 'string' || typeof o.created_at !== 'string') return null;
  if (typeof o.input_text !== 'string') return null;
  if (o.status !== 'draft' && o.status !== 'submitted') return null;
  const sessionId = typeof o.session_id === 'string' ? o.session_id : 'import';
  const ai = parseAi(o.ai_result);
  if (!ai) return null;
  if (!o.paint_result || typeof o.paint_result !== 'object') return null;
  const p = o.paint_result as Record<string, unknown>;
  if (typeof p.blob_texture_data_url !== 'string' || typeof p.terrain_texture_data_url !== 'string') return null;
  if (!o.matrix_render || typeof o.matrix_render !== 'object') return null;
  const m = o.matrix_render as Record<string, unknown>;
  if (typeof m.sprite_png_data_url !== 'string') return null;
  const participantRaw = o.participant_name;
  const participant_name =
    typeof participantRaw === 'string' && participantRaw.trim() ? participantRaw.trim() : 'N/A';
  return {
    entry_id: o.entry_id,
    created_at: o.created_at,
    session_id: sessionId,
    participant_name,
    input_text: o.input_text,
    input_language: typeof o.input_language === 'string' ? o.input_language : undefined,
    ai_result: ai,
    paint_result: {
      blob_texture_data_url: p.blob_texture_data_url,
      terrain_texture_data_url: p.terrain_texture_data_url,
    },
    matrix_render: { sprite_png_data_url: m.sprite_png_data_url },
    status: o.status,
  };
}

export function parseSubmissionsBackupJson(text: string): SubmissionRecord[] | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    const arr = Array.isArray(parsed) ? parsed : null;
    if (!arr) return null;
    const out: SubmissionRecord[] = [];
    for (const item of arr) {
      const n = parseSubmissionRecordLoose(item);
      if (n) out.push(n);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function downloadSubmissionsBackup(filename = DEFAULT_FILENAME): Promise<void> {
  const records = await getAllSubmissionsForDebug();
  const json = JSON.stringify(records, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readSubmissionsBackupFromFile(file: File): Promise<SubmissionRecord[] | null> {
  const text = await file.text();
  return parseSubmissionsBackupJson(text);
}

export type ImportMode = 'replace' | 'merge';

export function applySubmissionsImport(records: SubmissionRecord[], mode: ImportMode): Promise<boolean> {
  return importSubmissionsFromRecords(records, mode);
}
