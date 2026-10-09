import { Plate, Tag } from '../../design/ui';
import { Counterfactual, useCounterfactual } from '../../widgets/Counterfactual';
import { duration, usd } from '../../lib/format';

const BREADTH_LABEL = ['none', 'route', 'verifier', 'everything'];

// Loss vs containment breadth. Breadth is ordinal until the backend measures users blocked.
function Pareto({ cf }: { cf: ReturnType<typeof useCounterfactual> }) {
  const W = 420, H = 260, P = 36;
  const X = (b: number) => P + (b / 3) * (W - P * 2);
  const Y = (pct: number) => H - P - (pct / 100) * (H - P * 2);
  return (
    <svg className="pareto" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Loss versus containment breadth per policy">
      {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={P} x2={W - P} y1={Y(p)} y2={Y(p)} className="grid" /><text x={P - 8} y={Y(p) + 3} textAnchor="end" className="d-note">{p}%</text></g>)}
      {BREADTH_LABEL.map((l, b) => <text key={l} x={X(b)} y={H - 12} textAnchor="middle" className="d-note">{l}</text>)}
      {cf.model.lanes.map((l) => (
        <g key={l.policy}>
          <circle cx={X(l.breadth) + (l.policy === 'alert_human' ? -8 : l.policy === 'pause_all' ? 8 : 0)} cy={Y(l.lost_pct)} r="5" className={l.policy === 'no_monitor' ? 'pt pt--base' : 'pt'} />
          <text x={X(l.breadth) + 10} y={Y(l.lost_pct) - 8} className="d-note" style={{ fill: 'var(--text-2)' }}>{l.label}</text>
        </g>
      ))}
    </svg>
  );
}

export default function Theatre() {
  const cf = useCounterfactual();
  const best = [...cf.model.lanes].filter((l) => l.policy !== 'no_monitor').sort((a, b) => a.lost_pct - b.lost_pct)[0];
  return (
    <div className="page-grid">
      <Plate className="span-all" title="Counterfactual response analysis" meta={<Tag kind="real">real exploit data</Tag>}>
        <Counterfactual state={cf} />
      </Plate>
      <Plate title="Loss vs containment breadth">
        <Pareto cf={cf} />
        <p className="dim" style={{ fontSize: 12 }}>Breadth is ordinal (none → route → verifier → everything) until disruption is measured in users blocked.</p>
      </Plate>
      <Plate title="Reading it">
        <div className="stack" style={{ gap: 12 }}>
          <p className="t-body" style={{ fontSize: 14 }}>At <span className="mono">{cf.latency === 0 ? '0 s' : duration(cf.latency)}</span> latency on {cf.which === 'nomad' ? 'Nomad' : 'Ronin'}, the lowest loss short of freezing everything is <b>{best.label}</b> at <span className="mono">{best.lost_pct.toFixed(1)}%</span> ({usd(best.lost_usd)}).</p>
          {cf.which === 'nomad'
            ? <p className="dim" style={{ fontSize: 13 }}>Holding only the attacked routes fails on Nomad: the bug sat in the shared message verifier and attackers hopped token to token. Adaptive scope escalates to the verifier when a second route is hit, which is why it tracks "pause everything" without freezing healthy bridges.</p>
            : <p className="dim" style={{ fontSize: 13 }}>Ronin: two releases 115 s apart, ~95% of the loss in the first. Any post-execution response recovers at most ~4.5%. Only a pre-execution gate changes this outcome.</p>}
        </div>
      </Plate>
      <Plate title="Assumptions (mandatory)">
        <ul className="plain">
          <li>Attackers behave identically after a hold.</li>
          <li>Detection fires on the first unbacked release (needs source coverage).</li>
          <li>USD values are the dataset's historical value_usd.</li>
          <li>Nomad data covers the Ethereum side only (~$160M of ~$190M reported).</li>
          <li>Estimates, not recovered funds.</li>
        </ul>
      </Plate>
    </div>
  );
}
