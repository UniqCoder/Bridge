import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ButtonLink, Reveal } from '../../design/ui';
import { Map3D } from '../../live/Map3D';
import { useClock, useMetrics, useReplayData, useView } from '../../live/data';
import { usd } from '../../lib/format';
import '../../live/live.css';
import '../../app/landing.css';

const NUM = new Intl.NumberFormat('en-US');

const IDEAS = [
  { n: 1, name: 'Accusation Budget', line: 'We only accuse with proof, and we measure how often we are wrong.', asks: 'a risk-scored alert' },
  { n: 2, name: 'Contagion Radar', line: 'Tells you when an attack is spreading by itself, like an outbreak.', asks: 'volume spikes' },
  { n: 3, name: 'Signer DNA', line: 'Recovers who really signed each withdrawal, straight from the chain.', asks: 'unusual signer behaviour' },
  { n: 4, name: 'Ledger Pairing', line: 'Every coin paid out must match a coin locked, and we show the gap.', asks: 'mismatched deposit/withdrawal pairs' },
];

function HeroGraph() {
  const { data } = useReplayData('nomad');
  const w = data?.window;
  const [t, setT] = useClock(w, w ? (w[1] - w[0]) / 40 : 1, true);
  const start = data ? data.events[40].ts : 0;
  const v = useView(data, Math.max(t, start));
  useEffect(() => { if (w && t >= w[1]) setT(w[0]); }, [t, w]);
  return (
    <div className="hero-viz plate">
      <header className="plate-head"><span className="label">Nomad hack · 3D map, drag to orbit</span><Link to="/console/map" className="cap-link">Open the full map →</Link></header>
      {data && v ? <Map3D data={data} n={v.n} selected={null} onSelect={() => {}} spin /> : <div className="demo-wait label">Loading…</div>}
    </div>
  );
}

const FEATURES: [string, string, string][] = [
  ['Live dashboard and 3D map', 'Replay a real hack or watch a real bridge. Every payout appears as a dot you can click.', '/console/live'],
  ['Volume spikes', 'A 10-minute burst compared with the last 7 days, plus an attack-spread number.', '/console/contagion'],
  ['Unusual signer behaviour', 'Real Ronin signers recovered from the signatures themselves.', '/console/signers'],
  ['Mismatched deposit and payout pairs', 'Each payout is paired to one deposit; the gap is tracked live.', '/console/pairing'],
  ['Risk-scored alert with the attack type', 'A 0 to 100 score, the likely attack, the top reasons and the closest past hack.', '/console/live'],
  ['Check it yourself', 'Pick any payout, see the search that found no deposit, or try to cheat the rule.', '/console/evidence'],
];

export function Landing() {
  const m = useMetrics();
  const real = m ? [m.feeds.nomad, m.feeds.ronin] : null;
  const caught = real?.reduce((s, f) => s + f.attack_flagged_exploit, 0), total = real?.reduce((s, f) => s + f.attack_releases, 0);
  const normal = real?.reduce((s, f) => s + f.withdrawals - f.attack_releases, 0), wrong = real?.reduce((s, f) => s + f.normal_false_exploit, 0);
  return (
    <>
      <section className="hero2 wrap">
        <div className="hero2-copy">
        <span className="label">CSB-01 · Real-time detection of cross-chain bridge exploits</span>
        <h1 className="hero2-title">Catch a bridge hack while it is happening, and only accuse with proof.</h1>
        <p className="hero2-sub">A bridge locks your coins on one chain and pays out the same coins on another. When that promise breaks, hundreds of millions disappear in minutes. BridgeWitness watches both sides and tells you the moment a payout has no deposit behind it.</p>
        <div className="row-wrap">
          <ButtonLink to="/console/live?feed=nomad">Watch the Nomad hack replay</ButtonLink>
          <ButtonLink to="/console/budget" variant="line">Try our four ideas</ButtonLink>
        </div>
        </div>
        <HeroGraph />
        <div className="proofstrip">
          <div><b className="mono">{m ? `${caught} / ${total}` : '…'}</b><span>real attack payouts caught</span></div>
          <div><b className="mono">{m ? wrong : '…'}</b><span>honest payouts wrongly accused{m ? `, of ${NUM.format(normal!)}` : ''}</span></div>
          <div><b className="mono">{m ? usd(m.feeds.nomad.counterfactual?.attack_usd ?? 0) : '…'}</b><span>Nomad money traced to no deposit</span></div>
        </div>
      </section>

      <section className="sect wrap">
        <Reveal><div className="sect-head"><span className="label">Key features</span><h2>Everything the challenge asked for, working.</h2></div></Reveal>
        <div className="feats">
          {FEATURES.map(([t, d, to]) => <Link key={t} to={to} className="feat"><h3>{t}</h3><p>{d}</p><span className="idea-go">Open →</span></Link>)}
        </div>
      </section>

      <section className="sect wrap">
        <Reveal><div className="sect-head"><span className="label">Why this matters</span><h2>Bridges are the biggest target in crypto.</h2>
          <p>About $2 billion was stolen from bridges in 2022 (Chainalysis estimate). The two biggest hacks show why simple alerts fail:</p></div></Reveal>
        <div className="cols2">
          <div className="card"><h3>Ronin · March 2022</h3><p>Attackers stole 5 of the 9 validator keys. Every signature was real, so signature checks saw nothing wrong. Two payouts, 115 seconds apart, took about half a billion dollars.</p></div>
          <div className="card"><h3>Nomad · August 2022</h3><p>A bug let anyone withdraw money that was never deposited. One person found it, then hundreds copied the same transaction with their own address. {m ? `${m.feeds.nomad.attack_releases} payouts in about two and a half hours.` : ''}</p></div>
        </div>
        <p className="punch">Signatures can be stolen. <em>Conservation can't.</em> Coins paid out must never exceed coins locked.</p>
      </section>

      <section className="sect wrap">
        <Reveal><div className="sect-head"><span className="label">What the challenge asked for · what we built</span><h2>Four ideas, each answering one part of the brief.</h2></div></Reveal>
        <div className="ideas">
          {IDEAS.map((i) => (
            <Link key={i.n} to={`/console/${['budget', 'contagion', 'signers', 'pairing'][i.n - 1]}`} className="idea">
              <span className="idea-n">{i.n}</span><h3>{i.name}</h3><p>{i.line}</p><span className="idea-asks">Answers: {i.asks}</span><span className="idea-go">Try it →</span>
            </Link>))}
        </div>
      </section>

      <section className="sect wrap">
        <Reveal><div className="sect-head"><span className="label">How it works</span><h2>From a payout to a verdict in five plain steps.</h2></div></Reveal>
        <ol className="flow">
          <li><b>Read</b><span>Deposits on the source chain and payouts on the destination chain, replayed from real hacks or read live.</span></li>
          <li><b>Pair</b><span>Match each payout to one deposit by amount, person and timing.</span></li>
          <li><b>Measure</b><span>Spread, volume, signers and size, each compared with normal days.</span></li>
          <li><b>Decide</b><span>“Exploit” only when the deposit rule breaks. Statistics alone can only say “suspicious”.</span></li>
          <li><b>Explain</b><span>Attack type, top reasons, the closest past hack, and a check anyone can repeat.</span></li>
        </ol>
        <div className="row-wrap" style={{ marginTop: 28 }}><ButtonLink to="/console/live?feed=ronin">Watch the Ronin hack replay</ButtonLink><ButtonLink to="/console/evidence" variant="line">Check a payout yourself</ButtonLink><ButtonLink to="/console/results" variant="line">See the results</ButtonLink></div>
      </section>
    </>
  );
}
