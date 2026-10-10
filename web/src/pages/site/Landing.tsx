import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { animate, motion, useInView, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { ArrowRight, Cube, Fingerprint, Graph, TreeStructure } from '@phosphor-icons/react';
import { Ledger } from '../../live/Ledger';
import { useClock, useMetrics, useReplayData, useView, type Metrics, type Replay } from '../../live/data';
import { usd } from '../../lib/format';
import '../../live/live.css';
import '../../live/ws.css';
import '../../app/landing.css';

const NUM = new Intl.NumberFormat('en-US');
const EASE = [0.16, 1, 0.3, 1] as const;
const usdM = (v: number) => `$${(v / 1e6).toFixed(1)}M`;

/* ── shared pieces ─────────────────────────────────────────────────────── */

export const Cta = ({ to, children, ghost }: { to: string; children: ReactNode; ghost?: boolean }) => (
  <Link to={to} className={`cta${ghost ? ' cta--ghost' : ''}`}><span>{children}</span><ArrowRight size={16} weight="bold" aria-hidden="true" /></Link>
);

/** Counts up once when scrolled into view. Writes to the DOM directly, never through React state. */
function Ticker({ to, format = (v: number) => NUM.format(Math.round(v)) }: { to: number; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!ref.current) return;
    if (!seen || reduce) { ref.current.textContent = format(to); return; }
    const c = animate(0, to, { duration: 1.4, ease: EASE, onUpdate: (v) => { if (ref.current) ref.current.textContent = format(v); } });
    return () => c.stop();
  }, [seen, to, reduce]);
  return <span ref={ref}>{format(to)}</span>;
}

const Rise = ({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) => {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.7, delay, ease: EASE }}>{children}</motion.div>
  );
};

/* ── hero: the real conservation ledger, replaying Nomad on a loop ─────── */

function HeroLedger({ data }: { data: Replay }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [w0, w1] = data.window;
  // Show the whole replay, but start the clock 30 min before the first attack payout:
  // the backed traffic before it is already on screen, and the attack arrives within seconds.
  const firstAttack = useMemo(() => data.events.find((e) => e.truth === 'attack')?.ts ?? w0, [data]);
  const from = Math.max(w0, firstAttack - 1800);
  const domain = data.window;
  const [t, setT] = useClock([from, w1], (w1 - from) / 24, !reduce);
  useEffect(() => { if (reduce) setT(w1); }, [reduce]);
  useEffect(() => {
    if (reduce || t < w1) return;
    const id = setTimeout(() => setT(from), 3500); // hold on the full picture, then replay
    return () => clearTimeout(id);
  }, [t >= w1, reduce]);
  const v = useView(data, t)!;
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  return (
    <figure className="hero-ledger">
      <figcaption className="hero-ledger-cap">
        <span>Nomad bridge · 1 Aug 2022 · recorded data</span>
        <span className={v.unbacked ? 'bad mono' : 'ok mono'}>{usd(v.unbacked)} <small>not backed</small></span>
      </figcaption>
      <Ledger data={data} n={v.n} t={t} domain={domain} selected={null} focus={null}
        onSelect={(id) => { const e = byId.get(id); if (e) navigate(`/console/live?feed=nomad&t=${e.ts}`); }} />
    </figure>
  );
}

function Hero({ data }: { data: Replay | null }) {
  const reduce = useReducedMotion();
  const line = (d: number) => (reduce ? {} : { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.8, delay: d, ease: EASE } });
  return (
    <section className="hero4 wrap">
      <div className="hero4-copy">
        <h1>
          <motion.span {...line(0.05)}>Signatures can be stolen.</motion.span>
          <motion.span {...line(0.15)} className="hero4-accent">Conservation can't.</motion.span>
        </h1>
        <motion.p {...line(0.3)}>BridgeWitness checks every cross-chain payout against the deposit that should back it, and flags the payout that has none.</motion.p>
        <motion.div {...line(0.45)} className="hero4-ctas">
          <Cta to="/console/live?feed=nomad">Replay the Nomad hack</Cta>
          <Link to="/docs/architecture" className="textlink">How it works</Link>
        </motion.div>
      </div>
      <motion.div {...line(0.2)} className="hero4-vis">
        {data ? <HeroLedger data={data} /> : <div className="hero-ledger hero-ledger--wait" aria-busy="true"><span className="ws-skel" /></div>}
        <p className="hero4-note">Deposits above the line, payouts below. Teal payouts are tethered to their deposit; red ones have none. Click a payout to open it in the console.</p>
      </motion.div>
    </section>
  );
}

/* ── sections ──────────────────────────────────────────────────────────── */

function Proof({ m }: { m: Metrics | null }) {
  if (!m) return <section className="wrap"><div className="l-proof" aria-busy="true"><div className="ws-skel" /></div></section>;
  const nm = m.feeds.nomad, rn = m.feeds.ronin;
  const caught = nm.attack_flagged_exploit + rn.attack_flagged_exploit, total = nm.attack_releases + rn.attack_releases;
  const normal = nm.withdrawals - nm.attack_releases + rn.withdrawals - rn.attack_releases;
  return (
    <section className="wrap">
      <dl className="l-proof">
        <div><dd className="mono ok"><Ticker to={caught} /><em>/{total}</em></dd><dt>real attack payouts labelled exploit, across the Nomad and Ronin hacks</dt></div>
        <div><dd className="mono ok"><Ticker to={nm.normal_false_exploit + rn.normal_false_exploit} /></dd><dt>honest payouts wrongly accused, out of {NUM.format(normal)}</dt></div>
        <div><dd className="mono bad"><Ticker to={nm.counterfactual?.attack_usd ?? 0} format={(v) => usdM(v)} /></dd><dt>left Nomad with no deposit behind it (dataset prices)</dt></div>
      </dl>
    </section>
  );
}

function Versus({ m }: { m: Metrics | null }) {
  const nm = m?.feeds.nomad, rn = m?.feeds.ronin;
  return (
    <section className="l-sec wrap">
      <Rise><h2 className="l-h">Two hacks. Two different ways in. The same broken promise.</h2></Rise>
      <div className="l-vs">
        <Rise className="l-vs-c">
          <span className="l-vs-when">Ronin · March 2022</span>
          <b className="mono">{rn?.counterfactual ? usdM(rn.counterfactual.attack_usd) : '…'}</b>
          <p>Dataset total; the loss is widely quoted as $624M. Attackers held 5 of the 9 validator keys. Every signature was genuine, so signature checks saw nothing wrong. Two payouts, 115 seconds apart.</p>
        </Rise>
        <Rise className="l-vs-c" delay={0.08}>
          <span className="l-vs-when">Nomad · August 2022</span>
          <b className="mono">{nm?.counterfactual ? usdM(nm.counterfactual.attack_usd) : '…'}</b>
          <p>A bug let anyone withdraw money that was never deposited. One person found it, then hundreds pasted the same transaction with their own address.</p>
        </Rise>
      </div>
      <Rise className="l-rule"><p>In both, coins left the bridge that were never locked on the other side. <b>That is the one thing we check, every payout, every time.</b></p></Rise>
    </section>
  );
}

function DotField({ n }: { n: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const cols = 110, rows = Math.ceil(n / cols), s = 6, dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = cols * s * dpr; c.height = rows * s * dpr; c.style.aspectRatio = `${cols} / ${rows}`;
    const g = c.getContext('2d')!; g.scale(dpr, dpr); g.fillStyle = 'rgba(47,212,181,0.6)';
    for (let i = 0; i < n; i++) g.fillRect((i % cols) * s, Math.floor(i / cols) * s, 3, 3);
  }, [n]);
  return <canvas ref={ref} className="dotfield" role="img" aria-label={`${n} unseen normal payouts, one dot each, none flagged`} />;
}

function Spark({ data }: { data: Replay | null }) {
  if (!data) return <div className="spark ws-skel" />;
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
    <section className="l-sec wrap" id="ideas">
      <Rise><h2 className="l-h">Four checks, each answering part of the challenge on real data.</h2></Rise>
      <div className="l-bento">
        <Link to="/console/budget" className="l-cell b-budget">
          <header><Graph size={22} weight="light" /><h3>Accusation Budget</h3></header>
          <p>Warning signs add up to evidence. Only a broken deposit rule can say “exploit”.</p>
          {nm ? <DotField n={nm.heldout_normal} /> : <div className="ws-skel" style={{ height: 120 }} />}
          <footer><b className="mono">{nm ? `${nm.heldout_false_alarms} of ${NUM.format(nm.heldout_normal)}` : '…'}</b> unseen normal Nomad payouts raised a false alarm</footer>
        </Link>
        <Link to="/console/signers" className="l-cell b-signers">
          <header><Fingerprint size={22} weight="light" /><h3>Signer DNA</h3></header>
          <p>The real Ronin signers, recovered from the signatures inside each transaction.</p>
          <div className="vals3">{(s?.validators ?? Array.from({ length: 9 }, () => null)).map((v, i) => (
            <span key={i} className={v?.signed_attack ? 'on' : ''} title={v?.addr}><i>{v ? v.addr.slice(2, 6) : ''}</i></span>))}</div>
          <footer><b className="mono">5 of 9</b> signed the attack. The same group also signed {s ? `${(s.attack_quorum_share * 100).toFixed(1)}%` : '…'} of normal payouts, so the clue was elsewhere:</footer>
          {s && <div className="idmini">
            <div><span>Highest normal withdrawal ID</span><b className="mono">{NUM.format(s.normal_id_max)}</b></div>
            <div className="is-bad"><span>Attack withdrawal ID</span><b className="mono">{NUM.format(s.attack_ids[0])}</b></div>
          </div>}
        </Link>
        <Link to="/console/contagion" className="l-cell b-contagion">
          <header><TreeStructure size={22} weight="light" /><h3>Contagion Radar</h3></header>
          <p>Copy-paste payouts grouped into one swarm, with a fitted spread number.</p>
          <Spark data={data} />
          <footer><b className="mono">{nm ? nm.max_cluster : '…'}</b> payouts in the biggest Nomad copycat cluster</footer>
        </Link>
        <Link to="/console/pairing" className="l-cell b-pairing">
          <header><Cube size={22} weight="light" /><h3>Ledger Pairing</h3></header>
          <p>Every coin out must pair with one coin in, matched by amount, recipient and timing.</p>
          <div className="pairbars">
            <div><span>Match by message ID</span><i><em style={{ width: `${idPct}%` }} /></i><b className="mono">{idOnly}</b></div>
            <div className="ours"><span>Ledger pairing</span><i><em style={{ width: '100%' }} /></i><b className="mono">{nm ? `${nm.attack_flagged_exploit}/${nm.attack_releases}` : '…'}</b></div>
          </div>
          <footer>Nomad attack payouts caught. Copycats reused real message IDs.</footer>
        </Link>
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
    <section className="l-sec l-steps wrap">
      <Rise className="l-steps-head"><h2 className="l-h">From a payout to a verdict.</h2><p>Five steps run on every payout, in order, as it arrives.</p></Rise>
      <ol ref={ref} className="l-steps-list">
        <motion.span className="l-steps-fill" style={{ height: h }} aria-hidden="true" />
        {STEPS.map(([k, v], i) => <Rise key={k} delay={i * 0.04}><li><span className="mono">{i + 1}</span><b>{k}</b><p>{v}</p></li></Rise>)}
      </ol>
    </section>
  );
}

function Showcase() {
  return (
    <section className="l-sec l-show wrap">
      <Rise className="l-show-copy">
        <h2 className="l-h">Watch it catch a real hack.</h2>
        <p>The console replays Nomad and Ronin payout by payout. Every alert opens a case file: the payout, the deposit search, the statistical signals, the suspected type and an evidence bundle you can re-check.</p>
        <div className="l-links">
          <Link to="/console/live?feed=nomad" className="textlink">Open the live console <ArrowRight size={14} /></Link>
          <Link to="/console/evidence" className="textlink">Check a payout yourself <ArrowRight size={14} /></Link>
          <Link to="/console/results" className="textlink">See every result <ArrowRight size={14} /></Link>
        </div>
      </Rise>
      <Rise className="l-shot" delay={0.08}>
        <img src="/img/console.webp" width={1440} height={1000} loading="lazy"
          alt="The live console during the Nomad replay: $159.4M paid out without a valid deposit, the replay timeline, the conservation ledger and an open case file for a payout paid to the wrong person." />
      </Rise>
    </section>
  );
}

function Closing() {
  return (
    <section className="l-close wrap">
      <Rise className="l-close-in"><h2 className="l-h">Coins out can never exceed coins in.</h2><Cta to="/console/live">Open the console</Cta></Rise>
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
