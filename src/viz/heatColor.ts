/**
 * Heat color mapping: value in [-1,1]
 * x >= 0: lerp(white, red, x)
 * x < 0: lerp(white, blue, -x)
 * No external colormap library.
 */

export function heatColorRgb(x: number): [number, number, number] {
  const t = Math.max(-1, Math.min(1, x));
  if (t >= 0) {
    const r = 255;
    const g = Math.round(255 * (1 - t));
    const b = Math.round(255 * (1 - t));
    return [r, g, b];
  } else {
    const u = -t;
    const r = Math.round(255 * (1 - u));
    const g = Math.round(255 * (1 - u));
    const b = 255;
    return [r, g, b];
  }
}

/** Return hex string #rrggbb */
export function heatColorHex(x: number): string {
  const [r, g, b] = heatColorRgb(x);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

/** Normalize value from [min, max] to [-1, 1] then get RGB (0-1 for Three.js). */
export function heatColorNormalized(value: number, min: number, max: number): [number, number, number] {
  const range = max - min || 1;
  const x = (value - min) / range * 2 - 1;
  const [r, g, b] = heatColorRgb(x);
  return [r / 255, g / 255, b / 255];
}
