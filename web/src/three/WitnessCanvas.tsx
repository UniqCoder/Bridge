import { useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, ChromaticAberration } from '@react-three/postprocessing';
import * as THREE from 'three';
import { Towers, DST_X, SRC_X } from './Towers';
import { Thread, threadCurve } from './Thread';
import { WatermarkFog } from './WatermarkFog';
import { Gate } from './Gate';
import { ThreadBundle } from './Extras';
import { VERDICTS } from './verdicts';
import { scene, useScene, type ThreadSpec } from '../store';

// Where a lane crosses x = 0: that is where its gate sits.
function gatePoint(t: ThreadSpec): THREE.Vector3Tuple {
  const c = threadCurve(t);
  let best = c.getPointAt(0);
  for (let i = 1; i <= 60; i++) {
    const p = c.getPointAt(i / 60);
    if (Math.abs(p.x) < Math.abs(best.x)) best = p;
  }
  return [0, best.y, best.z];
}

function Effects() {
  const offset = useMemo(() => new THREE.Vector2(0, 0), []);
  useFrame(() => {
    // Violation moment: 120 ms RGB split. The effect keeps this vector by reference.
    const on = performance.now() - scene.get().violationAt < 120;
    offset.set(on ? 0.004 : 0, on ? 0.002 : 0);
  });
  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={1.1} luminanceSmoothing={0.1} intensity={0.8} mipmapBlur />
      <ChromaticAberration offset={offset} radialModulation={false} modulationOffset={0} />
      <Vignette offset={0.3} darkness={0.7} />
    </EffectComposer>
  );
}

function Lanes() {
  const { threads, holds, verifierHold, gates: showGates, labels } = useScene();
  const gates = useMemo(() => threads.map((t) => ({ t, p: gatePoint(t) })), [threads]);
  const outer = useMemo(() => {
    if (!showGates || gates.length < 2) return null;
    const ys = gates.map((g) => g.p[1]);
    return { p: [0, (Math.min(...ys) + Math.max(...ys)) / 2, 0] as THREE.Vector3Tuple, r: (Math.max(...ys) - Math.min(...ys)) / 2 + 0.7 };
  }, [gates, showGates]);
  return (
    <>
      {gates.map(({ t, p }) => (
        <group key={t.id}>
          <Thread spec={t} />
          {showGates && <Gate position={p} radius={0.32} closed={holds.includes(t.lane)} />}
          {(labels || t.label) && t.verdict !== 'witness' && (
            <Html position={[DST_X + 0.75, t.to, 0]} style={{ pointerEvents: 'none' }}>
              <span className={`v v--${t.verdict}`} style={{ transform: 'translateY(-50%)', display: 'inline-flex' }}>
                {t.label ?? VERDICTS[t.verdict].label}
              </span>
            </Html>
          )}
        </group>
      ))}
      {outer && <Gate position={outer.p} radius={outer.r} closed={verifierHold} />}
    </>
  );
}

// Slow drift for the hero; damped orbit for the console.
function HeroCamera() {
  useFrame(({ camera, clock, size }) => {
    const t = clock.elapsedTime * 0.06;
    const pull = Math.max(1, 1.5 / (size.width / size.height));
    camera.position.set(Math.sin(t) * 4 * pull, 6.2 + Math.sin(t * 0.7) * 0.4, 13.5 * pull);
    camera.lookAt(0, 5.2, 0);
  });
  return null;
}

export default function WitnessCanvas({ variant = 'hero', chains }: { variant?: 'hero' | 'console'; chains?: [string, string] }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ fov: 38, near: 0.1, far: 140, position: [0, 6, 14] }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#08090B']} />
      <fogExp2 attach="fog" args={['#08090B', variant === 'hero' ? 0.05 : 0.035]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[4, 14, 8]} intensity={1.1} color="#dfe6ee" />
      <directionalLight position={[-6, 4, -6]} intensity={0.35} color="#2FD4B5" />
      <Towers />
      <WatermarkFog />
      <Lanes />
      {variant === 'hero' && <ThreadBundle count={90} />}
      {chains && (
        <>
          <Html position={[SRC_X, 9.4, 0.8]} center style={{ pointerEvents: 'none' }}><span className="label scene-chain" style={{ whiteSpace: 'nowrap', color: 'var(--moon)' }}>{chains[0]}</span></Html>
          <Html position={[DST_X, 9.4, 0.8]} center style={{ pointerEvents: 'none' }}><span className="label scene-chain" style={{ whiteSpace: 'nowrap', color: 'var(--eth)' }}>{chains[1]}</span></Html>
        </>
      )}
      {variant === 'hero' ? <HeroCamera /> : <OrbitControls target={[0, 5, 0]} enableDamping dampingFactor={0.08} minDistance={6} maxDistance={30} enablePan={false} />}
      <Effects />
    </Canvas>
  );
}
