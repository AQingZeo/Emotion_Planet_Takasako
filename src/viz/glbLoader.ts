/**
 * Load GLB assets via GLTFLoader; collect meshes for painting and raycasting.
 * UV generation: blob → spherical if missing; terrain → planar XZ (avoids strip/wrap artifacts on plates).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();

/** Shift spherical seam around equator (0–1). 0.5 = 180° rotation vs default `atan2(nx,nz)` meridian. */
const SPHERICAL_UV_U_OFFSET = 0.5;

export type GlbUvHint = 'blob' | 'terrain';

export interface LoadedGlb {
  scene: THREE.Group;
  meshes: THREE.Mesh[];
}

/** Spherical UV from vertex direction — works for organic blobs when file has no uv. */
function ensureSphericalUv(geometry: THREE.BufferGeometry): void {
  if (geometry.attributes.uv) return;
  const pos = geometry.attributes.position;
  if (!pos) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const len = Math.max(Math.sqrt(x * x + y * y + z * z), 1e-8);
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    let u = Math.atan2(nx, nz) / (Math.PI * 2) + 0.5 + SPHERICAL_UV_U_OFFSET;
    u -= Math.floor(u);
    const v = Math.asin(Math.max(-1, Math.min(1, ny))) / Math.PI + 0.5;
    uvs[i * 2] = u;
    uvs[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function ensurePlanarUvXZ(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  if (!bb) return;
  const min = bb.min;
  const max = bb.max;
  const sx = max.x - min.x || 1e-6;
  const sz = max.z - min.z || 1e-6;
  const pos = geometry.attributes.position;
  if (!pos) return;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    uvs[i * 2] = (x - min.x) / sx;
    uvs[i * 2 + 1] = (z - min.z) / sz;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function applyUvHint(geometry: THREE.BufferGeometry, hint: GlbUvHint): void {
  if (hint === 'terrain') {
    ensurePlanarUvXZ(geometry);
    return;
  }
  if (!geometry.attributes.uv) ensureSphericalUv(geometry);
}

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes;
}

export async function loadGlb(url: string, uvHint: GlbUvHint = 'blob'): Promise<LoadedGlb> {
  const gltf = await loader.loadAsync(url);
  const scene = gltf.scene;
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const g = mesh.geometry;
      if (g instanceof THREE.BufferGeometry) {
        applyUvHint(g, uvHint);
        if (!g.attributes.normal) {
          g.computeVertexNormals();
        } else if (uvHint === 'blob') {
          /** Re-average face normals so organic blobs match Blender shade-smooth (exporter can ship flat splits). */
          g.computeVertexNormals();
        }
      }
    }
  });
  const meshes = collectMeshes(scene);
  return { scene, meshes };
}
