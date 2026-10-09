import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EVIDENCE, LIVE, NOMAD } from '../../data';
import { CFG, computeAt, END, ESCALATION, useReplay } from '../../data/replay';
import { Hash, Plate, Readout, Verdict } from '../../design/ui';
import { duration, formatUnits, usd, utc } from '../../lib/format';
import { IncidentCard } from '../../widgets/console';

const full = computeAt(END);
const liveAtk = EVIDENCE.find((e) => e.sha === LIVE.attack_sha)!;

function ListView() {
  const s = useReplay();
  const inc = full.incident!;
  return (
    <div className="page-grid">
      <Plate className="span-all" title="Open incidents" actions={<span className="label">grouped by destination contract / verifier within a window · rule not in key</span>} bodyClass="">
        <table className="table">
          <thead><tr><th>id</th><th>kind</th><th>status</th><th className="num">violations</th><th className="num">beneficiaries</th><th className="num">exposure</th><th>scope</th><th>first seen</th><th /></tr></thead>
          <tbody>
            <tr>
              <td className="mono">{inc.id}</td><td>unbacked + replayed releases</td><td><Verdict status="invariant_violation" label="open · copycat" /></td>
              <td className="num">{inc.count}</td><td className="num">{inc.beneficiaries}</td><td className="num">{usd(inc.exposureUsd)}</td>
              <td className="mono">verifier</td><td className="mono">{utc(inc.firstSeen)}</td><td><Link to="inc_nomad" className="cap-link">Open →</Link></td>
            </tr>
            <tr>
              <td className="mono">inc_live</td><td>unbacked release (local chains)</td><td><Verdict status="invariant_violation" label="contained · held" /></td>
              <td className="num">1</td><td className="num">1</td><td className="num">n/a · no price</td>
              <td className="mono">route</td><td className="mono">{utc(liveAtk.bundle.release.timestamp)}</td><td><Link to="inc_live" className="cap-link">Open →</Link></td>
            </tr>
          </tbody>
        </table>
      </Plate>
      <div className="span-2"><IncidentCard s={s} /></div>
      <Plate title="Why one incident"><p className="dim" style={{ fontSize: 13 }}>Raised individually, Nomad is {NOMAD.attack_releases} pages in 2.5 hours. Grouped by the destination verifier they all hit, it is one incident whose exposure, copycat signal and containment scope update live. The replay clock above drives the card.</p></Plate>
    </div>
  );
}

function Step({ pts, color, max, t1 }: { pts: [number, number][]; color: string; max: number; t1: number }) {
  const W = 1000, H = 160;
  const t0 = pts[0]?.[0] ?? 0;
  let d = `M0 ${H}`;
  for (const [ts, v] of pts) d += ` H${(((ts - t0) / (t1 - t0)) * W).toFixed(1)} V${(H - (v / max) * (H - 10)).toFixed(1)}`;
  return <path d={d + ` H${W}`} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />;
}

function NomadDetail() {
  const inc = full.incident!;
  const rows = NOMAD.attack;
  const t0 = rows[0].ts, t1 = rows.at(-1)!.ts;
  const series = useMemo(() => {
    let u = 0; const bens = new Set<string>();
    const exp: [number, number][] = [], cnt: [number, number][] = [], ben: [number, number][] = [];
    rows.forEach((r, i) => { u += r.usd; bens.add(r.ben); exp.push([r.ts, u]); cnt.push([r.ts, i + 1]); ben.push([r.ts, bens.size]); });
    return { exp, cnt, ben };
  }, [rows]);
  const at = (s: number) => rows.filter((r) => r.ts <= t0 + s).length;
  const tokens = [...inc.exposure.entries()].sort((a, b) => b[1].usd - a[1].usd);
  return (
    <div className="page-grid">
      <Plate className="span-all" title={<>Incident <b>inc_nomad</b> · Nomad replica on Ethereum</>} meta={<Verdict status="invariant_violation" label="open · copycat swarm" />}
        actions={<><Link to="/console/graph" className="btn btn--line btn--sm">Flow graph</Link><Link to="/console/theatre" className="btn btn--line btn--sm">Counterfactual</Link></>}>
        <div className="readouts">
          <Readout label="Exposure · dataset USD" value={usd(inc.exposureUsd)} />
          <Readout label="Violations" value={inc.count} sub={`${NOMAD.attack_txs} transactions`} />
          <Readout label="Beneficiaries" value={inc.beneficiaries} />
          <Readout label="Duration" value={duration(t1 - t0)} sub={`${utc(t0).slice(11, 19)} → ${utc(t1).slice(11, 19)} UTC`} />
          <Readout label="Priority" value={inc.priority.total} sub="ranking, not probability" />
        </div>
      </Plate>
      <Plate className="span-2" title="Exposure over time · copper = USD, line = violations, dashed = beneficiaries">
        <svg className="inc-chart" viewBox="0 0 1000 160" preserveAspectRatio="none">
          <Step pts={series.exp} color="var(--violation)" max={inc.exposureUsd} t1={t1} />
          <Step pts={series.cnt} color="var(--text-2)" max={rows.length} t1={t1} />
          <g strokeDasharray="4 4"><Step pts={series.ben} color="var(--text-3)" max={rows.length} t1={t1} /></g>
        </svg>
        <div className="checkpoints">
          {[60, 900, 3600, 9000].map((s) => <div key={s}><span className="label">+{duration(s)}</span><span className="mono">{at(s)} releases</span></div>)}
        </div>
      </Plate>
      <Plate title="Containment scope · adaptive">
        <ol className="timeline">
          <li><span className="mono">{utc(ESCALATION.route).slice(11, 19)}</span><span>route hold · {rows[0].token}</span><span className="dim">first unbacked release</span></li>
          <li><span className="mono">{utc(ESCALATION.copycat).slice(11, 19)}</span><span>copycat flag</span><span className="dim">≥{CFG.copycat.n} violations from ≥{CFG.copycat.m} beneficiaries in {CFG.copycat.w / 60} min</span></li>
          <li><span className="mono">{utc(ESCALATION.verifier).slice(11, 19)}</span><span>verifier hold</span><span className="dim">2nd route ({ESCALATION.secondToken}) behind the same verifier · +{ESCALATION.verifier - ESCALATION.route} s</span></li>
        </ol>
        <p className="dim" style={{ fontSize: 12, marginTop: 12 }}>Thresholds are preview config until incidents.py lands (HANDOFF Step 3).</p>
      </Plate>
      <Plate className="span-2" title="Exposure by token route" bodyClass="">
        <table className="table">
          <thead><tr><th>token</th><th className="num">violations</th><th className="num">units released</th><th className="num">dataset USD</th><th>share</th></tr></thead>
          <tbody>{tokens.map(([t, e]) => (
            <tr key={t}><td className="mono">{t}</td><td className="num">{e.count}</td><td className="num">{e.decimals !== null ? formatUnits(e.units.toString(), e.decimals).replace(/\.?0+$/, '') : e.units.toString()}</td><td className="num">{usd(e.usd)}</td>
              <td style={{ width: '24%' }}><div className="meter"><span style={{ width: `${(e.usd / inc.exposureUsd) * 100}%`, background: 'var(--violation)' }} /></div></td></tr>
          ))}</tbody>
        </table>
      </Plate>
      <Plate title="Priority breakdown">
        <div className="kv">
          <span className="label">base (unbacked / replay)</span><span className="mono">{inc.priority.base}</span>
          <span className="label">exposure min(15, 3·log10 usd)</span><span className="mono">+{inc.priority.exposure.toFixed(2)}</span>
          <span className="label">campaign (copycat)</span><span className="mono">+{inc.priority.campaign}</span>
          <span className="label">× evidence completeness</span><span className="mono">{inc.priority.completeness}</span>
          <span className="label">priority</span><span className="mono">{inc.priority.total}</span>
        </div>
        <div className="stack" style={{ gap: 6, marginTop: 14 }}>
          {[...inc.rules].map(([r, n]) => <div key={r} className="spread mono" style={{ fontSize: 11 }}><span>{r}</span><span>{n}</span></div>)}
        </div>
      </Plate>
    </div>
  );
}

function LiveDetail() {
  const d = liveAtk.decision;
  const a = d.accounting as { released_common_units: string; authorized_common_units: string; excess_common_units: string };
  return (
    <div className="page-grid">
      <Plate className="span-all" title={<>Incident <b>inc_live</b> · local chains 31337 → 31338</>} meta={<Verdict status="invariant_violation" label="contained · held before execution" />}
        actions={<Link to={`/console/evidence/${liveAtk.sha.slice(0, 12)}`} className="btn btn--sm">Verify exhibit<span className="arrow">→</span></Link>}>
        <div className="readouts">
          <Readout label="Released (requested)" value={formatUnits(a.released_common_units, 6)} unit="DEMO" />
          <Readout label="Authorized" value={formatUnits(a.authorized_common_units, 6)} unit="DEMO" />
          <Readout label="Excess" value={<span className="c-violation">{formatUnits(a.excess_common_units, 6)}</span>} unit="DEMO" />
          <Readout label="Healthy route settled" value={<span className="c-verified">{formatUnits(LIVE.healthy_settled_base_units, 6)}</span>} unit="DEMO" />
        </div>
      </Plate>
      <Plate className="span-2" title="What happened">
        <ol className="timeline">
          <li><span className="mono">request</span><span>validator <Hash value={(liveAtk.bundle.release as { signer_addresses: string[] }).signer_addresses[0]} kind="raw" /> signs 900 DEMO</span><span className="dim">signature valid · quorum 1</span></li>
          <li><span className="mono">verdict</span><span>{d.violations.join(', ')}</span><span className="dim">source coverage complete through {(liveAtk.bundle.coverage as { through_timestamp: number }).through_timestamp}</span></li>
          <li><span className="mono">hold</span><span>route held · tx <Hash value={LIVE.hold_tx} kind="raw" /></span><span className="dim">execute reverted · attack_execution_blocked = {String(LIVE.attack_execution_blocked)}</span></li>
          <li><span className="mono">healthy</span><span>local-healthy-route executes</span><span className="dim">exactly {LIVE.healthy_settled_base_units} base units</span></li>
        </ol>
      </Plate>
      <Plate title="Honesty">
        <ul className="plain">
          <li>{LIVE.public_chain_transactions_sent} public-chain transactions sent</li>
          <li>contracts audited: {String(LIVE.contracts_audited)}</li>
          <li>ML used for containment: {String(LIVE.ml_used_for_containment)}</li>
          <li>scope: {LIVE.scope.replaceAll('_', ' ')}</li>
        </ul>
      </Plate>
    </div>
  );
}

export default function Incidents() {
  const { id } = useParams();
  if (id === 'inc_nomad') return <NomadDetail />;
  if (id === 'inc_live') return <LiveDetail />;
  return <ListView />;
}
