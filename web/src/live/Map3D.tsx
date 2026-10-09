import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Ev, Replay } from './data';

// 3D map of one replay: deposits stand on the source plane, payouts on the destination plane.
// A backed payout is joined to its deposit by a teal arc; a payout with no deposit hangs off the copper void.
const X = 7, SEG = 10, GOLD = Math.PI * (3 - Math.sqrt(5));
const TEAL = new THREE.Color('#2fd4b5'), COPPER = new THREE.Color('#ff6a3d'), BRASS = new THREE.Color('#e3b04b'), VIOLET = new THREE.Color('#c9a7ff'), INK = new THREE.Color('#e9ecef');
const VOID: [number, number, number] = [-1.5, 5, 0];

// Even sunflower spread over the whole plane, whatever the replay's size.
function spot(i: number, total: number, side: -1 | 1): [number, number, number] {
  const r = 5 * Math.sqrt((i * 0.6180339 + 0.1) % 1), a = i * GOLD * 1.7 + total;
  return [side * X + Math.sin(a * 0.7) * 0.5, 5 + Math.cos(a) * r, Math.sin(a) * r];
}

function build(data: Replay) {
  const ev = data.events, pos: [number, number, number][] = [], col: THREE.Color[] = [], size: number[] = [];
  const byId = new Map<string, number>();
  let dn = 0, wn = 0;
  const nd = ev.filter((e) => e.kind === 'deposit').length, nw = ev.length - nd;
  ev.forEach((e, i) => {
    byId.set(e.id, i);
    const dep = e.kind === 'deposit';
    pos.push(spot(dep ? dn++ : wn++, dep ? nd : nw, dep ? -1 : 1));
    col.push(dep ? VIOLET : e.status === 'violation' ? COPPER : e.level === 'suspicious' ? BRASS : TEAL);
    size.push(dep ? 0.09 : e.status === 'violation' ? 0.075 : 0.11);
  });
  // One arc per event (deposits get a zero-length arc) so edges reveal in event order.
  const arcs = new Float32Array(ev.length * SEG * 6), ac = new Float32Array(ev.length * SEG * 6);
  const ctl = new Float32Array(ev.length * 9);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  ev.forEach((e, i) => {
    if (e.kind !== 'withdrawal') return;
    const bad = e.status === 'violation';
    const from = bad ? VOID : pos[byId.get(e.matched ?? '') ?? -1];
    if (!from) return;
    a.set(...from); b.set(...pos[i]); c.copy(a).add(b).multiplyScalar(0.5); c.y += 2 + (i % 5) * 0.15; ctl.set([a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z], i * 9);
    for (let s = 0; s < SEG; s++) {
      const t0 = s / SEG, t1 = (s + 1) / SEG;
      p.copy(a).multiplyScalar((1 - t0) ** 2).addScaledVector(c, 2 * (1 - t0) * t0).addScaledVector(b, t0 * t0);
      q.copy(a).multiplyScalar((1 - t1) ** 2).addScaledVector(c, 2 * (1 - t1) * t1).addScaledVector(b, t1 * t1);
      const o = (i * SEG + s) * 6;
      arcs.set([p.x, p.y, p.z, q.x, q.y, q.z], o);
      const k = bad ? COPPER : TEAL, f = bad ? 0.55 : 0.5;
      ac.set([k.r * f, k.g * f, k.b * f, k.r * f, k.g * f, k.b * f], o);
    }
  });
  return { pos, col, size, arcs, ac, ctl };
}

function Scene({ data, n, selected, onSelect, spin }: Props) {
  const g = useMemo(() => build(data), [data]);
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const lines = useRef<THREE.LineSegments>(null!);
  const geo = useMemo(() => {
    const x = new THREE.BufferGeometry();
    x.setAttribute('position', new THREE.BufferAttribute(g.arcs, 3));
    x.setAttribute('color', new THREE.BufferAttribute(g.ac, 3));
    return x;
  }, [g]);
  const frame = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(11, 11).rotateY(Math.PI / 2)), []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    g.pos.forEach((p, i) => {
      const s = g.size[i] * (data.events[i].id === selected ? 2.2 : 1);
      m.makeScale(s, s, s).setPosition(...p);
      mesh.current.setMatrixAt(i, m);
      mesh.current.setColorAt(i, (data.events[i].id === selected ? INK : g.col[i]).clone().multiplyScalar(2.2));
    });
    mesh.current.instanceMatrix.needsUpdate = true;
    mesh.current.instanceColor!.needsUpdate = true;
  }, [g, data, selected]);
  useFrame(() => { mesh.current.count = n; geo.setDrawRange(0, n * SEG * 2); });
  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.instanceId !== undefined) { const ev: Ev = data.events[e.instanceId]; if (ev.kind === 'withdrawal') onSelect(ev.id); } };
  const pts = useRef<THREE.Points>(null!);
  const ptsGeo = useMemo(() => {
    const x = new THREE.BufferGeometry();
    x.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.events.length * 3), 3));
    const c = new Float32Array(data.events.length * 3);
    data.events.forEach((e, i) => { const k = e.status === 'violation' ? COPPER : TEAL; c.set([k.r * 2.4, k.g * 2.4, k.b * 2.4], i * 3); });
    x.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return x;
  }, [data]);
  const halo = useRef<THREE.Mesh>(null!), halo2 = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const T = clock.elapsedTime, pa = ptsGeo.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < data.events.length; i++) {
      if (i >= n || data.events[i].kind !== 'withdrawal') { pa.setXYZ(i, 0, -999, 0); continue; }
      const u = (T * 0.35 + i * 0.137) % 1, w = 1 - u, o = i * 9, k = g.ctl;
      pa.setXYZ(i, w * w * k[o] + 2 * w * u * k[o + 3] + u * u * k[o + 6], w * w * k[o + 1] + 2 * w * u * k[o + 4] + u * u * k[o + 7], w * w * k[o + 2] + 2 * w * u * k[o + 5] + u * u * k[o + 8]);
    }
    pa.needsUpdate = true;
    const pulse = 1 + Math.sin(T * 2.2) * 0.18;
    if (halo.current) halo.current.scale.setScalar(pulse * 1.0);
    if (halo2.current) halo2.current.scale.setScalar(1.6 + Math.sin(T * 1.3) * 0.35);
  });
  const hasVoid = data.events.slice(0, n).some((e) => e.status === 'violation');
  return (
    <>
      <color attach="background" args={['#08090b']} />
      <fog attach="fog" args={['#08090b', 26, 60]} />
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * X, 5, 0]}>
          <lineSegments geometry={frame}><lineBasicMaterial color="#30343c" /></lineSegments>
          <Html position={[0, -6.1, 0]} center style={{ pointerEvents: 'none' }}><span className="label" style={{ whiteSpace: 'nowrap', color: s < 0 ? '#c9a7ff' : '#8c9eff' }}>{s < 0 ? `${data.src} · deposits` : `${data.dst} · payouts`}</span></Html>
        </group>
      ))}
      {hasVoid && (
        <mesh position={VOID}><icosahedronGeometry args={[0.38, 2]} /><meshBasicMaterial color={[3.2, 0.9, 0.4]} toneMapped={false} />
          <mesh ref={halo}><sphereGeometry args={[0.75, 24, 24]} /><meshBasicMaterial color="#ff6a3d" transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
          <mesh ref={halo2}><sphereGeometry args={[0.75, 24, 24]} /><meshBasicMaterial color="#ff6a3d" transparent opacity={0.08} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
          <Html position={[0, 0.8, 0]} center style={{ pointerEvents: 'none' }}><span className="label" style={{ whiteSpace: 'nowrap', color: '#ff6a3d' }}>no deposit behind these = the hack</span></Html></mesh>
      )}
      <lineSegments ref={lines} geometry={geo}><lineBasicMaterial vertexColors transparent opacity={0.6} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></lineSegments>
      <points ref={pts} geometry={ptsGeo} frustumCulled={false}><pointsMaterial vertexColors size={0.16} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
      <Stars radius={60} depth={30} count={900} factor={2.2} fade speed={0.4} />
      <gridHelper args={[60, 60, '#1c2026', '#12151a']} position={[0, -1.2, 0]} />
      <instancedMesh ref={mesh} args={[undefined, undefined, data.events.length]} onClick={pick}>
        <icosahedronGeometry args={[1, 1]} /><meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <EffectComposer multisampling={0}><Bloom luminanceThreshold={0.9} intensity={1.15} mipmapBlur radius={0.7} /><Vignette offset={0.25} darkness={0.7} /></EffectComposer>
      <OrbitControls target={[0, 5, 0]} enableDamping dampingFactor={0.08} autoRotate={spin} autoRotateSpeed={0.5} minDistance={10} maxDistance={50} enablePan={false} />
    </>
  );
}

type Props = { data: Replay; n: number; selected: string | null; onSelect: (id: string) => void; spin?: boolean };

export function Map3D(p: Props) {
  return (
    <div className="lg-canvas" role="img" aria-label={`3D map of ${p.data.label}: deposits on the left plane, payouts on the right; copper arcs are payouts with no deposit.`}>
      <Canvas dpr={[1, 1.75]} camera={{ fov: 40, position: [16, 9, 28] }}><Scene {...p} /></Canvas>
    </div>
  );
}
