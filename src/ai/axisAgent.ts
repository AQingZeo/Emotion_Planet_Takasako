/**
 * AI agent: text -> { emotion_id, valence, activation, ... }.
 * Uses OpenAI (gpt-4o-mini). JSON-only response; clamp to [-1,1]; fallback on failure.
 * MVP: emotion_id ∈ {emotion_a, emotion_b, emotion_c}; emotion_label always canonical from config.
 */

import { appendResponseLog } from './responseLog';
import { EMOTION_AXIS_SYSTEM_PROMPT } from './emotionAxisPrompt';
import { ALLOWED_EMOTION_IDS, EMOTION_ARCHETYPES, getEmotionArchetype } from '../config/emotions';
import type { AIClassificationResult } from '../data/types';
import { isMockClassifyEnabled, MOCK_CLASSIFICATION } from './mockClassification';

export type AxisAgentResponse = AIClassificationResult;

/** Result plus raw JSON string from the model for debugging. */
export interface ClassifyResult {
  result: AxisAgentResponse;
  rawJson: string;
}

/** Round to 2 decimal places for consistent coordinate variation. */
export function roundTo2(x: number): number {
  return Math.round(x * 100) / 100;
}

function clampOnly(x: number): number {
  return Math.max(-1, Math.min(1, x));
}

/** Map free-form English (label/reasoning) to closest allowed id when model returns invalid id. */
function inferEmotionIdFromText(text: string): string | null {
  const s = text.toLowerCase();
  if (/\b(adoration|adore|adoring|affection|tender|loving)\b/.test(s)) return 'emotion_a';
  if (/\b(excitement|excited|thrill|thrilled|energized|pumped|elated)\b/.test(s)) return 'emotion_b';
  if (/\b(awe|awesome|wonder|wonderous|curiosity|curious|sublime|vast)\b/.test(s)) return 'emotion_c';
  return null;
}

function normalizeEmotionId(rawId: unknown, rawLabel: unknown, reasoning?: unknown): string {
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (ALLOWED_EMOTION_IDS.includes(id)) return id;
  const label = typeof rawLabel === 'string' ? rawLabel : '';
  const reason = typeof reasoning === 'string' ? reasoning : '';
  const inferred =
    inferEmotionIdFromText(label) ?? inferEmotionIdFromText(reason) ?? inferEmotionIdFromText(`${label} ${reason}`);
  if (inferred) return inferred;
  return EMOTION_ARCHETYPES[0]?.id ?? 'emotion_a';
}

function canonicalLabelForId(emotionId: string): string {
  return getEmotionArchetype(emotionId)?.label ?? EMOTION_ARCHETYPES[0]?.label ?? 'adoration';
}

export function parseAgentResponse(jsonText: string): AxisAgentResponse {
  const fallbackId = EMOTION_ARCHETYPES[0]?.id ?? 'emotion_a';
  try {
    const raw = JSON.parse(jsonText) as Record<string, unknown>;
    const emotion_id = normalizeEmotionId(raw.emotion_id, raw.emotion_label, raw.reasoning_short);
    const confidence = clampOnly(Number(raw.confidence) || 0);
    const valence = roundTo2(clampOnly(Number(raw.valence) || 0));
    const activation = roundTo2(clampOnly(Number(raw.activation) ?? Number(raw.arousal) ?? 0));
    const reasoning_short =
      typeof raw.reasoning_short === 'string' ? raw.reasoning_short : undefined;
    return {
      emotion_id,
      emotion_label: canonicalLabelForId(emotion_id),
      confidence,
      valence,
      activation,
      reasoning_short,
    };
  } catch {
    return {
      emotion_id: fallbackId,
      emotion_label: canonicalLabelForId(fallbackId),
      confidence: 0,
      valence: 0,
      activation: 0,
    };
  }
}

declare const process: { env: { OPENAI_API_KEY?: string; API_KEY?: string } } | undefined;

const getApiKey = (): string => {
  if (typeof process !== 'undefined' && process.env?.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (typeof process !== 'undefined' && process.env?.API_KEY) return process.env.API_KEY;
  if (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_OPENAI_API_KEY)
    return (import.meta as unknown as { env: Record<string, string> }).env.VITE_OPENAI_API_KEY;
  return '';
};

const OPENAI_MODEL = 'gpt-4o-mini';

export async function classifyEmotion(text: string): Promise<ClassifyResult> {
  const fallbackId = EMOTION_ARCHETYPES[0]?.id ?? 'emotion_a';
  const fallback: AxisAgentResponse = {
    emotion_id: fallbackId,
    emotion_label: canonicalLabelForId(fallbackId),
    confidence: 0,
    valence: 0,
    activation: 0,
  };
  if (isMockClassifyEnabled()) {
    const result: AxisAgentResponse = {
      ...MOCK_CLASSIFICATION,
      emotion_label: canonicalLabelForId(MOCK_CLASSIFICATION.emotion_id),
    };
    const rawJson = JSON.stringify({ mock: true, ...result });
    logResponse(text, rawJson, result);
    return { result, rawJson };
  }
  const noKey: ClassifyResult = { result: fallback, rawJson: '{"reason":"no_api_key"}' };
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn('No OpenAI API key; returning fallback.');
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
      temperature: 0.15,
      max_tokens: 256,
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
