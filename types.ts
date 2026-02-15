
export interface EmotionData {
  id: string;
  name: string;
  valence: number; // -1 (Negative) to 1 (Positive)
  arousal: number; // -1 (Passive) to 1 (Active)
  timestamp: number;
}

export type ShaderMode = 'wireframe' | 'watercolor';

export interface ShapeConfig {
  points: number;
  shaderMode: ShaderMode;
  thickness: number;
}
