/**
 * Output #2 — 3D polynomial heat map surface.
 * Plane geometry 256×256 segments, 1:1 ratio. Height from H(u,v), heat coloring.
 */

import * as THREE from 'three';
import { heatColorNormalized } from './heatColor';
import type { EmotionState } from '../state/store';

const SEGMENTS_X = 256;
const SEGMENTS_Y = 256;
const HEIGHT_SCALE = 0.4;
const PLANE_WIDTH = 2;
const PLANE_HEIGHT = 2;

export function buildHeatMapSurface(state: EmotionState): THREE.Mesh {
  const { mapData, mapWidth, mapHeight, mapMin, mapMax } = state;
  const geometry = new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT, SEGMENTS_X, SEGMENTS_Y);
  const pos = geometry.getAttribute('position');
  const colors: number[] = [];

  for (let j = 0; j <= SEGMENTS_Y; j++) {
    const v = j / SEGMENTS_Y;
    const row = Math.min(Math.floor(v * (mapHeight - 1)), mapHeight - 1);
    for (let i = 0; i <= SEGMENTS_X; i++) {
      const u = i / SEGMENTS_X;
      const col = Math.min(Math.floor(u * (mapWidth - 1)), mapWidth - 1);
      const idx = row * mapWidth + col;
      const h = mapData[idx];
      const height = h * HEIGHT_SCALE;
      const vertexIndex = (j * (SEGMENTS_X + 1) + i) * 3;
      pos.setZ(vertexIndex / 3, height);
      const [r, g, b] = heatColorNormalized(h, mapMin, mapMax);
      colors.push(r, g, b);
    }
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export function disposeHeatMapSurface(mesh: THREE.Mesh): void {
  mesh.geometry.dispose();
  if (mesh.material instanceof THREE.Material) mesh.material.dispose();
}
