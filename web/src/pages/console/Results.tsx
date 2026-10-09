import { useState } from 'react';
import { Seg } from './Usps';
import { TYPE_SHORT, useMetrics, type FeedMetrics, type Metrics } from '../../live/data';
import { duration, usd } from '../../lib/format';
import '../../live/pages.css';

const NUM = new Intl.NumberFormat('en-US');
const NAMES = { nomad: 'Nomad hack (real)', ronin: 'Ronin hack (real)', simulated: 'Practice attacks (made up)' } as const;
type F = keyof typeof NAMES;

export default function Results() {
  const m = useMetrics();
  const [feed, setFeed] = useState<F>('nomad');
  if (!m) return <div className="pg"><div className="demo-wait label">Loading results…</div></div>;
  const real = (['nomad', 'ronin'] as const).map((k) => m.feeds[k]);
  const caught = real.reduce((s, f) => s + f.attack_flagged_exploit, 0), total = real.reduce((s, f) => s + f.attack_releases, 0);
  const normal = real.reduce((s, f) => s + f.withdrawals - f.attack_releases, 0), wrong = real.reduce((s, f) => s + f.normal_false_exploit, 0);
  const alarms = real.reduce((s, f) => s + f.heldout_false_alarms, 0), heldout = real.reduce((s, f) => s + f.heldout_normal, 0);
  const f = m.feeds[feed];
  return (
    <div className="pg">
      <header className="pg-head">
        <span className="label">Results · every number comes from one script</span>
        <h2 className="pg-title">What we caught, and what we got wrong.</h2>
        <p className="pg-lede">We replayed two real bridge hacks and a set of made-up attacks through the same system. Normal traffic is mixed in, so a detector that shouts at everything would fail here.</p>
      </header>

      <div className="kpis">
        <Kpi big={`${caught} / ${total}`} t="real attack payouts caught" s="Nomad and Ronin, from the first payout" />
        <Kpi big={`${wrong}`} t="honest payouts wrongly called an exploit" s={`out of ${NUM.format(normal)} normal payouts`} good />
        <Kpi big={`${alarms}`} t="statistical false alarms" s={`in ${NUM.format(heldout)} normal payouts from days the models never saw`} />
        <Kpi big={NUM.format(Object.values(m.feeds).reduce((s, x) => s + x.withdrawals, 0))} t="payouts replayed in total" s="two real hacks plus the practice attacks" />
      </div>

      <div className="demo-bar"><Seg value={feed} onChange={(v) => setFeed(v as F)} items={Object.entries(NAMES) as [string, string][]} /></div>

      <section className="plate res">
        <header className="plate-head"><span className="label">Us vs the usual methods · {NAMES[feed]}</span></header>
        <div className="plate-body">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Method</th><th>Attack payouts caught</th><th>Money paid out before the first alert</th><th>False alerts on normal days</th></tr></thead>
            <tbody>{f.scorecard.map((r) => {
              const [a, b] = r.attack_flagged.split('/').map(Number);
              return <tr key={r.method} className={r.method.startsWith('BridgeWitness') ? 'ours' : ''}>
                <td>{plain(r.method)}</td>
                <td><span className="meter"><i style={{ width: `${b ? (a / b) * 100 : 0}%` }} /></span> <span className="mono">{r.attack_flagged}</span></td>
                <td className="mono">{r.usd_before_first_alert == null ? '—' : usd(r.usd_before_first_alert)}</td>
                <td className="mono">{r.false_alerts} <span className="dim">({r.false_alerts_per_day} a day)</span></td></tr>;
            })}</tbody></table></div>
          <p className="note">“Before the first alert” counts only the other payouts that went out first; 0 means it was caught on the very first one.</p>
        </div>
      </section>

      <div className="two">
        <section className="plate"><header className="plate-head"><span className="label">If we had held the route · {NAMES[feed]}</span></header>
          <div className="plate-body">{f.counterfactual ? <>
            <p className="lede">Attack total: <b>{usd(f.counterfactual.attack_usd)}</b>. How much would have stayed in the bridge:</p>
            <table className="tbl tbl--kv"><tbody>{f.counterfactual.lanes.map((l) => (
              <tr key={l.latency_s}><td>{l.latency_s === 0 ? 'Stopped before the first payout' : `Stopped ${duration(l.latency_s)} after the first alert`}</td><td className="mono"><b>{usd(l.kept_usd)}</b> <span className="dim">({l.kept_pct}%)</span></td></tr>))}</tbody></table>
            <p className="note">Estimate from the data: it assumes attackers behave the same after a hold. It is not money recovered.</p></> : <p className="dim">No attack in this feed.</p>}</div></section>
        <section className="plate"><header className="plate-head"><span className="label">What kind of attack · {NAMES[feed]}</span></header>
          <div className="plate-body">
            <ul className="kinds">{Object.entries(f.types_on_attack).map(([k, n]) => <li key={k}><span>{TYPE_SHORT[k] ?? k}</span><b className="mono">{n}</b></li>)}</ul>
            <p className="note">{feed === 'nomad' ? 'Nomad copycats re-used real message IDs, so many look like “old message used again” until the cluster forms.' : feed === 'ronin' ? 'Ronin is typed as stolen validator keys because real signatures were recovered for it.' : 'The table reports the observed types on practice attacks; safe controls are evaluated separately.'}</p>
            <p className="note">Statistics alone, with the deposit rule switched off: <b>{f.stat_alarms_on_attack}/{f.attack_releases}</b> attack payouts alarm{f.stat_first_alarm_after_s != null ? `, the first ${duration(f.stat_first_alarm_after_s)} after the first attack payout` : '. This attack is caught by the deposit rule only.'}</p>
          </div></section>
      </div>

      <section className="plate"><header className="plate-head"><span className="label">The three models, in plain words</span></header>
        <div className="plate-body"><Models m={m} f={f} /></div></section>

      <section className="plate"><header className="plate-head"><span className="label">What we do not claim</span></header>
        <div className="plate-body"><ul className="limits">
          <li>These are two real hacks plus practice attacks. That shows the idea works; it is not a promise for every future attack.</li>
          <li>The “exploit” label comes from the deposit rule, whose reference answers come from XChainWatcher's own matching rules. We reproduce them; we do not claim to have found the hacks independently.</li>
          <li>Statistics and machine learning only rank and explain. They never make the final call alone.</li>
          <li>On Ronin the statistics alone miss the attack ({m.feeds.ronin.stat_alarms_on_attack}/2). The deposit rule catches it, and the signer finding is honest: the signers were ordinary, the withdrawal IDs were not.</li>
          <li>Dollar amounts are the dataset's historic values. The Ronin hack is widely quoted at $624M; the dataset's own total is {usd(m.feeds.ronin.counterfactual?.attack_usd ?? 0)}.</li>
          <li>The live feed (Across) only runs the deposit rule. The models stay silent there because they have no history for those routes.</li>
        </ul></div></section>
    </div>
  );
}

const plain = (s: string) => s.replace('B1 whale > $1M', 'Flag any payout above $1 million').replace('B2 volume z-score > 3', 'Flag when volume is 3× above normal').replace('B3 message-id join', 'Match payouts to deposits by message ID').replace('BridgeWitness (exploit)', 'BridgeWitness · “exploit” label').replace('BridgeWitness (any alert)', 'BridgeWitness · any alert');

const Kpi = ({ big, t, s, good }: { big: string; t: string; s: string; good?: boolean }) => (
  <div className={`kpi ${good ? 'kpi--good' : ''}`}><b className="mono">{big}</b><span>{t}</span><small>{s}</small></div>
);

function Models({ m, f }: { m: Metrics; f: FeedMetrics }) {
  const k = m.ml1_delay_cqr;
  return (
    <div className="models">
      <div><h5>1 · Normal timing model</h5><p>Learns how long a deposit normally takes to be paid out on each route, so a payout with no fitting deposit stands out.</p>
        <p><b>{(k.test_coverage * 100).toFixed(1)}%</b> of normal payouts it had never seen landed inside its window (goal {(100 - k.miscoverage_target * 100).toFixed(0)}%). Trained on {NUM.format(k.n_train)} real pairs.</p></div>
      <div><h5>2 · Signer and ID model</h5><p>Learns what normal Ronin withdrawals look like: which validators sign, how big, and which ID.</p>
        <p>Scores the two real attack withdrawals at <b>{m.feeds.ronin.auth_attack_p?.join(' and ')}</b>; a normal one scores about <b>{m.feeds.ronin.auth_heldout_median_p}</b> (smaller = stranger).</p></div>
      <div><h5>3 · Attack-type model</h5><p>Names the likely kind of attack and shows the top reasons, using exact per-feature contributions.</p>
        <p>Trained on practice attacks over real normal traffic, with separate training, calibration and test rows. Real incident outputs are reported individually. {f.attack_flagged_exploit > 0 && 'Its job is the label and the reasons, never the accusation.'}</p></div>
    </div>
  );
}
