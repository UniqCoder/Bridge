import { useMemo, useState } from 'react';
import { NOMAD } from '../../data';
import { CFG, END, ESCALATION, useReplay } from '../../data/replay';
import { Pending, Plate, Tag } from '../../design/ui';
import { DecisionFeed, IncidentCard, Transport, WatermarkGauges } from '../../widgets/console';
import { utc } from '../../lib/format';

const SCENARIOS = [
  ['S0', 'Normal day'], ['S1', 'The real exploit'], ['S2', 'Congestion ×3'], ['S3', 'RPC gap'],
  ['S4', 'Lying observer'], ['S5', 'Replay'], ['S6', 'Fake deposit'], ['S7', 'Amount mismatch'],
] as const;

// Per-token ledger: expected backing (deposits that authorize releases) vs observed releases.
const CHART_START = CFG.start - 3 * 3600;
function LedgerChart({ t }: { t: number }) {
  const tokens = NOMAD.tokens.filter((tk) => NOMAD.attack.some((r) => r.token === tk) && !tk.startsWith('0x'));
  const [token, setToken] = useState('USDC');
  const series = useMemo(() => {
    const unit = (a: string, d: number | null) => Number(BigInt(a)) / 10 ** (d ?? 18);
    const backing: [number, number][] = [];
    const released: [number, number][] = [];
    for (const r of NOMAD.normal.filter((x) => x.token === token && x.ts >= CHART_START)) {
      backing.push([Math.max(CHART_START, r.dep_ts), unit(r.amount, r.decimals)]);
      released.push([r.ts, unit(r.amount, r.decimals)]);
    }
    for (const r of NOMAD.attack.filter((x) => x.token === token)) released.push([r.ts, unit(r.amount, r.decimals)]);
    const cum = (xs: [number, number][]) => { let c = 0; return xs.sort((a, b) => a[0] - b[0]).map(([ts, v]) => [ts, (c += v)] as [number, number]); };
    const b = cum(backing), r = cum(released);
    return { b, r, max: Math.max(b.at(-1)?.[1] ?? 1, r.at(-1)?.[1] ?? 1) };
  }, [token]);
  const W = 1000, H = 220;
  const X = (ts: number) => ((ts - CHART_START) / (END - CHART_START)) * W;
  const Y = (v: number) => H - 8 - (v / series.max) * (H - 24);
  const path = (pts: [number, number][]) => {
    let d = `M0 ${H - 8}`;
    for (const [ts, v] of pts) { if (ts > t) break; d += ` H${X(ts).toFixed(1)} V${Y(v).toFixed(1)}`; }
    return d + ` H${X(Math.min(t, END)).toFixed(1)}`;
  };
  return (
    <Plate title={`${token} · coins locked (deposits) vs coins released`} actions={
      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
        {tokens.map((tk) => <button key={tk} className="btn btn--line btn--sm" aria-pressed={tk === token} onClick={() => setToken(tk)}>{tk}</button>)}
      </div>}>
      <svg className="ledger-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label={`Cumulative ${token}: backing vs released`}>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={Y(series.max * f)} y2={Y(series.max * f)} className="grid" />)}
        <line x1={X(ESCALATION.route)} x2={X(ESCALATION.route)} y1="0" y2={H} className="mark" />
        <path d={path(series.r)} className="released" vectorEffect="non-scaling-stroke" />
        <path d={path(series.b)} className="backing" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="spread" style={{ marginTop: 8 }}>
        <div className="row-wrap"><span className="legend-sw legend-sw--b" /> <span className="label">locked (deposits)</span><span className="legend-sw legend-sw--r" /> <span className="label">released</span></div>
        <span className="label">the gap opens at {utc(ESCALATION.route).slice(11, 19)} UTC</span>
      </div>
    </Plate>
  );
}

export default function Replay() {
  const s = useReplay();
  const [scenario, setScenario] = useState('S1');
  return (
    <div className="page-grid">
      <Plate className="span-all" title="Nomad hack · 1 Aug 2022 · replay" meta={<Tag kind="real">real · replay</Tag>}
        actions={<div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
          {SCENARIOS.map(([id, name]) => (
            <button key={id} className="btn btn--line btn--sm" aria-pressed={scenario === id} disabled={id !== 'S1'} title={id === 'S1' ? name : `${name} · fault injection, backend Step 4`} onClick={() => setScenario(id)}>{id}</button>
          ))}
          <Pending what="S0, S2–S7 · backend" />
        </div>}>
        <Transport />
      </Plate>
      <WatermarkGauges s={s} />
      <IncidentCard s={s} />
      <div className="span-2"><LedgerChart t={s.t} /></div>
      <Plate title="Which rules broke" actions={<Tag>same rule as the backend</Tag>}>
        <div className="stack" style={{ gap: 10 }}>
          {s.incident ? [...s.incident.rules.entries()].map(([rule, n]) => (
            <div key={rule} className="stack" style={{ gap: 4 }}>
              <div className="spread"><span className="mono" style={{ fontSize: 12 }}>{rule}</span><span className="mono">{n}</span></div>
              <div className="meter"><span style={{ width: `${(n / s.incident!.count) * 100}%`, background: 'var(--violation)' }} /></div>
            </div>
          )) : <p className="dim" style={{ fontSize: 13 }}>Appears with the first violation.</p>}
          <p className="dim" style={{ fontSize: 12 }}>Copycats reused real deposits ({NOMAD.distinct_message_ids} deposit ids for {NOMAD.attack_releases} releases; id {NOMAD.top_message_id.id} was claimed {NOMAD.top_message_id.count} times), so one hack breaks several rules. All of it becomes one incident.</p>
        </div>
      </Plate>
      <div className="span-all"><DecisionFeed s={s} /></div>
    </div>
  );
}
