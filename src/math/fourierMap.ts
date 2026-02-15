/**
 * Tileable 2D trigonometric polynomial map H(u,v).
 * Coefficients are fixed per seed/valence/arousal; map does not change over time.
 */

import { createPrng, randn } from './prng';

const TAU = 2 * Math.PI;

/** Modes with |k-l| >= this are "axis-aligned" (variation on both u and v). */
export const AXIS_ALIGNED_THRESHOLD = 3;

export interface FourierConfig {
  K: number;
  L: number;
  decayP: number;
  /** Number of active modes. */
  M: number;
  /** Spectral tilt for valence: positive = rounder, negative = spikier. */
  tilt: number;
  seed: number;
  /** Min modes that are axis-aligned (|k-l| >= AXIS_ALIGNED_THRESHOLD) for variation on both axes. */
  axisAlignedMin?: number;
}

export interface FourierCoeff {
  k: number;
  l: number;
  a: number;
  b: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Build list of (k,l) mode indices, 1..K and 1..L, excluding (0,0).
 * If axisAlignedMin > 0, ensures that many modes have |k-l| >= AXIS_ALIGNED_THRESHOLD
 * so the map varies on both u and v axes (not just diagonal).
 */
function selectModes(
  K: number,
  L: number,
  M: number,
  rand: () => number,
  axisAlignedMin: number = 0
): Array<{ k: number; l: number }> {
  const all: Array<{ k: number; l: number }> = [];
  for (let k = 1; k <= K; k++) {
    for (let l = 1; l <= L; l++) {
      all.push({ k, l });
    }
  }
  const shuffle = (arr: Array<{ k: number; l: number }>) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };
  const key = (m: { k: number; l: number }) => `${m.k},${m.l}`;
  const axisAligned = all.filter((m) => Math.abs(m.k - m.l) >= AXIS_ALIGNED_THRESHOLD);
  shuffle(axisAligned);
  shuffle(all);
  const used = new Set<string>();
  const selected: Array<{ k: number; l: number }> = [];
  const take = (m: { k: number; l: number }) => {
    if (!used.has(key(m))) {
      used.add(key(m));
      selected.push(m);
    }
  };
  const wantAxis = Math.min(axisAlignedMin, axisAligned.length, M);
  for (let i = 0; i < wantAxis; i++) take(axisAligned[i]);
  for (let i = 0; i < all.length && selected.length < M; i++) take(all[i]);
  return selected;
}

/**
 * Generate coefficients for the trig polynomial.
 * Arousal -> M active modes. Valence -> tilt (amplitude weight by frequency).
 */
export function generateCoefficients(config: FourierConfig): FourierCoeff[] {
  const { K, L, decayP, M, tilt, seed, axisAlignedMin = 0 } = config;
  const rand = createPrng(seed);
  const modes = selectModes(K, L, M, rand, axisAlignedMin);
  const coeffs: FourierCoeff[] = [];

  for (const { k, l } of modes) {
    const freq = Math.sqrt(k * k + l * l);
    const amp = 1 / Math.pow(k * k + l * l, decayP);
    const weight = Math.exp(tilt * freq);
    const scale = amp * weight;
    const a = randn(rand) * scale;
    const b = randn(rand) * scale;
    coeffs.push({ k, l, a, b });
  }

  return coeffs;
}

/**
 * Evaluate H(u,v) = sum over coeffs of a*cos(2π(ku+lv)) + b*sin(2π(ku+lv)).
 * u, v in [0,1]; tileable.
 */
export function evaluateH(u: number, v: number, coeffs: FourierCoeff[]): number {
  let sum = 0;
  for (const { k, l, a, b } of coeffs) {
    const phase = TAU * (k * u + l * v);
    sum += a * Math.cos(phase) + b * Math.sin(phase);
  }
  return sum;
}

/**
 * Fill a Float32Array with H(u,v) over a grid.
 * width, height = grid size (e.g. 512 x 512).
 * Values are raw; caller may normalize to [-1,1] for display.
 */
export function fillMapBuffer(
  buffer: Float32Array,
  width: number,
  height: number,
  coeffs: FourierCoeff[]
): void {
  for (let j = 0; j < height; j++) {
    const v = j / (height - 1 || 1);
    for (let i = 0; i < width; i++) {
      const u = i / (width - 1 || 1);
      buffer[j * width + i] = evaluateH(u, v, coeffs);
    }
  }
}

/**
 * Compute min/max of buffer.
 */
export function getMapRange(buffer: Float32Array): { min: number; max: number } {
  let min = buffer[0];
  let max = buffer[0];
  for (let i = 1; i < buffer.length; i++) {
    const v = buffer[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min, max };
}

/**
 * Robust scale: stddev of buffer. Avoid over-normalizing (no maxAbs).
 */
export function getMapStddev(buffer: Float32Array): number {
  let sum = 0;
  const n = buffer.length;
  for (let i = 0; i < n; i++) sum += buffer[i];
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = buffer[i] - mean;
    sq += d * d;
  }
  return Math.sqrt(sq / Math.max(1, n));
}

/**
 * Light normalization: x = clamp(raw / (3*sigma), -1, 1). Preserves relative energy.
 */
export function applySigmaScale(buffer: Float32Array, sigma: number): void {
  if (sigma <= 0) return;
  const scale = 1 / (3 * sigma);
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = Math.max(-1, Math.min(1, buffer[i] * scale));
  }
}

/**
 * Spike shaping for negative valence: sharpen peaks only (no amplitude boost).
 * Amplitude is controlled only by |arousal| via applyArousalAmplitude.
 * n = clamp(-valence, 0, 1). Peaks: pSharp = p^gamma (needle-like when valence negative).
 */
export function applySpikeShaping(buffer: Float32Array, valence: number): void {
  const n = Math.max(0, Math.min(1, -valence));
  const gamma = lerp(1.0, 0.22, n);
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    const p = Math.max(x, 0);
    const pSharp = p <= 0 ? 0 : Math.pow(p, gamma);
    const negPart = Math.max(-x, 0);
    buffer[i] = pSharp - negPart;
  }
}

/**
 * Asymmetric spectral tilt: positive valence → smooth; negative → strong high-freq.
 * valence >= 0: kappa ≈ -0.05 (smooth); valence < 0: kappa ≈ +0.35 (spiky).
 */
export function valenceToTilt(valence: number): number {
  if (valence >= 0) return -0.05 * valence;
  return 0.35 * (-valence);
}

/**
 * Map arousal [-1,1] to number of active modes: -1 = few (4, spiky), +1 = many (60, round).
 * Lower mode count → spikier; higher → rounder. Positively linear in arousal.
 */
export function arousalToModeCount(arousal: number): number {
  const s = (arousal + 1) / 2; // [0,1]: -1 -> 0, +1 -> 1
  return Math.round(lerp(4, 60, s)); // -1 -> 4 (spiky), +1 -> 60 (round)
}

/**
 * Scale map amplitude by |arousal|: |arousal| close to 1 = higher amplitude (spiky/round), 0 = lower.
 * Very negative emotion (high |arousal|) → high amplitude; low |arousal| → subtle.
 */
export function applyArousalAmplitude(buffer: Float32Array, arousal: number): void {
  const scale = 0.2 + 0.8 * Math.min(1, Math.abs(arousal));
  for (let i = 0; i < buffer.length; i++) buffer[i] *= scale;
}

/**
 * Sharpen peaks and valleys (symmetric V-shape). Gamma tied to arousal:
 * arousal -1 -> gamma 0.05 (steepest), arousal +1 -> gamma 0.35 (mild).
 * Optional gammaOverride: when set (e.g. debug), use it instead of arousal-based gamma.
 */
export function applyArousalPeakSharpening(
  buffer: Float32Array,
  arousal: number,
  gammaOverride?: number
): void {
  const gamma =
    gammaOverride !== undefined
      ? gammaOverride
      : lerp(0.05, 0.35, (arousal + 1) / 2);
  for (let i = 0; i < buffer.length; i++) {
    const x = buffer[i];
    const p = Math.max(x, 0);
    const negPart = Math.max(-x, 0);
    const pSharp = p <= 0 ? 0 : Math.pow(p, gamma);
    const negSharp = negPart <= 0 ? 0 : Math.pow(negPart, gamma);
    buffer[i] = pSharp - negSharp;
  }
}
