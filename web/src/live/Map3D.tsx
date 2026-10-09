import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls, Stars } from '@react-three/drei';
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { usd } from '../lib/format';
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

const BLOCK = new THREE.BoxGeometry(1, 1, 1);
const dummy = new THREE.Object3D();

/** The bridge vault: a locked block inside a tumbling cage, a security scanner, and shockwaves when the alarm is on. */
function Vault({ alarm, bare }: { alarm: boolean; bare?: boolean }) {
  const cage = useRef<THREE.Group>(null!), core = useRef<THREE.Mesh>(null!), scan = useRef<THREE.Mesh>(null!);
  const waves = useRef<THREE.Mesh[]>([]);
  const cageGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.8, 2.8, 2.8)), []);
  const cageGeo2 = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.1, 2.1, 2.1)), []);
  const hue = alarm ? '#ff6a3d' : '#2fd4b5';
  useFrame(({ clock }) => {
    const T = clock.elapsedTime;
    cage.current.rotation.set(T * 0.25, T * 0.4, alarm ? Math.sin(T * 40) * 0.03 : 0);
    core.current.rotation.set(-T * 0.5, T * 0.7, 0);
    core.current.scale.setScalar(1 + (alarm ? Math.abs(Math.sin(T * 5)) * 0.18 : Math.sin(T * 1.6) * 0.05));
    scan.current.position.y = Math.sin(T * 1.7) * 1.9;
    waves.current.forEach((w, i) => {
      const u = ((T * (alarm ? 0.55 : 0.22)) + i * 0.5) % 1;
      w.scale.setScalar(1 + u * (alarm ? 9 : 5));
      (w.material as THREE.MeshBasicMaterial).opacity = (1 - u) * (alarm ? 0.5 : 0.16);
    });
  });
  return (
    <group position={VAULT.toArray()}>
      <group ref={cage}>
        <lineSegments geometry={cageGeo}><lineBasicMaterial color={alarm ? [3, 0.9, 0.4] : [0.6, 2.4, 2]} toneMapped={false} /></lineSegments>
        <lineSegments geometry={cageGeo2} rotation={[0.6, 0.6, 0]}><lineBasicMaterial color={[2, 2, 2.2]} toneMapped={false} /></lineSegments>
      </group>
      <mesh ref={core}><boxGeometry args={[1.1, 1.1, 1.1]} /><meshBasicMaterial color={alarm ? [4, 1.2, 0.5] : [1.2, 3.4, 2.8]} toneMapped={false} /></mesh>
      <mesh ref={scan} rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[1.7, 1.95, 64]} /><meshBasicMaterial color={hue} transparent opacity={0.7} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      {[0, 1].map((i) => (
        <mesh key={i} rotation={[0, Math.PI / 2, 0]} ref={(m) => { if (m) waves.current[i] = m; }}>
          <ringGeometry args={[0.95, 1, 64]} /><meshBasicMaterial color={hue} transparent opacity={0} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>))}
      {!bare && <Html position={[0, -3.1, 0]} center style={{ pointerEvents: 'none' }}>
        <div className={`m3-tag m3-tag--vault ${alarm ? 'is-alarm' : ''}`}><b>{alarm ? 'BRIDGE VAULT · BREACH' : 'BRIDGE VAULT'}</b><span>{alarm ? 'copper = paid out with no deposit in' : 'money in on the left, money out on the right'}</span></div>
      </Html>}
    </group>
  );
}

/** Eight rails of data packets: deposits flow into the vault, payouts flow out. Right side turns copper under attack. */
function Tunnel({ alarm }: { alarm: boolean }) {
  const L = useRef<THREE.InstancedMesh>(null!), R = useRef<THREE.InstancedMesh>(null!);
  const N = 8, P = 10;
  useFrame(({ clock }) => {
    const T = clock.elapsedTime;
    ([[L.current, -1], [R.current, 1]] as const).forEach(([im, side]) => {
      let k = 0;
      for (let r = 0; r < N; r++) {
        const a = (r / N) * Math.PI * 2 + (side > 0 ? 0.39 : 0), rad = 1.35;
        for (let p = 0; p < P; p++) {
          const u = (T * (side > 0 && alarm ? 0.5 : 0.28) + p / P + r * 0.07) % 1;
          const x = side < 0 ? -X + 0.4 + u * (X - 2.2) : 2.2 + u * (X - 2.6);
          const s = 0.07 + (side < 0 ? 0.04 * (1 - u) : 0.05 * u) + (alarm && side > 0 ? 0.03 : 0);
          dummy.position.set(x, 5 + Math.cos(a) * rad, Math.sin(a) * rad); dummy.scale.set(s * 2.2, s, s); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
          im.setMatrixAt(k++, dummy.matrix);
        }
      }
      im.instanceMatrix.needsUpdate = true;
    });
  });
  return (
    <>
      <instancedMesh ref={L} args={[BLOCK, undefined, N * P]}><meshBasicMaterial color={[0.7, 2.6, 2.2]} toneMapped={false} /></instancedMesh>
      <instancedMesh ref={R} args={[BLOCK, undefined, N * P]}><meshBasicMaterial color={alarm ? [3, 0.9, 0.4] : [0.7, 2.6, 2.2]} toneMapped={false} /></instancedMesh>
    </>
  );
}

/** A chain's ledger: a dim grid of blocks with a scanning line, so the plane reads as "a blockchain". */
function Ledger({ side, label, sub, color, bare }: { side: -1 | 1; label: string; sub: string; color: string; bare?: boolean }) {
  const grid = useRef<THREE.InstancedMesh>(null!), line = useRef<THREE.Mesh>(null!);
  const frame = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(11, 11).rotateY(Math.PI / 2)), []);
  useEffect(() => {
    let k = 0;
    for (let y = 0; y < 13; y++) for (let z = 0; z < 13; z++) {
      dummy.position.set(0, (y - 6) * 0.85, (z - 6) * 0.85); dummy.scale.setScalar(0.12); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
      grid.current.setMatrixAt(k++, dummy.matrix);
    }
    grid.current.instanceMatrix.needsUpdate = true;
  }, []);
  useFrame(({ clock }) => { line.current.position.z = Math.sin(clock.elapsedTime * 0.8 + (side > 0 ? 1.5 : 0)) * 5.2; });
  return (
    <group position={[side * X, 5, 0]}>
      <instancedMesh ref={grid} args={[BLOCK, undefined, 169]}><meshBasicMaterial color={color} transparent opacity={0.28} toneMapped={false} /></instancedMesh>
      <mesh ref={line}><boxGeometry args={[0.02, 11, 0.07]} /><meshBasicMaterial color={color} transparent opacity={0.8} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} /></mesh>
      <lineSegments geometry={frame}><lineBasicMaterial color={color} transparent opacity={0.55} /></lineSegments>
      {!bare && <Html position={[0, 6.3, 0]} center style={{ pointerEvents: 'none' }}>
        <div className="m3-tag" style={{ borderColor: color, color }}><b>{label}</b><span>{sub}</span></div>
      </Html>}
    </group>
  );
}

function Scene({ data, n, selected, onSelect, spin, bare }: Props) {
  const g = useMemo(() => build(data), [data]);
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const geo = useMemo(() => {
    const x = new THREE.BufferGeometry();
    x.setAttribute('position', new THREE.BufferAttribute(g.arcs, 3));
    x.setAttribute('color', new THREE.BufferAttribute(g.ac, 3));
    return x;
  }, [g]);
  useEffect(() => {
    g.pos.forEach((p, i) => {
      const s = g.size[i] * (data.events[i].id === selected ? 2.4 : 1.25);
      dummy.position.set(...p); dummy.scale.setScalar(s * 1.5); dummy.rotation.set(i * 0.7, i * 1.3, 0); dummy.updateMatrix();
      mesh.current.setMatrixAt(i, dummy.matrix);
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
  const hasVoid = data.events.slice(0, n).some((e) => e.status === 'violation');
  const shake = useRef(0), was = useRef(false);
  useFrame(({ clock, camera }) => {
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
    // Fly-in on load, a short camera jolt the moment the first unbacked payout appears.
    if (T < 3) { const e = 1 - Math.pow(1 - Math.min(T / 3, 1), 3); camera.position.lerp(new THREE.Vector3(...(bare ? [13, 6, 24] : [17, 9, 30]) as [number, number, number]), 0.03 + e * 0.05); }
    if (hasVoid && !was.current) shake.current = 0.9;
    was.current = hasVoid;
    if (shake.current > 0) { shake.current -= 0.02; camera.position.x += (Math.random() - 0.5) * 0.35 * shake.current; camera.position.y += (Math.random() - 0.5) * 0.35 * shake.current; }
  });
  return (
    <>
      <color attach="background" args={['#06070a']} />
      <fog attach="fog" args={['#06070a', 30, 70]} />
      <Ledger side={-1} label="SOURCE CHAIN" sub={`${data.src} · where deposits are made`} color="#c9a7ff" bare={bare} />
      <Ledger side={1} label="DESTINATION CHAIN" sub={`${data.dst} · where payouts are made`} color="#8c9eff" bare={bare} />
      <Vault alarm={hasVoid} bare={bare} />
      <Tunnel alarm={hasVoid} />
      <lineSegments geometry={geo}><lineBasicMaterial vertexColors transparent opacity={0.6} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} /></lineSegments>
      <points geometry={ptsGeo} frustumCulled={false}><pointsMaterial vertexColors size={0.16} sizeAttenuation transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} /></points>
      <Stars radius={70} depth={40} count={bare ? 1400 : 1000} factor={2.4} fade speed={0.5} />
      <gridHelper args={[80, 80, '#1c2026', '#101318']} position={[0, -1.2, 0]} />
      <instancedMesh ref={mesh} args={[BLOCK, undefined, data.events.length]} onClick={pick}>
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.9} intensity={1.3} mipmapBlur radius={0.75} />
        <ChromaticAberration offset={useMemo(() => new THREE.Vector2(hasVoid ? 0.0016 : 0.0005, hasVoid ? 0.0012 : 0.0004), [hasVoid])} radialModulation={false} modulationOffset={0} />
        <Vignette offset={0.25} darkness={0.75} />
      </EffectComposer>
      <OrbitControls target={bare ? [-10, 4.5, 0] : [0, 5, 0]} enableZoom={!bare} enableDamping dampingFactor={0.08} autoRotate={spin} autoRotateSpeed={0.5} minDistance={10} maxDistance={50} enablePan={false} />
    </>
  );
}

type Props = { data: Replay; n: number; selected: string | null; onSelect: (id: string) => void; spin?: boolean; bare?: boolean };

/** Renders only while on screen: an off-screen WebGL loop still costs a frame budget on every scroll. */
export const Map3D = memo(function Map3D(p: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: '120px' });
    if (box.current) io.observe(box.current);
    return () => io.disconnect();
  }, []);
  let dep = 0, backed = 0, gap = 0;
  for (let i = 0; i < p.n; i++) {
    const e = p.data.events[i], v = e.usd ?? 0;
    if (e.kind === 'deposit') dep += v; else if (e.status === 'violation') gap += v; else backed += v;
  }
  const breach = gap > 0;
  return (
    <div ref={box} className="lg-canvas m3" role="img" aria-label={`3D map of ${p.data.label}: deposits on the left chain, the bridge vault in the middle, payouts on the right chain; copper packets and arcs are payouts with no deposit.`}>
      <Canvas dpr={[1, 1.5]} frameloop={visible ? 'always' : 'never'} gl={{ powerPreference: 'high-performance', antialias: false }} camera={{ fov: 40, position: [44, 22, 70] }}><Scene {...p} /></Canvas>
      {!p.bare && <>
      <div className={`m3-hud ${breach ? 'is-breach' : ''}`} aria-hidden="true">
        <div><span>MONEY IN</span><b>{usd(dep)}</b><i>locked on the source chain</i></div>
        <div><span>PAID OUT WITH A DEPOSIT</span><b className="ok">{usd(backed)}</b><i>matched to a real deposit</i></div>
        <div><span>PAID OUT WITH NO DEPOSIT</span><b className={breach ? 'bad' : ''}>{usd(gap)}</b><i>{breach ? 'this is the hack' : 'none so far'}</i></div>
      </div>
      <p className={`m3-cap ${breach ? 'is-breach' : ''}`}>{breach ? 'BREACH: the vault is paying out coins that were never deposited.' : 'Normal: every payout on the right matches a deposit on the left.'}</p>
      </>}
    </div>
  );
});

export default Map3D;
