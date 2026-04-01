/**
 * Static emotion archetypes: maps id → GLB paths under /public.
 * 24 emotions (emotion_a … emotion_x); folder name is emotion_<id>_<label>.
 */

export interface EmotionArchetype {
  id: string;
  label: string;
  blobModel: string;
  terrainModel: string;
}

/** Full set with assets under public/assets/emotions/ */
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
  {
    id: 'emotion_d',
    label: 'anger',
    blobModel: '/assets/emotions/emotion_d_anger/blob.glb',
    terrainModel: '/assets/emotions/emotion_d_anger/terrain.glb',
  },
  {
    id: 'emotion_e',
    label: 'confusion',
    blobModel: '/assets/emotions/emotion_e_confusion/blob.glb',
    terrainModel: '/assets/emotions/emotion_e_confusion/terrain.glb',
  },
  {
    id: 'emotion_f',
    label: 'contempt',
    blobModel: '/assets/emotions/emotion_f_contempt/blob.glb',
    terrainModel: '/assets/emotions/emotion_f_contempt/terrain.glb',
  },
  {
    id: 'emotion_g',
    label: 'contentment',
    blobModel: '/assets/emotions/emotion_g_contentment/blob.glb',
    terrainModel: '/assets/emotions/emotion_g_contentment/terrain.glb',
  },
  {
    id: 'emotion_h',
    label: 'desire',
    blobModel: '/assets/emotions/emotion_h_desire/blob.glb',
    terrainModel: '/assets/emotions/emotion_h_desire/terrain.glb',
  },
  {
    id: 'emotion_i',
    label: 'disappointment',
    blobModel: '/assets/emotions/emotion_i_disappointment/blob.glb',
    terrainModel: '/assets/emotions/emotion_i_disappointment/terrain.glb',
  },
  {
    id: 'emotion_j',
    label: 'disgust',
    blobModel: '/assets/emotions/emotion_j_disgust/blob.glb',
    terrainModel: '/assets/emotions/emotion_j_disgust/terrain.glb',
  },
  {
    id: 'emotion_k',
    label: 'distress',
    blobModel: '/assets/emotions/emotion_k_distress/blob.glb',
    terrainModel: '/assets/emotions/emotion_k_distress/terrain.glb',
  },
  {
    id: 'emotion_l',
    label: 'ecstacy',
    blobModel: '/assets/emotions/emotion_l_ecstacy/blob.glb',
    terrainModel: '/assets/emotions/emotion_l_ecstacy/terrain.glb',
  },
  {
    id: 'emotion_m',
    label: 'elation',
    blobModel: '/assets/emotions/emotion_m_elation/blob.glb',
    terrainModel: '/assets/emotions/emotion_m_elation/terrain.glb',
  },
  {
    id: 'emotion_n',
    label: 'embarrasment',
    blobModel: '/assets/emotions/emotion_n_embarrasment/blob.glb',
    terrainModel: '/assets/emotions/emotion_n_embarrasment/terrain.glb',
  },
  {
    id: 'emotion_o',
    label: 'fear',
    blobModel: '/assets/emotions/emotion_o_fear/blob.glb',
    terrainModel: '/assets/emotions/emotion_o_fear/terrain.glb',
  },
  {
    id: 'emotion_p',
    label: 'interest',
    blobModel: '/assets/emotions/emotion_p_interest/blob.glb',
    terrainModel: '/assets/emotions/emotion_p_interest/terrain.glb',
  },
  {
    id: 'emotion_q',
    label: 'pain',
    blobModel: '/assets/emotions/emotion_q_pain/blob.glb',
    terrainModel: '/assets/emotions/emotion_q_pain/terrain.glb',
  },
  {
    id: 'emotion_r',
    label: 'realization',
    blobModel: '/assets/emotions/emotion_r_realization/blob.glb',
    terrainModel: '/assets/emotions/emotion_r_realization/terrain.glb',
  },
  {
    id: 'emotion_s',
    label: 'relief',
    blobModel: '/assets/emotions/emotion_s_relief/blob.glb',
    terrainModel: '/assets/emotions/emotion_s_relief/terrain.glb',
  },
  {
    id: 'emotion_t',
    label: 'sad',
    blobModel: '/assets/emotions/emotion_t_sad/blob.glb',
    terrainModel: '/assets/emotions/emotion_t_sad/terrain.glb',
  },
  {
    id: 'emotion_u',
    label: 'negsurprise',
    blobModel: '/assets/emotions/emotion_u_negsurprise/blob.glb',
    terrainModel: '/assets/emotions/emotion_u_negsurprise/terrain.glb',
  },
  {
    id: 'emotion_v',
    label: 'possurprise',
    blobModel: '/assets/emotions/emotion_v_possurprise/blob.glb',
    terrainModel: '/assets/emotions/emotion_v_possurprise/terrain.glb',
  },
  {
    id: 'emotion_w',
    label: 'sympathy',
    blobModel: '/assets/emotions/emotion_w_sympathy/blob.glb',
    terrainModel: '/assets/emotions/emotion_w_sympathy/terrain.glb',
  },
  {
    id: 'emotion_x',
    label: 'triumph',
    blobModel: '/assets/emotions/emotion_x_triumph/blob.glb',
    terrainModel: '/assets/emotions/emotion_x_triumph/terrain.glb',
  },
];

const byId = new Map(EMOTION_ARCHETYPES.map((e) => [e.id, e]));

export function getEmotionArchetype(id: string): EmotionArchetype | undefined {
  return byId.get(id);
}

export function isValidEmotionId(id: string): boolean {
  return byId.has(id);
}

/** IDs the model may return (same as archetypes). */
export const ALLOWED_EMOTION_IDS: readonly string[] = EMOTION_ARCHETYPES.map((e) => e.id);
