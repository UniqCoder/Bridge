import { useState } from 'react';
import { Link } from 'react-router-dom';
import { API, LIVE } from '../../data';
import { ATTACKS, runAttack, type AttackResult } from '../../demo/attacks';
import { EXPLOIT_LABEL } from '../../detect/classify';
import { Hash, Pending, Plate, Tag, Verdict } from '../../design/ui';
import { formatUnits } from '../../lib/format';

const GATE_TEXT = { held: 'Held before funds move', flagged: 'Flagged, nothing released on a guess', allowed: 'Allowed to settle' } as const;
const EXPECT_TEXT: Record<string, string> = { invariant_violation: 'violation', consistent_under_supplied_evidence: 'consistent', unknown: 'unknown', overdue: 'overdue', orphaned: 'orphaned' };

function Result({ r }: { r: AttackResult }) {
  return (
    <div className="envelope-result">
      <ol className="plain" style={{ fontSize: 12.5 }}>{r.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <div className="outcome">
        <div><span className="label">{r.second ? 'Watermark mode' : 'Observed'}</span><Verdict status={r.observed.status} /></div>
        {r.second && <div><span className="label">Proof mode</span><Verdict status={r.second.observed.status} /></div>}
        {r.observed.rules[0] && <div><span className="label">Because</span><span className="mono" style={{ fontSize: 11 }}>{r.observed.rules[0]}</span></div>}
        {r.observed.exploit !== 'none' && <div><span className="label">Suspected exploit</span><span style={{ fontSize: 13 }}>{EXPLOIT_LABEL[r.observed.exploit]}</span></div>}
        {r.observed.excess && <div><span className="label">Excess</span><span className="mono c-violation">{r.observed.excess}</span></div>}
        {r.observed.note && <div><span className="label">Note</span><span style={{ fontSize: 12 }}>{r.observed.note}</span></div>}
      </div>
      <div className="spread" style={{ flexWrap: 'wrap' }}>
        <span className={r.pass ? 'c-verified' : 'c-violation'} style={{ fontWeight: 500 }}>{r.pass ? '✓ matches the expected verdict' : '✗ differs from the expected verdict'}</span>
        <span className="mono" style={{ fontSize: 11 }}>{r.n === 12 ? 'watermark mode: false alarm; proof mode: none' : GATE_TEXT[r.gate]}</span>
      </div>
      {r.layer && <span className="dim" style={{ fontSize: 11 }}>Uses: {r.layer}</span>}
    </div>
  );
}

function Envelope({ a, result, onRun }: { a: (typeof ATTACKS)[number]; result?: AttackResult; onRun: () => void }) {
  const ran = a.n === 1;
  return (
    <article className={`envelope ${a.control ? 'envelope--control' : ''} ${result ? 'is-open' : ''}`}>
      <svg className="flap" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 L150 38 L300 0" /></svg>
      <div className="seal mono" aria-hidden="true">{String(a.n).padStart(2, '0')}</div>
      <div className="envelope-body">
        <div className="spread"><span className="label">{a.control ? 'safe case (must not alarm)' : 'attack'} #{a.n}</span>{ran && <Tag kind="real">also run on real chains</Tag>}</div>
        <h3 className="t-h3">{a.name}</h3>
        <p className="dim" style={{ fontSize: 13 }}>{a.threat}</p>
        <div className="stack" style={{ gap: 6 }}>
          <span className="label">expected</span>
          <div className="row-wrap"><Verdict status={a.expected} /><span className="mono dim" style={{ fontSize: 10.5 }}>{a.expectedRule}</span></div>
        </div>
        {result && <Result r={result} />}
        {a.n === 1 && result && (
          <div className="envelope-real mono">
            Real local chains (reference run): held {formatUnits(LIVE.attempted_unbacked_base_units, 6)} DEMO; healthy route settled {formatUnits(LIVE.healthy_settled_base_units, 6)}; tx <Hash value={LIVE.hold_tx} kind="raw" head={6} tail={4} />
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 'auto' }}>
          <button className="btn btn--sm" onClick={onRun}>{result ? 'Run again' : 'Run in demo'}<span className="arrow">→</span></button>
          {a.n === 1 && <Link className="btn btn--line btn--sm" to={`/console/evidence/${LIVE.attack_sha.slice(0, 12)}`}>See the evidence</Link>}
        </div>
      </div>
    </article>
  );
}

export default function Gauntlet() {
  const [results, setResults] = useState<Record<number, AttackResult>>({});
  const run = (n: number) => setResults((r) => ({ ...r, [n]: runAttack(n) }));
  const runAll = () => setResults(Object.fromEntries(ATTACKS.map((a) => [a.n, runAttack(a.n)])));
  const done = Object.values(results);
  const passed = done.filter((r) => r.pass).length;
  return (
    <div className="page-grid">
      <Plate className="span-all" title="Attack tests · 12 attacks against a simulated bridge"
        actions={<>{API ? <Tag kind="live">backend connected</Tag> : <Tag>demo mode</Tag>}<button className="btn btn--sm" onClick={runAll}>Run all 12<span className="arrow">→</span></button></>}>
        <div className="stack" style={{ gap: 10 }}>
          <p className="t-body">Each card is an attack. Press <b>Run in demo</b> and the real checking rule runs in your browser on a simulated bridge. You see what we expected, what actually happened, and whether the release would have been held. The safe cases (a big honest transfer, a slow relayer) must <i>not</i> raise an alarm.</p>
          <p className="dim" style={{ fontSize: 12.5 }}>Demo mode: the bridge is simulated. Attack #1 was also run on two real local chains (reference run). Launching on live chains needs the backend. <Pending what="live launch · backend" /></p>
          {done.length > 0 && (
            <div className="score" role="status">
              <span className="mono big">{passed}/{done.length}</span>
              <span>{passed === done.length ? 'match what we expected' : 'match, some differ, see below'}</span>
              <span className="dim" style={{ fontSize: 12 }}>{done.filter((r) => r.gate === 'held').length} held · {done.filter((r) => r.control && r.gate === 'allowed').length}/{done.filter((r) => r.control).length} safe cases allowed</span>
            </div>
          )}
        </div>
      </Plate>
      <div className="span-all lockers">
        {ATTACKS.map((a) => <Envelope key={a.n} a={a} result={results[a.n]} onRun={() => run(a.n)} />)}
      </div>
      <Plate className="span-all" title="What each expected verdict means">
        <ul className="plain legend-plain">
          {Object.entries(EXPECT_TEXT).map(([k, v]) => <li key={k}><Verdict status={k} label={v} /></li>)}
        </ul>
        <p className="dim" style={{ fontSize: 12.5 }}>violation: a rule broke, may be held · consistent: all checks pass · unknown: we cannot see enough yet, not an alarm · overdue: late, not theft · orphaned: judged earlier, then the source chain reorganised.</p>
      </Plate>
    </div>
  );
}
