/**
 * Deterministic 32-bit hash from string.
 * Used to derive seed from normalized user text.
 */
const C1 = 0xcc9e2d51 | 0;
const C2 = 0x1b873593 | 0;
const R1 = 15;
const R2 = 13;
const M = 5;
const N = 0xe6546b64 | 0;

function mul32(a: number, b: number): number {
  return (a * b) >>> 0;
}

function rotl32(x: number, r: number): number {
  return (x << r) | (x >>> (32 - r));
}

export function hash32(str: string): number {
  const bytes = new TextEncoder().encode(str);
  let h = 0 | 0;
  const len = bytes.length;
  const nblocks = len >>> 2;

  for (let i = 0; i < nblocks; i++) {
    let k = (bytes[i * 4 + 3] << 24) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 1] << 8) | bytes[i * 4];
    k = mul32(k, C1);
    k = rotl32(k, R1);
    k = mul32(k, C2);
    h ^= k;
    h = rotl32(h, R2);
    h = mul32(h, M) + N;
  }

  let k = 0;
  const tail = len & 3;
  if (tail >= 3) k ^= bytes[nblocks * 4 + 2] << 16;
  if (tail >= 2) k ^= bytes[nblocks * 4 + 1] << 8;
  if (tail >= 1) {
    k ^= bytes[nblocks * 4];
    k = mul32(k, C1);
    k = rotl32(k, R1);
    k = mul32(k, C2);
    h ^= k;
  }

  h ^= len;
  h ^= h >>> 16;
  h = mul32(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = mul32(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Normalize unicode then hash. */
export function hashFromText(text: string): number {
  const normalized = (text || '').trim().normalize('NFKC');
  return hash32(normalized);
}
