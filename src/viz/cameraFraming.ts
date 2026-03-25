/**
 * Shared camera framing: fit perspective + orbit target to an object's bounding sphere.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * @param margin - >1 pulls camera back (more padding). Typical 1.35 (interactive) or 1.1–1.2 (tight sprite).
 */
export function frameCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  margin = 1.5
): void {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const radius = Math.max(sphere.radius, 0.05);
  const vFov = (camera.fov * Math.PI) / 180;
  const dist = (radius * margin) / Math.sin(vFov / 2);
  const offset = new THREE.Vector3(0.85, 0.45, 1.05).normalize().multiplyScalar(dist);
  camera.position.copy(center.clone().add(offset));
  camera.near = Math.max(0.01, dist * 0.001);
  camera.far = Math.max(80, dist * 30);
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}
