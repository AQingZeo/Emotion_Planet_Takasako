/**
 * HTTP client for local Express API (classify + submissions).
 */

import type { ClassifyResult } from '../ai/axisAgent';
import type { SubmissionRecord } from '../data/types';

export async function fetchClassify(text: string): Promise<ClassifyResult> {
  const r = await fetch('/api/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) {
    throw new Error((await r.text()) || `classify failed: ${r.status}`);
  }
  return r.json() as Promise<ClassifyResult>;
}

export async function fetchSubmissions(): Promise<SubmissionRecord[]> {
  const r = await fetch('/api/submissions');
  if (!r.ok) throw new Error(`GET submissions failed: ${r.status}`);
  return r.json() as Promise<SubmissionRecord[]>;
}

export async function fetchSubmission(entryId: string): Promise<SubmissionRecord | null> {
  const r = await fetch(`/api/submissions/${encodeURIComponent(entryId)}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET submission failed: ${r.status}`);
  return r.json() as Promise<SubmissionRecord>;
}

export async function postSubmission(record: SubmissionRecord): Promise<boolean> {
  const r = await fetch('/api/submissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record),
  });
  return r.ok;
}

export async function putSubmissionsAll(records: SubmissionRecord[]): Promise<boolean> {
  const r = await fetch('/api/submissions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  });
  return r.ok;
}
