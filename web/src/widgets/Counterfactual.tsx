import { useId, useMemo, useState } from 'react';
import { NOMAD, RONIN } from '../data';
import { lanes, lostPredicate, POLICIES, type Release } from '../lib/counterfactual';
import { duration, usd, utc } from '../lib/format';
import { Odometer, Pending } from '../design/ui';

export const INCIDENTS = {
  nomad: { label: 'Nomad · 2022-08-01', rows: NOMAD.attack as Release[] },
  ronin: { label: 'Ronin · 2022-03-23', rows: RONIN.releases as Release[] },
};
const MAX_L = 6 * 86400; // 0 s → 6 days (Ronin went unnoticed ~6 days)
const toLatency = (v: number) => (v === 0 ? 0 : Math.round(10 ** ((v / 1000) * Math.log10(MAX_L))));
const fromLatency = (s: number) => Math.round((1000 * Math.log10(s)) / Math.log10(MAX_L));
// Containment breadth, ordinal: how much of the bridge each policy freezes once triggered.
const BREADTH: Record<string, number> = { no_monitor: 0, alert_human: 3, pause_all: 3, hold_routes: 1, adaptive: 2 };

export function useCounterfactual(initial: keyof typeof INCIDENTS = 'nomad') {
  const [which, setWhich] = useState<keyof typeof INCIDENTS>(initial);
  const [v, setV] = useState(fromLatency(60));
  const latency = toLatency(v);
  const rows = INCIDENTS[which].rows;
  const model = useMemo(() => {
    const sorted = [...rows].sort((a, b) => a.ts - b.ts);
    const t0 = sorted[0].ts;
    const span = Math.max(60, sorted.at(-1)!.ts - t0) * 1.04;
    const total = sorted.reduce((a, r) => a + r.usd, 0);
    const result = lanes(sorted, latency);
    return {
      t0, span, total,
      lanes: POLICIES.map((pol, i) => {
        const lost = lostPredicate(sorted, pol.id, latency);
        let cum = 0, d = 'M0 40', containedAt: number | null = null;
        for (const r of sorted) {
          const x = ((r.ts - t0) / span) * 1000;
          d += ` H${x.toFixed(1)}`;
          if (lost(r)) cum += r.usd; else containedAt ??= r.ts;
          d += ` V${(40 - (cum / total) * 38).toFixed(2)}`;
        }
        return { ...result[i], d: d + ' H1000', containedAt, breadth: BREADTH[pol.id] };
      }),
    };
  }, [rows, latency]);
  return { which, setWhich, v, setV, latency, model };
}

export function Counterfactual({ compact, progress = 1, state }: { compact?: boolean; progress?: number; state?: ReturnType<typeof useCounterfactual> }) {
  const own = useCounterfactual();
  const { which, setWhich, v, setV, latency, model } = state ?? own;
  const id = useId();
  return (
    <div className={`cf ${compact ? 'cf--compact' : ''}`}>
      <div className="cf-head">
        <div role="group" aria-label="Incident" className="row" style={{ gap: 6 }}>
          {(Object.keys(INCIDENTS) as (keyof typeof INCIDENTS)[]).map((k) => (
            <button key={k} className="btn btn--line btn--sm" aria-pressed={which === k} onClick={() => setWhich(k)}>{INCIDENTS[k].label}</button>
          ))}
        </div>
        <label className="cf-slider" htmlFor={id}>
          <span className="label">Response latency</span>
          <span className="mono cf-latency">{latency === 0 ? '0 s' : duration(latency)}</span>
          <input id={id} type="range" min={0} max={1000} value={v} onChange={(e) => setV(+e.target.value)} />
          <span className="cf-ticks label" aria-hidden="true"><span>0 s</span><span>1 min</span><span>1 h</span><span>Ronin actual ≈ 6 d</span></span>
        </label>
      </div>
      <ol className="cf-lanes" style={{ ['--play' as string]: `${(1 - progress) * 100}%` }}>
        {model.lanes.map((l) => (
          <li key={l.policy} className={l.policy === 'no_monitor' ? 'is-baseline' : ''}>
            <span className="cf-label">{l.label}</span>
            <svg viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true">
              <line x1="0" x2="1000" y1="40" y2="40" className="cf-axis" />
              <path d={`${l.d} V40 H0 Z`} className="cf-area" />
              <path d={l.d} className="cf-curve" vectorEffect="non-scaling-stroke" />
            </svg>
            <span className="cf-loss">
              <Odometer value={`${l.lost_pct.toFixed(1)}%`} />
              <span className="label">{usd(l.lost_usd)} lost</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="cf-axis-labels label"><span>{utc(model.t0)}</span><span>+{duration(model.span / 1.04)}</span></div>
      <p className="cf-note">
        Estimated loss under this replay model. Attackers may adapt; no funds were recovered. Assumes attackers behave identically
        after a hold, detection at the first unbacked release, dataset USD. “Alert + human” and “Pause everything” lose the same
        amount here; they differ in users blocked <Pending what="disruption · backend" />. Computed in your browser from the XChainWatcher CSVs.
      </p>
    </div>
  );
}
