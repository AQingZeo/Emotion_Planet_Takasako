/**
 * Sprite PNG pipeline: greenscreen removal (edge-connected) + trim + fog cleanup.
 */

/** Must match capture clear / scene.background in paintView3D (opaque #00FF00). */
const KEY_R = 0;
const KEY_G = 255;
const KEY_B = 0;
/** Squared Euclidean distance tolerance in RGB for key + MSAA fringe. */
const KEY_COLOR_TOL_SQ = 50 * 50;

const PAD_PX = 2;
/** Row/column treated as "empty" if every pixel has alpha at or below this (edge trim). */
const EDGE_EMPTY_ALPHA = 14;
/** Pixels at or below this alpha are cleared (after fog pass). */
const ALPHA_ZERO_CUTOFF = 52;
/** Ignore very faint pixels when measuring content for bbox (after clean). */
const CONTENT_ALPHA_MIN = 22;

function isGreenKey(r: number, g: number, b: number): boolean {
  const dr = r - KEY_R;
  const dg = g - KEY_G;
  const db = b - KEY_B;
  return dr * dr + dg * dg + db * db <= KEY_COLOR_TOL_SQ;
}

/**
 * Flood-fill from image border: remove key-green connected to edges.
 * Followed by `removeRemainingGreenscreenKey` (holes through mesh + any leftover key color).
 */
function removeGreenscreenConnectedToEdges(d: Uint8ClampedArray, w: number, h: number): void {
  const n = w * h;
  const visited = new Uint8Array(n);
  const queue = new Uint32Array(n);
  let head = 0;
  let tail = 0;

  const idx = (x: number, y: number): number => y * w + x;

  const trySeed = (x: number, y: number): void => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = idx(x, y);
    if (visited[i]) return;
    const p = i * 4;
    const r = d[p];
    const g = d[p + 1];
    const b = d[p + 2];
    if (!isGreenKey(r, g, b)) return;
    visited[i] = 1;
    d[p] = 0;
    d[p + 1] = 0;
    d[p + 2] = 0;
    d[p + 3] = 0;
    queue[tail++] = i;
  };

  for (let x = 0; x < w; x++) {
    trySeed(x, 0);
    trySeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    trySeed(0, y);
    trySeed(w - 1, y);
  }

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % w;
    const cy = (cur / w) | 0;
    const neigh = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const ni = idx(nx, ny);
      if (visited[ni]) continue;
      const p = ni * 4;
      const r = d[p];
      const g = d[p + 1];
      const b = d[p + 2];
      if (!isGreenKey(r, g, b)) continue;
      visited[ni] = 1;
      d[p] = 0;
      d[p + 1] = 0;
      d[p + 2] = 0;
      d[p + 3] = 0;
      queue[tail++] = ni;
    }
  }
}

/**
 * After edge-connected flood: still-green pixels = holes / interior seeing greenscreen through mesh.
 * Also removes any exact key-green user paint (same RGB as clear color).
 */
function removeRemainingGreenscreenKey(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (!isGreenKey(r, g, b)) continue;
    d[i] = 0;
    d[i + 1] = 0;
    d[i + 2] = 0;
    d[i + 3] = 0;
  }
}

/**
 * Remove MSAA fringe, near-transparent pixels, and bright white "fog" that still has alpha.
 */
function cleanSpritePixels(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const lum = (r + g + b) / 3;
    if (a <= ALPHA_ZERO_CUTOFF) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
      continue;
    }
    /** Semi-transparent near-white bands (common under blob in captures). */
    if (a < 150 && lum > 238 && r > 235 && g > 235 && b > 235) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }
}

function trimTransparentEdges(
  d: Uint8ClampedArray,
  w: number,
  h: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const belowEmpty = (x: number, y: number): boolean => d[(y * w + x) * 4 + 3] <= EDGE_EMPTY_ALPHA;

  function rowEmpty(y: number): boolean {
    for (let x = 0; x < w; x++) {
      if (!belowEmpty(x, y)) return false;
    }
    return true;
  }

  function colEmpty(x: number): boolean {
    for (let y = 0; y < h; y++) {
      if (!belowEmpty(x, y)) return false;
    }
    return true;
  }

  let minY = 0;
  let maxY = h - 1;
  let minX = 0;
  let maxX = w - 1;
  while (minY <= maxY && rowEmpty(minY)) minY++;
  while (maxY >= minY && rowEmpty(maxY)) maxY--;
  while (minX <= maxX && colEmpty(minX)) minX++;
  while (maxX >= minX && colEmpty(maxX)) maxX--;
  if (minX > maxX || minY > maxY) return null;
  return { minX, minY, maxX, maxY };
}

/** Fallback bbox if edge trim fails (single pixel blob). */
function bboxByContentAlpha(
  d: Uint8ClampedArray,
  w: number,
  h: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const a = d[row + x * 4 + 3];
      if (a > CONTENT_ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function finalizeOpaqueEdges(d: Uint8ClampedArray): void {
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] <= ALPHA_ZERO_CUTOFF) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
      d[i + 3] = 0;
    }
  }
}

function applySpritePixelPipelineToCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  removeGreenscreenConnectedToEdges(d, w, h);
  removeRemainingGreenscreenKey(d);
  cleanSpritePixels(d);
  ctx.putImageData(imageData, 0, 0);
}

function sanitizeSpriteAlphaOnCanvas(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  if (w <= 0 || h <= 0) return;
  const imageData = ctx.getImageData(0, 0, w, h);
  finalizeOpaqueEdges(imageData.data);
  ctx.putImageData(imageData, 0, 0);
}

/** Full-image pass before crop (same cleaning as crop path). */
export async function sanitizeSpriteAlpha(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        applySpritePixelPipelineToCanvas(canvas);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Photoshop-style trim: clean fog → trim empty edges → crop → final alpha snap.
 */
export async function cropDataUrlToOpaqueBounds(dataUrl: string): Promise<string> {
  if (typeof document === 'undefined' || !dataUrl.startsWith('data:')) return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w <= 0 || h <= 0) {
          resolve(dataUrl);
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;
        removeGreenscreenConnectedToEdges(d, w, h);
        removeRemainingGreenscreenKey(d);
        cleanSpritePixels(d);
        ctx.putImageData(imageData, 0, 0);

        const imageData2 = ctx.getImageData(0, 0, w, h);
        const d2 = imageData2.data;
        let bounds = trimTransparentEdges(d2, w, h);
        if (!bounds) {
          bounds = bboxByContentAlpha(d2, w, h);
        }
        if (!bounds) {
          resolve(dataUrl);
          return;
        }

        let { minX, minY, maxX, maxY } = bounds;
        minX = Math.max(0, minX - PAD_PX);
        minY = Math.max(0, minY - PAD_PX);
        maxX = Math.min(w - 1, maxX + PAD_PX);
        maxY = Math.min(h - 1, maxY + PAD_PX);
        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        const octx = out.getContext('2d', { willReadFrequently: true });
        if (!octx) {
          resolve(dataUrl);
          return;
        }
        octx.drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
        sanitizeSpriteAlphaOnCanvas(out);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
