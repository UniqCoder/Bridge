import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Seg } from './Usps';
import { RULE_TEXT, SOURCE_CHAIN, TYPE_SHORT, human, txUrl, useReplayData, type Ev, type Replay } from '../../live/data';
import { duration, usd, utc } from '../../lib/format';
import '../../live/pages.css';

const NUM = new Intl.NumberFormat('en-US');
const day = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

export default function Evidence() {
  const [qs, setQs] = useSearchParams();
  const feed = (['nomad', 'ronin', 'simulated'].includes(qs.get('feed') ?? '') ? qs.get('feed') : 'nomad') as string;
  const { data } = useReplayData(feed);
  const [sel, setSel] = useState<string | null>(null);
  const [show, setShow] = useState<'flagged' | 'backed'>(qs.get('show') === 'backed' ? 'backed' : 'flagged');
  const list = useMemo(() => (data ? pick(data, show) : []), [data, show]);
  useEffect(() => { setSel(null); }, [feed, show]);
  const e = list.find((x) => x.id === sel) ?? list[0] ?? null;

  return (
    <div className="pg">
      <header className="pg-head">
        <span className="label">Check it yourself</span>
        <h2 className="pg-title">Don't trust the alert. Check the money.</h2>
        <p className="pg-lede">Every payout on the destination chain must trace back to a deposit on the source chain. Pick a payout below and see exactly what we looked for, what we found, and try to cheat it.</p>
      </header>
      <div className="demo-bar">
        <Seg value={feed} onChange={(v) => setQs({ feed: v }, { replace: true })} items={[['nomad', 'Nomad hack'], ['ronin', 'Ronin hack'], ['simulated', 'Practice attacks']]} />
        <Seg value={show} onChange={(v) => setShow(v as 'flagged' | 'backed')} items={[['flagged', 'Flagged payouts'], ['backed', 'Honest payouts']]} />
      </div>
      {!data || !e ? <div className="demo-wait label">Loading…</div> : (
        <div className="ev">
          <ol className="ev-list" aria-label="Payouts">
            {list.map((x) => (
              <li key={x.id}><button className={`ev-row ${x.id === e.id ? 'is-sel' : ''}`} onClick={() => setSel(x.id)}>
                <span className={`dot dot--${x.status === 'violation' ? 'bad' : 'ok'}`} aria-hidden />
                <span><b>{x.symbol} {human(x.amount, x.decimals, 2)}</b><small>{utc(x.ts).slice(5, 19)}{x.scenario ? ` · ${x.scenario}` : ''}</small></span>
                <em>{x.status === 'violation' ? 'no deposit' : 'backed'}</em>
              </button></li>))}
          </ol>
          <Detail key={e.id} e={e} feed={feed} />
        </div>
      )}
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
    <section className="ev-detail">
      <div className={`ev-verdict ${bad ? 'is-bad' : 'is-ok'}`}>
        <b>{bad ? 'Nothing backs this payout' : 'Backed by a real deposit'}</b>
        <span>{bad ? (RULE_TEXT[e.rule ?? ''] ?? e.rule) : e.delay != null ? `The deposit was made ${duration(e.delay)} earlier.` : ''}</span>
      </div>
      <h4>What was paid out</h4>
      <dl className="facts">
        <dt>Amount</dt><dd><b>{e.symbol} {human(e.amount, e.decimals)}</b>{e.usd != null && <> · {usd(e.usd)}</>}</dd>
        <dt>To</dt><dd className="mono brk">{e.recipient}</dd>
        <dt>When</dt><dd>{utc(e.ts)}</dd>
        <dt>Message ID</dt><dd className="mono">{e.msg_id}</dd>
        <dt>Transaction</dt><dd>{rel ? <a href={rel} target="_blank" rel="noreferrer" className="mono">{e.tx.slice(0, 14)}… ↗ open on a block explorer</a> : <span className="dim">simulated, no real transaction</span>}</dd>
      </dl>

      <h4>What we looked for</h4>
      <p className="lede">A deposit of <b>{e.symbol} {human(e.amount, e.decimals)}</b> from {src} for this same person, made before this payout and not already used for another payout.</p>
      <table className="tbl tbl--kv"><tbody>
        <tr><td>Deposits of {e.symbol} checked (whole history{s.since ? ` since ${day(s.since)}` : ''})</td><td className="mono">{NUM.format(s.deposits_checked)}</td></tr>
        <tr className={s.same_amount_and_recipient ? 'good' : 'badrow'}><td>…with the same amount <b>and</b> the same person</td><td className="mono">{s.same_amount_and_recipient}</td></tr>
        <tr><td>…same amount, different person</td><td className="mono">{s.same_amount_other_recipient}</td></tr>
        <tr><td>…same person, different amount</td><td className="mono">{s.same_recipient_other_amount}</td></tr>
        <tr><td>…using the same message ID</td><td className="mono">{s.same_message_id}</td></tr>
      </tbody></table>
      {bad && s.same_message_id > 0 && <p className="note warn">A deposit with this message ID exists, so a tool matching by ID alone would have said “fine”. Its amount or recipient is different, so we do not accept it.</p>}
      {e.deposit && <p className="lede">Matched deposit: {SOURCE_CHAIN[feed]} {dep ? <a href={dep} target="_blank" rel="noreferrer" className="mono">{e.deposit.tx.slice(0, 14)}… ↗</a> : <span className="mono">{e.deposit.tx.slice(0, 14)}…</span>}, {utc(e.deposit.ts).slice(0, 19)}.</p>}

      {e.type && bad && <p className="note">Our read of what kind of attack this looks like: <b>{TYPE_SHORT[e.type] ?? e.type}</b> ({Math.round((e.type_prob ?? 0) * 100)}% confident, from past incidents). That part is advice; the deposit check above is the proof.</p>}

      {e.deposit && !bad && <Cheat e={e} />}
      <p className="note">Checked against every deposit in the dataset, not just the part of the replay you can see. Data: XChainWatcher's public Nomad and Ronin transfers. Their labels are the reference here, which we say openly.</p>
    </section>
  );
}

/** Edit a backed payout and the same check runs again in your browser. */
function Cheat({ e }: { e: Ev }) {
  const dep = e.deposit!;
  const [amt, setAmt] = useState(BigInt(e.amount));
  const [rcp, setRcp] = useState(e.recipient);
  const changed = amt !== BigInt(dep.amount) || rcp !== dep.recipient;
  const why = amt !== BigInt(dep.amount) ? `The deposit was ${human(dep.amount, e.decimals)}, not ${human(amt.toString(), e.decimals)}.` : rcp !== dep.recipient ? 'The deposit was made for a different person.' : '';
  return (
    <div className="cheat">
      <h4>Try to cheat it</h4>
      <p className="lede">Change this payout and run the check again, right here in your browser.</p>
      <div className="row-wrap">
        <button className="btn btn--line btn--sm" onClick={() => setAmt(amt + 1n)}>Add 1 tiny unit</button>
        <button className="btn btn--line btn--sm" onClick={() => setAmt(amt * 2n)}>Double the amount</button>
        <button className="btn btn--line btn--sm" onClick={() => setRcp('0x' + 'ab'.repeat(20))}>Send it to someone else</button>
        <button className="btn btn--line btn--sm" onClick={() => { setAmt(BigInt(e.amount)); setRcp(e.recipient); }}>Reset</button>
      </div>
      <div className={`ev-verdict ${changed ? 'is-bad' : 'is-ok'}`}>
        <b>{changed ? 'Now unbacked: it would be flagged' : 'Still backed'}</b>
        <span>{changed ? `${why} One tiny unit is enough: payouts must match deposits exactly.` : `Matches the deposit exactly (${human(amt.toString(), e.decimals)} to the same person).`}</span>
      </div>
    </div>
  );
}
