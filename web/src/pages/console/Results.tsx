import { useState } from 'react';
import { Seg } from './Usps';
import { TYPE_SHORT, useMetrics } from '../../live/data';
import { duration, usd } from '../../lib/format';
import '../../live/ws.css';

const NUM = new Intl.NumberFormat('en-US');
const NAMES = { nomad: 'Nomad hack (real)', ronin: 'Ronin hack (real)', simulated: 'Practice attacks (made up)' } as const;
type F = keyof typeof NAMES;

export default function Results() {
  const m = useMetrics();
  const [feed, setFeed] = useState<F>('nomad');
  if (!m) return <div className="ws"><div className="ws-panel ws-msg"><span className="ws-skel" /> Loading results…</div></div>;
  const real = (['nomad', 'ronin'] as const).map((k) => m.feeds[k]);
  const caught = real.reduce((s, f) => s + f.attack_flagged_exploit, 0), total = real.reduce((s, f) => s + f.attack_releases, 0);
  const normal = real.reduce((s, f) => s + f.withdrawals - f.attack_releases, 0), wrong = real.reduce((s, f) => s + f.normal_false_exploit, 0);
  const alarms = real.reduce((s, f) => s + f.heldout_false_alarms, 0), heldout = real.reduce((s, f) => s + f.heldout_normal, 0);
  const f = m.feeds[feed];
  return (
    <div className="ws">
      <header className="ws-sit">
        <div>
          <p className="ws-sit-k">Results · every number comes from one script</p>
          <h2 className="ws-sit-h">What we caught, and what we got wrong.</h2>
          <p className="ws-sit-sub">We replayed two real bridge hacks and a set of made-up attacks through the same system. Normal traffic is mixed in, so a detector that shouts at everything would fail here.</p>
        </div>
      </header>

      <div className="ws-split">
        <div className="ws-panel">
          <div className="ws-charts" style={{ gridTemplateColumns: 'repeat(4, 1fr)', padding: '16px 20px' }}>
            <div>
              <div className="tl-head"><span className="label">Attack payouts caught</span></div>
              <div className="tl-note"><b className="mono" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>{caught} / {total}</b><br /><span className="dim">Nomad and Ronin, from the first payout</span></div>
            </div>
            <div className="kpi--good">
              <div className="tl-head"><span className="label">Honest payouts wrongly accused</span></div>
              <div className="tl-note"><b className="mono" style={{ fontSize: 'clamp(28px, 3vw, 40px)', color: 'var(--verified)' }}>{wrong}</b><br /><span className="dim">out of {NUM.format(normal)} normal payouts</span></div>
            </div>
            <div>
              <div className="tl-head"><span className="label">Statistical false alarms</span></div>
              <div className="tl-note"><b className="mono" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>{alarms}</b><br /><span className="dim">in {NUM.format(heldout)} normal payouts from unseen days</span></div>
            </div>
            <div>
              <div className="tl-head"><span className="label">Payouts replayed total</span></div>
              <div className="tl-note"><b className="mono" style={{ fontSize: 'clamp(28px, 3vw, 40px)' }}>{NUM.format(Object.values(m.feeds).reduce((s, x) => s + x.withdrawals, 0))}</b><br /><span className="dim">two real hacks plus practice attacks</span></div>
            </div>
          </div>
        </div>
        <div className="ws-panel">
          <div className="ws-transport" style={{ padding: '12px 20px' }}>
            <div className="ws-tbtns">
              <Seg value={feed} onChange={(v) => setFeed(v as F)} items={Object.entries(NAMES) as [string, string][]} />
            </div>
          </div>
        </div>
      </div>

      <section className="ws-panel">
        <header className="plate-head" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
          <span className="label">Us vs the usual methods · {NAMES[feed]}</span>
        </header>
        <div className="ws-charts" style={{ gridTemplateColumns: '1fr', padding: '16px 20px' }}>
          <div className="tbl-wrap" style={{ overflow: 'auto' }}>
            <table className="tbl">
              <thead><tr><th>Method</th><th>Attack payouts caught</th><th>Money paid out before the first alert</th><th>False alerts on normal days</th></tr></thead>
              <tbody>{f.scorecard.map((r) => {
                const [a, b] = r.attack_flagged.split('/').map(Number);
                return <tr key={r.method} className={r.method.startsWith('BridgeWitness') ? 'ours' : ''}>
                  <td>{plain(r.method)}</td>
                  <td><span className="meter"><i style={{ width: `${b ? (a / b) * 100 : 0}%` }} /></span> <span className="mono">{r.attack_flagged}</span></td>
                  <td className="mono">{r.usd_before_first_alert == null ? 'n/a' : usd(r.usd_before_first_alert)}</td>
                  <td className="mono">{r.false_alerts} <span className="dim">({r.false_alerts_per_day} a day)</span></td></tr>;
              })}</tbody>
            </table>
          </div>
          <p className="note" style={{ margin: '8px 20px 0' }}>Before the first alert counts only the other payouts that went out first; 0 means it was caught on the very first one.</p>
        </div>
      </section>

      <div className="ws-split">
        <section className="ws-panel">
          <header className="plate-head" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
            <span className="label">If we had held the route · {NAMES[feed]}</span>
          </header>
          <div className="ws-charts" style={{ gridTemplateColumns: '1fr', padding: '16px 20px' }}>
            {f.counterfactual ? (
              <>
                <p className="cf-lede" style={{ margin: 0 }}>Attack total: <b>{usd(f.counterfactual.attack_usd)}</b>. How much would have stayed in the bridge:</p>
                <table className="tbl tbl--kv"><tbody>{f.counterfactual.lanes.map((l) => (
                  <tr key={l.latency_s}><td>{l.latency_s === 0 ? 'Stopped before the first payout' : `Stopped ${duration(l.latency_s)} after the first alert`}</td><td className="mono"><b>{usd(l.kept_usd)}</b> <span className="dim">({l.kept_pct}%)</span></td></tr>
                ))}</tbody></table>
                <p className="note" style={{ margin: '8px 0 0' }}>Estimate from the data: it assumes attackers behave the same after a hold. It is not money recovered. BridgeWitness does not pause bridges.</p>
              </>
            ) : (
              <p className="dim" style={{ margin: 0 }}>No attack in this feed.</p>
            )}
          </div>
        </section>
        <section className="ws-panel">
          <header className="plate-head" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
            <span className="label">What kind of attack · {NAMES[feed]}</span>
          </header>
          <div className="ws-charts" style={{ gridTemplateColumns: '1fr', padding: '16px 20px' }}>
            <ul className="kinds" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
              {Object.entries(f.types_on_attack).map(([k, n]) => <li key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: '14px' }}><span>{TYPE_SHORT[k] ?? k}</span><b className="mono">{n}</b></li>)}
            </ul>
            <p className="note" style={{ margin: '8px 0 0' }}>
              {feed === 'nomad' ? 'Nomad copycats re-used real message IDs, so many look like "old message used again" until the cluster forms.' : feed === 'ronin' ? 'Ronin is typed as stolen validator keys because real signatures were recovered for it.' : 'The table reports the observed types on practice attacks; safe controls are evaluated separately.'}
            </p>
            <p className="note" style={{ margin: '8px 0 0' }}>
              Statistics alone, with the deposit rule switched off: <b>{f.stat_alarms_on_attack}/{f.attack_releases}</b> attack payouts alarm{f.stat_first_alarm_after_s != null ? `, the first ${duration(f.stat_first_alarm_after_s)} after the first attack payout` : '. This attack is caught by the deposit rule only.'}
            </p>
          </div>
        </section>
      </div>

      <section className="ws-panel">
        <header className="plate-head" style={{ padding: '12px 20px', borderBottom: '1px solid var(--line)' }}>
          <span className="label">What we do not claim</span>
        </header>
        <div className="ws-charts" style={{ gridTemplateColumns: '1fr', padding: '16px 20px' }}>
          <ul className="limits" style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '8px', color: 'var(--text-2)', fontSize: '14px', lineHeight: '1.55' }}>
            <li>These are two real hacks plus practice attacks. That shows the idea works; it is not a promise for every future attack.</li>
            <li>The "exploit" label comes from the deposit rule, whose reference answers come from XChainWatcher's own matching rules. We reproduce them; we do not claim to have found the hacks independently.</li>
            <li>Statistics and machine learning only rank and explain. They never make the final call alone.</li>
            <li>On Ronin the statistics alone catch {m.feeds.ronin.stat_alarms_on_attack} of 2 attack payouts{m.feeds.ronin.stat_alarms_on_attack < 2 ? ', and only the second' : ''}. The deposit rule catches both from the first, and the signer finding is honest: the signers were ordinary, the withdrawal IDs were not.</li>
            <li>Dollar amounts are the dataset's historic values. The Ronin hack is widely quoted at $624M; the dataset's own total is {usd(m.feeds.ronin.counterfactual?.attack_usd ?? 0)}.</li>
            <li>The live Across feed shows API-reported transfer status. It does not independently verify backing or finality; the models abstain on these routes.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}

const plain = (s: string) => s.replace('B1 whale > $1M', 'Flag any payout above $1 million').replace('B2 volume z-score > 3', 'Flag volume over 3 standard deviations above normal').replace('B3 message-id join', 'Match payouts to deposits by message ID').replace('BridgeWitness (exploit)', 'BridgeWitness · "exploit" label').replace('BridgeWitness (any alert)', 'BridgeWitness · any alert');