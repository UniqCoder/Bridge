import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { GRAPH, PLANE_X, type GNode } from './graphData';
import { replay } from '../data/replay';

const SEG = 18;
const COLORS = {
  message: new THREE.Color('#C9A7FF'),
  void: new THREE.Color('#FF6A3D').multiplyScalar(1.6),
  token: new THREE.Color('#E9ECEF'),
  benign: new THREE.Color('#2FD4B5'),
  drained: new THREE.Color('#FF6A3D'),
};

// Edge arcs: quadratic Bézier from source plane to destination plane, lifted over the bridge.
function arcPositions(edges: typeof GRAPH.edges) {
  const out = new Float32Array(edges.length * SEG * 6);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  edges.forEach((e, k) => {
    a.set(...GRAPH.nodes[e.from].pos);
    b.set(...GRAPH.nodes[e.to].pos);
    c.copy(a).add(b).multiplyScalar(0.5);
    c.y += 2.2 + (k % 7) * 0.08;
    for (let s = 0; s < SEG; s++) {
      const t0 = s / SEG, t1 = (s + 1) / SEG;
      p.copy(a).multiplyScalar((1 - t0) ** 2).addScaledVector(c, 2 * (1 - t0) * t0).addScaledVector(b, t0 * t0);
      q.copy(a).multiplyScalar((1 - t1) ** 2).addScaledVector(c, 2 * (1 - t1) * t1).addScaledVector(b, t1 * t1);
      out.set([p.x, p.y, p.z, q.x, q.y, q.z], (k * SEG + s) * 6);
    }
  });
  return out;
}

function EdgeLayer({ attack, highlight }: { attack: boolean; highlight: number | null }) {
  const edges = useMemo(() => GRAPH.edges.filter((e) => e.attack === attack), [attack]);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arcPositions(edges), 3));
    return g;
  }, [edges]);
  const shown = useRef(-1);
  useFrame(() => {
    // Edges are time-sorted: reveal everything released up to the replay clock.
    const t = replay.get().t;
    let n = 0;
    while (n < edges.length && edges[n].ts <= t) n++;
    if (n !== shown.current) { shown.current = n; geo.setDrawRange(0, n * SEG * 2); }
  });
  const dim = highlight !== null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color={attack ? '#FF6A3D' : '#2FD4B5'} transparent opacity={(attack ? 0.5 : 0.22) * (dim ? 0.25 : 1)} toneMapped={false} depthWrite={false} />
    </lineSegments>
  );
}

function Highlight({ node }: { node: number | null }) {
  const geo = useMemo(() => {
    if (node === null) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arcPositions(GRAPH.edges.filter((e) => e.from === node || e.to === node || GRAPH.nodes[e.to].token === GRAPH.nodes[node].key && GRAPH.nodes[node].kind === 'token')), 3));
    return g;
  }, [node]);
  if (!geo) return null;
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#FFB59A" toneMapped={false} transparent opacity={0.9} />
    </lineSegments>
  );
}

function Nodes({ onHover, onPick }: { onHover: (n: GNode | null) => void; onPick: (n: GNode) => void }) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const nodes = GRAPH.nodes;
  useEffect(() => {
    const m = new THREE.Matrix4();
    nodes.forEach((n, i) => {
      const s = n.kind === 'token' ? 0.09 : n.kind === 'void' ? 0.22 : n.kind === 'message' ? 0.05 + 0.03 * Math.sqrt(n.degree) : 0.045;
      m.makeScale(s, s, s).setPosition(...n.pos);
      ref.current.setMatrixAt(i, m);
      const c = n.kind === 'beneficiary' ? (n.attack ? COLORS.drained : COLORS.benign) : COLORS[n.kind];
      ref.current.setColorAt(i, c);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor!.needsUpdate = true;
  }, [nodes]);
  const at = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.instanceId !== undefined ? nodes[e.instanceId] : null);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, nodes.length]}
      onPointerMove={(e) => { e.stopPropagation(); onHover(at(e)); }} onPointerOut={() => onHover(null)}
      onClick={(e) => { e.stopPropagation(); const n = at(e); if (n) onPick(n); }}>
      <icosahedronGeometry args={[1, 2]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

function PlaneFrame({ x, label, color }: { x: number; label: string; color: string }) {
  const geo = useMemo(() => new THREE.EdgesGeometry(new THREE.PlaneGeometry(11, 11).rotateY(Math.PI / 2)), []);
  return (
    <group position={[x, 5, 0]}>
      <lineSegments geometry={geo}><lineBasicMaterial color="#30343C" /></lineSegments>
      <Html position={[0, -5.9, 0]} center style={{ pointerEvents: 'none' }}>
        <span className="label" style={{ whiteSpace: 'nowrap', color }}>{label}</span>
      </Html>
    </group>
  );
}

export type GraphSelection = GNode | null;

export default function FlowGraph({ selected, onSelect }: { selected: GraphSelection; onSelect: (n: GraphSelection) => void }) {
  const [hover, setHover] = useState<GNode | null>(null);
  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 40, position: [9, 9, 17] }} gl={{ antialias: true }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={['#08090B']} />
      <fog attach="fog" args={['#08090B', 18, 42]} />
      <PlaneFrame x={-PLANE_X} label="Moonbeam 1650811245 · source commitments" color="var(--moon)" />
      <PlaneFrame x={PLANE_X} label="Ethereum 6648936 · releases by token route" color="var(--eth)" />
      <EdgeLayer attack={false} highlight={selected?.i ?? null} />
      <EdgeLayer attack highlight={selected?.i ?? null} />
      <Highlight node={selected?.i ?? null} />
      <Nodes onHover={setHover} onPick={onSelect} />
      {GRAPH.nodes.filter((n) => (n.kind === 'token' && !n.label.startsWith('0x')) || n.kind === 'void' || (n.kind === 'message' && n.degree > 20)).map((n) => (
        <Html key={n.i} position={[n.pos[0], n.pos[1] + (n.kind === 'void' ? 0.45 : 0.3), n.pos[2]]} center style={{ pointerEvents: 'none' }}>
          <span className="label" style={{ whiteSpace: 'nowrap', color: n.kind === 'void' ? 'var(--violation)' : 'var(--text-2)' }}>{n.label}</span>
        </Html>
      ))}
      {hover && (
        <Html position={hover.pos} style={{ pointerEvents: 'none' }}>
          <div className="graph-tip">
            <span className="label">{hover.kind}</span>
            <span className="mono">{hover.kind === 'beneficiary' ? `${hover.label.slice(0, 8)}…${hover.label.slice(-6)}` : hover.label}</span>
            <span className="mono dim">{hover.degree} release{hover.degree === 1 ? '' : 's'} · {hover.attack} attack</span>
          </div>
        </Html>
      )}
      <OrbitControls target={[0, 5, 0]} enableDamping dampingFactor={0.08} autoRotate={!selected} autoRotateSpeed={0.35} minDistance={8} maxDistance={40} />
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={1.2} intensity={0.6} mipmapBlur />
        <Vignette offset={0.3} darkness={0.65} />
      </EffectComposer>
    </Canvas>
  );
}
