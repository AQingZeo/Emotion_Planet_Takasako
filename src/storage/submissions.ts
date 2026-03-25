/**
 * Submissions via local Express API + SQLite (see server/).
 */

import type { MatrixEntry, SubmissionRecord } from '../data/types';
import { downscaleDataUrl, downscalePngPreservingAlpha } from '../util/dataUrlCompress';
import { fetchSubmissions, fetchSubmission, postSubmission, putSubmissionsAll } from '../api/backend';

const DEFAULT_MAX_ACTIVE = 400;

const MAX_SPRITE_SIDE = 768;
const MAX_PAINT_SIDE = 512;

async function compressRecordForStorage(r: SubmissionRecord): Promise<SubmissionRecord> {
  const [sprite, blobT, terrainT] = await Promise.all([
    downscalePngPreservingAlpha(r.matrix_render.sprite_png_data_url, MAX_SPRITE_SIDE),
    downscaleDataUrl(r.paint_result.blob_texture_data_url, MAX_PAINT_SIDE, 'image/jpeg', 0.88),
    downscaleDataUrl(r.paint_result.terrain_texture_data_url, MAX_PAINT_SIDE, 'image/jpeg', 0.88),
  ]);
  return {
    ...r,
    matrix_render: { sprite_png_data_url: sprite },
    paint_result: {
      blob_texture_data_url: blobT,
      terrain_texture_data_url: terrainT,
    },
  };
}

function toMatrixEntry(r: SubmissionRecord): MatrixEntry {
  return {
    entry_id: r.entry_id,
    emotion_id: r.ai_result.emotion_id,
    sprite_png_data_url: r.matrix_render.sprite_png_data_url,
    valence: r.ai_result.valence,
    activation: r.ai_result.activation,
    created_at: r.created_at,
  };
}

export async function saveSubmission(record: SubmissionRecord): Promise<boolean> {
  const slim = await compressRecordForStorage(record);
  return postSubmission(slim);
}

export async function getEntry(entryId: string): Promise<SubmissionRecord | null> {
  return fetchSubmission(entryId);
}

export async function getActiveEntries(limit = DEFAULT_MAX_ACTIVE): Promise<MatrixEntry[]> {
  const all = await fetchSubmissions();
  const filtered = all
    .filter((e) => e.status === 'submitted')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return filtered.slice(0, limit).map(toMatrixEntry);
}

export async function getAllSubmissionsForDebug(): Promise<SubmissionRecord[]> {
  return fetchSubmissions();
}

export async function importSubmissionsFromRecords(
  records: SubmissionRecord[],
  mode: 'replace' | 'merge'
): Promise<boolean> {
  if (records.length === 0) return false;
  if (mode === 'replace') {
    return putSubmissionsAll(records);
  }
  const existing = await fetchSubmissions();
  const byId = new Map<string, SubmissionRecord>();
  for (const r of existing) {
    byId.set(r.entry_id, r);
  }
  for (const r of records) {
    byId.set(r.entry_id, r);
  }
  const merged = Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return putSubmissionsAll(merged);
}
