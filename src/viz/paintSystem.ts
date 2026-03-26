/**
 * Canvas-backed UV paint layer; one instance per logical surface (blob / terrain).
 */

import * as THREE from 'three';

const DEFAULT_SIZE = 2048;
const MAX_UNDO = 24;

export interface PaintSystemOptions {
  /** Canvas resolution (square). */
  size?: number;
  /** Multiplies brush radius (blob UV islands are often tiny in 0–1 space). */
  brushRadiusScale?: number;
}

export class PaintSystem {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly size: number;
  private undoStack: ImageData[] = [];
  private brushRadiusPx = 28;
  private brushRadiusScale = 1;
  /** Stroke color (radial brush stamp). */
  private brushColor = '#5F9569';
  /** Full-layer fill used by clearToNeutral / clear paint. */
  private baseColor = '#5F9569';
  private brushAlpha = 0.65;

  constructor(options?: PaintSystemOptions) {
    this.size = options?.size ?? DEFAULT_SIZE;
    this.brushRadiusScale = options?.brushRadiusScale ?? 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('PaintSystem: 2d context unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
    this.texture.wrapT = THREE.ClampToEdgeWrapping;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.clearToNeutral();
  }

  setBrushSize(radiusPx: number): void {
    this.brushRadiusPx = Math.max(2, Math.min(this.size / 4, radiusPx));
  }

  getBrushSize(): number {
    return this.brushRadiusPx;
  }

  setBrushColor(hex: string): void {
    this.brushColor = hex;
  }

  getBrushColor(): string {
    return this.brushColor;
  }

  setBaseColor(hex: string): void {
    this.baseColor = hex;
  }

  getBaseColor(): string {
    return this.baseColor;
  }

  setBrushAlpha(a: number): void {
    this.brushAlpha = Math.max(0.05, Math.min(1, a));
  }

  private effectiveRadiusPx(): number {
    return this.brushRadiusPx * this.brushRadiusScale;
  }

  /** Single dab, one undo snapshot. */
  paintAtUv(u: number, v: number): void {
    this.pushUndo();
    this.stampAtUvNoUndo(u, v);
    this.texture.needsUpdate = true;
  }

  /**
   * Interpolated stroke between two UV points (fixes dotted gaps on fast moves / stretched terrain UV).
   * One undo snapshot for the whole segment.
   */
  paintSegmentUv(u0: number, v0: number, u1: number, v1: number): void {
    const rPx = this.effectiveRadiusPx();
    const x0 = u0 * this.size;
    const y0 = (1 - v0) * this.size;
    const x1 = u1 * this.size;
    const y1 = (1 - v1) * this.size;
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const step = Math.max(1, rPx * 0.38);
    const n = Math.max(1, Math.ceil(dist / step));
    this.pushUndo();
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const u = u0 + (u1 - u0) * t;
      const v = v0 + (v1 - v0) * t;
      this.stampAtUvNoUndo(u, v);
    }
    this.texture.needsUpdate = true;
  }

  private stampAtUvNoUndo(u: number, v: number): void {
    const rPx = this.effectiveRadiusPx();
    const x = u * this.size;
    const y = (1 - v) * this.size;
    const g = this.ctx.createRadialGradient(x, y, 0, x, y, rPx);
    g.addColorStop(0, this.withAlpha(this.brushColor, this.brushAlpha));
    g.addColorStop(1, this.withAlpha(this.brushColor, 0));
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(x, y, rPx, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private withAlpha(hex: string, a: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return `rgba(255,255,255,${a})`;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${a})`;
  }

  private pushUndo(): void {
    try {
      const snap = this.ctx.getImageData(0, 0, this.size, this.size);
      this.undoStack.push(snap);
      if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    } catch {
      /* ignore */
    }
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.ctx.putImageData(prev, 0, 0);
    this.texture.needsUpdate = true;
  }

  clearToNeutral(): void {
    this.undoStack = [];
    this.ctx.fillStyle = this.baseColor;
    this.ctx.globalAlpha = 1;
    this.ctx.fillRect(0, 0, this.size, this.size);
    this.texture.needsUpdate = true;
  }

  getDataUrl(): string {
    return this.canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.texture.dispose();
  }
}

/** Cel-shading ramp shared by all painted meshes (discrete light bands). */
let sharedToonGradient: THREE.DataTexture | null = null;

function getSharedToonGradientMap(): THREE.DataTexture {
  if (!sharedToonGradient) {
    const n = 5;
    const data = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const v = Math.round((i / Math.max(1, n - 1)) * 255);
      data[i * 4] = v;
      data[i * 4 + 1] = v;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, n, 1);
    tex.needsUpdate = true;
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    sharedToonGradient = tex;
  }
  return sharedToonGradient;
}

/** Apply a shared paint texture to all meshes in a group (toon + white base). */
export function applyPaintTextureToMeshes(meshes: THREE.Mesh[], map: THREE.Texture): void {
  const gradientMap = getSharedToonGradientMap();
  for (const mesh of meshes) {
    const mat = new THREE.MeshToonMaterial({
      color: 0xffffff,
      map,
      gradientMap,
      /** Many GLBs have inward-facing normals; single-sided would render invisible. */
      side: THREE.DoubleSide,
    });
    if (mesh.material instanceof THREE.Material) mesh.material.dispose();
    mesh.material = mat;
  }
}
