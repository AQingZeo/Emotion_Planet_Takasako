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
 * Vite inlines `import.meta.env.VITE_*` in the client bundle. On Node (Express `tsx`),
 * `import.meta.env` may be missing — guard before the static `VITE_*` read.
 */
export function isMockClassifyEnabled(): boolean {
  if (typeof process !== 'undefined' && process.env?.VITE_USE_MOCK_CLASSIFY === 'true') return true;
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.VITE_USE_MOCK_CLASSIFY === 'true'
  ) {
    return true;
  }
  if (typeof window !== 'undefined') {
    try {
      if (new URLSearchParams(window.location.search).get('mock') === '1') return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}
