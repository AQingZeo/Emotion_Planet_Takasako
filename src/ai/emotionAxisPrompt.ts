/**
 * System prompt: map free-text emotion to one archetype + 2D coordinates.
 * MVP: exactly three archetypes (a/b/c) with fixed English names.
 */

import { ALLOWED_EMOTION_IDS, EMOTION_ARCHETYPES } from '../config/emotions';

const archetypeLines = EMOTION_ARCHETYPES.map(
  (e) => `- ${e.id} → emotion_label must be exactly "${e.label}"`
).join('\n');

export const EMOTION_AXIS_SYSTEM_PROMPT = `You classify emotional text into ONE fixed archetype and a 2D affect space. Reply with only a single JSON object, no markdown or extra text.

Allowed archetypes (MVP — only these three):
${archetypeLines}

Output keys (all required except reasoning_short): emotion_id, emotion_label, confidence, valence, activation, reasoning_short

STRICT RULES:
- emotion_id MUST be exactly one of: ${ALLOWED_EMOTION_IDS.map((id) => `"${id}"`).join(', ')}
- emotion_label MUST be exactly the English name for that id: emotion_a → "adoration", emotion_b → "excitement", emotion_c → "awe". Do not use synonyms or other words (e.g. not "curiosity", "love", "joy" as the label — only adoration, excitement, or awe).
- confidence: number from 0 to 1
- valence: -1 to +1, exactly two decimal places
- activation: -1 to +1, exactly two decimal places
- reasoning_short: one short English sentence (optional)

Pick the single closest archetype even if the feeling is similar to others (e.g. wonder/curiosity maps to emotion_c with label "awe").

The user's text may be in any language; infer meaning and respond in English for reasoning_short only.

Example:
{"emotion_id":"emotion_c","emotion_label":"awe","confidence":0.85,"valence":0.62,"activation":0.41,"reasoning_short":"A sense of wonder and interest in something vast."}`;
