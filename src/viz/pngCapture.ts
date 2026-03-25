/**
 * Matrix billboard sprite (PNG data URL).
 *
 * Implemented in paintView3D.captureBlobSpriteDataUrl(): hide terrain, opaque greenscreen,
 * no shadows on key; post-process removes edge-connected key color then trims (cropAlphaImage).
 */

import type { PaintView3DHandle } from './paintView3D';

export async function captureMatrixSprite(handle: PaintView3DHandle): Promise<string> {
  return handle.captureBlobSpriteDataUrl();
}
