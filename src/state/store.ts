/**
 * Central state for Emotion Planet.
 * Single source of truth: seed, valence, arousal, label, map data.
 */

export interface EmotionState {
  seed: number;
  valence: number;
  arousal: number;
  /** -1 = more typical of young, +1 = more typical of mature/old. Position only, not shape. */
  maturity: number;
  label: string;
  /** Map grid width */
  mapWidth: number;
  /** Map grid height */
  mapHeight: number;
  /** Raw height values (row-major, mapWidth * mapHeight) */
  mapData: Float32Array;
  /** Normalized to [-1,1] for display */
  mapMin: number;
  mapMax: number;
}

const MAP_WIDTH = 512;
const MAP_HEIGHT = 512;

export function createEmptyState(): EmotionState {
  const mapData = new Float32Array(MAP_WIDTH * MAP_HEIGHT);
  return {
    seed: 0,
    valence: 0,
    arousal: 0,
    maturity: 0,
    label: '',
    mapWidth: MAP_WIDTH,
    mapHeight: MAP_HEIGHT,
    mapData,
    mapMin: 0,
    mapMax: 0,
  };
}

export const DEFAULT_MAP_WIDTH = MAP_WIDTH;
export const DEFAULT_MAP_HEIGHT = MAP_HEIGHT;
