import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ev, Replay } from './data';
import { FEATURE_TEXT, RULE_TEXT, SIGNAL_NAME, TYPE_SHORT, human, txUrl } from './data';
import { duration, usd, utc } from '../lib/format';

const fmtP = (p: number | null | undefined) => (p == null ? '—' : p < 0.001 ? '< 0.001' : p.toFixed(3));

export function AlertCard({ e, data }: { e: Ev | null; data: Replay }) {
  const [tab, setTab] = useState<'why' | 'check' | 'stop'>('why');
  if (!e) return (
    <section className="ac ac--empty plate">
      <span className="label">No alert yet</span>
      <p className="dim">Press Play. Each payout is checked against the deposits behind it. An alert appears here the moment one has no deposit.</p>
    </section>
  );
  const level = e.level ?? 'none';
  return (
    <section className={`ac plate ac--${level}`} aria-live="polite">
      <header className="ac-head">
        <div className="ac-badge">{level === 'exploit' ? 'EXPLOIT' : level === 'suspicious' ? 'SUSPICIOUS' : 'LOOKS NORMAL'}</div>
        <div className="ac-risk" title="Risk from 0 to 100. Anything above 69 always has a broken deposit rule behind it.">
          <span className="mono">{e.risk ?? 0}</span><small>/100 risk</small>
          <i style={{ width: `${e.risk ?? 0}%` }} />
        </div>
      </header>
      {e.type && <div className="ac-type">
        <strong>{TYPE_SHORT[e.type] ?? e.type}</strong>
        <span className="mono dim"> · {Math.round((e.type_prob ?? 0) * 100)}% sure</span>
        <p className="dim">{e.type_text}</p>
        {e.precedent && e.precedent !== '—' && <p className="ac-prec">Looks most like: <b>{e.precedent}</b></p>}
      </div>}
      <dl className="ac-facts">
        <dt>Payout</dt><dd className="mono">{e.symbol} {human(e.amount, e.decimals)} · {e.usd == null ? 'unpriced' : usd(e.usd)} · {utc(e.ts).slice(11, 19)}</dd>
        <dt>Deposit</dt><dd>{e.status === 'violation' ? <b className="bad">{RULE_TEXT[e.rule ?? ''] ?? e.rule}</b> : <span className="ok">Found, made {e.delay != null ? duration(e.delay) : ''} earlier</span>}</dd>
        <dt>Transaction</dt><dd>{e.scenario ? <span className="tag tag--pending">practice attack · {e.scenario}</span> : <a className="hash" href={txUrl('x', 'withdrawal', e.tx) ?? '#'} target="_blank" rel="noreferrer">{e.tx.slice(0, 12)}… ↗</a>}</dd>
      </dl>
      <nav className="ac-tabs" role="tablist">
        {([['why', 'Why'], ['check', 'Check it'], ['stop', 'If we had stopped it']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="ac-tab" onClick={() => setTab(k)}>{l}</button>))}
      </nav>
      {tab === 'why' && <Why e={e} />}
      {tab === 'check' && <Check e={e} />}
      {tab === 'stop' && <WhatIf data={data} />}
    </section>
  );
}

function Why({ e }: { e: Ev }) {
  const s = e.signals;
  return (
    <div className="ac-body">
      {e.reasons && e.reasons.length > 0 && <>
        <span className="label">What pushed this alert up</span>
        <ul className="ac-reasons">{e.reasons.map((r) => (
          <li key={r.feature}><span>{FEATURE_TEXT[r.feature] ?? r.feature}</span><i style={{ width: `${Math.min(100, r.push * 12)}%` }} /></li>))}</ul>
      </>}
      <span className="label">How unusual is each sign? (smaller = rarer)</span>
      <table className="ac-p"><tbody>
        {Object.entries(e.p ?? {}).map(([k, p]) => (
          <tr key={k} className={p != null && p < 0.01 ? 'hot' : ''}><td>{SIGNAL_NAME[k] ?? k}</td><td className="mono">{fmtP(p)}</td>
            <td><i style={{ width: `${p == null ? 0 : Math.min(100, -Math.log10(Math.max(p, 1e-6)) * 25)}%` }} /></td></tr>))}
        <tr><td><b>All signs together</b></td><td className="mono"><b>{fmtP(e.p_comb)}</b></td><td /></tr>
      </tbody></table>
      {s && <p className="dim small">
        {s.cluster_size > 1 ? `${s.cluster_size} near-identical payouts in this cluster · ` : ''}spread {s.hawkes_n.toFixed(2)} · message ID {s.id_reused ? 'already used' : 'new'}{s.id_jump > 1000 ? ` · jumped ${s.id_jump.toLocaleString()} past the last ID` : ''}
        {s.signers ? ` · ${s.signers.length} validator signatures recovered` : ''}
      </p>}
      {s?.signers && <Signers ids={s.signers} />}
    </div>
  );
}

// The 9 Ronin validators on the day of the hack, in address order.
const VALIDATORS = ['0x11360e', '0x1a15a5', '0x70bb1f', '0x9d5d17', '0xb9e59d', '0xd11d98', '0xe70cbf', '0xee11d2', '0xf224be'];
function Signers({ ids }: { ids: string[] }) {
  const on = new Set(ids.map((x) => x.slice(0, 8)));
  return (
    <div className="ac-signers" aria-label={`${ids.length} of 9 validators signed`}>
      {VALIDATORS.map((v) => <span key={v} className={on.has(v) ? 'on' : ''} title={v}>{v.slice(2, 6)}</span>)}
      <p className="dim small">Signers recovered from the signatures inside the transaction. This exact group also signed 6.6% of normal withdrawals, so <b>who</b> signed was not unusual; the withdrawal ID was.</p>
    </div>
  );
}

function Check({ e }: { e: Ev }) {
  const s = e.search;
  return (
    <div className="ac-body">
      {s ? <>
        <p>We searched <b>{s.deposits_checked.toLocaleString()}</b> earlier {e.symbol} deposits for this payout:</p>
        <ul className="ac-verify">
          <li>Same amount <b>and</b> same person: <b className="mono">{s.same_amount_and_recipient}</b></li>
          <li>Same amount, other person: <b className="mono">{s.same_amount_other_recipient}</b></li>
          <li>Same message ID: <b className="mono">{s.same_message_id}</b></li>
        </ul></> : <p>No search data for this payout.</p>}
      <p><Link className="small" to="/console/evidence">Open “Check it yourself” and try to cheat it →</Link></p>
    </div>
  );
}

function WhatIf({ data }: { data: Replay }) {
  const cf = data.metrics.counterfactual;
  if (!cf) return <div className="ac-body dim">No attack in this feed.</div>;
  return (
    <div className="ac-body">
      <p>Attack total in this replay: <b>{usd(cf.attack_usd)}</b>. If the route had been held after the first alert, this much would have stayed in the bridge:</p>
      <table className="ac-p"><thead><tr><th>Stopped</th><th>Kept in the bridge</th><th>Honest payouts delayed</th></tr></thead><tbody>
        {cf.lanes.map((l) => <tr key={l.latency_s}><td className="mono">{l.latency_s === 0 ? 'before the 1st payout' : `${duration(l.latency_s)} after`}</td>
          <td className="mono">{usd(l.kept_usd)} <span className="dim">({l.kept_pct}%)</span></td><td className="mono">{l.legit_held}</td></tr>)}
      </tbody></table>
      <p className="dim small">An estimate from the data: it assumes attackers behave the same after a hold. It is not money recovered.</p>
    </div>
  );
}
