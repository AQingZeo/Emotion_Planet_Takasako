/**
 * Downscale data URLs so localStorage JSON stays under typical ~5MB limits.
 */

export async function downscaleDataUrl(
  dataUrl: string,
  maxSide: number,
  type: 'image/jpeg' | 'image/png' = 'image/jpeg',
  quality = 0.85
): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = (): void => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= 0 || h <= 0) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const cw = Math.max(1, Math.round(w * scale));
      const ch = Math.max(1, Math.round(h * scale));
      const c = document.createElement('canvas');
      c.width = cw;
      c.height = ch;
      const ctx = c.getContext('2d', { alpha: type === 'image/png' });
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      if (type === 'image/png') {
        ctx.clearRect(0, 0, cw, ch);
      }
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(type === 'image/jpeg' ? c.toDataURL('image/jpeg', quality) : c.toDataURL('image/png'));
    };
    img.onerror = (): void => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Downscale PNG (or data URL with alpha) and keep transparency.
 * JPEG must not be used for matrix sprites — transparent areas become black.
 */
export async function downscalePngPreservingAlpha(dataUrl: string, maxSide: number): Promise<string> {
  return downscaleDataUrl(dataUrl, maxSide, 'image/png', 1);
}
