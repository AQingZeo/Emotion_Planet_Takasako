/**
 * SQLite persistence: one row per submission, image payloads as BLOB + mime.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import type { AIClassificationResult, MatrixEntry, SubmissionRecord } from '../src/data/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = path.resolve(__dirname, '..', 'data', 'emotion-planet.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      entry_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      session_id TEXT NOT NULL,
      input_text TEXT NOT NULL,
      input_language TEXT,
      emotion_id TEXT NOT NULL,
      emotion_label TEXT NOT NULL,
      confidence REAL NOT NULL,
      valence REAL NOT NULL,
      activation REAL NOT NULL,
      reasoning_short TEXT,
      status TEXT NOT NULL,
      sprite_png BLOB NOT NULL,
      sprite_mime TEXT NOT NULL DEFAULT 'image/png',
      blob_paint BLOB NOT NULL,
      blob_mime TEXT NOT NULL,
      terrain_paint BLOB NOT NULL,
      terrain_mime TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
  `);
  migrateSubmissionsV2(db);
  return db;
}

function migrateSubmissionsV2(database: Database.Database): void {
  const cols = database.prepare(`PRAGMA table_info(submissions)`).all() as { name: string }[];
  if (!cols.some((c) => c.name === 'participant_name')) {
    database.exec(`ALTER TABLE submissions ADD COLUMN participant_name TEXT DEFAULT 'N/A'`);
  }
  if (!cols.some((c) => c.name === 'terrain_base_color')) {
    database.exec(`ALTER TABLE submissions ADD COLUMN terrain_base_color TEXT DEFAULT '#5F9569'`);
  }
}

function normalizeParticipantName(raw: string | undefined): string {
  const s = typeof raw === 'string' ? raw.trim() : '';
  return s.length > 0 ? s : 'N/A';
}

export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) return { mime: 'application/octet-stream', buffer: Buffer.alloc(0) };
  try {
    return { mime: m[1], buffer: Buffer.from(m[2], 'base64') };
  } catch {
    return { mime: m[1], buffer: Buffer.alloc(0) };
  }
}

export function toDataUrl(buf: Buffer, mime: string): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function rowToRecord(row: Record<string, unknown>): SubmissionRecord {
  const ai: AIClassificationResult = {
    emotion_id: row.emotion_id as string,
    emotion_label: row.emotion_label as string,
    confidence: row.confidence as number,
    valence: row.valence as number,
    activation: row.activation as number,
    reasoning_short: (row.reasoning_short as string | null) ?? undefined,
  };
  return {
    entry_id: row.entry_id as string,
    created_at: row.created_at as string,
    session_id: row.session_id as string,
    participant_name:
      typeof row.participant_name === 'string' && row.participant_name.trim()
        ? (row.participant_name as string)
        : 'N/A',
    input_text: row.input_text as string,
    input_language: (row.input_language as string | null) ?? undefined,
    ai_result: ai,
    paint_result: {
      blob_texture_data_url: toDataUrl(row.blob_paint as Buffer, row.blob_mime as string),
      terrain_base_color:
        typeof row.terrain_base_color === 'string' && row.terrain_base_color.trim()
          ? (row.terrain_base_color as string)
          : '#5F9569',
    },
    matrix_render: {
      sprite_png_data_url: toDataUrl(row.sprite_png as Buffer, row.sprite_mime as string),
    },
    status: row.status as SubmissionRecord['status'],
  };
}

export function listSubmissions(limit = 400): SubmissionRecord[] {
  const d = getDb();
  const rows = d
    .prepare(
      `SELECT * FROM submissions WHERE status = 'submitted' ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map(rowToRecord);
}

export function getSubmission(entryId: string): SubmissionRecord | null {
  const d = getDb();
  const row = d.prepare(`SELECT * FROM submissions WHERE entry_id = ?`).get(entryId) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToRecord(row) : null;
}

export function insertSubmission(record: SubmissionRecord): void {
  const sprite = parseDataUrl(record.matrix_render.sprite_png_data_url);
  const blob = parseDataUrl(record.paint_result.blob_texture_data_url);
  const d = getDb();
  d.prepare(
    `INSERT INTO submissions (
      entry_id, created_at, session_id, participant_name, input_text, input_language,
      emotion_id, emotion_label, confidence, valence, activation, reasoning_short, status,
      sprite_png, sprite_mime, blob_paint, blob_mime, terrain_paint, terrain_mime, terrain_base_color
    ) VALUES (
      @entry_id, @created_at, @session_id, @participant_name, @input_text, @input_language,
      @emotion_id, @emotion_label, @confidence, @valence, @activation, @reasoning_short, @status,
      @sprite_png, @sprite_mime, @blob_paint, @blob_mime, @terrain_paint, @terrain_mime, @terrain_base_color
    )`
  ).run({
    entry_id: record.entry_id,
    created_at: record.created_at,
    session_id: record.session_id,
    participant_name: normalizeParticipantName(record.participant_name),
    input_text: record.input_text,
    input_language: record.input_language ?? null,
    emotion_id: record.ai_result.emotion_id,
    emotion_label: record.ai_result.emotion_label,
    confidence: record.ai_result.confidence,
    valence: record.ai_result.valence,
    activation: record.ai_result.activation,
    reasoning_short: record.ai_result.reasoning_short ?? null,
    status: record.status,
    sprite_png: sprite.buffer,
    sprite_mime: sprite.mime || 'image/png',
    blob_paint: blob.buffer,
    blob_mime: blob.mime || 'image/jpeg',
    terrain_paint: Buffer.alloc(0),
    terrain_mime: 'application/octet-stream',
    terrain_base_color: record.paint_result.terrain_base_color || '#5F9569',
  });
}

export function replaceAllSubmissions(records: SubmissionRecord[]): void {
  const d = getDb();
  const del = d.prepare(`DELETE FROM submissions`);
  const insert = d.prepare(
    `INSERT INTO submissions (
      entry_id, created_at, session_id, participant_name, input_text, input_language,
      emotion_id, emotion_label, confidence, valence, activation, reasoning_short, status,
      sprite_png, sprite_mime, blob_paint, blob_mime, terrain_paint, terrain_mime, terrain_base_color
    ) VALUES (
      @entry_id, @created_at, @session_id, @participant_name, @input_text, @input_language,
      @emotion_id, @emotion_label, @confidence, @valence, @activation, @reasoning_short, @status,
      @sprite_png, @sprite_mime, @blob_paint, @blob_mime, @terrain_paint, @terrain_mime, @terrain_base_color
    )`
  );
  const runInsert = d.transaction((items: SubmissionRecord[]) => {
    del.run();
    for (const record of items) {
      const sprite = parseDataUrl(record.matrix_render.sprite_png_data_url);
      const blob = parseDataUrl(record.paint_result.blob_texture_data_url);
      insert.run({
        entry_id: record.entry_id,
        created_at: record.created_at,
        session_id: record.session_id,
        participant_name: normalizeParticipantName(record.participant_name),
        input_text: record.input_text,
        input_language: record.input_language ?? null,
        emotion_id: record.ai_result.emotion_id,
        emotion_label: record.ai_result.emotion_label,
        confidence: record.ai_result.confidence,
        valence: record.ai_result.valence,
        activation: record.ai_result.activation,
        reasoning_short: record.ai_result.reasoning_short ?? null,
        status: record.status,
        sprite_png: sprite.buffer,
        sprite_mime: sprite.mime || 'image/png',
        blob_paint: blob.buffer,
        blob_mime: blob.mime || 'image/jpeg',
        terrain_paint: Buffer.alloc(0),
        terrain_mime: 'application/octet-stream',
        terrain_base_color: record.paint_result.terrain_base_color || '#5F9569',
      });
    }
  });
  runInsert(records);
}

export function toMatrixEntries(records: SubmissionRecord[]): MatrixEntry[] {
  return records.map((r) => ({
    entry_id: r.entry_id,
    emotion_id: r.ai_result.emotion_id,
    sprite_png_data_url: r.matrix_render.sprite_png_data_url,
    valence: r.ai_result.valence,
    activation: r.ai_result.activation,
    created_at: r.created_at,
  }));
}
