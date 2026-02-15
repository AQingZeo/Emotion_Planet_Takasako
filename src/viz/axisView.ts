/**
 * Dot-map axis view: two-axis matrix with dots (no straight lines).
 * Y = passive (bottom) ↔ active (top). X = negative (left) ↔ positive (right).
 * Main page holds only this 2-axis map.
 */

export interface AxisViewOptions {
  width: number;
  height: number;
  /** Dot spacing along axes */
  dotSpacing?: number;
  /** Optional single point to highlight: arousal = X (pos/neg), valence = Y (active/passive) */
  valence?: number;
  arousal?: number;
  label?: string;
}

export function drawAxisView(canvas: HTMLCanvasElement, options: AxisViewOptions): void {
  const { width, height, valence, arousal, label, dotSpacing = 12 } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = width;
  canvas.height = height;

  const padding = 48;
  const plotLeft = padding;
  const plotTop = padding;
  const plotW = width - 2 * padding;
  const plotH = height - 2 * padding;
  const cx = plotLeft + plotW / 2;
  const cy = plotTop + plotH / 2;

  ctx.fillStyle = '#fafaf9';
  ctx.fillRect(0, 0, width, height);

  // Dot map: full rectangular plot (stretched to fit screen)
  ctx.fillStyle = '#d6d3d1';
  const r = 1.5;

  for (let x = plotLeft; x <= plotLeft + plotW; x += dotSpacing) {
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let y = plotTop; y <= plotTop + plotH; y += dotSpacing) {
    ctx.beginPath();
    ctx.arc(cx, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#e7e5e4';
  for (let x = plotLeft; x <= plotLeft + plotW; x += dotSpacing * 2) {
    for (let y = plotTop; y <= plotTop + plotH; y += dotSpacing * 2) {
      if (Math.abs(x - cx) > 3 && Math.abs(y - cy) > 3) {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = '#78716c';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Negative', plotLeft + 32, cy + 22);
  ctx.fillText('Positive', plotLeft + plotW - 32, cy + 22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Active', cx, plotTop + 14);
  ctx.textBaseline = 'top';
  ctx.fillText('Passive', cx, plotTop + plotH - 14);
  ctx.textBaseline = 'alphabetic';

  if (valence !== undefined && arousal !== undefined) {
    const px = cx + (arousal / 2) * plotW;
    const py = cy - (valence / 2) * plotH;
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fafaf9';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (label) {
    ctx.fillStyle = '#1c1917';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, plotTop + plotH + 28);
  }
}

/**
 * Convert pixel (px, py) to valence/arousal if inside plot area.
 */
export function pixelToVA(
  px: number,
  py: number,
  options: { width: number; height: number; padding?: number }
): { valence: number; arousal: number } | null {
  const padding = options.padding ?? 48;
  const plotLeft = padding;
  const plotTop = padding;
  const plotW = options.width - 2 * padding;
  const plotH = options.height - 2 * padding;
  const cx = plotLeft + plotW / 2;
  const cy = plotTop + plotH / 2;
  if (px < plotLeft || px > plotLeft + plotW || py < plotTop || py > plotTop + plotH) return null;
  const arousal = ((px - cx) / plotW) * 2;
  const valence = -((py - cy) / plotH) * 2;
  return { valence, arousal };
}

export function createAxisCanvas(parent: HTMLElement, options: AxisViewOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  parent.appendChild(canvas);
  drawAxisView(canvas, options);
  return canvas;
}
