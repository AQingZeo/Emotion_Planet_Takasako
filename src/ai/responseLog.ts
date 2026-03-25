/**
 * Persist and export a collection of API responses for debugging.
 * Stored in localStorage; can be downloaded as emotion-planet-responses.json.
 */

import type { AxisAgentResponse } from './axisAgent';

const STORAGE_KEY = 'emotion-planet-response-log';
const MAX_ENTRIES = 100;

export interface ResponseLogEntry {
  timestamp: string;
  input: string;
  rawJson: string;
  result: AxisAgentResponse;
}

function loadLog(): ResponseLogEntry[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLog(entries: ResponseLogEntry[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries, null, 0));
  } catch (_) {}
}

/**
 * Append one response to the log (persisted to localStorage).
 */
export function appendResponseLog(
  input: string,
  rawJson: string,
  result: AxisAgentResponse
): void {
  const entries = loadLog();
  entries.unshift({
    timestamp: new Date().toISOString(),
    input,
    rawJson,
    result,
  });
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  saveLog(entries);
}

/**
 * Get the full collection (for UI or export).
 */
export function getResponseLog(): ResponseLogEntry[] {
  return loadLog();
}

/**
 * Clear the stored log.
 */
export function clearResponseLog(): void {
  saveLog([]);
}

/**
 * JSON string for download (pretty-printed for easier debug in codebase).
 */
export function getResponseLogExportJson(): string {
  return JSON.stringify(loadLog(), null, 2);
}
