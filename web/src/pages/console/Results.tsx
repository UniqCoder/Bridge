import { useState } from 'react';
import { TYPE_SHORT, useMetrics } from '../../live/data';
import { duration, usd } from '../../lib/format';
import '../../live/ws.css';

const NUM = new Intl.NumberFormat('en-US');
const NAMES = { nomad: 'Nomad hack', ronin: 'Ronin hack', simulated: 'Practice attacks' } as const;
const KIND = { nomad: 'Recorded on-chain data', ronin: 'Recorded on-chain data', simulated: 'Synthetic attacks in real traffic' } as const;
type F = keyof typeof NAMES;

export default function Results() {
  const m = useMetrics();
  const [feed, setFeed] = useState<F>('nomad');
  if (!m) return <div className="ws"><div className="ws-msg" aria-busy="true"><span className="ws-skel" />Loading results…</div></div>;
  const real = (['nomad', 'ronin'] as const).map((k) => m.feeds[k]);
  const caught = real.reduce((s, f) => s + f.attack_flagged_exploit, 0), total = real.reduce((s, f) => s + f.attack_releases, 0);
  const normal = real.reduce((s, f) => s + f.withdrawals - f.attack_releases, 0), wrong = real.reduce((s, f) => s + f.normal_false_exploit, 0);
  const alarms = real.reduce((s, f) => s + f.heldout_false_alarms, 0), heldout = real.reduce((s, f) => s + f.heldout_normal, 0);
  const f = m.feeds[feed];
  return (
    <div className="ws">
      <header className="ws-sit ws-sit--page">
        <div>
          <p className="ws-sit-k">Every number on this page comes from one script (metrics.json)</p>
          <h2 className="ws-sit-h">What we caught, and what we got wrong.</h2>
          <p className="ws-sit-sub">Two real bridge hacks and a set of practice attacks, replayed through the same system with normal traffic mixed in. A detector that shouts at everything would fail here.</p>
        </div>
      </header>

      <dl className="ws-kpis" aria-label="Headline results on the two real hacks">
        <div><dt>Real attack payouts caught</dt><dd className="mono">{caught} / {total}</dd><small>Nomad and Ronin, from the first payout</small></div>
        <div><dt>Honest payouts wrongly called an exploit</dt><dd className="mono ok">{wrong}</dd><small>out of {NUM.format(normal)} normal payouts</small></div>
        <div><dt>Statistical false alarms</dt><dd className="mono">{alarms}</dd><small>in {NUM.format(heldout)} normal payouts from days the models never saw</small></div>
        <div><dt>Payouts replayed in total</dt><dd className="mono">{NUM.format(Object.values(m.feeds).reduce((s, x) => s + x.withdrawals, 0))}</dd><small>two real hacks plus the practice attacks</small></div>
      </dl>

      <nav className="ws-feeds ws-feeds--3" role="tablist" aria-label="Choose a feed">
        {(Object.keys(NAMES) as F[]).map((k) => (
          <button key={k} role="tab" aria-selected={feed === k} className="ws-feed" onClick={() => setFeed(k)}><b>{NAMES[k]}</b><span>{KIND[k]}</span></button>))}
      </nav>

      <section className="ws-panel">
        <header className="ws-ph"><div><h2 className="ws-h">Us vs the usual methods</h2><p className="dim">{NAMES[feed]}. “Before the first alert” counts only payouts that went out first; $0 means it was caught on the very first one.</p></div></header>
        <div className="ws-tablewrap"><table className="ws-table ws-score">
          <thead><tr><th>Method</th><th>Attack payouts caught</th><th>Paid out before the first alert</th><th>False alerts on normal days</th></tr></thead>
          <tbody>{f.scorecard.map((r) => {
            const [a, b] = r.attack_flagged.split('/').map(Number);
            return <tr key={r.method} className={r.method.startsWith('BridgeWitness') ? 'is-us' : ''}>
              <td>{plain(r.method)}</td>
              <td><span className="ws-meter"><i style={{ width: `${b ? (a / b) * 100 : 0}%` }} /></span><span className="mono">{r.attack_flagged}</span></td>
              <td className="mono">{r.usd_before_first_alert == null ? 'n/a' : usd(r.usd_before_first_alert)}</td>
              <td className="mono"><span className={r.false_alerts ? 'bad' : 'ok'}>{r.false_alerts}</span> <span className="dim">({r.false_alerts_per_day} a day)</span></td></tr>;
          })}</tbody>
        </table></div>
      </section>

      <div className="ws-split">
        <section className="ws-panel">
          <header className="ws-ph"><div><h2 className="ws-h">If the route had been held</h2><p className="dim">{NAMES[feed]}. An estimate that assumes attackers behave the same after a hold; not money recovered. BridgeWitness raises alerts; it does not pause bridges.</p></div></header>
          {f.counterfactual ? <div className="ws-body">
            <p>Attack total in the dataset: <b className="mono">{usd(f.counterfactual.attack_usd)}</b>. How much would have stayed in the bridge:</p>
            <table className="ws-table"><tbody>{f.counterfactual.lanes.map((l) => (
              <tr key={l.latency_s}><td>{l.latency_s === 0 ? 'Held before the first payout' : `Held ${duration(l.latency_s)} after the first alert`}</td><td className="mono num"><b>{usd(l.kept_usd)}</b> <span className="dim">({l.kept_pct}%)</span></td></tr>))}</tbody></table>
          </div> : <p className="ws-body dim">No attack in this feed.</p>}
        </section>
        <section className="ws-panel">
          <header className="ws-ph"><div><h2 className="ws-h">What kind of attack</h2><p className="dim">{NAMES[feed]}. Suspected type on each attack payout.</p></div></header>
          <div className="ws-body">
            <ul className="ws-kinds">{Object.entries(f.types_on_attack).map(([k, n]) => <li key={k}><span>{TYPE_SHORT[k] ?? k}</span><b className="mono">{n}</b></li>)}</ul>
            <p className="dim">{feed === 'nomad' ? 'Nomad copycats re-used real message IDs, so many look like “old message used again” until the cluster forms.' : feed === 'ronin' ? 'Ronin is typed as stolen validator keys because real signatures were recovered for it.' : 'Observed types on practice attacks; safe controls are evaluated separately.'}</p>
            <p className="dim">Statistics alone, with the deposit rule switched off: <b className="mono">{f.stat_alarms_on_attack}/{f.attack_releases}</b> attack payouts alarm{f.stat_first_alarm_after_s != null ? `, the first ${duration(f.stat_first_alarm_after_s)} after the first attack payout.` : '. This attack is caught by the deposit rule only.'}</p>
          </div>
        </section>
      </div>

      <section className="ws-panel">
        <header className="ws-ph"><h2 className="ws-h">What we do not claim</h2></header>
        <ul className="ws-limits">
          <li>These are two real hacks plus practice attacks. That shows the idea works; it is not a promise for every future attack.</li>
          <li>The “exploit” label comes from the deposit rule, whose reference answers come from XChainWatcher's own matching rules. We reproduce them; we do not claim to have found the hacks independently.</li>
          <li>Statistics and machine learning only rank and explain. They never make the final call alone.</li>
          <li>On Ronin the statistics alone catch {m.feeds.ronin.stat_alarms_on_attack} of 2 attack payouts{m.feeds.ronin.stat_alarms_on_attack < 2 ? ', and only the second' : ''}. The deposit rule catches both from the first, and the signer finding is honest: the signers were ordinary, the withdrawal IDs were not.</li>
          <li>Dollar amounts are the dataset's historic values. The Ronin hack is widely quoted at $624M; the dataset's own total is {usd(m.feeds.ronin.counterfactual?.attack_usd ?? 0)}.</li>
          <li>The live Across feed shows API-reported transfer status. It does not independently verify backing or finality; the models abstain on these routes.</li>
        </ul>
      </section>
    </div>
  );
}

const plain = (s: string) => s.replace('B1 whale > $1M', 'Flag any payout above $1 million').replace('B2 volume z-score > 3', 'Flag volume over 3 standard deviations above normal').replace('B3 message-id join', 'Match payouts to deposits by message ID').replace('BridgeWitness (exploit)', 'BridgeWitness, “exploit” label').replace('BridgeWitness (any alert)', 'BridgeWitness, any alert');

