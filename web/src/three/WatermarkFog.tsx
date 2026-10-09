import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { SRC_X } from './Towers';
import { scene } from '../store';

const H = 7; // depth of the unobserved band above the horizon

// Everything above wm[source] is unobserved: a fog volume that thickens upward from the horizon.
const fragment = /* glsl */ `
uniform float uTime;
varying vec3 vLocal;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
void main() {
  float h = vLocal.y + ${(H / 2).toFixed(1)};
  float n = fbm(vec2(vLocal.x * 1.3 + uTime * 0.05, h * 0.9 - uTime * 0.03) + vLocal.z);
  float a = smoothstep(0.0, 1.2, h) * (0.75 + 0.25 * n) * 0.94;
  gl_FragColor = vec4(vec3(0.031, 0.035, 0.043) + n * 0.035, a);
}`;

const vertex = /* glsl */ `
varying vec3 vLocal;
void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function WatermarkFog() {
  const group = useRef<THREE.Group>(null!);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 } },
    }),
    [],
  );

  useFrame(({ clock }, dt) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    const { wm } = scene.get();
    const g = group.current;
    g.position.y += (wm - g.position.y) * Math.min(1, dt * 3);
  });

  return (
    <group ref={group} position={[SRC_X, scene.get().wm, 0]}>
      <mesh position={[0, H / 2, 0]} material={mat}>
        <boxGeometry args={[2.4, H, 2.4]} />
      </mesh>
      {/* the horizon hairline */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI / 2)]} />
        <lineBasicMaterial color="#A4ABB6" transparent opacity={0.8} />
      </lineSegments>
      <Html position={[1.3, 0, 1.3]} style={{ pointerEvents: 'none', transform: 'translateY(-50%)' }}>
        <span className="label" style={{ whiteSpace: 'nowrap', color: 'var(--text-2)' }}>— wm[source] · unobserved above</span>
      </Html>
    </group>
  );
}
