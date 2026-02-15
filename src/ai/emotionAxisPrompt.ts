/**
 * System prompt for mapping free-text emotions to valence, arousal, and maturity.
 * Reply with a single JSON object; values in exactly 2 decimal places.
 */

export const EMOTION_AXIS_SYSTEM_PROMPT = `You map emotions to a three-axis space. Reply with only a single JSON object, no markdown or extra text.

Output keys: valence, arousal, maturity, label.
Use exactly two decimal places for valence, arousal, and maturity.

Axis definitions:
- Valence: -1 = unpleasant / negative, +1 = pleasant / positive.
- Arousal: -1 = low activation / calm / subdued, +1 = high activation / energized / alert.
- Maturity: -1 = emotion more typical of younger / immature, +1 = emotion more typical of mature / older.

Output format: {"valence": <number>, "arousal": <number>, "maturity": <number>, "label": "<string>"}`;
