import { useLayoutEffect, useRef } from 'react';
import * as THREE from 'three';

export const SRC_X = -4;
export const DST_X = 4;
export const SLAB_STEP = 0.06;
const COUNT = 1200; // per tower; 2 draw calls total

// Deterministic jitter so the stack reads as hand-laid, not CAD.
const rand = (i: number) => {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

function Tower({ x, side }: { x: number; side: 'src' | 'dst' }) {
  const ref = useRef<THREE.InstancedMesh>(null!);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < COUNT; i++) {
      const r = rand(i + (side === 'src' ? 0 : 9999));
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r - 0.5) * 0.08);
      s.set(1 + (r - 0.5) * 0.12, 1, 1 + (rand(i * 7) - 0.5) * 0.12);
      m.compose(new THREE.Vector3(x + (r - 0.5) * 0.04, i * SLAB_STEP, 0), q, s);
      ref.current.setMatrixAt(i, m);
    }
    ref.current.instanceMatrix.needsUpdate = true;
  }, [x, side]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <boxGeometry args={[1.1, SLAB_STEP * 0.55, 1.1]} />
      <meshStandardMaterial color="#9AA3AE" roughness={0.55} metalness={0.35} />
    </instancedMesh>
  );
}

export function Towers() {
  return (
    <>
      <Tower x={SRC_X} side="src" />
      <Tower x={DST_X} side="dst" />
    </>
  );
}
