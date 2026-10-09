import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { lookOf } from './verdicts';
import { makeThreadMaterial } from './threadMaterial';
import { SRC_X, DST_X } from './Towers';
import { scene, type ThreadSpec } from '../store';

const EDGE = 0.55; // half slab width: threads tie to the slab face

// Sagging curve between two slabs. A parabola is visually indistinguishable from a
// catenary at this sag ratio and avoids solving for the catenary parameter.
export function threadCurve(t: ThreadSpec) {
  const look = lookOf(t.verdict);
  const z = t.lane * 0.3 - 0.3;
  const a = new THREE.Vector3(SRC_X + EDGE, t.from, z);
  const b = new THREE.Vector3(DST_X - EDGE, t.to, z);
  const free = look.fray > 0;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    // A violated thread is tied only at the release; its source end hangs loose mid-air.
    const s = free ? 0.42 + u * 0.58 : u;
    const p = a.clone().lerp(b, s);
    p.y -= look.slack * 4 * s * (1 - s);
    if (free) p.y -= 1.4 * (1 - u) ** 2;
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function Thread({ spec }: { spec: ThreadSpec }) {
  const look = lookOf(spec.verdict);
  const curve = useMemo(() => threadCurve(spec), [spec]);
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 160, look.radius, 6, false), [curve, look]);
  const mat = useMemo(() => makeThreadMaterial(look), [look]);
  const particle = useRef<THREE.Mesh>(null!);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const u = mat.uniforms;
    u.uTime.value = t;
    u.uProgress.value = spec.draw ? spec.draw() : look.drawing ? Math.min(1, (t * 0.18) % 1.4) : 1;
    u.uReverse.value = spec.fromRelease ? 1 : 0;
    // Violation moment: a vermilion flash that decays over ~400 ms.
    if (look.fray) u.uFlash.value = Math.max(0, 1 - (performance.now() - scene.get().violationAt) / 400);
    if (particle.current) {
      const drawn = u.uProgress.value;
      // Ride the drawing tip until the thread is complete, then cross it on a loop.
      const p = drawn < 1 || look.drawing ? drawn : (t * 0.12 + spec.lane * 0.37) % 1;
      particle.current.visible = !spec.fromRelease && drawn > 0;
      particle.current.position.copy(curve.getPointAt(Math.min(p, 1)));
    }
  });

  const mid = curve.getPointAt(0.5);
  const end = curve.getPointAt(1);
  const flows = !look.fray && !look.strike && look.pulse === 0;

  return (
    <group>
      <mesh geometry={geo} material={mat} />
      {flows && (
        <mesh ref={particle}>
          <sphereGeometry args={[0.03, 8, 8]} />
          <meshBasicMaterial color={look.color} toneMapped={false} transparent opacity={look.opacity} />
        </mesh>
      )}
      {look.fray > 0 && (
        // The drained release slab: the only emissive that crosses the bloom threshold.
        <mesh position={[DST_X, end.y, end.z]}>
          <boxGeometry args={[1.14, 0.04, 1.14]} />
          <meshBasicMaterial color={new THREE.Color(look.color).multiplyScalar(look.glow)} toneMapped={false} />
        </mesh>
      )}
      {look.strike && (
        <mesh position={mid} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.006, 0.5, 0.006]} />
          <meshBasicMaterial color={look.color} transparent opacity={0.8} />
        </mesh>
      )}
    </group>
  );
}
