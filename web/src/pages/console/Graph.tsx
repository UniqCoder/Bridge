import { lazy, Suspense, useMemo, useState } from 'react';
import { GRAPH, type GNode } from '../../three/graphData';
import { useReplay } from '../../data/replay';
import { Hash, Plate, Tag, Verdict } from '../../design/ui';
import { Transport } from '../../widgets/console';
import { usd, utc } from '../../lib/format';

const FlowGraph = lazy(() => import('../../three/FlowGraph'));

function Inspector({ n }: { n: GNode }) {
  const edges = GRAPH.edges.filter((e) => e.from === n.i || e.to === n.i);
  const rules = new Map<string, number>();
  edges.forEach((e) => e.rule && rules.set(e.rule, (rules.get(e.rule) ?? 0) + 1));
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="spread"><span className="label">{n.kind}</span>{n.attack ? <Verdict status="invariant_violation" label={`${n.attack} attack`} /> : <Verdict status="consistent_under_supplied_evidence" />}</div>
      <div className="mono" style={{ fontSize: 13, overflowWrap: 'anywhere' }}>
        {n.kind === 'beneficiary' ? <Hash value={n.key} chain={6648936} kind="address" head={10} tail={8} /> : n.label}
      </div>
      <div className="kv">
        <span className="label">releases</span><span className="mono">{edges.length}</span>
        <span className="label">dataset USD</span><span className="mono">{usd(n.usd)}</span>
        {n.token && <><span className="label">token route</span><span className="mono">{n.token}</span></>}
        <span className="label">first seen</span><span className="mono">{n.firstTs ? utc(n.firstTs).slice(5, 19) : '—'}</span>
      </div>
      {rules.size > 0 && <div className="stack" style={{ gap: 4 }}>{[...rules].map(([r, c]) => <div key={r} className="spread mono" style={{ fontSize: 11 }}><span>{r}</span><span>{c}</span></div>)}</div>}
    </div>
  );
}

export default function Graph() {
  const [sel, setSel] = useState<GNode | null>(null);
  const s = useReplay();
  const hubs = useMemo(() => GRAPH.nodes.filter((n) => n.kind === 'message' || n.kind === 'void').sort((a, b) => b.degree - a.degree).slice(0, 7), []);
  const tokens = useMemo(() => GRAPH.nodes.filter((n) => n.kind === 'token').sort((a, b) => b.usd - a.usd), []);
  const shown = GRAPH.edges.filter((e) => e.ts <= s.t);
  return (
    <div className="graph-page">
      <div className="graph-stage plate">
        <div className="hud hud--tl label">{shown.length}/{GRAPH.edges.length} releases · {utc(s.t).slice(11, 19)} UTC · drag to orbit</div>
        <Suspense fallback={<div className="page-loading label">Building graph…</div>}><FlowGraph selected={sel} onSelect={setSel} /></Suspense>
        <div className="hud hud--bl graph-legend">
          <span><i className="lg lg--msg" />source message</span>
          <span><i className="lg lg--void" />∅ no deposit</span>
          <span><i className="lg lg--ok" />beneficiary · matched</span>
          <span><i className="lg lg--bad" />beneficiary · unbacked</span>
          <span><i className="lg lg--tok" />token route</span>
        </div>
      </div>
      <aside className="graph-side">
        <Plate title="Replay clock"><Transport compact /></Plate>
        <Plate title="Inspector" actions={sel && <button className="btn btn--line btn--sm" onClick={() => setSel(null)}>Clear</button>}>
          {sel ? <Inspector n={sel} /> : <p className="dim" style={{ fontSize: 13 }}>Click any node. Hubs on the source plane are message ids; their fan-out is how many releases claimed them.</p>}
        </Plate>
        <Plate title="Fan-out · releases per source message">
          <ol className="rank">
            {hubs.map((n) => (
              <li key={n.i}>
                <button onClick={() => setSel(n)}>
                  <span className="mono">{n.kind === 'void' ? '∅ no deposit' : `id ${n.key}`}</span>
                  <span className="rank-bar"><i style={{ width: `${(n.degree / hubs[0].degree) * 100}%`, background: n.attack ? 'var(--violation)' : 'var(--verified)' }} /></span>
                  <span className="mono">{n.degree}</span>
                </button>
              </li>
            ))}
          </ol>
          <p className="dim" style={{ fontSize: 12, marginTop: 10 }}>A legitimate message backs exactly one release. Anything above 1 is a replay of a proven message.</p>
        </Plate>
        <Plate title="Exposure by token route">
          <table className="table">
            <tbody>{tokens.map((t) => <tr key={t.i} onClick={() => setSel(t)} className="is-clickable"><td className="mono">{t.label}</td><td className="num">{t.degree}</td><td className="num">{usd(t.usd)}</td></tr>)}</tbody>
          </table>
          <div className="row-wrap" style={{ marginTop: 10 }}><Tag kind="real">XChainWatcher CSV · 1–2 Aug</Tag></div>
        </Plate>
      </aside>
    </div>
  );
}
