import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SIGNAL_NAME, human, useMetrics, useReplayData, type Ev, type Metrics, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/pages.css';

const NUM = new Intl.NumberFormat('en-US');
const usdShort = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : usd(v));
const Wait = ({ what }: { what: string }) => <div className="demo-wait label">Loading {what}…</div>;

const Cur = createContext(1);

export default function Usps() {
  const m = useMetrics();
  const { hash } = useLocation();
  const [cur, setCur] = useState(1);
  useEffect(() => { const n = Number(hash.replace('#usp-', '')); if (n >= 1 && n <= 4) setCur(n); }, [hash]);
  return (
    <Cur.Provider value={cur}><div className="pg">
      <header className="pg-head">
        <span className="label">Our four ideas · each one running on real data</span>
        <h2 className="pg-title">Four ways we catch a bridge hack, and prove it.</h2>
        <p className="pg-lede">A bridge holds coins on one chain and pays out the same coins on another. Every idea below checks a different part of that promise. Try each one; nothing here is a mock-up.</p>
        <nav className="pg-pills" role="tablist" aria-label="Pick an idea">
          {['Accusation Budget', 'Contagion Radar', 'Signer DNA', 'Ledger Pairing'].map((n, i) => <button key={n} aria-selected={cur === i + 1} onClick={() => setCur(i + 1)}><b>{i + 1}</b>{n}</button>)}
        </nav>
      </header>

      <Usp n={1} name="Accusation Budget" tag="Fewer false alarms, guaranteed"
        problem="Most tools shout whenever a number crosses a line, and nobody knows how often they are wrong. Teams stop listening, then miss the real attack."
        how="Every warning sign is compared with what normal traffic looked like recently, and the signs are combined into one evidence score. An alarm needs enough evidence, and “exploit” needs the deposit rule to break as well, so a scary-looking number alone can never accuse anyone.">
        <BudgetDemo m={m} />
      </Usp>

      <Usp n={2} name="Contagion Radar" tag="Is the attack spreading?"
        problem="Nomad was not one big theft. One person found the bug, then hundreds of copycats pasted the same transaction with their own address. Size alerts see a lot of small payments, not a swarm."
        how="We fingerprint every release with the address hidden, so copy-paste releases land in one cluster. Then we measure whether each release is causing more releases. That number (n̂, the attack's reproduction number) near or above 1 means it will keep going on its own: hold the route.">
        <ContagionDemo m={m} />
      </Usp>

      <Usp n={3} name="Signer DNA" tag="Who signed, from the chain itself"
        problem="Bridges release money when enough validators sign. Most demos make signers up. Real signatures sit inside transaction data, where almost nobody looks."
        how="We recover the signers of each Ronin withdrawal straight from the signatures (public math, no trust needed) and learn each validator's normal habits. Then we report honestly what that showed.">
        <SignerDemo m={m} />
      </Usp>

      <Usp n={4} name="Ledger Pairing" tag="Every coin out needs a coin in"
        problem="Many tools match a payout to a deposit by its message ID. Nomad's copycats re-used real IDs, so those tools saw a match and stayed quiet."
        how="We match by amount, recipient and timing, one deposit to one payout, and each deposit can only be used once. A payout with no deposit behind it is unbacked. The gap between money in and money out is tracked live, and you can click to see who caused it.">
        <PairingDemo m={m} />
      </Usp>

      <footer className="pg-foot">Want to see all four working together on one timeline? <Link to="/console/live">Open the live console →</Link></footer>
    </div></Cur.Provider>
  );
}

function Usp({ n, name, tag, problem, how, children }: { n: number; name: string; tag: string; problem: string; how: string; children: ReactNode }) {
  if (useContext(Cur) !== n) return null;
  return (
    <section className="usp" id={`usp-${n}`}>
      <div className="usp-copy">
        <span className="usp-n">{n}</span>
        <h3>{name}</h3>
        <span className="usp-tag">{tag}</span>
        <p><b>The problem.</b> {problem}</p>
        <p><b>What we do.</b> {how}</p>
      </div>
      <div className="usp-demo">{children}</div>
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
            <div className="bignum">{e.e_comb != null ? (e.e_comb >= 10 ? Math.round(e.e_comb) : e.e_comb.toFixed(1)) : '—'}</div>
            <p className="note">Evidence score. <b>1 means nothing unusual</b>; the higher, the stranger. Several weak signs add up, one noisy sign barely moves it.</p></div>
          <div className="step"><span className="step-n">3</span><h4>Did the deposit rule break?</h4>
            <div className={`bignum ${e.status === 'violation' ? 'bad' : 'ok'}`}>{e.status === 'violation' ? 'Yes' : 'No'}</div>
            <p className="note">{e.status === 'violation' ? 'No deposit backs this payout.' : 'A deposit of the same amount to the same person was found.'}</p></div>
        </div>
        <div className={`verdict verdict--${e.level}`}>
          <b>{e.level === 'exploit' ? 'EXPLOIT' : e.level === 'suspicious' ? 'SUSPICIOUS (advice only)' : 'NO ALERT'}</b>
          <span>{e.level === 'exploit' ? `The statistics and the deposit rule agree. Risk ${e.risk}/100.` : e.level === 'suspicious' ? 'Unusual, but the deposit rule held, so we do not accuse. Risk is capped below 70.' : e.signals && (e.p?.value_vs_route ?? 1) < 0.05 ? 'This payout is large, but it is fully backed. Big does not mean guilty, so nobody is accused.' : 'Looks like everyday traffic.'}</span>
        </div>
        <div className="demo-meta">{e.symbol} {human(e.amount, e.decimals)} · {e.usd != null ? usd(e.usd) : 'unpriced'} · {utc(e.ts).slice(0, 19)}{e.scenario ? ' · practice attack' : ''}</div>
      </>}
      {m && <div className="proof">
        <b>The promise, measured.</b> On normal days the models had never seen:
        <ul>
          {(['nomad', 'ronin', 'simulated'] as const).map((f) => <li key={f}><b>{m.feeds[f].heldout_false_alarms}</b> false alarms in <b>{NUM.format(m.feeds[f].heldout_normal)}</b> normal releases ({FEED_LABEL[f]})</li>)}
        </ul>
        <span className="note">Our promise: on average no more than one false alarm per 1,000 normal releases. Wrongly labelled “exploit” in total: 0.</span>
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
  const state = k.hawkes_n >= 0.8 ? ['Spreading by itself', 'Hold the route now.', 'bad'] : k.hawkes_n >= 0.3 ? ['Building', 'Copycats are starting to trigger copycats.', 'warn'] : ['Quiet', 'No copy-paste cluster is feeding itself.', 'ok'];
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
  const [tab, setTab] = useState<'who' | 'id'>('who');
  if (!m) return <div className="demo"><Wait what="signer data" /></div>;
  const s = m.signer_dna, r = m.feeds.ronin;
  const gap = s.attack_ids[0] - s.normal_id_max;
  const lo = 1_000_000, hi = 2_050_000, pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="demo">
      <div className="demo-bar"><Seg value={tab} onChange={(v) => setTab(v as 'who' | 'id')} items={[['who', '1 · Who signed?'], ['id', '2 · Which withdrawal ID?']]} /></div>
      {tab === 'who' ? <>
        <p className="lede">Ronin has 9 validators and needs 5 to approve a withdrawal. We recovered the signers of <b>{NUM.format(s.normal_sampled)}</b> normal withdrawals and of the two attack withdrawals. Amber = signed the attack.</p>
        <div className="vals">{s.validators.map((v) => (
          <div key={v.addr} className={v.signed_attack ? 'val val--atk' : 'val'}><div className="val-bar"><i style={{ height: `${v.participation * 100}%` }} /></div><b>{Math.round(v.participation * 100)}%</b><span className="mono">{v.addr.slice(2, 6)}</span></div>))}</div>
        <p className="note">Share of normal withdrawals each validator signed. Four of the five attack signers sign almost everything.</p>
        <div className="finding"><b>Honest finding.</b> The exact attack group also signed <b>{NUM.format(s.attack_quorum_seen_in_normal)}</b> normal withdrawals ({(s.attack_quorum_share * 100).toFixed(1)}%). So <b>who signed was not unusual</b>. The signatures were real and the signers ordinary, which is exactly why checks that trust signatures stayed quiet.</div>
      </> : <>
        <p className="lede">Every withdrawal has an ID counted up by Ronin's own chain. Normal ones were between <b>{NUM.format(s.normal_id_min)}</b> and <b>{NUM.format(s.normal_id_max)}</b>.</p>
        <div className="idaxis">
          <div className="idband" style={{ left: pos(s.normal_id_min), width: `calc(${pos(s.normal_id_max)} - ${pos(s.normal_id_min)})` }}><span>normal IDs</span></div>
          <div className="idmark" style={{ left: pos(s.attack_ids[0]) }}><span>attack: {NUM.format(s.attack_ids[0])} and {NUM.format(s.attack_ids[1])}</span></div>
          <span className="idtick" style={{ left: '0%' }}>1,000,000</span><span className="idtick" style={{ left: '100%' }}>2,050,000</span>
        </div>
        <div className="finding"><b>The real signal.</b> The attack's IDs were about <b>{NUM.format(gap)}</b> past the last ID ever issued, numbers Ronin never created. Our signer model scored the two attack withdrawals at <b>p = {r.auth_attack_p?.join(' and ')}</b>; a normal withdrawal scores around <b>{r.auth_heldout_median_p}</b> (smaller = stranger).</div>
      </>}
    </div>
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
      <div className="demo-bar" style={{ marginTop: 14 }}>
        <span className="demo-hint">The money in vs out gap by the end of the replay: <b className="bad">{last ? usd(last.unbacked_usd) : '—'}</b> paid out with nothing behind it.</span>
        <label className="chk"><input type="checkbox" checked={onlyFooled} onChange={(e) => setOnlyFooled(e.target.checked)} /> only show the ones ID-matching misses</label>
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Time</th><th>Paid out</th><th>Message ID</th><th>ID matching says</th><th>Ledger Pairing says</th></tr></thead>
        <tbody>{rows.map((e) => (
          <tr key={e.id}><td className="mono">{utc(e.ts).slice(11, 19)}</td><td className="mono">{e.symbol} {human(e.amount, e.decimals, 2)}</td><td className="mono">{e.msg_id}</td>
            <td>{(e.search?.same_message_id ?? 0) > 0 ? <span className="warn">“Matched” (ID was used before)</span> : <span className="bad">No deposit with this ID</span>}</td>
            <td className="bad">No deposit of this amount to this person ({e.search ? NUM.format(e.search.deposits_checked) : '—'} checked)</td></tr>))}</tbody>
      </table></div>
      <p className="note">Want to check one yourself, against the full deposit history? <Link to="/console/evidence?feed=nomad">Open it on the Check it yourself page →</Link></p>
    </div>
  );
}

/* ── shared ── */
export function Seg({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: [string, string][] }) {
  return <div className="seg" role="tablist">{items.map(([v, l]) => <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
