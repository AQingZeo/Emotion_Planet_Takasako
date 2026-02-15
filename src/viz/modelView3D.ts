/**
 * Output #3 — 3D wireframe model: icosahedron with displacement from height map.
 * Same calculation as the heat map: same H(u,v), same scale (uHeightScale = map HEIGHT_SCALE).
 * Rules: valence → subdivision only; |arousal| → amplitude (in map); arousal → number of modes (in map).
 */

import * as THREE from 'three';
import type { EmotionState } from '../state/store';

const RADIUS = 1;
/** Must match mapView3D HEIGHT_SCALE so blob and map use the same world height. */
const HEIGHT_SCALE = 0.4;

const vertexShader = `
uniform sampler2D uHeightMap;
uniform float uMapMin;
uniform float uMapMax;
uniform float uHeightScale;
uniform float uScrollU;
uniform float uScrollV;
uniform float uTime;

varying vec2 vUv;

void main() {
  vec3 pos = position;
  vec3 dir = normalize(pos);
  float u = atan(dir.z, dir.x) / 6.28318530718 + 0.5;
  float v = asin(dir.y) / 3.14159265359 + 0.5;
  float scrollU = uScrollU * uTime;
  float scrollV = uScrollV * uTime;
  vUv = vec2(fract(u + scrollU), fract(v + scrollV));
  float t = texture2D(uHeightMap, vUv).r;
  float range = uMapMax - uMapMin;
  float h = range <= 0.0 ? uMapMin : (uMapMin + t * range);
  float mid = (uMapMin + uMapMax) * 0.5;
  float d = (h - mid) * uHeightScale;
  vec3 newPos = position + normal * d;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(0.1, 0.1, 0.15, 0.95);
}
`;

/** Encode map values to [0,1]: t = (mapData[i]-mapMin)/range so shader can reconstruct h = mapMin + t*range. */
function createHeightMapTexture(
  state: EmotionState,
  useNearestFilter?: boolean
): THREE.DataTexture {
  const { mapData, mapWidth, mapHeight, mapMin, mapMax } = state;
  const range = mapMax - mapMin || 1;
  const pixels = new Uint8Array(mapWidth * mapHeight);
  for (let i = 0; i < mapData.length; i++) {
    const t = (mapData[i] - mapMin) / range;
    const u = Math.max(0, Math.min(1, t));
    pixels[i] = Math.max(0, Math.min(255, Math.round(u * 255)));
  }
  const texture = new THREE.DataTexture(pixels, mapWidth, mapHeight, THREE.RedFormat);
  texture.needsUpdate = true;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  if (useNearestFilter) {
    texture.minFilter = THREE.NearestFilter;
    texture.magFilter = THREE.NearestFilter;
  } else {
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
  }
  return texture;
}

export interface ModelViewOptions {
  scrollU?: number;
  scrollV?: number;
  /** Use nearest-neighbor filter for height (keeps steep peaks sharp when arousal < 0). */
  useNearestFilter?: boolean;
}

/** Map valence [-1, 1] to intensity [0, 1]: -1 = low, +1 = high (linear). */
function valenceToIntensity(valence: number): number {
  return Math.max(0, Math.min(1, (valence + 1) / 2));
}

/** Valence only: subdivision (arousal → modes, |arousal| → amplitude are in map pipeline). */
function subdivisionsFromValence(valence: number): number {
  const intensity = valenceToIntensity(valence);
  return 5 + Math.round(14 * intensity);
}

export function buildWireframeModel(
  state: EmotionState,
  options: ModelViewOptions = {}
): { mesh: THREE.Mesh; heightMapTexture: THREE.DataTexture } {
  const subs = subdivisionsFromValence(state.valence);
  const geometry = new THREE.IcosahedronGeometry(RADIUS, subs);
  const { scrollU = 0, scrollV = 0, useNearestFilter = false } = options;
  const heightMapTexture = createHeightMapTexture(
    state,
    useNearestFilter && state.arousal < 0
  );
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightMapTexture },
      uMapMin: { value: state.mapMin },
      uMapMax: { value: state.mapMax },
      uHeightScale: { value: HEIGHT_SCALE },
      uScrollU: { value: scrollU },
      uScrollV: { value: scrollV },
      uTime: { value: 0 },
    },
    vertexShader,
    fragmentShader,
    wireframe: true,
    transparent: true,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  (mesh as THREE.Mesh & { userData: { heightMapTexture?: THREE.DataTexture } }).userData.heightMapTexture = heightMapTexture;
  return { mesh, heightMapTexture };
}

export function updateWireframeTime(mesh: THREE.Mesh, time: number): void {
  const mat = mesh.material as THREE.ShaderMaterial;
  if (mat.uniforms?.uTime) mat.uniforms.uTime.value = time;
}

export function disposeWireframeModel(mesh: THREE.Mesh): void {
  const tex = (mesh as THREE.Mesh & { userData: { heightMapTexture?: THREE.DataTexture } }).userData?.heightMapTexture;
  if (tex) tex.dispose();
  mesh.geometry.dispose();
  if (mesh.material instanceof THREE.Material) mesh.material.dispose();
}
