import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NextStep } from '../../live/CaseBar';
import { Seg } from './Usps';
import { RULE_TEXT, SOURCE_CHAIN, TYPE_SHORT, human, txUrl, useReplayData, type Ev, type Replay } from '../../live/data';
import { duration, usd, utc } from '../../lib/format';
import { verifyEvidence } from '../../live/verifyEvidence';
import '../../live/ws.css';

const NUM = new Intl.NumberFormat('en-US');
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

export default function Evidence() {
  const [qs, setQs] = useSearchParams();
  const feed = (['nomad', 'ronin', 'simulated'].includes(qs.get('feed') ?? '') ? qs.get('feed') : 'nomad') as string;
  const { data } = useReplayData(feed);
  const [sel, setSel] = useState<string | null>(qs.get('case'));
  const [show, setShow] = useState<'flagged' | 'backed'>(qs.get('show') === 'backed' ? 'backed' : 'flagged');
  const list = useMemo(() => (data ? pick(data, show) : []), [data, show]);
  useEffect(() => { setSel(qs.get('case')); }, [feed, show]);
  const caseEv = sel && data ? data.events.find((x) => x.id === sel) : undefined;
  const e = list.find((x) => x.id === sel) ?? caseEv ?? list[0] ?? null;

  return (
    <div className="ws">
      <header className="ws-sit">
        <div>
          <p className="ws-sit-k">Step 5 of 5 · Verify it yourself</p>
          <h2 className="ws-sit-h">Don't trust the alert. Check the money.</h2>
          <p className="ws-sit-sub">Every payout on the destination chain must trace back to a deposit on the source chain. Pick a payout below and see exactly what we looked for, what we found, and try to cheat it.</p>
        </div>
      </header>
      <div className="ws-transport">
        <div className="ws-tbtns">
          <Seg value={feed} onChange={(v) => setQs({ feed: v }, { replace: true })} items={[['nomad', 'Nomad hack'], ['ronin', 'Ronin hack'], ['simulated', 'Practice attacks']]} />
          <Seg value={show} onChange={(v) => setShow(v as 'flagged' | 'backed')} items={[['flagged', 'Flagged payouts'], ['backed', 'Honest payouts']]} />
        </div>
      </div>
      {!data || !e ? (
        <div className="ws-panel ws-msg"><span className="ws-skel" /> Loading…</div>
      ) : (
        <div className="ws-grid">
          <div className="ws-left">
            <section className="ws-panel">
              <ol className="ws-alist" style={{ padding: '12px 16px', maxHeight: '640px' }} aria-label="Payouts">
                {list.map((x) => (
                  <li key={x.id}>
                    <button
                      className={`ws-arow ${x.id === e.id ? 'is-sel' : ''}`}
                      onClick={() => setSel(x.id)}
                    >
                      <span className="ws-arisk mono dim">{x.symbol} {human(x.amount, x.decimals, 2)}</span>
                      <span className="ws-atype">
                        <small>{utc(x.ts).slice(5, 19)}{x.scenario ? ` · ${x.scenario}` : ''}</small>
                      </span>
                      <em className="dim">{x.status === 'violation' ? 'no deposit' : 'backed'}</em>
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <div className="ws-right">
            <Detail key={e.id} e={e} feed={feed} />
          </div>
        </div>
      )}
      <NextStep from="evidence" />
    </div>
  );
}

function pick(d: Replay, show: 'flagged' | 'backed') {
  const w = d.events.filter((e) => e.kind === 'withdrawal');
  if (show === 'flagged') return w.filter((e) => e.status === 'violation').filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 40)) === 0).slice(0, 40);
  return w.filter((e) => e.status === 'consistent' && e.deposit).slice(0, 40);
}

function Detail({ e, feed }: { e: Ev; feed: string }) {
  const sim = !!e.scenario;
  const s = e.search!;
  const bad = e.status === 'violation';
  const src = SOURCE_CHAIN[feed];
  const rel = txUrl(feed, 'withdrawal', e.tx, sim), dep = e.deposit ? txUrl(feed, 'deposit', e.deposit.tx, sim) : null;
  return (
    <section className="cf" style={{ maxHeight: 'none' }}>
      <div className="cf-top">
        <div className="cf-badge">{bad ? 'EXPLOIT' : 'BACKED'}</div>
        <h2 className="cf-title">{e.symbol} {human(e.amount, e.decimals)}</h2>
        <div className="cf-amt">
          <span className="mono">{e.usd != null ? usd(e.usd) : 'unpriced'}</span>
          <small>{utc(e.ts)}</small>
        </div>
        <div className="cf-risk">
          <span className="cf-risk-n mono">{e.risk ?? 0}</span>
          <div className="cf-risk-bar">
            {e.risk_breakdown ? (['base', 'exposure', 'campaign', 'behavior'] as const).map((k) => e.risk_breakdown![k] > 0 && <i key={k} className={`rb-${k}`} style={{ width: `${e.risk_breakdown![k]}%` }} />) : <i className="rb-base" style={{ width: `${e.risk ?? 0}%` }} />}
          </div>
          <span className="cf-risk-k">Priority / 100</span>
        </div>
      </div>

      <div className={`cf-sec ${bad ? 'cf-sec--bad' : 'cf-sec--ok'}`}>
        <h3 className="cf-h"><span className="cf-n">1</span>What happened</h3>
        <p className="cf-lede">{bad ? 'Nothing backs this payout.' : 'A matching deposit was found.'}</p>
        <dl className="cf-facts">
          <dt>Status</dt><dd className={bad ? 'bad' : 'ok'}><b>{bad ? 'No deposit found' : 'Deposit matched'}</b></dd>
          <dt>Rule</dt><dd>{RULE_TEXT[e.rule ?? ''] ?? e.rule}</dd>
          <dt>Deposit delay</dt><dd>{e.delay != null ? `${duration(e.delay)} before payout` : 'no deposit'}</dd>
          <dt>Deposits checked</dt><dd className="mono">{NUM.format(s.deposits_checked)}</dd>
        </dl>
      </div>

      <div className="cf-sec cf-sec--ok">
        <h3 className="cf-h"><span className="cf-n">2</span>What was paid out</h3>
        <dl className="cf-facts">
          <dt>Amount</dt><dd><b>{e.symbol} {human(e.amount, e.decimals)}</b>{e.usd != null && <> · {usd(e.usd)}</>}</dd>
          <dt>Recipient</dt><dd className="mono brk">{e.recipient}</dd>
          <dt>When</dt><dd>{utc(e.ts)}</dd>
          <dt>Message ID</dt><dd className="mono">{e.msg_id}</dd>
          <dt>Transaction</dt><dd>{rel ? <a href={rel} target="_blank" rel="noreferrer" className="mono">{e.tx.slice(0, 14)}… ↗ open on a block explorer</a> : <span className="dim">simulated, no real transaction</span>}</dd>
        </dl>
      </div>

      <div className="cf-sec cf-sec--ok">
        <h3 className="cf-h"><span className="cf-n">3</span>What we looked for</h3>
        <p className="cf-lede">A deposit of <b>{e.symbol} {human(e.amount, e.decimals)}</b> from {src} for this same person, made before this payout and not already used for another payout.</p>
        <div className="cf-search">
          <div><b>{NUM.format(s.deposits_checked)}</b><span>deposits checked (whole history{s.since ? ` since ${day(s.since)}` : ''})</span></div>
          <div className={s.same_amount_and_recipient ? 'ok' : 'bad'}><b>{s.same_amount_and_recipient}</b><span>same amount <b>and</b> same person</span></div>
          <div><b>{s.same_amount_other_recipient}</b><span>same amount, different person</span></div>
          <div><b>{s.same_recipient_other_amount}</b><span>same person, different amount</span></div>
        </div>
        {bad && s.same_message_id > 0 && <p className="note warn" style={{ margin: '10px 22px 0', padding: '10px 14px', background: 'var(--pending-ink)', border: '1px solid var(--pending)' }}>A deposit with this message ID exists, so a tool matching by ID alone would have said "fine". Its amount or recipient is different, so we do not accept it.</p>}
        {e.deposit && <p className="cf-lede" style={{ margin: '10px 22px 0' }}>Matched deposit: {src} {dep ? <a href={dep} target="_blank" rel="noreferrer" className="mono">{e.deposit.tx.slice(0, 14)}… ↗</a> : <span className="mono">{e.deposit.tx.slice(0, 14)}…</span>}, {utc(e.deposit.ts).slice(0, 19)}.</p>}
      </div>

      <div className="cf-sec cf-sec--warn">
        <h3 className="cf-h"><span className="cf-n">4</span>Suspected attack type</h3>
        {e.type && bad && <p className="note" style={{ padding: '0 22px' }}>Suggested attack type: <b>{TYPE_SHORT[e.type] ?? e.type}</b>. Its model confidence is trained on synthetic scenarios, not a measured probability for real attacks.</p>}
        {!e.type && <p className="note" style={{ padding: '0 22px' }}>No attack type classified (deposit rule held).</p>}
      </div>

      <div className="cf-sec cf-sec--ok">
        <h3 className="cf-h"><span className="cf-n">5</span>Evidence bundle</h3>
        <p className="cf-lede">SHA-256 digest of the supplied exhibit. Your browser can recompute it.</p>
        <dl className="cf-facts">
          <dt>Digest</dt><dd><div className="id"><span className="mono brk">{e.evidence?.sha256 ?? 'n/a'}</span><button className="id-btn" title="Copy" onClick={() => navigator.clipboard.writeText(e.evidence?.sha256 ?? '')} aria-label="Copy digest">Copy</button></div></dd>
          <dt>Message ID</dt><dd className="mono brk">{e.evidence?.bundle?.release?.msg_id ?? 'n/a'}</dd>
          <dt>Amount</dt><dd className="mono">{e.evidence?.bundle?.release?.amount ?? 'n/a'}</dd>
          <dt>Recipient</dt><dd className="mono brk">{e.evidence?.bundle?.release?.recipient ?? 'n/a'}</dd>
          <dt>Route</dt><dd className="mono">{e.evidence?.bundle?.release?.route ?? 'n/a'}</dd>
        </dl>
      </div>

      <EvidenceCheck e={e} />

      <div className="cf-next">
        <p className="cf-lede">Checked against every deposit in the dataset, not just the part of the replay you can see. Data: XChainWatcher's public Nomad and Ronin transfers. Their labels are the reference here, which we say openly.</p>
        <p className="cf-link"><a href="/console/results" className="ws-link">All measured results →</a></p>
      </div>
    </section>
  );
}

/** Edit a backed payout and the same check runs again in your browser. */
function EvidenceCheck({ e }: { e: Ev }) {
  const [edit, setEdit] = useState<'original' | 'amount' | 'recipient'>('original');
  const [result, setResult] = useState<Awaited<ReturnType<typeof verifyEvidence>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verify = async (mode: typeof edit) => {
    setEdit(mode); setResult(null); setError(null);
    if (!e.evidence) { setError('This replay needs regenerated evidence artifacts.'); return; }
    const bundle = structuredClone(e.evidence.bundle);
    if (mode === 'amount') bundle.release.amount = (BigInt(bundle.release.amount) + 1n).toString();
    if (mode === 'recipient') bundle.release.recipient = '0x' + 'ab'.repeat(20);
    try { setResult(await verifyEvidence(bundle, e.evidence.sha256)); }
    catch (err) { setError(String(err)); }
  };
  return (
    <div className="cf-sec cf-sec--ok">
      <h3 className="cf-h"><span className="cf-n">6</span>Verify the supplied evidence</h3>
      <p className="cf-lede">Your browser checks the SHA-256 digest and recomputes the message, amount, recipient and prior-use rule.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        <button className="btn btn--line btn--sm" onClick={() => void verify('original')}>Verify original</button>
        <button className="btn btn--line btn--sm" onClick={() => void verify('amount')}>Add 1 tiny unit</button>
        <button className="btn btn--line btn--sm" onClick={() => void verify('recipient')}>Send it to someone else</button>
      </div>
      {error && <p role="alert" className="bad" style={{ margin: '8px 0 0', padding: '10px 14px', background: 'var(--violation-ink)', border: '1px solid var(--violation)' }}>{error}</p>}
      {result && <div className={`ev-verdict ${result.integrity ? 'is-ok' : 'is-bad'}`} role="status" style={{ marginTop: 10, padding: '14px 16px', background: 'var(--bg-raise)', display: 'grid', gap: 4 }}>
        <b>{result.integrity ? 'Digest matches the original exhibit' : 'Tampering detected: digest does not match'}</b>
        <span>Recomputed: {result.status} · {RULE_TEXT[result.rule ?? ''] ?? result.rule ?? 'exact backing checks pass'}{edit === 'original' && result.status !== e.status ? ' · differs from reported verdict' : ''}</span>
      </div>}
      <p className="note" style={{ margin: '10px 0 0' }}>This checks supplied dataset evidence. The server still supplies the history and its completeness claim; this is not an on-chain proof that a deposit never existed.</p>
    </div>
  );
}