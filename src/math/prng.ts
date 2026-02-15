/**
 * Seeded PRNG (Mulberry32) for deterministic coefficient generation.
 */
export function createPrng(seed: number): () => number {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0; // mulberry32
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box-Muller: two uniform [0,1] -> one standard normal. */
export function randn(rand: () => number): number {
  const u1 = rand();
  const u2 = rand();
  if (u1 <= 0) return randn(rand);
  const r = Math.sqrt(-2 * Math.log(u1));
  const theta = 2 * Math.PI * u2;
  return r * Math.cos(theta);
}
