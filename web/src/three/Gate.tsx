import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const BLADES = 9;
const RING_SEGS = 64;
const STEPS = 6; // mechanical stepped close, 0.6 s total

// Camera-aperture of hairline blades. Turned 0.9 rad off the camera so it reads as a ring
// around the thread rather than edge-on.
export function Gate({ position, radius, closed }: { position: THREE.Vector3Tuple; radius: number; closed: boolean }) {
  const c = useRef(closed ? 1 : 0);
  const shown = useRef(-1);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const ring = Array.from({ length: RING_SEGS }, (_, i) => {
      const a0 = (i / RING_SEGS) * Math.PI * 2;
      const a1 = ((i + 1) / RING_SEGS) * Math.PI * 2;
      return [Math.cos(a0) * radius, Math.sin(a0) * radius, 0, Math.cos(a1) * radius, Math.sin(a1) * radius, 0];
    }).flat();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...ring, ...new Array(BLADES * 6).fill(0)], 3));
    return g;
  }, [radius]);

  useFrame((_, dt) => {
    c.current = THREE.MathUtils.clamp(c.current + (closed ? dt : -dt) / 0.6, 0, 1);
    const k = Math.round(c.current * STEPS) / STEPS;
    if (k === shown.current) return;
    shown.current = k;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const r = THREE.MathUtils.lerp(radius, radius * 0.02, k);
    const phi = THREE.MathUtils.lerp(0.9, 1.7, k);
    for (let i = 0; i < BLADES; i++) {
      const th = (i / BLADES) * Math.PI * 2;
      const o = RING_SEGS * 2 + i * 2;
      pos.setXYZ(o, Math.cos(th) * radius, Math.sin(th) * radius, 0);
      pos.setXYZ(o + 1, Math.cos(th + phi) * r, Math.sin(th + phi) * r, 0);
    }
    pos.needsUpdate = true;
  });

  return (
    <lineSegments geometry={geo} position={position} rotation={[0, 0.9, 0]}>
      <lineBasicMaterial color="#E9ECEF" transparent opacity={0.7} />
    </lineSegments>
  );
}
