/**
 * Static emotion archetypes: maps id → GLB paths under /public.
 * MVP: three emotions with assets; expand to 24 as models are added.
 */

export interface EmotionArchetype {
  id: string;
  label: string;
  blobModel: string;
  terrainModel: string;
}

/** MVP subset with real assets in public/assets/emotions/ */
export const EMOTION_ARCHETYPES: EmotionArchetype[] = [
  {
    id: 'emotion_a',
    label: 'adoration',
    blobModel: '/assets/emotions/emotion_a_adoration/blob.glb',
    terrainModel: '/assets/emotions/emotion_a_adoration/terrain.glb',
  },
  {
    id: 'emotion_b',
    label: 'excitement',
    blobModel: '/assets/emotions/emotion_b_excitement/blob.glb',
    terrainModel: '/assets/emotions/emotion_b_excitement/terrain.glb',
  },
  {
    id: 'emotion_c',
    label: 'awe',
    blobModel: '/assets/emotions/emotion_c_awe/blob.glb',
    terrainModel: '/assets/emotions/emotion_c_awe/terrain.glb',
  },
];

const byId = new Map(EMOTION_ARCHETYPES.map((e) => [e.id, e]));

export function getEmotionArchetype(id: string): EmotionArchetype | undefined {
  return byId.get(id);
}

export function isValidEmotionId(id: string): boolean {
  return byId.has(id);
}

/** IDs the model may return (MVP = same as archetypes). */
export const ALLOWED_EMOTION_IDS: readonly string[] = EMOTION_ARCHETYPES.map((e) => e.id);
