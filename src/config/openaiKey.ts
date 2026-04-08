/**
 * Single place to read the OpenAI API key. Server: `process.env` after `server/envBootstrap.ts`.
 * Canonical name: OPENAI_API_KEY. Aliases supported for older setups / Vite-style names.
 */

export const OPENAI_API_KEY_ENV_NAMES = [
  'OPENAI_API_KEY',
  'VITE_OPENAI_API_KEY',
  'API_KEY',
] as const;

function normalizeEnvValue(raw: string | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/^\uFEFF/, '').trim();
}

/** Node / Express: read from process.env (all supported names). */
export function readOpenAiApiKeyFromProcess(): string {
  if (typeof process === 'undefined' || !process.env) return '';
  for (const name of OPENAI_API_KEY_ENV_NAMES) {
    const v = normalizeEnvValue(process.env[name]);
    if (v) return v;
  }
  return '';
}

export function isOpenAiKeyConfigured(): boolean {
  return readOpenAiApiKeyFromProcess().length > 0;
}

/** Vite client bundle only — `import.meta.env.VITE_OPENAI_API_KEY` if present. */
export function readOpenAiApiKeyFromImportMeta(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    return normalizeEnvValue(env?.VITE_OPENAI_API_KEY);
  } catch {
    return '';
  }
}

/** Process first, then Vite client meta. */
export function readOpenAiApiKey(): string {
  return readOpenAiApiKeyFromProcess() || readOpenAiApiKeyFromImportMeta();
}
