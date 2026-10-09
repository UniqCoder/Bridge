import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DET, LIVE, NOMAD, RONIN } from '../../data';
import { ButtonLink, Hash, Odometer, Pending, Reveal, Tag, Verdict, VERDICT_MEANING, type Status } from '../../design/ui';
import { Glyph } from '../../design/glyphs';
import { formatUnits, group, usd, utc } from '../../lib/format';
import { scene } from '../../store';
import { Counterfactual } from '../../widgets/Counterfactual';
import { EvidenceMini } from '../../widgets/EvidenceMini';
import { LedgerPlayground } from '../../widgets/LedgerPlayground';
import { Pipeline, ScopeRings, TrieDiagram, WatermarkDiagram } from '../../widgets/diagrams';
import { Collapse, GraphPreview, Ticker } from '../../widgets/showcase';
import { GRAPH } from '../../three/graphData';
import { ATTACKS } from '../../demo/attacks';
import { EXPLOIT_LABEL } from '../../detect/classify';

const WitnessCanvas = lazy(() => import('../../three/WitnessCanvas'));
const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;

function Hero() {
  useEffect(() => {
    scene.set({
      wm: 7.4, gates: false, labels: false, holds: [], verifierHold: false,
      threads: [
        { id: 'a', verdict: 'consistent_under_supplied_evidence', from: 3.0, to: 3.4, lane: 0 },
        { id: 'b', verdict: 'consistent_under_supplied_evidence', from: 4.2, to: 4.7, lane: 2 },
        { id: 'c', verdict: 'invariant_violation', from: 5.4, to: 5.9, lane: 1 },
        { id: 'd', verdict: 'pending', from: 6.3, to: 6.7, lane: 2 },
        { id: 'e', verdict: 'unknown', from: 8.2, to: 7.1, lane: 0 },
      ],
    });
    const id = setTimeout(() => scene.set({ violationAt: performance.now() }), 1400);
    return () => clearTimeout(id);
  }, []);
  const n = DET.nomad;
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <Reveal><Tag kind="real">Challenge CSB-01 · spotting cross-chain bridge hacks</Tag></Reveal>
          <Reveal delay={0.08}>
            <h1 className="t-hero">Spot a bridge hack on the <span className="c-verified">first</span> stolen release.</h1>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="t-lead">
              A bridge locks coins on one blockchain and releases matching coins on another. BridgeWitness checks that
              <b> every release has a real deposit behind it</b>. When one doesn't, it raises a scored alert that says what kind of
              attack it looks like, and shows the proof.
            </p>
          </Reveal>
          <Reveal delay={0.24} className="row-wrap">
            <ButtonLink to="/console/monitor">Watch it catch attacks</ButtonLink>
            <ButtonLink to="/console/lab" variant="line">Try our 7 USPs</ButtonLink>
          </Reveal>
          <Reveal delay={0.32} className="hero-proof">
            <div><span className="readout-value">{n.rule_flags} of {n.attack_releases}</span><span className="label">releases of the real Nomad hack caught, from the very first</span></div>
            <div><span className="readout-value">{group(String(n.first_volume_flag_offset_s))} s</span><span className="label">how long a "sudden burst" alarm took on the same hack. {usd(DET.nomad_loss_before_volume)} had left by then</span></div>
            <div><span className="readout-value">{DET.sim_correct} of {DET.sim_attacks}</span><span className="label">simulated attack types identified correctly, with no exploit alert on the safe cases</span></div>
          </Reveal>
          <Reveal delay={0.4}><p className="tagline">Signatures can be stolen. <span className="c-verified">Conservation</span> can't.</p></Reveal>
        </div>
        <div className="hero-viewport plate">
          <div className="hud hud--tl label">The bridge, as threads between two chains</div>
          <div className="hud hud--tr"><Verdict status="invariant_violation" label="release with no deposit" /></div>
          <Suspense fallback={null}><WitnessCanvas variant="hero" chains={['chain A · deposits', 'chain B · releases']} /></Suspense>
          <div className="hud hud--bl row-wrap">
            {(['consistent_under_supplied_evidence', 'invariant_violation', 'pending', 'unknown'] as Status[]).map((s) => <Verdict key={s} status={s} />)}
          </div>
        </div>
      </div>
      <Ticker />
    </section>
  );
}

const BRIEF: [string, string, string, string, boolean][] = [
  ['A monitoring dashboard', 'The Monitor page: pick a feed, press play, watch alerts appear', '/console/monitor', 'working', true],
  ['A replayed public bridge dataset', 'Real Nomad and Ronin hacks from a public research dataset, replayed on a clock', '/console/monitor?feed=nomad', 'working', true],
  ['A simulated attack replay', 'A made-up bridge with scheduled attacks and safe cases mixed into normal traffic', '/console/monitor', 'working · simulated', true],
  ['Flag deposits and withdrawals that don\'t match', 'Every release must match a deposit exactly. This is the main check', '/console/lab#usp-2', 'working', true],
  ['Flag volume spikes', 'A burst detector, set before it saw any attack data. It advises; it never blocks', '/console/monitor', 'working', true],
  ['Flag unusual signer behaviour', 'Wrong or too few signers; signers acting in lockstep (on the simulated bridge)', '/console/monitor', 'working · simulated', true],
  ['A risk-scored alert with the suspected exploit', 'Score 0 to 100 with its working shown, plus a plain name such as "validator key compromise"', '/console/monitor', 'working', true],
  ['A live feed', 'Two real local chains were run once; live wiring to the dashboard is next', '/console/gauntlet', 'next step', false],
];

function Brief() {
  return (
    <section className="section" id="brief">
      <div className="wrap">
        <Reveal className="section-head">
          <span className="label">What the challenge asks for</span>
          <h2 className="t-h2">Each requirement, and where you can see it work.</h2>
          <p className="t-body">Bridges are the biggest target in crypto, and attacks finish in minutes. The challenge asks for a dashboard that reads a bridge's transactions, flags three suspicious patterns, and raises a scored alert naming the likely attack. This is that dashboard.</p>
        </Reveal>
        <Reveal delay={0.08}>
          <ol className="brief">
            {BRIEF.map(([req, how, to, status, done], i) => (
              <li key={req}>
                <span className="mono dim">{i + 1}</span>
                <span className="brief-req">{req}</span>
                <span className="brief-how">{how}</span>
                <span className="brief-status">{done ? <Tag kind="real">{status}</Tag> : <Pending what={status} />}</span>
                <Link to={to} className="cap-link">Open →</Link>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}

function Signals() {
  const n = DET.nomad, r = DET.ronin;
  const ex = DET.example_alert;
  const cards = [
    { k: '1', name: 'Deposit and withdrawal don\'t match', role: 'decides', what: 'Money came out with nothing put in. Or more came out than went in. Or it went to the wrong person. Or the same deposit was used twice.',
      real: [`Nomad hack: ${n.rule_flags} of ${n.attack_releases} releases flagged, starting with the first`, `Ronin hack: ${r.rule_flags} of ${r.attack_releases} flagged`, `Normal Nomad transfers: 0 of ${group(String(n.all_normal))} flagged`] },
    { k: '2', name: 'A sudden burst of withdrawals', role: 'advises', what: 'Many releases on one route within minutes, compared with that route\'s normal pace. Its alarm level was fixed before it saw any hack.',
      real: [`Nomad: first alarm ${group(String(n.first_volume_flag_offset_s))} s in; ${n.volume_flags_on_attack} of ${n.attack_releases} eventually`, `Ronin: ${r.volume_flags_on_attack} of ${r.attack_releases} (two big transfers, 115 s apart: no burst)`, `False alarms on normal traffic: ${pct(n.volume_flags_on_all_normal, n.all_normal)} Nomad, ${pct(r.volume_flags_on_all_normal, r.all_normal)} Ronin`] },
    { k: '3', name: 'Odd behaviour by the signers', role: 'rules decide · behaviour advises', what: 'Signers are the guards who approve releases. We check that the right ones signed, enough of them, and that they are not all signing together in a burst.',
      real: ['Simulated bridge: a forged signature and a stolen-key drain are both caught', 'The public datasets have no signer data, so this is shown on the simulated bridge', 'Two real local chains: signer recovered and checked'] },
  ];
  return (
    <section className="section section--rule">
      <div className="wrap">
        <Reveal className="section-head">
          <span className="label">How it spots an attack</span>
          <h2 className="t-h2">Three signals. One alert. Rules decide; the rest advise.</h2>
          <p className="t-body">Only a broken rule can hold funds. The burst and signer signals help rank and explain, because on real hacks they fire late, not at all, or on honest traffic. We measured all three on the same data.</p>
        </Reveal>
        <div className="signals">
          {cards.map((c, i) => (
            <Reveal key={c.k} delay={i * 0.06} className="signal plate">
              <div className="plate-body stack" style={{ gap: 12 }}>
                <div className="spread"><span className="mono dim">Signal {c.k}</span><Tag kind={c.role === 'decides' ? 'real' : undefined}>{c.role}</Tag></div>
                <h3 className="t-h3" style={{ fontSize: 19 }}>{c.name}</h3>
                <p className="dim" style={{ fontSize: 14 }}>{c.what}</p>
                <div className="hr" />
                <span className="label">measured on the replayed data</span>
                <ul className="plain">{c.real.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal delay={0.1} className="anatomy plate">
          <div className="plate-head"><span className="label">One alert, explained · simulated bridge, minute {Math.floor(ex.offset_s / 60)}</span><Link to="/console/monitor" className="cap-link">Watch it fire →</Link></div>
          <div className="anatomy-body">
            <div className="anatomy-score"><span className="mono">{ex.risk.total}</span><span className="label">risk, out of 100</span></div>
            <div className="stack" style={{ gap: 10 }}>
              <span className="t-h3" style={{ fontSize: 22 }}>{EXPLOIT_LABEL[ex.exploit as keyof typeof EXPLOIT_LABEL]}</span>
              <span className="mono dim" style={{ fontSize: 12 }}>{formatUnits(ex.amount, ex.decimals).replace(/\.?0+$/, '')} {ex.route} · {usd(ex.usd)} · approved by validators {ex.signers.join(', ')}</span>
              <div className="row-wrap" style={{ gap: 6 }}>
                {ex.rules.map((x) => <span key={x} className="reason reason--rule">{x}</span>)}
                <span className="reason">burst score {ex.volume_dev} (alarm at 11)</span>
                {ex.signer.map((x) => <span key={x} className="reason">{x}</span>)}
              </div>
              <div className="prio-bar">
                <span style={{ flex: ex.risk.base }} className="prio-base">type: {ex.risk.base}</span>
                <span style={{ flex: ex.risk.exposure }} className="prio-exp">+{ex.risk.exposure} size</span>
                <span style={{ flex: ex.risk.campaign }} className="prio-camp">+{ex.risk.campaign}</span>
              </div>
              <p className="dim" style={{ fontSize: 13 }}>All three signals agree: nothing was deposited for this release, it is part of a fast burst, and the same five validators keep approving together. A rule broke, so it is eligible to be held. The score is a ranking, not a probability.</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Problem() {
  const [weth, usdc] = RONIN.releases;
  const r = DET.ronin;
  return (
    <section className="section">
      <div className="wrap split">
        <Reveal className="stack">
          <span className="label">Why the usual checks miss it · the Ronin hack, March 2022</span>
          <h2 className="t-h2">Valid signatures. No burst. Money gone.</h2>
          <p className="t-body">Hackers stole five of Ronin's nine validator keys, so every signature was valid. Only two withdrawals happened, 115 seconds apart, so a burst detector stayed quiet ({r.volume_flags_on_attack} of {r.attack_releases}). A "large transfer" alert would fire, but only after the money moved, when at most about 4.5% is recoverable. It went unnoticed for six days. The question that catches it: <em>which deposit backs this release?</em></p>
          <div className="ronin-amount">
            <Odometer value={usd(RONIN.public_estimate_usd)} />
            <span className="label">public estimate · in the dataset: {group(formatUnits(weth.amount, weth.decimals!).split('.')[0])} {weth.token} + {group(formatUnits(usdc.amount, usdc.decimals!).split('.')[0])} {usdc.token} = {usd(RONIN.usd_total_dataset)}</span>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="plate">
            <div className="plate-head"><span className="label">What each check said about the Ronin theft</span><Tag kind="real">real dataset</Tag></div>
            <div className="plate-body stack" style={{ gap: 18 }}>
              <div className="keys">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className={`key ${i < 5 ? 'is-signed' : ''}`}>{Glyph.key}<span className="label">{i < 5 ? 'signed' : `v${i + 1}`}</span></div>
                ))}
              </div>
              <div className="checks-list">
                <div className="spread"><span>Are the signatures valid?</span><Verdict status="consistent_under_supplied_evidence" label="yes · keys were stolen" /></div>
                <div className="spread"><span>Is there a sudden burst?</span><Verdict status="consistent_under_supplied_evidence" label="no · 0 of 2" /></div>
                <div className="spread"><span>Is the transfer very large?</span><Tag>yes, but after the money left</Tag></div>
                <div className="spread"><span>Is there a deposit behind it? <Hash value={weth.tx} chain={1} /></span><Verdict status="invariant_violation" label="no deposit" /></div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Invariant() {
  return (
    <section className="section section--rule">
      <div className="wrap split split--wide">
        <Reveal className="stack">
          <span className="label">The one rule</span>
          <h2 className="t-h2">Every coin released must match a coin locked. To the last unit.</h2>
          <p className="t-body">Not a score or a guess: exact arithmetic. Splitting a theft into small pieces changes nothing, because the pieces are added up. Try it. This is the real checking rule running in your browser.</p>
        </Reveal>
        <Reveal delay={0.1}><div className="plate"><div className="plate-head"><span className="label">Try the rule</span><span className="tag">same rule as the backend</span></div><div className="plate-body"><LedgerPlayground /></div></div></Reveal>
      </div>
    </section>
  );
}

function VerdictLegend() {
  return (
    <section className="section section--tight">
      <div className="wrap">
        <span className="label" style={{ display: 'block', marginBottom: 14 }}>The six verdicts you will see</span>
        <div className="verdict-legend">
          {(Object.keys(VERDICT_MEANING) as Status[]).map((s) => (
            <div key={s} className="vl-item"><Verdict status={s} /><span className="dim" style={{ fontSize: 13 }}>{VERDICT_MEANING[s]}</span></div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Capability({ n, title, line, children, visual, tag }: { n: string; title: string; line: string; children: ReactNode; visual: ReactNode; tag: ReactNode }) {
  return (
    <Reveal as="section" className="cap">
      <div className="cap-copy">
        <span className="cap-n mono">{n}</span>
        <h3 className="t-h2 cap-title">{title}</h3>
        <p className="cap-line">{line}</p>
        <div className="t-body">{children}</div>
        <div className="row-wrap" style={{ marginTop: 8 }}>{tag}<Link to={`/console/lab#usp-${+n}`} className="cap-link">Try the demo →</Link></div>
      </div>
      <div className="cap-visual plate"><div className="plate-body">{visual}</div></div>
    </Reveal>
  );
}

function GauntletList() {
  const pick = [1, 2, 6, 8, 11, 12].map((n) => ATTACKS.find((a) => a.n === n)!);
  return (
    <ul className="glist">
      {pick.map((a) => (
        <li key={a.n}><span>{a.name}</span><span className="mono dim">{a.expectedRule}</span><Verdict status={a.expected} /></li>
      ))}
      <li className="dim"><span>and 6 more · run them all on the demo page</span></li>
    </ul>
  );
}

function Capabilities() {
  return (
    <section className="section" id="capabilities">
      <div className="wrap">
        <Reveal className="section-head">
          <span className="label">What we add on top · the deposit-matching idea itself is prior research (XChainWatcher, Count of Monte Crypto), cited</span>
          <h2 className="t-h2">Detecting is the start. Seven things make it trustworthy.</h2>
          <p className="t-body">Each one has a working demo. The tag says what is real and what is simulated.</p>
        </Reveal>
        <div className="caps">
          <Capability n="01" title="Proof that a deposit does not exist" line="Not 'we saw nothing'. The chain itself proves it." tag={<Tag>demo · simulated bridge</Tag>} visual={<TrieDiagram />}>
            Instead of trusting a monitor's own records, we ask the source chain for a short mathematical proof that the deposit slot is empty, and your browser checks it. Fetching proofs from a real chain is the next backend step.
          </Capability>
          <Capability n="02" title="Evidence anyone can re-run" line="Don't trust our alert. Re-run it." tag={<Tag kind="real">works · 12 of 12 files verified</Tag>} visual={<EvidenceMini />}>
            Every alert comes with a file. Your browser re-checks it, and changing even one smallest unit makes the check fail.
          </Capability>
          <Capability n="03" title='"Unknown" instead of crying wolf' line="If we can't see the source chain yet, we say so." tag={<Tag>demo · simulated feed</Tag>} visual={<WatermarkDiagram />}>
            A lagging data feed makes honest releases look unbacked. We track how far we have seen each chain, and until we have seen far enough the answer is "unknown", never "attack".
          </Capability>
          <Capability n="04" title="Hold before the money moves" line="As narrow as the evidence allows." tag={<Tag>demo · simulated gate</Tag>} visual={<ScopeRings />}>
            A release waits in a 30-second window. If a rule breaks, that route is held first. If a second route behind the same verifier is hit, the hold widens, as it should have on Nomad (second route at +{NOMAD.second_token_offset_s} s). A route hold was also proven once on two real local chains.
          </Capability>
          <Capability n="05" title="What if we had responded faster?" line="Same hack, five responses, measured." tag={<Tag kind="real">works · real data</Tag>} visual={<Counterfactual compact />}>
            Replay a real hack under five response policies and read the loss for each, including where our own narrow policy loses. These are estimates, not money recovered.
          </Capability>
          <Capability n="06" title={`One incident, not ${NOMAD.attack_releases} alerts`} line="Related alerts become one story." tag={<Tag kind="real">works · real data</Tag>} visual={<Collapse />}>
            The Nomad hack produced {NOMAD.attack_releases} violations from {NOMAD.beneficiaries} addresses. We group them into one incident with live dollar exposure and a copycat flag.
          </Capability>
          <Capability n="07" title="We attack ourselves" line="Twelve attacks, including safe cases that must not alarm." tag={<Tag>demo · simulated bridge</Tag>} visual={<GauntletList />}>
            Each attack runs through the real rule and is compared with the verdict we expected. Baselines and fault injection on the Nomad stream are still to come.
          </Capability>
        </div>
      </div>
    </section>
  );
}

function GraphTeaser() {
  const hub = GRAPH.nodes.filter((n) => n.kind === 'message').sort((a, b) => b.degree - a.degree)[0];
  const voidN = GRAPH.nodes.find((n) => n.kind === 'void');
  return (
    <section className="section">
      <div className="wrap">
        <Reveal className="plate graph-teaser">
          <div className="plate-head"><span className="label">Flow map · Nomad hack, 1–2 Aug 2022 · {GRAPH.edges.length} releases</span><ButtonLink to="/console/graph" size="sm">Open in 3D</ButtonLink></div>
          <div className="graph-teaser-body">
            <div className="stack" style={{ gap: 18 }}>
              <h2 className="t-h2">One deposit. {hub.degree} releases.</h2>
              <p className="t-body">Drawn as a map, the copycat swarm is obvious. Deposit #{hub.key} was real, then was claimed {hub.degree} times by different addresses. Another {voidN?.degree} releases come from no deposit at all. An honest deposit backs exactly one release.</p>
              <div className="row-wrap"><Verdict status="invariant_violation" label={`${hub.degree} claims on one deposit`} /><Verdict status="invariant_violation" label={`${voidN?.degree} with no deposit`} /><Verdict status="consistent_under_supplied_evidence" label={`${NOMAD.normal_aug_1_2} honest transfers`} /></div>
            </div>
            <GraphPreview />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const DATA_USED: [string, string, string][] = [
  ['Nomad hack · public dataset', '4,482 honest transfers + 382 stolen releases (1 Aug 2022), 279 addresses, $159.6M at dataset prices', 'real · MIT licence'],
  ['Ronin hack · public dataset', '22,830 honest transfers + 2 stolen releases (23 Mar 2022), $565.4M at dataset prices', 'real · MIT licence'],
  ['Simulated attack replay', '130 releases over 3 hours; normal traffic copied from real Ronin amounts; 6 attacks and 2 safe cases we scheduled', 'synthetic · seed 2410'],
  ['Two local test chains', 'One run: a stolen release held, an honest route settled, with full proofs', 'run once · local only'],
  ['Reference engine output', '12 evidence files, the ML model card, the burst baseline, a speed benchmark', 'from our Python engine'],
];

function DataUsed() {
  return (
    <section className="section">
      <div className="wrap split split--wide">
        <Reveal className="stack">
          <span className="label">The data</span>
          <h2 className="t-h2">Real where we can. Simulated where the challenge allows. Labelled everywhere.</h2>
          <p className="t-body">The public datasets have no signer data and no raw proofs, so signer behaviour and proofs are shown on the simulated bridge and the local chains. Every number on this site is produced by a script that stops if it changes.</p>
        </Reveal>
        <Reveal delay={0.08}>
          <table className="table data-table">
            <tbody>{DATA_USED.map(([a, b, c]) => <tr key={a}><td>{a}</td><td className="dim">{b}</td><td><Tag>{c}</Tag></td></tr>)}</tbody>
          </table>
        </Reveal>
      </div>
    </section>
  );
}

function ArchitectureStrip() {
  return (
    <section className="section">
      <div className="wrap stack" style={{ gap: 28 }}>
        <Reveal className="spread section-head">
          <div className="stack"><span className="label">How it fits together</span><h2 className="t-h2">Read the chains, match every release, hold if a rule broke.</h2></div>
          <ButtonLink to="/docs/architecture" variant="line" size="sm">Read more</ButtonLink>
        </Reveal>
        <Reveal delay={0.1}><Pipeline /></Reveal>
      </div>
    </section>
  );
}

function Feeds() {
  return (
    <section className="section">
      <div className="wrap acts acts--3">
        <Reveal className="act plate">
          <div className="plate-body stack" style={{ gap: 14 }}>
            <span className="label">1 · the challenge's demo</span>
            <h3 className="t-h2">Simulated attack replay</h3>
            <p className="t-body">A fake deposit, a forged signature, a replay, a stolen-key drain and two mismatched pairs, hidden in normal traffic. A big honest transfer and an honest burst must not raise an exploit alert.</p>
            <ButtonLink to="/console/monitor">Run it</ButtonLink>
          </div>
        </Reveal>
        <Reveal delay={0.06} className="act plate">
          <div className="plate-body stack" style={{ gap: 14 }}>
            <span className="label">2 · real history</span>
            <h3 className="t-h2">Nomad and Ronin</h3>
            <p className="t-body">The 2022 hacks, replayed from public data. Nomad's {NOMAD.attack_releases} releases from {NOMAD.beneficiaries} copycats collapse into one incident. The first one landed at {utc(NOMAD.first_ts).slice(11, 19)} UTC.</p>
            <ButtonLink to="/console/monitor?feed=nomad" variant="line">Replay Nomad</ButtonLink>
          </div>
        </Reveal>
        <Reveal delay={0.12} className="act plate">
          <div className="plate-body stack" style={{ gap: 14 }}>
            <span className="label">3 · your turn</span>
            <h3 className="t-h2">Attack the bridge</h3>
            <p className="t-body">Run 12 attacks against a simulated bridge and see which are held. On two real local chains, a stolen release was held while an honest one settled exactly {formatUnits(LIVE.healthy_settled_base_units, 6)} units.</p>
            <ButtonLink to="/console/gauntlet" variant="line">Open attack tests</ButtonLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <>
      <Hero />
      <Brief />
      <Signals />
      <Problem />
      <Invariant />
      <VerdictLegend />
      <Capabilities />
      <GraphTeaser />
      <DataUsed />
      <ArchitectureStrip />
      <Feeds />
    </>
  );
}
