import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RULE_TEXT, SIGNAL_NAME, human, txUrl, useMetrics, useReplayData, type Ev, type Metrics, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/pages.css';
import '../../live/ws.css';
import { NextStep, STEPS } from '../../live/CaseBar';

const NUM = new Intl.NumberFormat('en-US');
const usdShort = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : usd(v));
const Wait = ({ what }: { what: string }) => <div className="demo-wait label">Loading {what}…</div>;

// Plain-language framing shown first on each page (the technical demo stays below).
const PLAIN: Record<string, { analogy: string; why: string }> = {
  pairing: { analogy: 'Think of a cloakroom. Every coat handed out needs a ticket from a coat handed in. A payout with no deposit is a coat handed out with no ticket.',
    why: 'Stolen keys can sign anything, but they cannot create a deposit that never happened. That is why this is the only check allowed to say “exploit”.' },
  signers: { analogy: 'Think of a cheque that needs 5 of 9 bank managers to sign. We read the real signatures off the blockchain to see who signed.',
    why: 'In Ronin the thieves held 5 real keys, so the signers looked normal. The giveaway was the cheque number: a withdrawal ID about 936,000 past any the bridge had issued.' },
  contagion: { analogy: 'Think of an epidemic. One person finds the bug, then others copy the exact same transaction with their own address.',
    why: 'Copycat clusters and a spread number show whether an attack is fading or feeding itself (above about 1), which tells a team how urgently to act.' },
  budget: { analogy: 'Think of a smoke alarm you can trust: we tested how often it goes off on normal days, and we report that number.',
    why: 'Statistics can only say “suspicious”. Only a broken deposit rule can say “exploit”, so a scary-looking number alone never accuses anyone.' },
};

const IDEAS = [
  { to: 'budget', name: 'Accusation Budget', tag: 'False alarms, measured', answers: 'a risk-scored alert',
    problem: 'Most tools shout whenever a number crosses a line, and nobody knows how often they are wrong. Teams stop listening, then miss the real attack.',
    how: 'Every warning sign is compared with what normal traffic looked like recently, and the signs are combined into one evidence score. An alarm needs enough evidence, and “exploit” needs the deposit rule to break as well, so a scary-looking number alone can never accuse anyone.' },
  { to: 'contagion', name: 'Contagion Radar', tag: 'Is the attack spreading?', answers: 'volume spikes',
    problem: 'Nomad was not one big theft. One person found the bug, then hundreds of copycats pasted the same transaction with their own address. Size alerts see a lot of small payments, not a swarm.',
    how: 'We fingerprint releases with the address hidden and group similar transactions. A fitted spread number describes the cluster timing. It helps investigate a swarm, but cannot prove causation or authorize a hold by itself.' },
  { to: 'signers', name: 'Signer DNA', tag: 'Who signed, from the chain itself', answers: 'unusual signer behaviour',
    problem: 'Bridges release money when enough validators sign. Most demos make signers up. Real signatures sit inside transaction data, where almost nobody looks.',
    how: 'We recover the signers of each Ronin withdrawal straight from the signatures (public math, no trust needed) and learn each validator’s normal habits. Then we report honestly what that showed.' },
  { to: 'pairing', name: 'Ledger Pairing', tag: 'Every coin out needs a coin in', answers: 'mismatched deposit/withdrawal pairs',
    problem: 'Many tools match a payout to a deposit by its message ID. Nomad’s copycats re-used real IDs, so those tools saw a match and stayed quiet.',
    how: 'We bind each payout to its route, token and message, then check the exact amount, recipient and prior use. Each deposit can back one payout. Learned timing adds context, but never rejects an otherwise valid authorization.' },
];

function KeyStats({ n, m }: { n: number; m: Metrics | null }) {
  const nm = m?.feeds.nomad, rn = m?.feeds.ronin, s = m?.signer_dna;
  const rows: [string, string, string][][] = [
    [[nm ? `${nm.heldout_false_alarms} of ${NUM.format(nm.heldout_normal)}` : '…', 'false alarms on unseen normal Nomad payouts', 'ok'],
     [nm ? `${nm.attack_flagged_exploit} / ${nm.attack_releases}` : '…', 'Nomad attack payouts labelled exploit', 'ok'],
     [nm ? String(nm.normal_false_exploit) : '…', 'honest Nomad payouts wrongly called exploit', 'ok']],
    [[nm ? String(nm.max_cluster) : '…', 'payouts in the biggest copycat cluster', 'bad'],
     [nm ? nm.max_hawkes_n.toFixed(2) : '…', 'spread number (1 = feeds itself)', 'bad'],
     [nm ? `${nm.stat_alarms_on_attack} / ${nm.attack_releases}` : '…', 'attack payouts the statistics alone flagged', 'ok']],
    [['9 · 5', 'Ronin validators · needed to approve', ''],
     [s ? NUM.format(s.normal_sampled) : '…', 'normal withdrawals with recovered signers', 'ok'],
     [s ? `${(s.attack_quorum_share * 100).toFixed(1)}%` : '…', 'normal withdrawals signed by the attack group too', 'warn']],
    [[nm ? `${nm.attack_flagged_exploit} / ${nm.attack_releases}` : '…', 'attack payouts caught by ledger pairing', 'ok'],
     [nm?.counterfactual ? usdShort(nm.counterfactual.attack_usd) : '…', 'paid out with no deposit behind it', 'bad'],
     [rn ? `${rn.attack_flagged_exploit} / ${rn.attack_releases}` : '…', 'Ronin attack payouts caught', 'ok']],
  ];
  return <dl className="ws-kpis ws-kpis--3">{rows[n - 1].map(([v, l, t]) => <div key={l}><dt>{l}</dt><dd className={`mono${t ? ` ${t}` : ''}`}>{v}</dd></div>)}</dl>;
}

/** One page per idea: what it is, why it matters, then a demo on real data. */
export default function Usps({ n }: { n: 1 | 2 | 3 | 4 }) {
  const m = useMetrics();
  const idea = IDEAS[n - 1];
  const Demo = [BudgetDemo, ContagionDemo, SignerDemo, PairingDemo][n - 1];
  const step = STEPS.find((x) => x.to === idea.to)!;
  return (
    <div className="ws">
      <header className="ws-sit ws-sit--page">
        <div>
          <p className="ws-sit-k">Step {step.n} of 5 · {idea.name} · answers the challenge’s “{idea.answers}”</p>
          <h2 className="ws-sit-h">{step.q}</h2>
          <div className="ws-plain">
            <p><b>In plain words.</b> {PLAIN[idea.to].analogy}</p>
            <p><b>Why it matters.</b> {PLAIN[idea.to].why}</p>
          </div>
        </div>
      </header>
      <KeyStats n={n} m={m} />
      <Usp n={n} name={idea.name} tag={idea.tag} problem={idea.problem} how={idea.how}><Demo m={m} /></Usp>
      <NextStep from={idea.to} />
    </div>
  );
}
function Usp({ n, name, tag, problem, how, children }: { n: number; name: string; tag: string; problem: string; how: string; children: ReactNode }) {
  return (
    <section className="ws-panel usp" id={`usp-${n}`}>
      <header className="ws-ph usp-head">
        <div><h2 className="ws-h">{name}<span className="usp-tag">{tag}</span></h2></div>
        <div className="usp-copy">
          <p><b>The problem.</b> {problem}</p>
          <p><b>How it works.</b> {how}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/* ───────────────────────── 1 · Accusation Budget ───────────────────────── */
function BudgetDemo({ m }: { m: Metrics | null }) {
  const [feed, setFeed] = useState<'nomad' | 'ronin'>('nomad');
  const { data } = useReplayData(feed);
  const samples = useMemo(() => (data ? pickSamples(data) : []), [data]);
  const [pick, setPick] = useState(0);
  const e = samples[Math.min(pick, samples.length - 1)]?.e;
  return (
    <div className="demo">
      <div className="demo-bar">
        <Seg value={feed} onChange={(v) => { setFeed(v as 'nomad' | 'ronin'); setPick(0); }} items={[['nomad', 'Nomad'], ['ronin', 'Ronin']]} />
        <span className="demo-hint">Pick a release and watch how the verdict is reached:</span>
      </div>
      <div className="chips">{samples.map((s, i) => <button key={s.k} className="chip" aria-pressed={pick === i} onClick={() => setPick(i)}>{s.label}</button>)}</div>
      {!e ? <Wait what="release" /> : <>
        <div className="steps">
          <div className="step"><span className="step-n">1</span><h4>How unusual is each sign?</h4>
            <ul className="sigbars">{Object.entries(e.p ?? {}).filter(([, p]) => p != null).map(([k, p]) => (
              <li key={k} className={(p as number) < 0.01 ? 'hot' : ''}><span>{SIGNAL_NAME[k] ?? k}</span><i style={{ width: `${Math.min(100, -Math.log10(Math.max(p as number, 1e-4)) * 25)}%` }} /><em>{(p as number) < 0.001 ? '< 0.001' : (p as number).toFixed(3)}</em></li>))}</ul>
            <p className="note">Small number = rarer than almost everything seen recently.</p></div>
          <div className="step"><span className="step-n">2</span><h4>Add the evidence up</h4>
            <div className="bignum">{e.e_comb != null ? (e.e_comb >= 10 ? Math.round(e.e_comb) : e.e_comb.toFixed(1)) : 'n/a'}</div>
            <p className="note">Evidence score. <b>1 means nothing unusual</b>; the higher, the stranger. Several weak signs add up, one noisy sign barely moves it.</p></div>
          <div className="step"><span className="step-n">3</span><h4>Did the deposit rule break?</h4>
            <div className={`bignum ${e.status === 'violation' ? 'bad' : 'ok'}`}>{e.status === 'violation' ? 'Yes' : 'No'}</div>
            <p className="note">{e.status === 'violation' ? 'No deposit backs this payout.' : 'A deposit of the same amount to the same person was found.'}</p></div>
        </div>
        <div className={`verdict verdict--${e.level}`}>
          <b>{e.level === 'exploit' ? 'Exploit' : e.level === 'suspicious' ? 'Suspicious (advice only)' : 'No alert'}</b>
          <span>{e.level === 'exploit' ? `The deposit rule broke: ${RULE_TEXT[e.rule ?? ''] ?? e.rule}. Priority ${e.risk}/100; statistical agreement is not required.` : e.level === 'suspicious' ? 'Unusual, but the deposit rule held, so we do not accuse. Priority is capped below 70.' : e.signals && (e.p?.value_vs_route ?? 1) < 0.05 ? 'This payout is large, but it is fully backed. Big does not mean guilty, so nobody is accused.' : 'Looks like everyday traffic.'}</span>
        </div>
        <div className="demo-meta">{e.symbol} {human(e.amount, e.decimals)} · {e.usd != null ? usd(e.usd) : 'unpriced'} · {utc(e.ts).slice(0, 19)}{e.scenario ? ' · practice attack' : ''}</div>
      </>}
      {m && <div className="proof">
        <b>The promise, measured.</b> On normal days the models had never seen:
        <ul>
          {(['nomad', 'ronin', 'simulated'] as const).map((f) => <li key={f}><b>{m.feeds[f].heldout_false_alarms}</b> false alarms in <b>{NUM.format(m.feeds[f].heldout_normal)}</b> normal releases ({FEED_LABEL[f]})</li>)}
        </ul>
        <span className="note">These are observed replay counts. Rolling calibration does not establish a guaranteed future false-alarm rate. Only exact rule violations produce exploit verdicts.</span>
      </div>}
    </div>
  );
}
const FEED_LABEL = { nomad: 'Nomad', ronin: 'Ronin', simulated: 'practice attacks' };

function pickSamples(d: Replay) {
  const w = d.events.filter((e) => e.kind === 'withdrawal');
  const ok = w.filter((e) => e.truth === 'normal' && e.status === 'consistent' && e.p && e.e_comb != null);
  const typical = [...ok].sort((a, b) => (a.usd ?? 0) - (b.usd ?? 0))[Math.floor(ok.length / 2)];
  const biggest = [...ok].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))[0];
  const atk = w.filter((e) => e.truth === 'attack');
  return [
    { k: 'typical', label: 'An everyday release', e: typical },
    { k: 'big', label: 'The biggest honest release', e: biggest },
    { k: 'first', label: 'The first attack release', e: atk[0] },
    { k: 'later', label: 'A later attack release', e: atk[Math.floor(atk.length * 0.6)] },
  ].filter((s): s is { k: string; label: string; e: Ev } => !!s.e);
}

/* ───────────────────────── 2 · Contagion Radar ───────────────────────── */
function ContagionDemo({ m }: { m: Metrics | null }) {
  const [feed, setFeed] = useState<'nomad' | 'simulated'>('nomad');
  const { data } = useReplayData(feed);
  const [i, setI] = useState<number | null>(null);
  if (!data) return <div className="demo"><Wait what="replay" /></div>;
  const T = data.ticks;
  const first = Math.max(0, T.findIndex((k) => k.unbacked_usd > 0));
  const idx = Math.min(i ?? first, T.length - 1);
  const k = T[idx];
  const maxC = Math.max(...T.map((x) => x.cluster_max), 1);
  const W = 640, H = 200, X = (j: number) => (j / (T.length - 1)) * W;
  const area = `M0 ${H} ` + T.map((x, j) => `L${X(j).toFixed(1)} ${(H - (x.cluster_max / maxC) * (H - 16)).toFixed(1)}`).join(' ') + ` L${W} ${H} Z`;
  const line = T.map((x, j) => `${j ? 'L' : 'M'}${X(j).toFixed(1)} ${(H - (Math.min(x.hawkes_n, 3.2) / 3.2) * (H - 16)).toFixed(1)}`).join(' ');
  const state = k.hawkes_n >= 1 ? ['Strong fitted spread', 'Investigate the cluster and its backing evidence.', 'warn'] : k.hawkes_n >= 0.3 ? ['Cluster building', 'Timing fits a growing cluster; it does not prove causation.', 'warn'] : ['Quiet', 'Little fitted spread in the current cluster.', 'ok'];
  const crossIdx = T.findIndex((x) => x.hawkes_n >= 0.5);
  const sc = m?.feeds[feed === 'nomad' ? 'nomad' : 'simulated'].scorecard.find((r) => r.method.startsWith('B2'));
  return (
    <div className="demo">
      <div className="demo-bar">
        <Seg value={feed} onChange={(v) => { setFeed(v as 'nomad' | 'simulated'); setI(null); }} items={[['nomad', 'Nomad (real)'], ['simulated', 'Practice swarm']]} />
        <span className="demo-hint">Drag the time slider through the attack:</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Copycat cluster size and attack spread over time" preserveAspectRatio="none">
        <path d={area} className="area" /><path d={line} className="line" />
        <line x1={X(idx)} x2={X(idx)} y1="0" y2={H} className="cursor" />
        {crossIdx >= 0 && <><line x1={X(crossIdx)} x2={X(crossIdx)} y1="0" y2={H} className="mark" /></>}
      </svg>
      <div className="axis"><span>{utc(T[0].t).slice(11, 16)}</span><span>{utc(T[Math.floor(T.length / 2)].t).slice(11, 16)}</span><span>{utc(T[T.length - 1].t).slice(11, 16)} UTC</span></div>
      <div className="legend"><span className="sw sw--area" />copycats in the biggest cluster <span className="sw sw--line" />attack spread n̂ (right: 0 to 3)</div>
      <input className="slider" type="range" min={0} max={T.length - 1} value={idx} onChange={(e) => setI(+e.target.value)} aria-label="Time" />
      <div className="reads">
        <div><span className="label">Time</span><b>{utc(k.t).slice(11, 16)}</b></div>
        <div><span className="label">Copycats so far</span><b>{k.cluster_max}</b></div>
        <div><span className="label">Money out, unbacked</span><b>{usdShort(k.unbacked_usd)}</b></div>
        <div className={`st st--${state[2]}`}><span className="label">Attack spread n̂ = {k.hawkes_n.toFixed(2)}</span><b>{state[0]}</b></div>
      </div>
      <p className="note">{state[1]} {crossIdx >= 0 && idx < crossIdx && <button className="link" onClick={() => setI(crossIdx)}>Jump to the minute it becomes clear →</button>}</p>
      {sc && <div className="proof">A plain volume alarm (z-score) on the same data catches <b>{sc.attack_flagged}</b> attack releases and raises <b>{sc.false_alerts}</b> false alerts on normal days. Contagion Radar sees the cluster form from the second copycat.</div>}
    </div>
  );
}

/* ───────────────────────── 3 · Signer DNA ───────────────────────── */
function SignerDemo({ m }: { m: Metrics | null }) {
  const [tab, setTab] = useState<'real' | 'who' | 'id'>('real');
  const { data: ronin } = useReplayData('ronin');
  if (!m) return <div className="demo"><Wait what="signer data" /></div>;
  const s = m.signer_dna, r = m.feeds.ronin;
  const gap = s.attack_ids[0] - s.normal_id_max;
  const lo = 1_000_000, hi = 2_050_000, pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="demo">
      <div className="demo-bar"><Seg value={tab} onChange={(v) => setTab(v as 'real' | 'who' | 'id')} items={[['real', '1 · The real signers'], ['who', '2 · How often each signs'], ['id', '3 · Which withdrawal ID?']]} /></div>
      {tab === 'real' ? <RealSigners m={m} ronin={ronin} /> : tab === 'who' ? <>
        <p className="lede">Ronin has 9 validators and needs 5 to approve a withdrawal. We recovered the signers of <b>{NUM.format(s.normal_sampled)}</b> normal withdrawals and of the two attack withdrawals. Amber = signed the attack.</p>
        <div className="vals">{s.validators.map((v) => (
          <div key={v.addr} className={v.signed_attack ? 'val val--atk' : 'val'}><div className="val-bar"><i style={{ height: `${v.participation * 100}%` }} /></div><b>{Math.round(v.participation * 100)}%</b><span className="mono" title={v.addr}>{v.addr.slice(0, 6)}…{v.addr.slice(-4)}</span></div>))}</div>
        <p className="note">Share of normal withdrawals each validator signed. Four of the five attack signers sign almost everything.</p>
        <div className="finding"><b>Honest finding.</b> The exact attack group also signed <b>{NUM.format(s.attack_quorum_seen_in_normal)}</b> normal withdrawals ({(s.attack_quorum_share * 100).toFixed(1)}%). So <b>who signed was not unusual</b>. The signatures were real and the signers ordinary, which is exactly why checks that trust signatures stayed quiet.</div>
      </> : <>
        <p className="lede">Every withdrawal has an ID counted up by Ronin's own chain. Normal ones were between <b>{NUM.format(s.normal_id_min)}</b> and <b>{NUM.format(s.normal_id_max)}</b>.</p>
        <div className="idcards">
          <div><span>Highest ID in the normal sample</span><b>{NUM.format(s.normal_id_max)}</b></div>
          <div className="idcards--gap"><span>Gap above the sample</span><b>{NUM.format(gap)}</b></div>
          <div className="idcards--bad"><span>ID the attacker used</span><b>{NUM.format(s.attack_ids[0])}</b></div>
        </div>
        <div className="idruler" role="img" aria-label="Ruler of withdrawal IDs: normal ones, a huge empty gap, then the attack IDs">
          <div className="idruler-normal" style={{ width: pos(s.normal_id_max) }}><span>real IDs</span></div>
          <div className="idruler-gap"><span>{NUM.format(gap)} numbers above the sample</span></div>
          <div className="idruler-atk" style={{ left: pos(s.attack_ids[0]) }}><span>attack</span></div>
          <span className="idtick" style={{ left: '0%' }}>{NUM.format(lo)}</span><span className="idtick" style={{ left: '100%' }}>{NUM.format(hi)}</span>
        </div>
        <p className="lede">Think of withdrawal IDs like cheque numbers. Real ones were counted up one by one, so a new one should be the next number. The attacker's was nearly a million numbers ahead.</p>
        <div className="finding"><b>The warning signal.</b> The attack IDs were <b>{NUM.format(gap)}</b> above the sampled normal maximum. This is unusual, but the gap alone does not prove those IDs were never issued. Model p-values: <b>{r.auth_attack_p?.join(' and ')}</b>; normal median <b>{r.auth_heldout_median_p}</b>. The backing check makes the exploit decision.</div>
      </>}
    </div>
  );
}

/** The signers of the two real Ronin attack withdrawals, recovered from the signatures inside each transaction. */
function RealSigners({ m, ronin }: { m: Metrics; ronin: Replay | null }) {
  if (!ronin) return <Wait what="the Ronin attack" />;
  const attacks = ronin.events.filter((e) => e.truth === 'attack' && e.kind === 'withdrawal');
  const part = new Map(m.signer_dna.validators.map((v) => [v.addr, v.participation]));
  return (
    <>
      <p className="lede">Ronin is run by <b>9 validators</b>, and <b>5</b> must sign before a withdrawal is paid. The signatures sit inside the Ethereum transaction. We recovered the address behind each one with public math (<span className="mono">ecrecover</span>), so you can check any of these on a block explorer. These are the <b>real</b> signers of the two stolen withdrawals.</p>
      {attacks.map((e, i) => {
        const url = txUrl('ronin', 'withdrawal', e.tx);
        return (
          <div key={e.id} className="sigcard">
            <header>
              <b>Attack withdrawal {i + 1}</b>
              <span>{utc(e.ts).slice(0, 19)} UTC · {e.symbol} {NUM.format(Number(human(e.amount, e.decimals, 0).replace(/,/g, '')))} · {usd(e.usd ?? 0)}</span>
              {url && <a href={url} target="_blank" rel="noreferrer" className="mono">{e.tx.slice(0, 12)}…{e.tx.slice(-6)} ↗</a>}
            </header>
            <ol className="signers">
              {(e.signals?.signers ?? []).map((a, k) => (
                <li key={a}>
                  <span className="signers-n">{k + 1}</span>
                  <a className="mono brk" href={`https://etherscan.io/address/${a}`} target="_blank" rel="noreferrer">{a} ↗</a>
                  <span className="dim">signs {Math.round((part.get(a) ?? 0) * 100)}% of normal withdrawals</span>
                </li>))}
            </ol>
          </div>);
      })}
      <div className="finding"><b>What this shows.</b> Five genuine validators signed both withdrawals. Four of them sign almost everything, so the signers alone look normal. That is the point: a bridge that trusts signatures sees nothing wrong. See tab 3 for the number that gave the attack away.</div>
      <p className="note">Recovered from calldata of the {ronin.label} replay. Only Ronin exposes signatures this way; for Nomad the signer model reports "not applicable" instead of guessing.</p>
    </>
  );
}

/* ───────────────────────── 4 · Ledger Pairing ───────────────────────── */
function PairingDemo({ m }: { m: Metrics | null }) {
  const { data } = useReplayData('nomad');
  const [onlyFooled, setOnlyFooled] = useState(true);
  const rows = useMemo(() => {
    if (!data) return [];
    const atk = data.events.filter((e) => e.kind === 'withdrawal' && e.truth === 'attack');
    const list = onlyFooled ? atk.filter((e) => (e.search?.same_message_id ?? 0) > 0) : atk;
    return list.slice(0, 12);
  }, [data, onlyFooled]);
  const f = m?.feeds.nomad, b3 = f?.scorecard.find((r) => r.method.startsWith('B3'));
  const fooled = b3 && f ? f.attack_releases - parseInt(b3.attack_flagged) : null;
  const last = data?.ticks[data.ticks.length - 1];
  if (!data || !f) return <div className="demo"><Wait what="Nomad replay" /></div>;
  return (
    <div className="demo">
      <div className="duel">
        <div className="duel-c"><span className="label">Match by message ID only</span><b className="mono">{b3?.attack_flagged}</b><span>attack releases caught</span><em>{fooled != null ? `${fooled} looked fine because the ID had been used by a real deposit` : ''}</em></div>
        <div className="duel-c duel-c--us"><span className="label">Ledger Pairing (ours)</span><b className="mono">{f.attack_flagged_exploit}/{f.attack_releases}</b><span>attack releases caught</span><em>{f.normal_false_exploit} honest payouts wrongly accused</em></div>
      </div>
      <div className="demo-bar">
        <span className="demo-hint">The money in vs out gap by the end of the replay: <b className="bad">{last ? usd(last.unbacked_usd) : 'n/a'}</b> paid out with nothing behind it.</span>
        <label className="chk"><input type="checkbox" checked={onlyFooled} onChange={(e) => setOnlyFooled(e.target.checked)} /> only show the ones ID-matching misses</label>
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Time</th><th>Paid out</th><th>Message ID</th><th>ID matching says</th><th>Ledger Pairing says</th></tr></thead>
        <tbody>{rows.map((e) => (
          <tr key={e.id}><td className="mono">{utc(e.ts).slice(11, 19)}</td><td className="mono">{e.symbol} {human(e.amount, e.decimals, 2)}</td><td className="mono">{e.msg_id}</td>
            <td>{(e.search?.same_message_id ?? 0) > 0 ? <span className="warn">“Matched” (ID was used before)</span> : <span className="bad">No deposit with this ID</span>}</td>
            <td className="bad">{RULE_TEXT[e.rule ?? ''] ?? e.rule} ({e.search ? NUM.format(e.search.deposits_checked) : 'n/a'} checked)</td></tr>))}</tbody>
      </table></div>
      <p className="note">Want to check one yourself, against the full deposit history? <Link to="/console/evidence?feed=nomad">Open it on the Check it yourself page →</Link></p>
    </div>
  );
}

/* ── shared ── */
export function Seg({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: [string, string][] }) {
  return <div className="seg" role="tablist">{items.map(([v, l]) => <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
