/**
 * AI agent: text -> { valence, arousal, label }.
 * Uses OpenAI (gpt-4o-mini). JSON-only response; clamp to [-1,1]; fallback {0,0} on failure.
 */

import { appendResponseLog } from './responseLog';
import { EMOTION_AXIS_SYSTEM_PROMPT } from './emotionAxisPrompt';

export interface AxisAgentResponse {
  valence: number;
  arousal: number;
  /** -1 = more typical of young, +1 = more typical of mature/old */
  maturity: number;
  label: string;
}

/** Result plus raw JSON string from the model for debugging. */
export interface ClassifyResult {
  result: AxisAgentResponse;
  rawJson: string;
}

function clamp(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

/** Round to 2 decimal places for consistent valence/arousal variation. */
export function roundTo2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** Clamp only; do not round (ChatGPT returns 2 decimal places). */
function clampOnly(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

export function parseAgentResponse(jsonText: string): AxisAgentResponse {
  try {
    const raw = JSON.parse(jsonText);
    const valence = clampOnly(Number(raw.valence) || 0);
    const arousal = clampOnly(Number(raw.arousal) || 0);
    const maturity = clampOnly(Number(raw.maturity) ?? 0);
    const label = typeof raw.label === 'string' ? raw.label : 'neutral';
    return { valence, arousal, maturity, label };
  } catch {
    return { valence: 0, arousal: 0, maturity: 0, label: 'neutral' };
  }
}

declare const process: { env: { OPENAI_API_KEY?: string; API_KEY?: string } } | undefined;

const getApiKey = (): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_OPENAI_API_KEY)
    return (import.meta as unknown as { env: Record<string, string> }).env.VITE_OPENAI_API_KEY;
  if (typeof process !== 'undefined' && process?.env?.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (typeof process !== 'undefined' && process?.env?.API_KEY) return process.env.API_KEY;
  return '';
};

const OPENAI_MODEL = 'gpt-4o-mini';

export async function classifyEmotion(text: string): Promise<ClassifyResult> {
  const fallback: AxisAgentResponse = {
    valence: 0,
    arousal: 0,
    maturity: 0,
    label: (text || 'neutral').slice(0, 32),
  };
  const noKey: ClassifyResult = { result: fallback, rawJson: '{"reason":"no_api_key"}' };
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('No OpenAI API key; returning neutral.');
    logResponse(text, noKey.rawJson, fallback);
    return noKey;
  }

  const userMessage = `Analyze the emotion or emotional state: "${text}"`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: EMOTION_AXIS_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 128,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('OpenAI API error', res.status, err);
    const errPayload = JSON.stringify({ error: res.status, body: err });
    logResponse(text, errPayload, fallback);
    return { result: fallback, rawJson: errPayload };
  }

  const data = await res.json();
  const part = data?.choices?.[0]?.message?.content?.trim() ?? '';
  if (!part) {
    const raw = JSON.stringify(data, null, 2);
    logResponse(text, raw, fallback);
    return { result: fallback, rawJson: raw };
  }
  const result = parseAgentResponse(part);
  console.log('[OpenAI raw]', part);
  logResponse(text, part, result);
  return { result, rawJson: part };
}

function logResponse(input: string, rawJson: string, result: AxisAgentResponse): void {
  try {
    appendResponseLog(input, rawJson, result);
  } catch (_) {}
}
