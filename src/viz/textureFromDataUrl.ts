/**
 * Load a Three.js texture from a data URL or HTTP URL, waiting until image data exists.
 * Avoids "Texture marked for update but no image data found" from sync TextureLoader.load + needsUpdate.
 */

import * as THREE from 'three';

const loader = new THREE.TextureLoader();

export async function loadTextureAsync(url: string): Promise<THREE.Texture> {
  if (!url || typeof url !== 'string') {
    throw new Error('loadTextureAsync: empty url');
  }
  const tex = await loader.loadAsync(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
