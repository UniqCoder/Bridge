import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowSquareOut, Check, CopySimple, MagnifyingGlass, SealCheck, ShieldWarning, Warning } from '@phosphor-icons/react';
import type { Ev, Replay } from './data';
import { FEATURE_ABSENT, FEATURE_TEXT, RULE_SENTENCE, SIGNAL_NAME, SOURCE_CHAIN, TYPE_SHORT, human, txUrl } from './data';
import { duration, usd, utc } from '../lib/format';

/** Copy-to-clipboard identifier with an optional explorer link. */
export function Ident({ value, href, head = 10, tail = 6 }: { value: string; href?: string | null; head?: number; tail?: number }) {
  const [ok, setOk] = useState(false);
  const text = value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
  return (
    <span className="id">
      <span className="mono" title={value}>{text}</span>
      <button type="button" className="id-btn" aria-label={`Copy ${value}`} title="Copy"
        onClick={() => navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); })}>
        {ok ? <Check size={15} /> : <CopySimple size={15} />}
      </button>
      {href && <a className="id-btn" href={href} target="_blank" rel="noreferrer" aria-label="Open in block explorer" title="Open in block explorer"><ArrowSquareOut size={15} /></a>}
    </span>
  );
}

const Sec = ({ n, title, children, tone }: { n: string; title: string; children: ReactNode; tone?: string }) => (
  <section className={`cf-sec${tone ? ` cf-sec--${tone}` : ''}`}>
    <h3 className="cf-h"><span className="cf-n">{n}</span>{title}</h3>
    {children}
  </section>
);

const NEXT_STEP: Record<string, string> = {
  unbacked_release: 'Confirm on the source chain that no deposit exists for this message, then trace where the recipient sends the funds.',
  copycat_swarm: 'Many near-identical payouts are draining the route. Trace the first payout in the cluster to find the root cause.',
  message_replay: 'Check the message history: the same authorization is being paid out more than once.',
  key_compromise: 'Check which validator keys signed, and review every withdrawal with an out-of-range ID.',
  amount_mismatch: 'Compare the payout amount with its deposit and check the token decimals on both chains.',
  recipient_mismatch: 'Check whether the recipient field was rewritten between the deposit and the payout.',
};
// A reason only counts as present above these values (ID jump > ~1,000; fitted spread > 0.3).
const LOW: Record<string, number> = { id_jump_log: 6.9, hawkes_n: 0.3 };
const fmtP = (p: number | null | undefined) => (p == null ? 'n/a' : p < 0.001 ? '< 0.001' : p.toFixed(3));
// The 9 Ronin validators on the day of the hack, in address order.
const VALIDATORS = ['0x11360e', '0x1a15a5', '0x70bb1f', '0x9d5d17', '0xb9e59d', '0xd11d98', '0xe70cbf', '0xee11d2', '0xf224be'];

export function CaseFile({ e, data, threshold, mates }: { e: Ev | null; data: Replay; threshold: number | null; mates: number }) {
  if (!e) return (
    <aside className="cf cf--empty" aria-label="Case file">
      <ShieldWarning size={28} weight="light" />
      <h2>No case open</h2>
      <p>Press <b>Play</b> or <b>Jump to first alert</b>. Every payout is checked against the deposits behind it, and the replay stops on the first one that breaks the rule. Click any payout on the ledger to open its file.</p>
    </aside>
  );
  const level = e.level ?? 'none';
  const broke = e.status === 'violation';
  const sim = !!e.scenario;
  const s = e.signals;
  const src = SOURCE_CHAIN[data.feed] ?? data.src;
  const rb = e.risk_breakdown;
  const pvals = Object.entries(e.p ?? {});
  const head = level === 'exploit' ? 'Exploit: conservation rule broken' : level === 'suspicious' ? 'Suspicious: advisory signals only' : 'No alert: payout is backed';

  return (
    <aside className={`cf cf--${level}`} aria-label="Case file" aria-live="polite">
      <header className="cf-top">
        <div className="cf-badge">{level === 'exploit' ? <ShieldWarning size={16} weight="bold" /> : level === 'suspicious' ? <Warning size={16} weight="bold" /> : <SealCheck size={16} weight="bold" />}{head}</div>
        <h2 className="cf-title">{level === 'none' ? 'Backed payout' : TYPE_SHORT[e.type ?? ''] ?? 'Alert'}</h2>
        <p className="cf-amt"><span className="mono">{e.symbol} {human(e.amount, e.decimals)}</span>{e.usd != null ? <small>{usd(e.usd)} at dataset prices</small> : <small>unpriced token</small>}</p>
        {level !== 'none' && <div className="cf-risk" title="Ranks alerts from 0 to 100. Above 69 always has a broken rule behind it. Not a probability.">
          <span className="cf-risk-n mono">{e.risk ?? 0}</span>
          <div className="cf-risk-bar">
            {rb ? (['base', 'exposure', 'campaign', 'behavior'] as const).map((k) => rb[k] > 0 && <i key={k} className={`rb-${k}`} style={{ width: `${rb[k]}%` }} title={`${k} ${rb[k]}`} />) : <i className="rb-base" style={{ width: `${e.risk ?? 0}%` }} />}
          </div>
          <span className="cf-risk-k">priority{rb ? <> · rule {rb.base} + size {rb.exposure} + campaign {rb.campaign} + signals {rb.behavior}</> : null}</span>
        </div>}
      </header>

      <Sec n="1" title="What happened">
        <dl className="cf-facts">
          <dt>Paid out</dt><dd>{utc(e.ts)} on {data.dst}</dd>
          <dt>Route</dt><dd>{src} → {data.dst}</dd>
          <dt>Recipient</dt><dd><Ident value={e.recipient} href={sim ? null : `https://etherscan.io/address/${e.recipient}`} /></dd>
          <dt>Payout tx</dt><dd>{sim ? <span className="tag tag--pending">practice attack, no real tx</span> : <Ident value={e.tx} href={txUrl(data.feed, 'withdrawal', e.tx)} />}</dd>
          <dt>Message ID</dt><dd className="mono">{e.msg_id}{s?.id_reused ? <span className="bad"> · used before</span> : null}</dd>
        </dl>
      </Sec>

      <Sec n="2" title="Conservation rule" tone={broke ? 'bad' : 'ok'}>
        <p className="cf-lede">{broke
          ? <>Paid out {RULE_SENTENCE[e.rule ?? ''] ?? 'breaking the deposit rule'}. This layer is the only one allowed to say <b>exploit</b>.</>
          : <>Matched to a deposit on {src}{e.delay != null ? <> made <b>{duration(e.delay)}</b> earlier</> : null}.{e.window ? <> The delay model expects {duration(e.window[0])} to {duration(e.window[1])}.</> : null}</>}</p>
        {e.search && <div className="cf-search" aria-label="Deposit search">
          <div><b className="mono">{e.search.deposits_checked.toLocaleString()}</b><span>earlier {e.symbol} deposits searched</span></div>
          <div className={e.search.same_amount_and_recipient ? 'ok' : 'bad'}><b className="mono">{e.search.same_amount_and_recipient}</b><span>same amount and recipient</span></div>
          <div><b className="mono">{e.search.same_amount_other_recipient}</b><span>same amount, other recipient</span></div>
          <div><b className="mono">{e.search.same_message_id}</b><span>same message ID</span></div>
        </div>}
        {e.deposit && <dl className="cf-facts">
          <dt>{broke ? 'Claimed deposit' : 'Deposit'}</dt><dd>{sim ? <span className="mono">{e.deposit.tx.slice(0, 12)}…</span> : <Ident value={e.deposit.tx} href={txUrl(data.feed, 'deposit', e.deposit.tx)} />}</dd>
          <dt>Deposited</dt><dd><span className="mono">{e.symbol} {human(e.deposit.amount, e.decimals)}</span> at {utc(e.deposit.ts).slice(5, 16)}</dd>
          {e.deposit.recipient !== e.recipient && <><dt>For</dt><dd><Ident value={e.deposit.recipient} /> <span className="bad">different recipient</span></dd></>}
        </dl>}
      </Sec>

      <Sec n="3" title="Statistical signals" tone={e.p_comb != null && e.p_comb < 0.01 ? 'warn' : undefined}>
        <p className="cf-lede">Seven signals ranked against recent backed payouts. They can raise <b>suspicious</b> but never accuse on their own. Longer bar = rarer.</p>
        <ul className="cf-p">
          {pvals.map(([k, p]) => {
            const w = p == null ? 0 : Math.min(100, (-Math.log10(Math.max(p, 1e-6)) / 4) * 100);
            return <li key={k} className={p != null && p < 0.01 ? 'hot' : p == null ? 'na' : ''}>
              <span>{SIGNAL_NAME[k] ?? k}</span><i><em style={{ width: `${w}%` }} /><u style={{ left: '50%' }} title="p = 0.01" /></i><b className="mono">{fmtP(p)}</b>
            </li>;
          })}
          <li className="cf-p-all"><span>All signals combined</span><i /><b className="mono">{fmtP(e.p_comb)}</b></li>
        </ul>
        {e.ecusum != null && threshold != null && <p className="small dim">Running evidence (e-CUSUM) <b className="mono">{e.ecusum.toLocaleString(undefined, { maximumFractionDigits: 1 })}</b> against an alarm line of <b className="mono">{threshold.toLocaleString()}</b>{e.alarm ? <b className="warn"> · alarm</b> : null}.</p>}
        {s && (s.cluster_size > 1 || s.id_jump > 1000) && <p className="small">
          {s.cluster_size > 1 && <>Part of a cluster of <b>{s.cluster_size}</b> near-identical payouts{mates > 1 ? <> (<b>{mates}</b> visible, ringed on the ledger)</> : null}, fitted spread <b className="mono">{s.hawkes_n.toFixed(2)}</b>{s.hawkes_n >= 0.9 ? ' (self-sustaining)' : ''}. </>}
          {s.id_jump > 1000 && <>Withdrawal ID jumped <b className="mono">{s.id_jump.toLocaleString()}</b> past the last issued ID.</>}
        </p>}
        {s?.signers && <div className="cf-signers" aria-label={`${s.signers.length} of 9 validators signed`}>
          {VALIDATORS.map((v) => <span key={v} className={s.signers!.some((x) => x.startsWith(v)) ? 'on' : ''} title={v}>{v.slice(2, 6)}</span>)}
          <p className="small dim">{s.signers.length} of 9 validator signatures recovered from the transaction calldata. This group also signed 6.6% of normal withdrawals, so who signed was not the signal.</p>
        </div>}
      </Sec>

      {level !== 'none' && e.type && <Sec n="4" title="Suspected exploit type">
        <p className="cf-lede"><b>{e.type_text ?? TYPE_SHORT[e.type]}</b>{e.precedent && e.precedent !== '—' ? <span className="dim"> Resembles {e.precedent}.</span> : null}</p>
        {e.reasons && e.reasons.length > 0 && <ul className="cf-why">{e.reasons.map((r) => (
          <li key={r.feature}><span>{(r.value <= (LOW[r.feature] ?? 0) && FEATURE_ABSENT[r.feature]) || (FEATURE_TEXT[r.feature] ?? r.feature)}</span><i style={{ width: `${Math.min(100, r.push * 8)}%` }} /></li>))}</ul>}
        <p className="small dim">Classifier confidence {Math.round((e.type_prob ?? 0) * 100)}%. It was trained on synthetic attacks over real normal traffic; bars show each reason's exact contribution (TreeSHAP).</p>
      </Sec>}

      {e.evidence && <Sec n={level !== 'none' && e.type ? '5' : '4'} title="Evidence bundle">
        <dl className="cf-facts">
          <dt>SHA-256</dt><dd><Ident value={e.evidence.sha256} head={12} tail={8} /></dd>
          <dt>Rule</dt><dd className="mono">{e.evidence.bundle.rule_version}</dd>
          <dt>Inputs</dt><dd>{e.evidence.bundle.authorizations.length} authorizations, {e.evidence.bundle.previous_releases.length} earlier payouts</dd>
          <dt>Coverage</dt><dd>{e.evidence.bundle.coverage.mode.replace(/_/g, ' ')}</dd>
        </dl>
        <Link className="cf-link" to={`/console/evidence?feed=${data.feed}`}>Re-run the check yourself and try to tamper with it →</Link>
      </Sec>}

      {level !== 'none' && <footer className="cf-next">
        {e.type && NEXT_STEP[e.type] && <p><b>Investigate next.</b> {NEXT_STEP[e.type]}</p>}
        <Link className="btn btn--sm" to={`/console/pairing?feed=${data.feed}&case=${encodeURIComponent(e.id)}`}><MagnifyingGlass size={16} />Open full investigation</Link>
      </footer>}
    </aside>
  );
}
