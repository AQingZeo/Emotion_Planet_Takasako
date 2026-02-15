/**
 * Add-on: blob with very light base, rim outline, and (in debug) irregular shadow.
 * Same shape as wireframe blob (height-map displacement). Debug only.
 * Do not modify modelView3D.ts.
 */

import * as THREE from 'three';
import type { EmotionState } from '../state/store';

const RADIUS = 1;
const HEIGHT_SCALE = 0.4;

/** Valence [-1,1] -> intensity [0,1]; subdivision count matches base blob. */
function valenceToIntensity(valence: number): number {
  return Math.max(0, Math.min(1, (valence + 1) / 2));
}

function subdivisionsFromValence(valence: number): number {
  return 5 + Math.round(14 * valenceToIntensity(valence));
}

function createHeightMapTexture(state: EmotionState): THREE.DataTexture {
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
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

const vertexShader = `
uniform sampler2D uHeightMap;
uniform float uMapMin;
uniform float uMapMax;
uniform float uHeightScale;
uniform float uScrollU;
uniform float uScrollV;
uniform float uTime;
uniform vec3 uLightPosition;

varying vec3 vNormalView;
varying vec3 vViewPosition;
varying vec3 vLightDirView;
varying vec3 vWorldPos;

void main() {
  vec3 dir = normalize(position);
  float u = atan(dir.z, dir.x) / 6.28318530718 + 0.5;
  float v = asin(dir.y) / 3.14159265359 + 0.5;
  float scrollU = uScrollU * uTime;
  float scrollV = uScrollV * uTime;
  vec2 uvScroll = vec2(fract(u + scrollU), fract(v + scrollV));
  float t = texture2D(uHeightMap, uvScroll).r;
  float range = uMapMax - uMapMin;
  float h = range <= 0.0 ? uMapMin : (uMapMin + t * range);
  float mid = (uMapMin + uMapMax) * 0.5;
  float d = (h - mid) * uHeightScale;
  vec3 newPos = position + normal * d;
  vWorldPos = (modelMatrix * vec4(newPos, 1.0)).xyz;
  vNormalView = normalMatrix * normal;
  vec4 mvPos = modelViewMatrix * vec4(newPos, 1.0);
  vViewPosition = mvPos.xyz;
  vec3 lightView = (viewMatrix * vec4(uLightPosition, 1.0)).xyz;
  vLightDirView = normalize(lightView - mvPos.xyz);
  gl_Position = projectionMatrix * mvPos;
}
`;

const fragmentShader = `
uniform vec3 uBaseColor;
uniform vec3 uShadowColor;
uniform float uShadowStart;
uniform float uShadowEnd;
uniform float uNoiseScale;
uniform float uTerminatorIrregularity;

varying vec3 vNormalView;
varying vec3 vViewPosition;
varying vec3 vLightDirView;
varying vec3 vWorldPos;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2D(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float NdotL = max(0.0, dot(normalize(vNormalView), normalize(vLightDirView)));

  float mid = (uShadowStart + uShadowEnd) * 0.5;
  float terminatorOffset = (noise2D(vWorldPos.xz * uNoiseScale) - 0.5) * uTerminatorIrregularity;
  terminatorOffset = clamp(terminatorOffset, -0.15, 0.15);
  float terminator = mid + terminatorOffset;
  float halfBlur = 0.02;
  float shadow = 1.0 - smoothstep(terminator - halfBlur, terminator + halfBlur, NdotL);
  vec3 baseLit = mix(uShadowColor, uBaseColor, 1.0 - shadow);

  gl_FragColor = vec4(baseLit, 1.0);
}
`;

const outlineVertexShader = `
uniform sampler2D uHeightMap;
uniform float uMapMin;
uniform float uMapMax;
uniform float uHeightScale;
uniform float uScrollU;
uniform float uScrollV;
uniform float uTime;
uniform float uOutlineThickness;

void main() {
  vec3 dir = normalize(position);
  float u = atan(dir.z, dir.x) / 6.28318530718 + 0.5;
  float v = asin(dir.y) / 3.14159265359 + 0.5;
  float scrollU = uScrollU * uTime;
  float scrollV = uScrollV * uTime;
  vec2 uvScroll = vec2(fract(u + scrollU), fract(v + scrollV));
  float t = texture2D(uHeightMap, uvScroll).r;
  float range = uMapMax - uMapMin;
  float h = range <= 0.0 ? uMapMin : (uMapMin + t * range);
  float mid = (uMapMin + uMapMax) * 0.5;
  float d = (h - mid) * uHeightScale;
  vec3 newPos = position + normal * d;
  vec4 mvPos = modelViewMatrix * vec4(newPos, 1.0);
  vec3 viewNormal = normalize((normalMatrix * normal));
  vec3 expandedPos = mvPos.xyz + viewNormal * uOutlineThickness;
  gl_Position = projectionMatrix * vec4(expandedPos, 1.0);
}
`;

const outlineFragmentShader = `
uniform vec3 uRimColor;

void main() {
  gl_FragColor = vec4(uRimColor, 1.0);
}
`;

const BASE_COLOR = 0xf7fce1;
const RIM_COLOR = 0x3d160f;

export interface WatercolorBlobOptions {
  scrollU?: number;
  scrollV?: number;
  baseColor?: THREE.ColorRepresentation;
  rimThickness?: number;
  rimColor?: THREE.ColorRepresentation;
  shadowStart?: number;
  shadowEnd?: number;
  shadowStrength?: number;
  irregularity?: number;
  noiseScale?: number;
  terminatorIrregularity?: number;
}

export function buildWatercolorBlob(
  state: EmotionState,
  options: WatercolorBlobOptions = {}
): { mesh: THREE.Mesh; outlineMesh: THREE.Mesh; heightMapTexture: THREE.DataTexture } {
  const subs = subdivisionsFromValence(state.valence);
  const geometry = new THREE.IcosahedronGeometry(RADIUS, subs);
  const {
    scrollU = 0.03,
    scrollV = 0.02,
    baseColor = BASE_COLOR,
    rimThickness = 0.3,
    rimColor = RIM_COLOR,
    shadowStart = -0.16,
    shadowEnd = 0.2,
    shadowStrength = 0.8,
    irregularity = 0.3,
    noiseScale = 4.0,
    terminatorIrregularity = 0.15,
  } = options;
  const t = Math.max(0, Math.min(1, (state.maturity + 1) / 2));
  const base =
    options.baseColor !== undefined
      ? new THREE.Color(options.baseColor)
      : new THREE.Color().setRGB(252 / 255, (240 + 15 * t) / 255, 252 / 255);
  const shadowColor = new THREE.Color().setRGB(119 / 255, 1 - t, 230 / 255);
  const heightMapTexture = createHeightMapTexture(state);
  const rim = new THREE.Color(rimColor);

  const lightPosition = new THREE.Vector3(3, 3, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightMapTexture },
      uMapMin: { value: state.mapMin },
      uMapMax: { value: state.mapMax },
      uHeightScale: { value: HEIGHT_SCALE },
      uScrollU: { value: scrollU },
      uScrollV: { value: scrollV },
      uTime: { value: 0 },
      uLightPosition: { value: lightPosition },
      uBaseColor: { value: new THREE.Vector3(base.r, base.g, base.b) },
      uShadowColor: { value: new THREE.Vector3(shadowColor.r, shadowColor.g, shadowColor.b) },
      uShadowStart: { value: shadowStart },
      uShadowEnd: { value: shadowEnd },
      uNoiseScale: { value: noiseScale },
      uTerminatorIrregularity: { value: terminatorIrregularity },
    },
    vertexShader,
    fragmentShader,
    transparent: false,
    side: THREE.DoubleSide,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  (mesh as THREE.Mesh & { userData: { heightMapTexture?: THREE.DataTexture } }).userData.heightMapTexture =
    heightMapTexture;
  mesh.renderOrder = 1;

  const outlineThickness = 0.015 * (0.5 + rimThickness);
  const outlineMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uHeightMap: { value: heightMapTexture },
      uMapMin: { value: state.mapMin },
      uMapMax: { value: state.mapMax },
      uHeightScale: { value: HEIGHT_SCALE },
      uScrollU: { value: scrollU },
      uScrollV: { value: scrollV },
      uTime: { value: 0 },
      uOutlineThickness: { value: outlineThickness },
      uRimColor: { value: new THREE.Vector3(rim.r, rim.g, rim.b) },
    },
    vertexShader: outlineVertexShader,
    fragmentShader: outlineFragmentShader,
    transparent: false,
    side: THREE.BackSide,
    depthWrite: true,
  });

  const outlineMesh = new THREE.Mesh(geometry, outlineMaterial);
  outlineMesh.renderOrder = 0;

  // #region agent log
  const hasNormals = !!geometry.attributes.normal;
  fetch('http://127.0.0.1:7242/ingest/e5c5e27a-60f2-4511-bd09-253ca487968d', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'watercolorBlob.ts:buildWatercolorBlob',
      message: 'watercolor blob built',
      data: {
        hasNormals,
        rimThickness,
        baseHex: base.getHexString(),
        rimHex: rim.getHexString(),
        vertexUsesNormalMatrix: vertexShader.includes('normalMatrix'),
        vertexUsesModelView: vertexShader.includes('modelViewMatrix'),
      },
      timestamp: Date.now(),
      hypothesisId: 'A',
    }),
  }).catch(() => {});
  // #endregion

  return { mesh, outlineMesh, heightMapTexture };
}

export function updateWatercolorTime(
  mesh: THREE.Mesh,
  time: number,
  outlineMesh?: THREE.Mesh
): void {
  const mat = mesh.material as THREE.ShaderMaterial;
  if (mat.uniforms?.uTime) mat.uniforms.uTime.value = time;
  if (outlineMesh) {
    const outlineMat = outlineMesh.material as THREE.ShaderMaterial;
    if (outlineMat.uniforms?.uTime) outlineMat.uniforms.uTime.value = time;
  }
}

export function disposeWatercolorBlob(
  mesh: THREE.Mesh,
  outlineMesh?: THREE.Mesh
): void {
  if (outlineMesh?.material instanceof THREE.Material) outlineMesh.material.dispose();
  const tex = (mesh as THREE.Mesh & { userData: { heightMapTexture?: THREE.DataTexture } }).userData?.heightMapTexture;
  if (tex) tex.dispose();
  mesh.geometry.dispose();
  if (mesh.material instanceof THREE.Material) mesh.material.dispose();
}
