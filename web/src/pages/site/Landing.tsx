import { lazy, Suspense, useEffect, useRef, type PointerEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowUpRight, Cube, Fingerprint, Graph, Scales, ShieldWarning, TreeStructure } from '@phosphor-icons/react';
import { useClock, useMetrics, useReplayData, useView, type Metrics, type Replay } from '../../live/data';
import '../../live/live.css';
import '../../app/landing.css';

const Map3D = lazy(() => import('../../live/Map3D'));
const NUM = new Intl.NumberFormat('en-US');
const EASE = [0.16, 1, 0.3, 1] as const;
const noop = () => {};
const usdM = (v: number) => `$${(v / 1e6).toFixed(1)}M`;

/* ── shared pieces ─────────────────────────────────────────────────────── */

/** Primary CTA: pill with the arrow in its own island (button-in-button). */
export const Cta = ({ to, children, ghost }: { to: string; children: ReactNode; ghost?: boolean }) => (
  <Link to={to} className={`cta ${ghost ? 'cta--ghost' : ''}`}>
    <span>{children}</span>
    <i aria-hidden="true"><ArrowUpRight size={14} weight="bold" /></i>
  </Link>
);

/** Counts up once when scrolled into view. Writes to the DOM directly, never through React state. */
function Ticker({ to, format = (v: number) => NUM.format(Math.round(v)) }: { to: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    if (!seen || reduce) { ref.current.textContent = format(to); return; }
    const c = animate(0, to, { duration: 1.6, ease: EASE, onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v); } });
    return () => c.stop();
  }, [seen, to, reduce]);
  return <span ref={ref}>{format(to)}</span>;
}

const Rise = ({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.8, delay, ease: EASE }}>{children}</motion.div>
  );
};

/** Bento cell whose border lights up under the cursor (position goes to CSS variables, not state). */
function Cell({ className = '', children, to }: { className?: string; children: ReactNode; to: string }) {
  const move = (e: PointerEvent<HTMLAnchorElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return <Link to={to} className={`cell ${className}`} onPointerMove={move}><div className="cell-in">{children}</div></Link>;
}

/* ── hero ──────────────────────────────────────────────────────────────── */

function HeroScene({ data }: { data: Replay | null }) {
  const w = data?.window;
  const [t, setT] = useClock(w, w ? (w[1] - w[0]) / 40 : 1, true);
  const start = data ? data.events[Math.min(40, data.events.length - 1)].ts : 0;
  const v = useView(data, Math.max(t, start));
  useEffect(() => { if (w && t >= w[1]) setT(w[0]); }, [t, w]);
  let gap = 0;
  if (v) for (const e of v.withdrawals) if (e.status === 'violation') gap += e.usd ?? 0;
  return (
    <>
      <div className="hero-gl" aria-hidden="true">
        {data && v && <Suspense fallback={null}><Map3D data={data} n={v.n} selected={null} onSelect={noop} spin bare /></Suspense>}
      </div>
      <div className={`hero-live ${gap > 0 ? 'is-breach' : ''}`} aria-live="off">
        <span>{gap > 0 ? 'Nomad replay · payouts with no deposit' : 'Nomad replay · every payout backed'}</span>
        <b className="mono">${NUM.format(Math.round(gap))}</b>
      </div>
    </>
  );
}

function Hero({ data }: { data: Replay | null }) {
  const reduce = useReducedMotion();
  const line = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 40 }, animate: { opacity: 1, y: 0 }, transition: { duration: 1, delay: d, ease: EASE } });
  return (
    <section className="hero3">
      <HeroScene data={data} />
      <div className="hero3-scrim" aria-hidden="true" />
      <div className="wrap hero3-copy">
        <h1>
          <motion.span {...line(0.1)}>Signatures can be stolen.</motion.span>
          <motion.span {...line(0.25)} className="hero3-accent">Conservation can't.</motion.span>
        </h1>
        <motion.p {...line(0.45)}>BridgeWitness checks every bridge payout against a real deposit, and flags the hack the moment one has none.</motion.p>
        <motion.div {...line(0.6)} className="hero3-ctas">
          <Cta to="/console/live?feed=nomad">Watch the Nomad hack</Cta>
          <Link to="/docs/architecture" className="textlink">How it works</Link>
        </motion.div>
      </div>
    </section>
  );
}

/* ── sections ──────────────────────────────────────────────────────────── */

function Proof({ m }: { m: Metrics | null }) {
  if (!m) return <section className="proof3 wrap" aria-busy="true"><div className="skel" /><div className="skel" /><div className="skel" /></section>;
  const nm = m.feeds.nomad, rn = m.feeds.ronin;
  const caught = nm.attack_flagged_exploit + rn.attack_flagged_exploit, total = nm.attack_releases + rn.attack_releases;
  const normal = nm.withdrawals - nm.attack_releases + rn.withdrawals - rn.attack_releases;
  return (
    <section className="proof3 wrap">
      <Rise><div className="proof3-n"><Ticker to={caught} /><em>/{total}</em></div><p>real attack payouts labelled exploit, across the Nomad and Ronin hacks</p></Rise>
      <Rise delay={0.08}><div className="proof3-n"><Ticker to={nm.normal_false_exploit + rn.normal_false_exploit} /></div><p>honest payouts wrongly accused, out of {NUM.format(normal)}</p></Rise>
      <Rise delay={0.16}><div className="proof3-n proof3-n--bad"><Ticker to={nm.counterfactual?.attack_usd ?? 0} format={(v) => usdM(v)} /></div><p>left Nomad with no deposit behind it</p></Rise>
    </section>
  );
}

function Versus({ m }: { m: Metrics | null }) {
  const nm = m?.feeds.nomad, rn = m?.feeds.ronin;
  return (
    <section className="vs wrap">
      <Rise className="vs-head"><h2>Two hacks. Two different ways in. The same broken promise.</h2></Rise>
      <div className="vs-grid">
        <Rise className="vs-card">
          <span className="vs-when">Ronin · March 2022</span>
          <b className="mono">{rn?.counterfactual ? usdM(rn.counterfactual.attack_usd) : '…'}</b>
          <p>Dataset total; the loss is widely quoted as $624M. Attackers held 5 of the 9 validator keys. Every signature was genuine, so signature checks saw nothing wrong. Two payouts, 115 seconds apart.</p>
        </Rise>
        <div className="vs-mid" aria-hidden="true"><Scales size={28} weight="light" /></div>
        <Rise className="vs-card" delay={0.1}>
          <span className="vs-when">Nomad · August 2022</span>
          <b className="mono">{nm?.counterfactual ? usdM(nm.counterfactual.attack_usd) : '…'}</b>
          <p>A bug let anyone withdraw money that was never deposited. One person found it, then hundreds pasted the same transaction with their own address.</p>
        </Rise>
      </div>
      <Rise className="vs-rule"><p>In both, coins left the bridge that were never locked on the other side. <b>That is the one thing we check, every payout, every time.</b></p></Rise>
    </section>
  );
}

function DotField({ n }: { n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const cols = 110, rows = Math.ceil(n / cols), s = 6, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = cols * s * dpr; c.height = rows * s * dpr; c.style.aspectRatio = `${cols} / ${rows}`;
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.fillStyle = 'rgba(47,212,181,0.55)';
    for (let i = 0; i < n; i++) g.fillRect((i % cols) * s, Math.floor(i / cols) * s, 3, 3);
  }, [n]);
  return <canvas ref={ref} className="dotfield" role="img" aria-label={`${n} unseen normal payouts, one dot each, none flagged`} />;
}

function Spark({ data }: { data: Replay | null }) {
  if (!data) return <div className="spark skel" />;
  const k = data.ticks, max = Math.max(1, ...k.map((x) => x.cluster_max)), t0 = k[0]?.t ?? 0, t1 = k[k.length - 1]?.t ?? 1;
  const d = k.map((x, i) => `${i ? 'L' : 'M'}${(((x.t - t0) / (t1 - t0)) * 100).toFixed(2)},${(40 - (x.cluster_max / max) * 38).toFixed(2)}`).join(' ');
  return (
    <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`Biggest copycat cluster over the Nomad replay, peaking at ${max}`}>
      <path d={`${d} L100,40 L0,40 Z`} className="spark-a" /><path d={d} className="spark-l" />
    </svg>
  );
}

function Ideas({ m, data }: { m: Metrics | null; data: Replay | null }) {
  const nm = m?.feeds.nomad, s = m?.signer_dna;
  const idOnly = nm?.scorecard.find((r) => r.method.startsWith('B3'))?.attack_flagged ?? '…';
  const idPct = (() => { const [a, b] = idOnly.split('/').map(Number); return b ? (a / b) * 100 : 0; })();
  return (
    <section className="ideas3 wrap" id="ideas">
      <Rise className="ideas3-head">
        <span className="eyebrow">Four ideas</span>
        <h2>Each one answers a part of the challenge, on real data.</h2>
      </Rise>
      <div className="bento">
        <Cell to="/console/budget" className="b-budget">
          <header><Graph size={22} weight="light" /><h3>Accusation Budget</h3></header>
          <p>Warning signs add up to evidence. Only a broken deposit rule can say "exploit".</p>
          {nm ? <DotField n={nm.heldout_normal} /> : <div className="skel" style={{ height: 120 }} />}
          <footer><b className="mono">{nm ? `${nm.heldout_false_alarms} of ${NUM.format(nm.heldout_normal)}` : '…'}</b> unseen normal Nomad payouts raised a false alarm</footer>
        </Cell>
        <Cell to="/console/signers" className="b-signers">
          <header><Fingerprint size={22} weight="light" /><h3>Signer DNA</h3></header>
          <p>The real Ronin signers, recovered from the signatures inside each transaction.</p>
          <div className="vals3">{(s?.validators ?? Array.from({ length: 9 }, () => null)).map((v, i) => (
            <span key={i} className={v?.signed_attack ? 'on' : ''} title={v?.addr}><i>{v ? v.addr.slice(2, 6) : ''}</i></span>))}</div>
          <footer><b className="mono">5 of 9</b> signed the attack. The same group also signed {s ? `${(s.attack_quorum_share * 100).toFixed(1)}%` : '…'} of normal payouts, so the clue was elsewhere:</footer>
          {s && <div className="idmini">
            <div><span>Highest normal withdrawal ID</span><b className="mono">{NUM.format(s.normal_id_max)}</b></div>
            <div className="bad"><span>Attack withdrawal ID</span><b className="mono">{NUM.format(s.attack_ids[0])}</b></div>
          </div>}
        </Cell>
        <Cell to="/console/contagion" className="b-contagion">
          <header><TreeStructure size={22} weight="light" /><h3>Contagion Radar</h3></header>
          <p>Copy-paste payouts grouped into one swarm, with a fitted spread number.</p>
          <Spark data={data} />
          <footer><b className="mono">{nm ? nm.max_cluster : '…'}</b> payouts in the biggest Nomad copycat cluster</footer>
        </Cell>
        <Cell to="/console/pairing" className="b-pairing">
          <header><Cube size={22} weight="light" /><h3>Ledger Pairing</h3></header>
          <p>Every coin out must pair with one coin in, matched by amount, person and timing.</p>
          <div className="pairbars">
            <div><span>Match by message ID</span><i style={{ width: `${idPct}%` }} /><b className="mono">{idOnly}</b></div>
            <div className="ours"><span>Ledger pairing</span><i style={{ width: '100%' }} /><b className="mono">{nm ? `${nm.attack_flagged_exploit}/${nm.attack_releases}` : '…'}</b></div>
          </div>
          <footer>Nomad attack payouts caught. Copycats reused real message IDs.</footer>
        </Cell>
      </div>
    </section>
  );
}

const STEPS: [string, string][] = [
  ['Read', 'Deposits on one chain, payouts on the other, replayed from real hacks or read live.'],
  ['Pair', 'Each payout is matched to exactly one deposit. A deposit can only be used once.'],
  ['Measure', 'Spread, volume, signers and size, each compared with recent normal traffic.'],
  ['Decide', 'Exploit only when the deposit rule breaks. Statistics alone can only say suspicious.'],
  ['Explain', 'Attack type, top reasons, the closest past hack, and a check anyone can repeat.'],
];

function Steps() {
  const ref = useRef<HTMLOListElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 75%', 'end 55%'] });
  const h = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  return (
    <section className="steps3 wrap">
      <Rise className="steps3-head"><h2>From a payout to a verdict.</h2><p>Five steps run on every payout, in order, as it arrives.</p></Rise>
      <ol ref={ref} className="steps3-list">
        <motion.span className="steps3-fill" style={{ height: h }} aria-hidden="true" />
        {STEPS.map(([k, v], i) => (
          <Rise key={k} delay={i * 0.04}><li><b>{k}</b><p>{v}</p></li></Rise>
        ))}
      </ol>
    </section>
  );
}

function Showcase() {
  return (
    <section className="show wrap">
      <Rise className="show-copy">
        <h2>Watch it catch a real hack.</h2>
        <p>The console replays Nomad and Ronin payout by payout. Every alert comes with a risk score, the likely attack, its reasons and a check you can repeat.</p>
        <div className="show-links">
          <Link to="/console/map" className="textlink"><ShieldWarning size={16} weight="light" /> Open the 3D map</Link>
          <Link to="/console/evidence" className="textlink">Check a payout yourself</Link>
          <Link to="/console/results" className="textlink">See every result</Link>
        </div>
      </Rise>
      <Rise className="show-frame" delay={0.1}>
        <div className="show-bezel"><img src="/img/console.webp" alt="The live console during the Nomad replay: an exploit alert with risk 98, its reasons, and the 3D map of payouts" loading="lazy" /></div>
      </Rise>
    </section>
  );
}

function Closing() {
  return (
    <section className="close3 wrap">
      <Rise><h2>Coins out can never exceed coins in.</h2><Cta to="/console/live">Open the console</Cta></Rise>
    </section>
  );
}

export function Landing() {
  const m = useMetrics();
  const { data } = useReplayData('nomad');
  return (
    <>
      <Hero data={data} />
      <Proof m={m} />
      <Versus m={m} />
      <Ideas m={m} data={data} />
      <Steps />
      <Showcase />
      <Closing />
    </>
  );
}
