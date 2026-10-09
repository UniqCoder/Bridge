import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ev, Replay } from './data';
import { FEATURE_ABSENT, FEATURE_TEXT, RULE_SENTENCE, SIGNAL_NAME, TYPE_SHORT, human, txUrl } from './data';
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
        <div className="ac-title"><div className="ac-badge">{level === 'exploit' ? '✗ Exploit' : level === 'suspicious' ? '! Suspicious' : 'Looks normal'}</div><h3>{TYPE_SHORT[e.type ?? ''] ?? 'Alert'}</h3>
          {e.type && <span className="dim small" title="Classifier trained on synthetic scenarios; not a validated real-attack probability">type classifier confidence {Math.round((e.type_prob ?? 0) * 100)}% (trained on synthetic attacks)</span>}</div>
        <div className="ac-risk" title="Risk from 0 to 100. Anything above 69 always has a broken deposit rule behind it.">
          <span className="mono">{e.risk ?? 0}</span><small>/100 priority</small>
          <i style={{ width: `${e.risk ?? 0}%` }} />
        </div>
      </header>
      <Verdict e={e} />
      <Link className="btn btn--sm investigate" to={`/console/pairing?feed=${data.feed}&case=${encodeURIComponent(e.id)}`}>Investigate this alert step by step →</Link>
      <nav className="ac-tabs" role="tablist">
        {([['why', 'Detector details'], ['check', 'Deposit search'], ['stop', 'What-if: hold earlier']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="ac-tab" onClick={() => setTab(k)}>{l}</button>))}
      </nav>
      {tab === 'why' && <Why e={e} />}
      {tab === 'check' && <Check e={e} />}
      {tab === 'stop' && <WhatIf data={data} />}
    </section>
  );
}

// A reason only counts as present above these values (ID jump > ~1,000; fitted spread > 0.3).
const LOW: Record<string, number> = { id_jump_log: 6.9, hawkes_n: 0.3 };

type Mark = 'bad' | 'warn' | 'ok' | 'na';
const ICON: Record<Mark, string> = { bad: '✗', warn: '!', ok: '✓', na: '–' };

const NEXT_STEP: Record<string, string> = {
  unbacked_release: 'Hold this route and confirm on the source chain that no deposit exists for this message.',
  copycat_swarm: 'Hold the route: many near-identical payouts are draining it. Trace the first payout to find the root cause.',
  message_replay: 'Check the message ID history: the same authorization is being paid out more than once.',
  key_compromise: 'Rotate the validator keys that signed and freeze withdrawals with out-of-range IDs.',
  amount_mismatch: 'Compare the payout amount with its deposit and check the token decimals on both chains.',
  recipient_mismatch: 'Contact the depositor and check whether the recipient field was rewritten in transit.',
};

/** The selected alert as a story: observed fact -> rule finding -> advisory signals -> assessment -> next step. */
function Verdict({ e }: { e: Ev }) {
  const s = e.signals;
  const amt = `${e.symbol} ${human(e.amount, e.decimals)}${e.usd == null ? ' (unpriced)' : ` (${usd(e.usd)})`}`;
  const broke = e.status === 'violation';
  const signals: [Mark, string, string][] = [
    s?.id_jump && s.id_jump > 1000 ? ['bad', 'Withdrawal ID', `jumped ${s.id_jump.toLocaleString()} past the last issued ID`]
      : s?.id_reused ? ['bad', 'Message ID', 'already used by an earlier payout'] : ['ok', 'Message / withdrawal ID', 'in the normal range'],
    s?.signers ? ['ok', 'Signers', `${s.signers.length} real validator signatures recovered; this group is normal`] : ['na', 'Signers', 'no signer data for this bridge'],
    s && s.cluster_size > 1 ? [s.hawkes_n >= 0.9 ? 'bad' : 'warn', 'Copycats', `${s.cluster_size} near-identical payouts · spread ${s.hawkes_n.toFixed(2)}${s.hawkes_n >= 0.9 ? ' (self-sustaining)' : ''}`] : ['ok', 'Copycats', 'isolated payout'],
    e.p_comb != null && e.p_comb < 0.01 ? ['warn', 'Traffic statistics', `unusual vs normal traffic (p ${fmtP(e.p_comb)})`] : ['ok', 'Traffic statistics', 'within normal traffic'],
  ];
  return (
    <ol className="story">
      <li><span className="story-k">Observed on chain</span>
        <p><b>{amt}</b> paid out on the destination chain at {utc(e.ts).slice(11, 19)} UTC to <span className="mono">{e.recipient.slice(0, 10)}…</span>{' '}
          {e.scenario ? <span className="tag tag--pending">practice attack</span> : <a className="hash" href={txUrl('x', 'withdrawal', e.tx) ?? '#'} target="_blank" rel="noreferrer">tx {e.tx.slice(0, 10)}… ↗</a>}</p></li>
      <li className={broke ? 'is-bad' : 'is-ok'}><span className="story-k">Deposit rule {broke ? 'broken' : 'holds'}</span>
        <p>{broke ? <>Paid out {RULE_SENTENCE[e.rule ?? ''] ?? 'breaking the deposit rule'}.{e.rule === 'missing_source_deposit' && e.search ? <> We searched <b>{e.search.deposits_checked.toLocaleString()}</b> earlier deposits: none match.</> : null}</>
          : <>A matching deposit was found{e.delay != null ? `, made ${duration(e.delay)} earlier` : ''}.</>}</p></li>
      <li><span className="story-k">Advisory signals <small>(statistics and ML; cannot accuse alone)</small></span>
        <ul className="story-sig">{signals.map(([m, k, v]) => <li key={k} className={`vd--${m}`}><i aria-hidden>{ICON[m]}</i><b>{k}</b><span>{v}</span></li>)}</ul></li>
      <li><span className="story-k">Assessment</span>
        <p>{broke ? <><b className="bad">Exploit</b>: the deposit rule broke, which is verifiable from chain data.</> : <><b className="warn">Suspicious</b>: backed by a deposit, so this is advice only, not an accusation.</>}
          {e.type && <> Most likely type: <b>{TYPE_SHORT[e.type] ?? e.type}</b>{e.precedent && e.precedent !== '—' ? <> (resembles {e.precedent})</> : null}.</>}</p></li>
      {e.type && NEXT_STEP[e.type] && <li><span className="story-k">Recommended next step</span><p>{NEXT_STEP[e.type]}</p></li>}
    </ol>
  );
}

function Why({ e }: { e: Ev }) {
  const s = e.signals;
  return (
    <div className="ac-body">
      {e.risk_breakdown && <p className="small">Priority: rule {e.risk_breakdown.base} + exposure {e.risk_breakdown.exposure} + campaign {e.risk_breakdown.campaign} + advisory context {e.risk_breakdown.behavior}, capped at {e.level === 'exploit' ? 100 : 69}. This ranks alerts; it is not an exploit probability.</p>}
      {e.reasons && e.reasons.length > 0 && <>
        <span className="label">What pushed this alert up</span>
        <ul className="ac-reasons">{e.reasons.map((r) => (
          <li key={r.feature}><span>{(r.value <= (LOW[r.feature] ?? 0) && FEATURE_ABSENT[r.feature]) || (FEATURE_TEXT[r.feature] ?? r.feature)}</span><i style={{ width: `${Math.min(100, r.push * 12)}%` }} /></li>))}</ul>
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
      <p><Link className="small" to={`/console/evidence?feed=${e.scenario ? 'simulated' : e.evidence?.bundle.release.route.startsWith('ronin') ? 'ronin' : 'nomad'}`}>Open “Check it yourself” and try to cheat it →</Link></p>
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
