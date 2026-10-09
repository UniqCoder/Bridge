import { ESCALATION } from '../data/replay';
import { NOMAD } from '../data';
import { duration, utc } from '../lib/format';

// Engineering-drawing style diagrams for each capability. Strokes 1.5px, semantic colour only.

export function TrieDiagram() {
  const rows: [string, string, string?][] = [
    ['Block header #N', 'hash re-encoded with RLP + keccak256'],
    ['stateRoot', 'commits to every account'],
    ['account · SourceBridge', 'storageRoot of the bridge contract'],
    ['slot keccak(id, 0)', 'deposits[id] → ∅ empty', 'violation'],
  ];
  return (
    <svg className="diagram" viewBox="0 0 520 300" role="img" aria-label="Proof path from block header to an empty deposit slot">
      {rows.map(([a, b, tone], i) => {
        const y = 22 + i * 70;
        return (
          <g key={a}>
            {i > 0 && <path d={`M70 ${y - 34} V${y}`} className="d-line" />}
            <rect x="20" y={y} width="210" height="40" className={tone ? 'd-box d-box--violation' : 'd-box'} />
            <text x="34" y={y + 25} className={tone ? 'd-text c-violation' : 'd-text'}>{a}</text>
            <path d={`M230 ${y + 20} H262`} className="d-line" />
            <text x="270" y={y + 25} className="d-note">{b}</text>
          </g>
        );
      })}
      <text x="20" y="296" className="d-note">Exclusion proof: the walk ends in an empty branch.</text>
    </svg>
  );
}

export function WatermarkDiagram() {
  const ticks = (n: number, from: number, to: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));
  return (
    <svg className="diagram" viewBox="0 0 520 220" role="img" aria-label="Per-chain watermarks: releases past the source watermark are unknown">
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#A4ABB6" strokeOpacity="0.35" strokeWidth="1.5" />
        </pattern>
      </defs>
      <text x="0" y="52" className="d-note" style={{ fill: 'var(--moon)' }}>source</text>
      <text x="0" y="142" className="d-note" style={{ fill: 'var(--eth)' }}>destination</text>
      <path d="M70 48 H500 M70 138 H500" className="d-line" />
      <rect x="330" y="30" width="170" height="36" fill="url(#hatch)" />
      {ticks(8, 82, 318).map((x) => <path key={x} d={`M${x} 40 V56`} className="d-line" />)}
      {ticks(11, 90, 490).map((x, i) => (
        <circle key={x} cx={x} cy="138" r="4" className={x > 330 ? 'd-dot d-dot--unknown' : i === 6 ? 'd-dot d-dot--violation' : 'd-dot d-dot--ok'} />
      ))}
      <path d="M330 18 V160" className="d-line d-line--strong" />
      <text x="336" y="20" className="d-note">seen up to here</text>
      <text x="500" y="182" textAnchor="end" className="d-note">beyond it: unknown, not alarm</text>
      <text x="70" y="182" className="d-note">before it: decided</text>
    </svg>
  );
}

export function ScopeRings() {
  const t0 = ESCALATION.route;
  const rings = [
    { r: 40, label: 'message', at: 'first violation' },
    { r: 78, label: 'route', at: `${utc(t0).slice(11, 19)} UTC · ${NOMAD.attack[0].token}` },
    { r: 118, label: 'shared verifier', at: `+${duration(ESCALATION.verifier - t0)} · 2nd route (${ESCALATION.secondToken})` },
  ];
  return (
    <svg className="diagram" viewBox="0 0 520 260" role="img" aria-label="Adaptive containment scope rings">
      {rings.map((g, i) => (
        <g key={g.label}>
          <circle cx="130" cy="130" r={g.r} className={i === 2 ? 'd-ring d-ring--hold' : 'd-ring'} />
          <path d={`M${130 + g.r * 0.71} ${130 - g.r * 0.71} L300 ${50 + i * 70}`} className="d-line" />
          <text x="308" y={54 + i * 70} className="d-text">{g.label}</text>
          <text x="308" y={72 + i * 70} className="d-note">{g.at}</text>
        </g>
      ))}
      {Array.from({ length: 9 }, (_, k) => {
        const a = (k / 9) * Math.PI * 2;
        return <path key={k} d={`M${130 + Math.cos(a) * 40} ${130 + Math.sin(a) * 40} L${130 + Math.cos(a + 1.5) * 8} ${130 + Math.sin(a + 1.5) * 8}`} className="d-blade" />;
      })}
    </svg>
  );
}

export function Pipeline() {
  const stages = [
    ['Read the chains', 'finalized blocks and receipts'],
    ['Track what we have seen', 'gap-free, per chain'],
    ['Match every release', 'exact whole-number maths'],
    ['Group and score', 'incidents, exposure, risk'],
    ["Hold if a rule broke", "before the release executes"],
  ];
  return (
    <div className="pipeline">
      {stages.map(([a, b], i) => (
        <div className="pipe-stage" key={a}>
          <span className="label">{String(i + 1).padStart(2, '0')}</span>
          <span className="t-h3">{a}</span>
          <span className="dim mono" style={{ fontSize: 11 }}>{b}</span>
        </div>
      ))}
      <div className="pipe-out">
        <span className="label">Every verdict comes with</span>
        <span className="mono">an evidence file your browser can re-check</span>
      </div>
    </div>
  );
}
