/**
 * Skip OpenAI during UI/paint testing.
 *
 * Enable ONE of:
 * - `.env.local`: `VITE_USE_MOCK_CLASSIFY=true` (restart `npm run dev`)
 * - URL: open `http://localhost:3000/?mock=1` (no restart needed)
 */

import type { AIClassificationResult } from '../data/types';

/** Fixed result for local testing (matches MVP archetype c / awe). */
export const MOCK_CLASSIFICATION: AIClassificationResult = {
  emotion_id: 'emotion_c',
  emotion_label: 'awe',
  confidence: 0.92,
  valence: 0.35,
  activation: 0.42,
  reasoning_short: 'Mock response for testing paint and matrix without API calls.',
};

/**
 * Must read `import.meta.env.VITE_*` with a static property access so Vite inlines it.
 * Do not use `(import.meta as any).env?.KEY` — the flag stays undefined at runtime.
 */
export function isMockClassifyEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.VITE_USE_MOCK_CLASSIFY === 'true') return true;
  if (import.meta.env.VITE_USE_MOCK_CLASSIFY === 'true') return true;
  if (typeof window !== 'undefined') {
    try {
      if (new URLSearchParams(window.location.search).get('mock') === '1') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
