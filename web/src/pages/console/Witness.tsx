import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LIVE } from '../../data';
import { ESCALATION, useReplay, type Decision } from '../../data/replay';
import { Hash, Plate, Tag, Verdict } from '../../design/ui';
import { DecisionFeed, Transport, WatermarkGauges } from '../../widgets/console';
import { formatUnits, utc } from '../../lib/format';
import { scene, type ThreadSpec } from '../../store';

const WitnessCanvas = lazy(() => import('../../three/WitnessCanvas'));
const LANES = 7;

// The newest releases become threads on the bridge, newest on top.
function threadsFor(ds: Decision[]): ThreadSpec[] {
  return ds.slice(0, LANES).map((d, i) => {
    const from = 2 + (LANES - 1 - i) * 0.95;
    return { id: d.key, verdict: d.status as ThreadSpec['verdict'], from, to: from + 0.45, lane: i % 3 };
  });
}

function Takeover({ d, onClose }: { d: Decision; onClose: () => void }) {
  const amount = d.decimals !== null ? formatUnits(d.amount, d.decimals) : d.amount;
  const authorized = d.rules.includes('missing_source_authorization') ? '0' : 'claimed by an earlier release';
  return (
    <div className="takeover" role="alertdialog" aria-labelledby="tk-title">
      <span className="takeover-sweep" aria-hidden="true" />
      <div className="takeover-card plate">
        <div className="plate-head">
          <span className="label" id="tk-title">Exhibit · release <span className="mono">{d.tx.slice(0, 10)}…</span> · {utc(d.ts).slice(11, 19)} UTC</span>
          <button className="icon-btn" onClick={onClose} aria-label="Dismiss">×</button>
        </div>
        <div className="plate-body stack" style={{ gap: 18 }}>
          <div className="row-wrap"><Verdict status="invariant_violation" /><span className="mono" style={{ fontSize: 12 }}>{d.rules.join(' · ')}</span><span className="dim mono" style={{ fontSize: 12 }}>suspected_unbacked_release</span></div>
          <div className="triple">
            <div><span className="label">Released</span><span className="mono big">{amount}</span><span className="label">{d.token}</span></div>
            <div><span className="label">Authorized</span><span className="mono big">{authorized === '0' ? '0' : '—'}</span><span className="label">{authorized === '0' ? 'no deposit on this route' : authorized}</span></div>
            <div><span className="label">Excess</span><span className="mono big c-violation">{authorized === '0' ? amount : '≥ ' + amount}</span><span className="label">{d.token}</span></div>
          </div>
          <div className="row-wrap">
            <Link to="/console/incidents/inc_nomad" className="btn btn--sm">Open incident<span className="arrow">→</span></Link>
            <button className="btn btn--line btn--sm" disabled title="Historical replay: Nomad had no gate. Holds run on the live bridge (Gauntlet).">Hold · route (scope pre-selected)</button>
            <Link to={`/console/evidence/${LIVE.attack_sha.slice(0, 12)}`} className="btn btn--line btn--sm">Verify a held exhibit</Link>
          </div>
          <p className="dim" style={{ fontSize: 12 }}>Nomad replay bundles carry no receipt proofs (the dataset has none). The live-bridge exhibit shows the same violation with full proofs.</p>
        </div>
      </div>
    </div>
  );
}

export default function Witness() {
  const s = useReplay();
  const [alert, setAlert] = useState<Decision | null>(null);
  const seenFirst = useRef(false);
  const top = s.decisions[0]?.key;

  useEffect(() => {
    scene.set({ threads: threadsFor(s.decisions), wm: s.blinded ? 4.2 : 40, gates: false, labels: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top, s.blinded]);

  useEffect(() => {
    const first = s.decisions.find((d) => d.status === 'invariant_violation');
    if (first && !seenFirst.current && s.t - first.ts < 120) {
      seenFirst.current = true;
      scene.set({ violationAt: performance.now() });
      setAlert(first);
    }
    if (!first) seenFirst.current = false;
  }, [s.decisions, s.t]);

  return (
    <div className="witness-page">
      <div className="witness-stage plate">
        <div className="hud hud--tl label">Witness bridge · newest {LANES} releases · drag to orbit</div>
        <div className="hud hud--tr row" style={{ gap: 6 }}>{s.blinded ? <span className="tag" style={{ color: 'var(--pending)', borderColor: 'var(--pending)' }}>source blind · unknown, not alarm</span> : <Tag>source observed</Tag>}</div>
        <Suspense fallback={null}><WitnessCanvas variant="console" chains={['Moonbeam 1650811245', 'Ethereum 6648936']} /></Suspense>
        {alert && <Takeover d={alert} onClose={() => setAlert(null)} />}
      </div>
      <aside className="witness-side">
        <Plate title="Replay clock"><Transport compact /></Plate>
        <WatermarkGauges s={s} />
        <Plate title="Live chains · Act 2" actions={<Tag kind="real">last run</Tag>}>
          <div className="kv">
            <span className="label">held (unbacked)</span><span className="mono">{formatUnits(LIVE.attempted_unbacked_base_units, 6)} DEMO</span>
            <span className="label">settled (healthy)</span><span className="mono c-verified">{formatUnits(LIVE.healthy_settled_base_units, 6)} DEMO</span>
            <span className="label">hold tx</span><Hash value={LIVE.hold_tx} kind="raw" />
          </div>
        </Plate>
      </aside>
      <div className="witness-feed"><DecisionFeed s={s} limit={40} /></div>
      <div className="sr-only" aria-live="polite">{s.decisions[0] ? `${utc(s.decisions[0].ts).slice(11, 19)} ${s.decisions[0].status} ${s.decisions[0].token}` : ''}{s.t >= ESCALATION.verifier ? ' · scope verifier' : ''}</div>
    </div>
  );
}
