import { useMemo, useState } from 'react';
import type { Ev, Replay } from './data';
import { FEATURE_TEXT, RULE_TEXT, TYPE_SHORT } from './data';
import { duration, usd, utc } from '../lib/format';

const SIG_TEXT: Record<string, string> = {
  burst: 'Volume spike (10 min vs 7 days)', midas: 'Repeat-edge burst (MIDAS-R)', cluster_log: 'Copycat cluster (MinHash)', hawkes_n: 'Spread n̂ (Hawkes)',
  value_vs_route: 'Size vs normal day', id_jump_pos: 'Withdrawal-id jump', auth: 'Signer & auth model (ML2)',
};
const fmtP = (p: number | null | undefined) => (p == null ? '—' : p < 0.001 ? p.toExponential(1) : p.toFixed(3));

export function AlertCard({ e, data }: { e: Ev | null; data: Replay }) {
  const [tab, setTab] = useState<'why' | 'verify' | 'whatif'>('why');
  if (!e) return (
    <section className="ac ac--empty plate">
      <span className="label">No alert yet</span>
      <p className="dim">Press play. Every release is checked against its deposit; an alert appears here the moment conservation breaks or the evidence budget is spent.</p>
    </section>
  );
  const level = e.level ?? 'none';
  return (
    <section className={`ac plate ac--${level}`} aria-live="polite">
      <header className="ac-head">
        <div className="ac-badge">{level === 'exploit' ? 'EXPLOIT' : level === 'suspicious' ? 'SUSPICIOUS' : 'CHECKED'}</div>
        <div className="ac-risk" title="Risk 0–100. Above 69 always has a broken conservation rule behind it.">
          <span className="mono">{e.risk ?? 0}</span><small>/100 risk</small>
          <i style={{ width: `${e.risk ?? 0}%` }} />
        </div>
      </header>
      {e.type && <div className="ac-type">
        <strong>{TYPE_SHORT[e.type] ?? e.type}</strong>
        <span className="mono dim"> · {Math.round((e.type_prob ?? 0) * 100)}% (calibrated)</span>
        <p className="dim">{e.type_text}</p>
        {e.precedent && e.precedent !== '—' && <p className="ac-prec">Closest past incident: <b>{e.precedent}</b></p>}
      </div>}
      <dl className="ac-facts">
        <dt>Release</dt><dd className="mono">{e.symbol} {(e.usd == null ? 'unpriced' : usd(e.usd))} · {utc(e.ts).slice(11, 19)}</dd>
        <dt>Rule</dt><dd>{e.status === 'violation' ? <b className="bad">{RULE_TEXT[e.rule ?? ''] ?? e.rule}</b> : <span className="ok">Backed by deposit {e.delay != null ? `(${duration(e.delay)} earlier)` : ''}</span>}</dd>
        <dt>Tx</dt><dd><a className="hash" href={`https://etherscan.io/tx/${e.tx}`} target="_blank" rel="noreferrer">{e.tx.slice(0, 12)}…</a>{e.scenario && <span className="tag tag--pending" style={{ marginLeft: 6 }}>simulated · {e.scenario}</span>}</dd>
      </dl>
      <nav className="ac-tabs" role="tablist">
        {(['why', 'verify', 'whatif'] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className="ac-tab" onClick={() => setTab(k)}>
            {k === 'why' ? 'Why' : k === 'verify' ? 'Verify' : 'What if we held?'}
          </button>))}
      </nav>
      {tab === 'why' && <Why e={e} />}
      {tab === 'verify' && <Verify e={e} data={data} />}
      {tab === 'whatif' && <WhatIf data={data} />}
    </section>
  );
}

function Why({ e }: { e: Ev }) {
  const s = e.signals;
  return (
    <div className="ac-body">
      {e.reasons && e.reasons.length > 0 && <>
        <span className="label">Top reasons (exact TreeSHAP)</span>
        <ul className="ac-reasons">{e.reasons.map((r) => (
          <li key={r.feature}><span>{FEATURE_TEXT[r.feature] ?? r.feature}</span><i style={{ width: `${Math.min(100, r.push * 12)}%` }} /></li>))}</ul>
      </>}
      <span className="label">Signals (conformal p-value: small = unusual vs normal history)</span>
      <table className="ac-p"><tbody>
        {Object.entries(e.p ?? {}).map(([k, p]) => (
          <tr key={k} className={p != null && p < 0.01 ? 'hot' : ''}><td>{SIG_TEXT[k] ?? k}</td><td className="mono">{fmtP(p)}</td>
            <td><i style={{ width: `${p == null ? 0 : Math.min(100, -Math.log10(Math.max(p, 1e-6)) * 25)}%` }} /></td></tr>))}
        <tr><td><b>Combined evidence (e-value mean)</b></td><td className="mono"><b>{fmtP(e.p_comb)}</b></td><td /></tr>
      </tbody></table>
      {s && <p className="dim small">
        Cluster {s.cluster_size} · n̂ {s.hawkes_n.toFixed(2)} · id {s.id_reused ? 'reused' : 'fresh'}{s.id_jump > 1000 ? ` · jumped +${s.id_jump.toLocaleString()}` : ''}
        {s.signers ? ` · ${s.signers.length} validator signatures recovered` : ''}
      </p>}
      {s?.signers && <Signers ids={s.signers} />}
    </div>
  );
}

// The 9 Ronin validators at block 14442834 (validator contract 0x42b19dca…), ascending.
const VALIDATORS = ['0x11360e', '0x1a15a5', '0x70bb1f', '0x9d5d17', '0xb9e59d', '0xd11d98', '0xe70cbf', '0xee11d2', '0xf224be'];
function Signers({ ids }: { ids: string[] }) {
  const on = new Set(ids.map((x) => x.slice(0, 8)));
  return (
    <div className="ac-signers" aria-label={`${ids.length} of 9 validators signed`}>
      {VALIDATORS.map((v) => <span key={v} className={on.has(v) ? 'on' : ''} title={v}>{v.slice(2, 6)}</span>)}
      <p className="dim small">Signers recovered with ecrecover from the transaction's calldata. Measured: this 5-validator group also signed 6.6% of normal withdrawals, so <b>who</b> signed was not unusual; the withdrawal-id jump was.</p>
    </div>
  );
}

/** Re-derives the backing rule in the browser from the raw events shipped with the replay. */
function Verify({ e, data }: { e: Ev; data: Replay }) {
  const res = useMemo(() => {
    const deps = data.events.filter((d) => d.kind === 'deposit' && d.ts <= e.ts && d.symbol === e.symbol);
    const exact = deps.filter((d) => d.amount === e.amount && d.recipient === e.recipient);
    const consumed = new Set(data.events.filter((w) => w.kind === 'withdrawal' && w.ts < e.ts && w.matched).map((w) => w.matched));
    const free = exact.filter((d) => !consumed.has(d.id));
    const sameAmt = deps.filter((d) => d.amount === e.amount && d.recipient !== e.recipient).length;
    return { scanned: deps.length, exact: exact.length, free: free.length, sameAmt, hasHistory: data.events[0].ts };
  }, [e, data]);
  const browserSays = res.free > 0 ? 'backed' : 'unbacked in this window';
  const serverSays = e.status === 'violation' ? 'unbacked' : 'backed';
  return (
    <div className="ac-body">
      <p>Your browser just re-checked this release against <b>{res.scanned}</b> {e.symbol} deposits in the replay window (same amount and recipient, not already claimed):</p>
      <ul className="ac-verify">
        <li>Exact matches (amount + recipient): <b className="mono">{res.exact}</b>, unclaimed: <b className="mono">{res.free}</b></li>
        <li>Same amount, different recipient: <b className="mono">{res.sameAmt}</b></li>
        <li>Browser: <b>{browserSays}</b> · Server (full history): <b>{serverSays}</b></li>
      </ul>
      <p className="dim small">The server checks the full history since the bridge's first transfer; the browser only sees this window, so "unbacked in this window" is necessary, not sufficient. Matching uses amount, recipient and time, never the message id alone (Nomad copycats reused real ids).</p>
    </div>
  );
}

function WhatIf({ data }: { data: Replay }) {
  const cf = data.metrics.counterfactual;
  if (!cf) return <div className="ac-body dim">No attack in this feed.</div>;
  return (
    <div className="ac-body">
      <p>Attack value in this replay: <b>{usd(cf.attack_usd)}</b>. If the route had been held at the first exploit alert:</p>
      <table className="ac-p"><thead><tr><th>Hold after</th><th>Kept in bridge</th><th>Legit releases delayed</th></tr></thead><tbody>
        {cf.lanes.map((l) => <tr key={l.latency_s}><td className="mono">{l.latency_s === 0 ? 'before 1st release' : duration(l.latency_s)}</td>
          <td className="mono">{usd(l.kept_usd)} <span className="dim">({l.kept_pct}%)</span></td><td className="mono">{l.legit_held}</td></tr>)}
      </tbody></table>
      <p className="dim small">{cf.assumptions.join(' · ')}. Computed from the dataset, not asserted.</p>
    </div>
  );
}
