import { useEffect, useMemo, useRef, useState } from 'react';
import { assess } from '../verify/accounting';
import { buildChain, checkProof, DEPOSITS, matches, type Proof, type Transfer } from '../demo/proofBridge';
import { toHex } from '../verify/bytes';
import { Pending, Tag, Verdict, short } from '../design/ui';

// ─────────────────────────────────────────────────────────────────────────────
// USP 1 · Proof of Non-Deposit
// ─────────────────────────────────────────────────────────────────────────────
const D3 = DEPOSITS[2];
const RELEASES: { key: string; label: string; id: string; t: Transfer; note: string }[] = [
  { key: 'honest', label: 'Honest release', id: D3.id, t: D3.t, note: 'Pays out exactly what deposit msg-0003 locked.' },
  { key: 'stolen', label: 'Stolen-key release', id: 'stolen-key-0001', t: { ...D3.t, amount: 900_000_000n }, note: 'A hacked validator signs 900 for a message that was never deposited.' },
  { key: 'wei', label: 'One wei too many', id: DEPOSITS[1].id, t: { ...DEPOSITS[1].t, amount: DEPOSITS[1].t.amount + 1n }, note: 'Pays the deposit of msg-0002 plus one smallest unit.' },
  { key: 'who', label: 'Wrong recipient', id: DEPOSITS[5].id, t: { ...DEPOSITS[5].t, recipient: '0x1111111111111111111111111111111111111111' }, note: 'Pays someone other than the person who deposited msg-0006.' },
];
const units = (a: bigint) => (Number(a) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 });

export function ProofDemo() {
  const chain = useMemo(() => buildChain(), []);
  const [pick, setPick] = useState('stolen');
  const [lying, setLying] = useState(false);
  const [corrupt, setCorrupt] = useState(false);
  const rel = RELEASES.find((r) => r.key === pick)!;

  // What a log-reading indexer believes. When it "drops" the msg-0003 event it still reports being fully synced.
  const indexerSees = (id: string) => DEPOSITS.some((d) => d.id === id) && !(lying && id === D3.id);
  const watermark = !indexerSees(rel.id) ? { v: 'invariant_violation', why: 'no deposit seen for this message' }
    : { v: 'consistent_under_supplied_evidence', why: 'a deposit was seen' };

  const proof: Proof = useMemo(() => {
    const p = chain.getProof(rel.id);
    if (corrupt && p.storageProof.length) p.storageProof = p.storageProof.map((n, i) => (i === p.storageProof.length - 1 ? n.map((b, j) => (j === 4 ? b ^ 1 : b)) : n));
    return p;
  }, [chain, rel.id, corrupt]);
  const res = useMemo(() => checkProof(chain.stateRoot, rel.id, proof), [chain, rel.id, proof]);
  const verdict = !res.ok ? { v: 'unknown', why: 'the proof does not verify, so nothing is concluded' }
    : res.value === null ? { v: 'invariant_violation', why: 'the chain itself holds no deposit for this message' }
      : matches(res.value ?? null, rel.t) ? { v: 'consistent_under_supplied_evidence', why: 'the stored deposit commitment matches this release exactly' }
        : { v: 'invariant_violation', why: 'a deposit exists, but its stored amount or recipient differs from this release' };

  return (
    <div className="demo">
      <div className="demo-bar"><Tag kind="real">demo · simulated bridge</Tag><span className="dim">The chain is made up; the Merkle-Patricia proofs are real and checked in your browser.</span></div>
      <div className="demo-two">
        <div className="stack" style={{ gap: 10 }}>
          <span className="label">1 · Pick a release to judge</span>
          <div className="choice" role="group" aria-label="Release">
            {RELEASES.map((r) => (
              <button key={r.key} className="btn btn--line btn--sm" aria-pressed={pick === r.key} onClick={() => { setPick(r.key); setCorrupt(false); }}>{r.label}</button>
            ))}
          </div>
          <p className="dim" style={{ fontSize: 13 }}>{rel.note} Amount released: <span className="mono">{units(rel.t.amount)}</span>.</p>
          <label className="check"><input type="checkbox" checked={lying} onChange={(e) => setLying(e.target.checked)} /> Make the indexer drop the msg-0003 deposit event <span className="dim">(a "lying observer")</span></label>
          <span className="label">The source bridge's deposits</span>
          <table className="table">
            <tbody>{DEPOSITS.map((d) => (
              <tr key={d.id} className={d.id === rel.id ? 'is-sel' : ''}>
                <td className="mono">{d.id}</td><td className="num">{units(d.t.amount)}</td><td className="mono dim">{short(d.t.recipient, 6, 4)}</td>
                <td className="mono dim">{lying && d.id === D3.id ? 'event dropped' : ''}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          <span className="label">2 · Two ways to answer: "is there a deposit?"</span>
          <div className="vs">
            <div className="vs-card">
              <span className="label">Without proof · trusts the indexer</span>
              <Verdict status={watermark.v} />
              <span className="dim" style={{ fontSize: 12.5 }}>{watermark.why}.{lying && pick === 'honest' && <b className="c-violation"> False alarm: the deposit is real.</b>}</span>
            </div>
            <div className="vs-card vs-card--proof">
              <span className="label">With proof · asks the chain state</span>
              <Verdict status={verdict.v} />
              <span className="dim" style={{ fontSize: 12.5 }}>{verdict.why}.</span>
            </div>
          </div>
          <span className="label">3 · The proof your browser just checked</span>
          <ol className="proof-steps">
            <li className="is-pass"><span className="mono">✓</span><span>Trusted: the state root in the block header</span><span className="mono dim">{toHex(chain.stateRoot).slice(0, 14)}…</span></li>
            {res.steps.map((s) => (
              <li key={s.label} className={s.ok ? 'is-pass' : 'is-fail'}><span className="mono">{s.ok ? '✓' : '✗'}</span><span>{s.label}</span><span className="mono dim">{s.detail}</span></li>
            ))}
          </ol>
          <div className="row-wrap">
            <button className="btn btn--line btn--sm" aria-pressed={corrupt} onClick={() => setCorrupt(!corrupt)}>{corrupt ? 'Restore proof' : 'Corrupt one byte of the proof'}</button>
            <span className="dim" style={{ fontSize: 12 }}>{proof.accountProof.length} account node(s) · {proof.storageProof.length} storage node(s) · {proof.storageProof.reduce((a, n) => a + n.length, 0) + proof.accountProof.reduce((a, n) => a + n.length, 0)} bytes</span>
          </div>
          <p className="dim" style={{ fontSize: 12 }}>On real chains the server fetches this with <span className="mono">eth_getProof</span> at a finalized block. That wiring is the backend's job; this demo shows the proof mechanics end to end. <Pending what="real chain proofs · backend" /></p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USP 3 · Watermarked verdicts
// ─────────────────────────────────────────────────────────────────────────────
const WM_ROWS = [
  { r: 10, d: -18 }, { r: 22, d: -12 }, { r: 31, d: -25 }, { r: 44, d: -15 }, { r: 53, d: -22 }, { r: 66, d: -17 },
  { r: 79, d: null }, { r: 88, d: -14 }, { r: 101, d: -20 }, { r: 113, d: -16 },
].map((x, i) => ({ ...x, i, dep: x.d === null ? null : x.r + x.d, fake: x.d === null }));

export function WatermarkDemo() {
  const [w, setW] = useState(120);
  const rows = WM_ROWS.map((x) => {
    const depSeen = x.dep !== null && x.dep <= w;
    const naive = depSeen ? 'ok' : 'alert';
    const ours = x.r > w ? 'unknown' : x.fake ? 'violation' : 'ok';
    return { ...x, naive, ours };
  });
  const naiveFalse = rows.filter((x) => x.naive === 'alert' && !x.fake).length;
  const naiveHit = rows.some((x) => x.fake && x.naive === 'alert');
  const oursHit = rows.some((x) => x.fake && x.ours === 'violation');
  return (
    <div className="demo">
      <div className="demo-bar"><Tag kind="real">demo · simulated feed</Tag><span className="dim">Ten releases, one of them has no deposit. Slide the source observer back to simulate an RPC lag or outage.</span></div>
      <label className="wm-slider">
        <span className="label">Source observer has seen up to</span>
        <input type="range" min={0} max={120} value={w} onChange={(e) => setW(+e.target.value)} aria-label="Source observer position" />
        <span className="mono">t = {w}s</span>
        <button className="btn btn--line btn--sm" onClick={() => setW(48)}>Stall it at 48 s</button>
        <button className="btn btn--line btn--sm" onClick={() => setW(120)}>Fully synced</button>
      </label>
      <div className="wm-track" aria-hidden="true">
        {rows.map((x) => <span key={x.i} className={`wm-dot ${x.fake ? 'is-fake' : ''}`} style={{ left: `${(x.r / 120) * 100}%` }} />)}
        <span className="wm-mark" style={{ left: `${(w / 120) * 100}%` }}><span className="label">watermark</span></span>
      </div>
      <table className="table wm-table">
        <thead><tr><th>release</th><th>deposit</th><th>Naive monitor</th><th>BridgeWitness</th></tr></thead>
        <tbody>{rows.map((x) => (
          <tr key={x.i}>
            <td className="mono">t={x.r}s</td>
            <td className="mono dim">{x.fake ? 'none exists' : `t=${x.dep}s`}</td>
            <td>{x.naive === 'alert' ? <Verdict status="invariant_violation" label={x.fake ? 'alert' : 'false alert'} /> : <span className="dim">ok</span>}</td>
            <td>{x.ours === 'violation' ? <Verdict status="invariant_violation" label="violation" /> : x.ours === 'unknown' ? <Verdict status="unknown" label="unknown · can't see yet" /> : <span className="dim">ok</span>}</td>
          </tr>))}</tbody>
      </table>
      <div className="wm-sum">
        <div><span className="label">Naive monitor</span><span className="mono">{naiveFalse} false alert{naiveFalse === 1 ? '' : 's'}</span><span className="dim" style={{ fontSize: 12 }}>{naiveHit ? 'catches the fake' : 'misses the fake'}</span></div>
        <div><span className="label">BridgeWitness</span><span className="mono c-verified">0 false alerts</span><span className="dim" style={{ fontSize: 12 }}>{oursHit ? 'catches the fake, only after it could see' : 'says "unknown" until it can see'}</span></div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USP 4 · Pre-execution gate with adaptive scope
// ─────────────────────────────────────────────────────────────────────────────
type Lane = 'USDC' | 'WETH' | 'AXS';
const LANES: Lane[] = ['USDC', 'WETH', 'AXS'];
type Req = { id: number; lane: Lane; backed: boolean; amount: number; t0: number; state: 'window' | 'executed' | 'reverted'; why?: string };
const WINDOW = 30, SPEED = 6; // virtual seconds, and virtual seconds per real second

function verdictOf(backed: boolean, amount: number) {
  const U = (n: number) => String(Math.round(n * 1e6));
  const r = { amount: U(amount), recipient: '0xa', timestamp: 100, finalized: true };
  return assess({
    rule_version: 'exact-lock-mint-v1',
    route: { source_decimals: 6, destination_decimals: 6, source_fee_bps: 0, allow_partial: false, validator_addresses: [], quorum: 0 },
    release: r, authorizations: backed ? [{ ...r, timestamp: 50, value_verification: 'adapter_verified' }] : [], previous_releases: [],
    coverage: { healthy: true, complete_from_bridge_deployment: true, through_timestamp: 200 },
  });
}

export function GateDemo() {
  const [reqs, setReqs] = useState<Req[]>([]);
  const [held, setHeld] = useState<Lane[]>([]);
  const [verifier, setVerifier] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [clock, setClock] = useState(0);
  const nextId = useRef(1);
  const heldRef = useRef<Lane[]>([]), verRef = useRef(false), reqRef = useRef<Req[]>([]);
  heldRef.current = held; verRef.current = verifier; reqRef.current = reqs;

  useEffect(() => {
    const id = setInterval(() => {
      if (!reqRef.current.some((r) => r.state === 'window')) return;
      setClock((c) => c + SPEED / 10);
    }, 100);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setReqs((rs) => rs.map((r) => {
      if (r.state !== 'window' || clock - r.t0 < WINDOW) return r;
      const blocked = verRef.current || heldRef.current.includes(r.lane);
      return blocked ? { ...r, state: 'reverted', why: verRef.current ? 'verifier hold' : 'route hold' } : { ...r, state: 'executed' };
    }));
  }, [clock]);

  const say = (m: string) => setLog((l) => [m, ...l].slice(0, 8));
  function request(lane: Lane, backed: boolean) {
    const amount = backed ? 25 : 900;
    const id = nextId.current++;
    setReqs((rs) => [...rs, { id, lane, backed, amount, t0: clock, state: 'window' }]);
    const v = verdictOf(backed, amount);
    say(`#${id} ${lane} release of ${amount} requested · ${backed ? 'deposit found' : 'no deposit'} → ${v.status === 'invariant_violation' ? 'VIOLATION' : 'consistent'}`);
    if (v.status !== 'invariant_violation') return;
    if (!heldRef.current.includes(lane)) {
      const others = heldRef.current.filter((l) => l !== lane);
      setHeld((h) => [...h, lane]);
      say(`#${id} held the ${lane} route inside the ${WINDOW}s window, before any funds moved`);
      if (others.length > 0 && !verRef.current) { setVerifier(true); say(`second route (${lane} after ${others[0]}) hit behind the same verifier → hold widened to the whole verifier`); }
    }
  }
  const reset = () => { setReqs([]); setHeld([]); setVerifier(false); setLog([]); nextId.current = 1; setClock(0); };
  const executed = reqs.filter((r) => r.state === 'executed'), reverted = reqs.filter((r) => r.state === 'reverted');
  const legitBlocked = reverted.filter((r) => r.backed).length;
  const exploitMoved = executed.filter((r) => !r.backed).reduce((a, r) => a + r.amount, 0);

  return (
    <div className="demo">
      <div className="demo-bar"><Tag kind="real">demo · simulated gate</Tag><span className="dim">Real contract: a route hold was proven on two local chains (reference run). Here the rule is real and the chain is simulated; the {WINDOW}s window runs {SPEED}× fast.</span></div>
      <div className="gate-controls">
        <span className="label">Request a release</span>
        <div className="row-wrap">
          {LANES.map((l) => (
            <span key={l} className="gate-pair">
              <button className="btn btn--line btn--sm" onClick={() => request(l, true)}>{l} · honest</button>
              <button className="btn btn--sm" onClick={() => request(l, false)}>{l} · stolen</button>
            </span>
          ))}
          <button className="btn btn--line btn--sm" onClick={reset}>Reset</button>
        </div>
      </div>
      <div className={`gate-board ${verifier ? 'is-verifier' : ''}`}>
        <span className="gate-ring label" aria-hidden="true">{verifier ? 'shared verifier: held' : 'shared verifier: open'}</span>
        {LANES.map((l) => {
          const lr = reqs.filter((r) => r.lane === l).slice(-3);
          const closed = verifier || held.includes(l);
          return (
            <div key={l} className={`gate-lane ${closed ? 'is-closed' : ''}`}>
              <span className="mono gate-name">{l}</span>
              <div className="gate-pipe">
                {lr.map((r) => {
                  const p = Math.min(1, (clock - r.t0) / WINDOW);
                  return <span key={r.id} className={`gate-chip ${r.state} ${r.backed ? '' : 'bad'}`} style={{ left: `${(r.state === 'window' ? p : 1) * 78}%` }} title={`#${r.id}`}>#{r.id}</span>;
                })}
                <span className={`gate-aperture ${closed ? 'is-closed' : ''}`} aria-label={closed ? 'gate closed' : 'gate open'}>
                  <svg viewBox="0 0 40 40" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <path key={i} d="M20 3 L28 20" style={{ transformOrigin: '20px 20px', transform: `rotate(${i * 45 + (closed ? 38 : 0)}deg)` }} />)}<circle cx="20" cy="20" r="16" /></svg>
                </span>
              </div>
              <span className="gate-state mono">{closed ? <span className="c-violation">{verifier ? 'held · verifier' : 'held · route'}</span> : <span className="dim">open</span>}</span>
            </div>
          );
        })}
      </div>
      <div className="gate-sum">
        <div><span className="label">Stolen funds that moved</span><span className={`mono ${exploitMoved ? 'c-violation' : 'c-verified'}`}>{exploitMoved}</span></div>
        <div><span className="label">Honest releases executed</span><span className="mono">{executed.filter((r) => r.backed).length}</span></div>
        <div><span className="label">Honest releases blocked by scope</span><span className="mono">{legitBlocked}</span></div>
      </div>
      <ol className="gate-log mono">{log.length ? log.map((m, i) => <li key={i}>{m}</li>) : <li className="dim">Try: one stolen USDC release, then an honest WETH one, then a stolen WETH one.</li>}</ol>
      <p className="dim" style={{ fontSize: 12 }}>Lesson: a narrow hold is cheap, but when a second route behind the same verifier is hit, the hold widens, which is the right call when the bug sits in the shared verifier (as on Nomad). The widening also blocks honest users, so we only do it on evidence.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USP 7 · Adversarial self-evaluation: run every attack and tabulate
// ─────────────────────────────────────────────────────────────────────────────
import { runAttack, ATTACKS, type AttackResult } from '../demo/attacks';

export function SelfTest() {
  const [res, setRes] = useState<AttackResult[] | null>(null);
  const passed = res?.filter((r) => r.pass).length ?? 0;
  return (
    <div className="demo">
      <div className="demo-bar"><Tag kind="real">demo · simulated bridge</Tag><span className="dim">Twelve attacks through the real checking rule, in your browser.</span></div>
      <div className="row-wrap"><button className="btn btn--sm" onClick={() => setRes(ATTACKS.map((a) => runAttack(a.n)))}>{res ? 'Run again' : 'Attack ourselves'}<span className="arrow">→</span></button>
        {res && <span className="mono"><b className={passed === 12 ? 'c-verified' : 'c-violation'}>{passed}/12</b> match what we expected</span>}</div>
      {res && (
        <table className="table">
          <thead><tr><th>#</th><th>attack</th><th>expected</th><th>observed</th><th>action</th><th /></tr></thead>
          <tbody>{res.map((r) => (
            <tr key={r.n}>
              <td className="mono">{r.n}</td><td>{r.name}{r.control && <span className="dim"> · safe case</span>}</td>
              <td><Verdict status={r.expected} /></td><td><Verdict status={r.observed.status} /></td>
              <td className="mono" style={{ fontSize: 11 }}>{r.gate === 'held' ? 'held' : r.gate === 'flagged' ? 'flagged' : 'allowed'}</td>
              <td className={r.pass ? 'c-verified' : 'c-violation'}>{r.pass ? '✓' : '✗'}</td>
            </tr>))}</tbody>
        </table>
      )}
      <p className="dim" style={{ fontSize: 12 }}>These are our own attacks, written to exercise our own rules, so this shows the rules behave as designed, not that they catch attacks we did not think of. Baselines (whale alert, z-score) are measured in the Results page. <Pending what="fault injection S0–S7 · backend" /></p>
    </div>
  );
}
