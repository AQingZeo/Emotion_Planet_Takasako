
import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as THREE from 'three';
import { EmotionData, ShapeConfig } from '../types';

interface Props {
  emotion: EmotionData;
  size?: number;
  customConfig?: Partial<ShapeConfig>;
  interactive?: boolean;
  isDetailed?: boolean;
  enableRotation?: boolean;
}

const ParametricShape: React.FC<Props> = ({ 
  emotion, 
  size = 150, 
  customConfig,
  interactive = false,
  isDetailed = false,
  enableRotation = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const requestRef = useRef<number>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  
  // Interaction State - Cumulative rotation for 360 degree freedom
  const isDragging = useRef(false);
  const previousMousePosition = useRef({ x: 0, y: 0 });
  const currentRotation = useRef({ x: 0, y: 0 });

  const config = useMemo(() => {
    const v = emotion.valence;
    const a = emotion.arousal;
    const extremity = Math.min(Math.sqrt(v * v + a * a) / 1.414, 1.0);

    const eta = (1.1 - v) * 0.7; 
    const gamma = 1.0 + (1.1 - v) * 2.2; 
    const harmonicFreq = 2 + (a + 1) * 3;
    const noiseScale = 1.5 + (a + 1) * 2.5;
    
    const baseSegs = isDetailed ? 128 : 32;
    const segments = customConfig?.points || Math.floor(baseSegs * (0.6 + (a + 1) * 0.4));

    return {
      extremity,
      eta,
      gamma,
      harmonicFreq,
      noiseScale,
      segments: Math.max(12, segments),
      rotationSpeed: (0.00015 + (a + 1) * 0.00015) * 0.2, 
      shaderMode: customConfig?.shaderMode || 'wireframe',
      arousal: a,
      valence: v
    };
  }, [emotion, isDetailed, customConfig]);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    
    // Increased distance significantly to ensure spiky shapes are never "clamped" or clipped
    camera.position.z = isDetailed ? 10.5 : 4.0; 

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(5, 5, 10);
    scene.add(directionalLight);

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      preserveDrawingBuffer: true 
    });
    renderer.setSize(size, size);
    renderer.setPixelRatio(config.shaderMode === 'watercolor' ? Math.min(window.devicePixelRatio, 3) : Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const geometry = new THREE.SphereGeometry(1, config.segments, config.segments);
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    const originalPositions = positionAttribute.array.slice();
    const vertex = new THREE.Vector3();

    const colorPos = new THREE.Color(0x4ade80); 
    const colorNeg = new THREE.Color(0xf87171); 
    const colorAct = new THREE.Color(0x60a5fa); 
    const colorPas = new THREE.Color(0xfbbf24); 
    const baseColor = emotion.valence >= 0 ? colorPos : colorNeg;
    const accentColor = emotion.arousal >= 0 ? colorAct : colorPas;
    const finalColor = baseColor.clone().lerp(accentColor, 0.4);

    // Watercolor palette: 3 pale pastel tones derived from the emotion
    const wcWhite = new THREE.Color(1.0, 1.0, 1.0);
    const wc1 = baseColor.clone().lerp(wcWhite, 0.55);
    const wc2 = accentColor.clone().lerp(wcWhite, 0.55);
    const wcThird = baseColor.clone().offsetHSL(0.35, 0, 0);
    const wc3 = wcThird.clone().lerp(wcWhite, 0.60);

    let material: THREE.Material;

    // Vertex shader: only pass object-space position and normal (no view dependency)
    const watercolorVertexShader = `
      varying vec3 vObjPos;
      varying vec3 vObjNormal;
      void main() {
        vObjPos = position;
        vObjNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;
    // Fragment shader: everything computed from object-space position and normal
    // so the effect is "baked" onto the mesh and doesn't shift when rotating
    const watercolorFragmentShader = `
      precision highp float;
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform float uPaperScale;
      varying vec3 vObjPos;
      varying vec3 vObjNormal;

      float hash3(vec3 p) {
        return fract(sin(dot(floor(p).xy, vec2(12.9898, 78.233)) + floor(p).z * 43.0) * 43758.5453);
      }
      float smoothNoise(vec3 p) {
        vec3 fp = floor(p);
        vec3 fr = fract(p);
        fr = fr * fr * (3.0 - 2.0 * fr);
        float n000 = hash3(fp);
        float n100 = hash3(fp + vec3(1,0,0));
        float n010 = hash3(fp + vec3(0,1,0));
        float n110 = hash3(fp + vec3(1,1,0));
        float n001 = hash3(fp + vec3(0,0,1));
        float n101 = hash3(fp + vec3(1,0,1));
        float n011 = hash3(fp + vec3(0,1,1));
        float n111 = hash3(fp + vec3(1,1,1));
        return mix(
          mix(mix(n000, n100, fr.x), mix(n010, n110, fr.x), fr.y),
          mix(mix(n001, n101, fr.x), mix(n011, n111, fr.x), fr.y),
          fr.z
        );
      }
      float fbm(vec3 p) {
        float v = 0.0; float a = 0.5; float f = 1.0;
        for (int i = 0; i < 5; i++) {
          v += a * smoothNoise(p * f);
          a *= 0.5; f *= 2.0;
        }
        return v;
      }
      float warpedFbm(vec3 p) {
        vec3 q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)), fbm(p + vec3(8.1, 3.2, 1.4)));
        return fbm(p + 2.5 * q);
      }

      void main() {
        vec3 n = normalize(vObjNormal);
        vec3 p = vObjPos;

        // --- Unified vertical gradient for color blending (bottom to top) ---
        float yNorm = clamp(p.y * 0.35 + 0.5, 0.0, 1.0);
        float yWarp = fbm(p * 0.5) * 0.18;
        float grad = clamp(yNorm + yWarp, 0.0, 1.0);
        vec3 paint;
        if (grad < 0.5) {
          paint = mix(uColor1, uColor2, grad * 2.0);
        } else {
          paint = mix(uColor2, uColor3, (grad - 0.5) * 2.0);
        }

        // --- Soft wet-on-wet bleeding at transitions ---
        float bleed = warpedFbm(p * 1.8) * 0.15;
        paint = mix(paint, (uColor1 + uColor3) * 0.5, bleed);

        // --- Brush stroke gaps (object-space, baked) ---
        vec3 strokeCoord = p * vec3(1.2, 4.5, 1.2);
        float strokeNoise = fbm(strokeCoord + 7.0);
        vec3 strokeCoord2 = p * vec3(4.0, 1.5, 2.0);
        float strokeNoise2 = fbm(strokeCoord2 + 20.0);
        float strokes = min(strokeNoise, strokeNoise2);
        float strokeMask = smoothstep(0.22, 0.38, strokes);

        // --- Edge pigment: use object-space normal direction instead of view rim ---
        // Normals pointing outward along y get lighter (like watercolor pooling in crevices)
        float crevice = 1.0 - abs(n.y);  // peaks and valleys get more pigment
        float creviceNoise = fbm(p * 3.0 + 10.0);
        float edgeFactor = crevice * (0.5 + 0.5 * creviceNoise);
        paint = mix(paint, paint * 0.75, edgeFactor * 0.35);

        // --- Paper grain on paint ---
        float grain = fbm(p * uPaperScale);
        paint *= (0.96 + 0.06 * grain);

        // --- Alpha: stroke gaps only (no view-dependent fade) ---
        float alpha = strokeMask;
        alpha = clamp(alpha, 0.0, 1.0);

        gl_FragColor = vec4(paint, alpha);
      }
    `;

    switch(config.shaderMode) {
      case 'watercolor':
        material = new THREE.ShaderMaterial({
          vertexShader: watercolorVertexShader,
          fragmentShader: watercolorFragmentShader,
          uniforms: {
            uColor1: { value: new THREE.Vector3(wc1.r, wc1.g, wc1.b) },
            uColor2: { value: new THREE.Vector3(wc2.r, wc2.g, wc2.b) },
            uColor3: { value: new THREE.Vector3(wc3.r, wc3.g, wc3.b) },
            uPaperScale: { value: 10.0 }
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          lights: false
        });
        break;
      case 'wireframe':
      default:
        material = new THREE.MeshBasicMaterial({
          color: finalColor,
          wireframe: true,
          transparent: true,
          opacity: isDetailed ? 0.35 : 0.8,
          blending: THREE.AdditiveBlending
        });
        break;
    }

    const mesh = new THREE.Mesh(geometry, material);
    meshRef.current = mesh;
    scene.add(mesh);

    const updateGeometry = (time: number) => {
      const positions = positionAttribute.array as Float32Array;
      
      for (let i = 0; i < positionAttribute.count; i++) {
        const ix = i * 3;
        vertex.set(originalPositions[ix], originalPositions[ix + 1], originalPositions[ix + 2]);
        vertex.normalize(); 

        const phi = Math.acos(vertex.y);
        const theta = Math.atan2(vertex.x, vertex.z);
        const polarDampener = Math.pow(Math.sin(phi), 1.5);

        const blobFactor = (Math.sin(theta * 2) * Math.cos(phi * 2) * 0.2) + 
                           (Math.sin(phi * 3) * 0.1);
        
        const harm = Math.sin(theta * config.harmonicFreq) * Math.cos(phi * config.harmonicFreq);
        
        let noise = 0;
        const octaves = isDetailed ? 3 : 2;
        for(let o = 1; o <= octaves; o++) {
          noise += (1/o) * Math.sin((theta * config.noiseScale * o) + time) * 
                           Math.cos((phi * config.noiseScale * o) + time * 0.5);
        }

        const combined = (harm * 0.4) + (noise * 0.6);
        const spike = Math.pow(Math.abs(combined), config.gamma) * Math.sign(combined);
        const bias = config.arousal * 0.3;

        const rBase = 1.0 + (config.extremity * ((blobFactor + bias) * polarDampener));
        const radialDisplacement = (config.extremity * (config.eta * spike * polarDampener)) * 1.5;
        
        const r = rBase + radialDisplacement;

        vertex.multiplyScalar(r);
        positions[ix] = vertex.x;
        positions[ix + 1] = vertex.y;
        positions[ix + 2] = vertex.z;
      }
      positionAttribute.needsUpdate = true;
      geometry.computeVertexNormals();
    };

    updateGeometry(0);

    const handleMouseDown = (e: MouseEvent) => {
      if (!enableRotation) return;
      isDragging.current = true;
      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !enableRotation || !meshRef.current) return;
      const deltaX = e.clientX - previousMousePosition.current.x;
      const deltaY = e.clientY - previousMousePosition.current.y;

      // Unclamp rotation freedom: map delta to absolute rotation change
      currentRotation.current.x += deltaY * 0.005;
      currentRotation.current.y += deltaX * 0.005;

      previousMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    if (enableRotation) {
      window.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    const animate = () => {
      if (!isDragging.current) {
        currentRotation.current.y += config.rotationSpeed;
      }
      mesh.rotation.x = currentRotation.current.x;
      mesh.rotation.y = currentRotation.current.y;

      renderer.render(scene, camera);
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      if (enableRotation) {
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      }
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, [size, config, emotion, enableRotation, isDetailed]);

  return (
    <div 
      ref={containerRef} 
      className={`relative flex items-center justify-center transition-opacity duration-1000 ${interactive ? 'hover:scale-105 cursor-pointer' : ''}`}
      style={{ width: size, height: size }}
    />
  );
};

export default ParametricShape;
