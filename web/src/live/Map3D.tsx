import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Ev, Replay } from './data';

// 3D map of one replay. Left plane: deposits on the source chain. Right plane: payouts on the destination chain.
// In the middle stands the bridge vault. A backed payout travels deposit -> vault -> payout (teal).
// A payout with no deposit leaves the vault with nothing coming in (copper): that is the hack.
const X = 8, H = 8, SEG = H * 2, GOLD = Math.PI * (3 - Math.sqrt(5));
const TEAL = new THREE.Color('#2fd4b5'), COPPER = new THREE.Color('#ff6a3d'), BRASS = new THREE.Color('#e3b04b'), VIOLET = new THREE.Color('#c9a7ff'), INK = new THREE.Color('#e9ecef');
const VAULT = new THREE.Vector3(0, 5, 0);

// Even sunflower spread over the whole plane, whatever the replay's size.
function spot(i: number, total: number, side: -1 | 1): [number, number, number] {
  const r = 4.8 * Math.sqrt((i * 0.6180339 + 0.1) % 1), a = i * GOLD * 1.7 + total;
  return [side * X + Math.sin(a * 0.7) * 0.4, 5 + Math.cos(a) * r, Math.sin(a) * r];
}

const quad = (o: THREE.Vector3, a: THREE.Vector3, c: THREE.Vector3, b: THREE.Vector3, t: number) => {
  const w = 1 - t;
  return o.copy(a).multiplyScalar(w * w).addScaledVector(c, 2 * w * t).addScaledVector(b, t * t);
};

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
    size.push(dep ? 0.1 : e.status === 'violation' ? 0.075 : 0.12);
  });
  const arcs = new Float32Array(ev.length * SEG * 6), ac = new Float32Array(ev.length * SEG * 6);
  const ctl = new Float32Array(ev.length * 15); // per payout: deposit, control, vault, control, payout
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c1 = new THREE.Vector3(), c2 = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  ev.forEach((e, i) => {
    if (e.kind !== 'withdrawal') return;
    const bad = e.status === 'violation';
    const from = bad ? null : pos[byId.get(e.matched ?? '') ?? -1];
    if (!bad && !from) return;
    a.set(...(from ?? ([VAULT.x, VAULT.y, VAULT.z] as [number, number, number]))); b.set(...pos[i]);
    c1.copy(a).add(VAULT).multiplyScalar(0.5); c1.y += 1.2 + (i % 5) * 0.12;
    c2.copy(VAULT).add(b).multiplyScalar(0.5); c2.y += 1.2 + (i % 5) * 0.12;
    ctl.set([a.x, a.y, a.z, c1.x, c1.y, c1.z, VAULT.x, VAULT.y, VAULT.z, c2.x, c2.y, c2.z, b.x, b.y, b.z], i * 15);
    const k = bad ? COPPER : TEAL, f = bad ? 0.55 : 0.5;
    for (let s = 0; s < SEG; s++) {
      if (bad && s < H) continue; // nothing comes in
      const first = s < H, t0 = (s % H) / H, t1 = ((s % H) + 1) / H;
      const [s0, sc, s1] = first ? [a, c1, VAULT] : [VAULT, c2, b];
      quad(p, s0, sc, s1, t0); quad(q, s0, sc, s1, t1);
      const o = (i * SEG + s) * 6;
      arcs.set([p.x, p.y, p.z, q.x, q.y, q.z], o);
      ac.set([k.r * f, k.g * f, k.b * f, k.r * f, k.g * f, k.b * f], o);
    }
  });
  return { pos, col, size, arcs, ac, ctl };
}

function Scene({ data, n, selected, onSelect, spin }: Props) {
  const g = useMemo(() => build(data), [data]);
  const mesh = useRef<THREE.InstancedMesh>(null!);
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
  const pick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); if (e.instanceId !== undefined) { const ev: Ev = data.events[e.instanceId]; if (ev.kind === 'withdrawal') onSelect(ev.id); } };
  const ptsGeo = useMemo(() => {
    const x = new THREE.BufferGeometry();
    x.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.events.length * 3), 3));
    const c = new Float32Array(data.events.length * 3);
    data.events.forEach((e, i) => { const k = e.status === 'violation' ? COPPER : TEAL; c.set([k.r * 2.4, k.g * 2.4, k.b * 2.4], i * 3); });
    x.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return x;
  }, [data]);
  const halo = useRef<THREE.Mesh>(null!), halo2 = useRef<THREE.Mesh>(null!), ring1 = useRef<THREE.Mesh>(null!), ring2 = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    mesh.current.count = n; geo.setDrawRange(0, n * SEG * 2);
    const T = clock.elapsedTime, pa = ptsGeo.getAttribute('position') as THREE.BufferAttribute, k = g.ctl;
    for (let i = 0; i < data.events.length; i++) {
      if (i >= n || data.events[i].kind !== 'withdrawal') { pa.setXYZ(i, 0, -999, 0); continue; }
      const bad = data.events[i].status === 'violation', o = i * 15;
      let u = (T * 0.3 + i * 0.137) % 1;
      if (bad) u = 0.5 + u * 0.5;
      const second = u >= 0.5, t = second ? (u - 0.5) * 2 : u * 2, w = 1 - t, r = o + (second ? 6 : 0);
      pa.setXYZ(i, w * w * k[r] + 2 * w * t * k[r + 3] + t * t * k[r + 6], w * w * k[r + 1] + 2 * w * t * k[r + 4] + t * t * k[r + 7], w * w * k[r + 2] + 2 * w * t * k[r + 5] + t * t * k[r + 8]);
    }
    pa.needsUpdate = true;
    if (ring1.current) { ring1.current.rotation.y = T * 0.6; ring2.current.rotation.z = -T * 0.45; }
    halo.current?.scale.setScalar(1 + Math.sin(T * 2.2) * 0.18);
    halo2.current?.scale.setScalar(1.6 + Math.sin(T * 1.3) * 0.35);
  });
  const hasVoid = data.events.slice(0, n).some((e) => e.status === 'violation');
  const glow = hasVoid ? '#ff6a3d' : '#9fe8d8';
  return (
    <>
      <color attach="background" args={['#08090b']} />
      <fog attach="fog" args={['#08090b', 28, 64]} />
      {([-1, 1] as const).map((s) => (
        <group key={s} position={[s * X, 5, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[11, 11]} /><meshBasicMaterial color={s < 0 ? '#c9a7ff' : '#8c9eff'} transparent opacity={0.045} side={THREE.DoubleSide} depthWrite={false} /></mesh>
          <lineSegments geometry={frame}><lineBasicMaterial color={s < 0 ? '#6e5f8f' : '#4d5a99'} /></lineSegments>
          <Html position={[0, 6.3, 0]} center style={{ pointerEvents: 'none' }}>
            <div className="m3-tag" style={{ borderColor: s < 0 ? '#c9a7ff' : '#8c9eff', color: s < 0 ? '#c9a7ff' : '#8c9eff' }}>
              <b>{s < 0 ? 'SOURCE CHAIN' : 'DESTINATION CHAIN'}</b><span>{s < 0 ? `${data.src} · where deposits are made` : `${data.dst} · where payouts are made`}</span>
            </div>
          </Html>
        </group>
      ))}
      <group position={VAULT.toArray()}>
        <mesh><icosahedronGeometry args={[0.55, 3]} /><meshBasicMaterial color={[3, 3, 3.2]} toneMapped={false} /></mesh>
        <mesh ref={ring1} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[1.5, 0.045, 12, 96]} /><meshBasicMaterial color={[2, 2, 2.2]} toneMapped={false} /></mesh>
        <mesh ref={ring2}><torusGeometry args={[1.9, 0.03, 12, 96]} /><meshBasicMaterial color={[0.9, 2.2, 1.9]} toneMapped={false} /></mesh>
        <mesh ref={halo}><sphereGeometry args={[1.1, 24, 24]} /><meshBasicMaterial color={glow} transparent opacity={0.16} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
        <mesh ref={halo2}><sphereGeometry args={[1.1, 24, 24]} /><meshBasicMaterial color={glow} transparent opacity={0.06} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></mesh>
        <Html position={[0, -2.9, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="m3-tag m3-tag--vault"><b>BRIDGE VAULT</b><span>{hasVoid ? 'copper = paid out with no deposit in' : 'money in on the left, money out on the right'}</span></div>
        </Html>
      </group>
      <lineSegments geometry={geo}><lineBasicMaterial vertexColors transparent opacity={0.6} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></lineSegments>
      <points geometry={ptsGeo} frustumCulled={false}><pointsMaterial vertexColors size={0.16} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
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
    <div className="lg-canvas" role="img" aria-label={`3D map of ${p.data.label}: deposits on the left plane, the bridge vault in the middle, payouts on the right; copper arcs are payouts with no deposit.`}>
      <Canvas dpr={[1, 1.75]} camera={{ fov: 40, position: [17, 9, 30] }}><Scene {...p} /></Canvas>
    </div>
  );
}
