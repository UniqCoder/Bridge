import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { threadCurve } from './Thread';
import { makeThreadMaterial } from './threadMaterial';
import { VERDICTS } from './verdicts';

const rand = (i: number) => {
  const x = Math.sin(i * 78.233 + 1.7) * 43758.5453;
  return x - Math.floor(x);
};

// Hundreds of tied threads (the Conservation Ledger) merged into one draw call.
export function ThreadBundle({ count = 220 }: { count?: number }) {
  const { geo, mat } = useMemo(() => {
    const look = { ...VERDICTS.consistent_under_supplied_evidence, opacity: 0.32 };
    const tubes = Array.from({ length: count }, (_, i) => {
      const from = 4.5 + rand(i) * 7;
      const spec = { id: `b${i}`, verdict: 'consistent_under_supplied_evidence' as const, from, to: from + 0.3 + rand(i + 99) * 0.8, lane: rand(i + 7) * 2 };
      return new THREE.TubeGeometry(threadCurve(spec), 40, 0.005, 4, false);
    });
    const merged = mergeGeometries(tubes)!;
    tubes.forEach((t) => t.dispose());
    return { geo: merged, mat: makeThreadMaterial(look) };
  }, [count]);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.elapsedTime; });
  return <mesh geometry={geo} material={mat} />;
}
