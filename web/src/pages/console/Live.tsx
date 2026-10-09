import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCard } from '../../live/AlertCard';
import { LiveGraph } from '../../live/LiveGraph';
import { Map3D } from '../../live/Map3D';
import { CHARTS, Timeline } from '../../live/Timelines';
import { FEEDS, TYPE_SHORT, human, useClock, useLive, useReplayData, useView, type Ev, type FeedId, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/live.css';

const SPEEDS = [60, 300, 1000, 3000];

export default function Live() {
  const [qs, setQs] = useSearchParams();
  const feed = (qs.get('feed') as FeedId) ?? 'nomad';
  const setFeed = (f: FeedId) => setQs({ feed: f }, { replace: true });
  return (
    <div className="live">
      <div className="live-feeds" role="tablist" aria-label="Choose what to watch">
        {FEEDS.map((f) => (
          <button key={f.id} role="tab" aria-selected={feed === f.id} className="feed-btn" onClick={() => setFeed(f.id)}>
            <b>{f.label}</b><span>{f.note}</span>
          </button>))}
      </div>
      {feed === 'live' ? <LiveTail /> : <ReplayView feed={feed} />}
    </div>
  );
}

function ReplayView({ feed }: { feed: string }) {
  const { data, err } = useReplayData(feed);
  if (err) return <div className="plate live-msg">Could not load this replay: {err}</div>;
  if (!data) return <div className="plate live-msg label">Loading the replay…</div>;
  return <Console data={data} />;
}

/** ?t=<unix seconds> deep-links to a moment in the replay (demo links, screenshots). */
function useStartParam() {
  const [qs] = useSearchParams();
  const v = Number(qs.get('t'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

function Console({ data }: { data: Replay }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [t, setT] = useClock(data.window, speed, playing);
  const v = useView(data, t)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [view3d, setView3d] = useState(true);
  const startAt = useStartParam();
  const [tour, setTour] = useState(!startAt);
  useEffect(() => { if (startAt) setT(Math.min(Math.max(startAt, data.window[0]), data.window[1])); }, [data, startAt]);
  const firstAttack = useMemo(() => data.events.find((e) => e.truth === 'attack')?.ts, [data]);
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);

  // Guided flow: stop on the first alert and open it, so a viewer sees the moment the deposit rule breaks.
  const paused = useRef(false);
  useEffect(() => { paused.current = false; setSelected(null); }, [data]);
  useEffect(() => {
    if (tour && !paused.current && v.alerts.length > 0) {
      paused.current = true; setPlaying(false); setSelected(v.alerts[0].id);
    }
  }, [v.alerts.length, tour]);

  const top = selected ? byId.get(selected) ?? null : v.alerts[v.alerts.length - 1] ?? null;
  const progress = (t - data.window[0]) / (data.window[1] - data.window[0]);
  const m = data.metrics;
  const nNow = v.last?.hawkes_n ?? 0;
  const suspicious = v.alerts.length - v.exploits.length;

  return (
    <>
      <details className="howto" open={!playing && v.n < 3}>
        <summary>How to read this page</summary>
        <ol>
          <li><b>Press Play.</b> Every payout on the destination chain is checked against the deposits made on the source chain.</li>
          <li><b>It stops at the first alert.</b> Green dots are payouts with a deposit behind them; copper dots have none.</li>
          <li><b>Click Why or Check it</b> in the alert card to see the reasons, and try the check yourself.</li>
        </ol>
      </details>

      <div className="live-transport plate">
        <button className="btn btn--sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : t >= data.window[1] ? 'Finished' : 'Play'}</button>
        <div className="row" style={{ gap: 4 }} title="Replay speed">
          {SPEEDS.map((s) => <button key={s} className="btn btn--line btn--sm" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
        {firstAttack && <button className="btn btn--line btn--sm" onClick={() => { setT(firstAttack - 180); setPlaying(true); }}>Skip to the attack</button>}
        <input className="live-scrub" type="range" min={data.window[0]} max={data.window[1]} value={Math.floor(t)} aria-label="Replay time"
          onChange={(e) => setT(+e.target.value)} style={{ ['--p' as string]: `${progress * 100}%` }} />
        <span className="mono live-clock">{utc(t).slice(5, 19)}</span>
        <label className="row small dim" style={{ gap: 6 }}><input type="checkbox" checked={tour} onChange={(e) => setTour(e.target.checked)} /> stop at the first alert</label>
      </div>

      <div className="live-stats">
        <Stat k="Payouts checked" v={v.withdrawals.length.toLocaleString()} />
        <Stat k="Backed by a deposit" v={usd(v.backed)} tone="ok" />
        <Stat k="No deposit behind it" v={usd(v.unbacked)} tone={v.unbacked > 0 ? 'bad' : undefined} />
        <Stat k="Exploit alerts" v={String(v.exploits.length)} tone={v.exploits.length ? 'bad' : undefined} />
        <Stat k="Suspicious (advice only)" v={String(suspicious)} tone={suspicious ? 'warn' : undefined} />
        <Stat k="Attack spread" v={nNow.toFixed(2)} tone={nNow > 0.8 ? 'bad' : undefined} sub={nNow > 0.8 ? 'spreading by itself' : nNow > 0.3 ? 'building' : 'quiet'} />
      </div>

      <div className="live-main">
        <section className="plate live-graph">
          <header className="plate-head"><span className="label">Where the money goes · {data.label}</span>
            <span className="seg" role="tablist" aria-label="Graph style"><button aria-selected={view3d} onClick={() => setView3d(true)}>3D map</button><button aria-selected={!view3d} onClick={() => setView3d(false)}>Network</button></span>
            <span className="legend"><i className="lg-ok" />payout with a deposit <i className="lg-bad" />payout with no deposit <i className="lg-warn" />suspicious <i className="lg-cl" />copycat cluster <i className="lg-src" />source chain <i className="lg-vault" />bridge vault</span></header>
          {view3d ? <Map3D data={data} n={v.n} selected={top?.id ?? null} onSelect={setSelected} spin={!playing} /> : <LiveGraph data={data} n={v.n} selected={top?.id ?? null} onSelect={setSelected} />}
        </section>
        <aside className="live-side">
          <AlertCard e={top} data={data} />
          <AlertQueue alerts={v.alerts} selected={top?.id ?? null} onSelect={setSelected} />
        </aside>
      </div>

      <div className="live-tl plate">{CHARTS.map((c, i) => <Timeline key={c.title} data={data} t={t} spec={c} idx={i} />)}</div>

      <section className="plate summary">
        <header className="plate-head"><span className="label">This replay in numbers</span><Link className="small" to="/console/results">All results →</Link></header>
        <div className="plate-body small">
          <p><b>{m.attack_flagged_exploit} of {m.attack_releases}</b> attack payouts were labelled “exploit”, and <b>{m.normal_false_exploit}</b> honest payouts ever were.</p>
          <p>On {m.heldout_days} days of normal traffic the models had never seen ({m.heldout_normal.toLocaleString()} payouts) there were <b>{m.heldout_false_alarms}</b> statistical false alarm{m.heldout_false_alarms === 1 ? '' : 's'}.</p>
          <p className="dim">Statistics alone, with the deposit rule switched off, flag {m.stat_alarms_on_attack} of {m.attack_releases} attack payouts{m.max_cluster > 1 ? `; the biggest copycat cluster reached ${m.max_cluster}` : ''}. The deposit rule is what makes the final call.</p>
        </div>
      </section>
    </>
  );
}

const Stat = ({ k, v, tone, sub }: { k: string; v: string; tone?: 'ok' | 'bad' | 'warn'; sub?: string }) => (
  <div className={`stat ${tone ? `stat--${tone}` : ''}`}><span className="label">{k}</span><b className="mono">{v}</b>{sub && <small>{sub}</small>}</div>
);

function AlertQueue({ alerts, selected, onSelect }: { alerts: Ev[]; selected: string | null; onSelect: (id: string) => void }) {
  const list = alerts.slice(-60).reverse();
  return (
    <section className="plate aq">
      <header className="plate-head"><span className="label">Alerts so far · {alerts.length}</span></header>
      <ol className="aq-list">
        {list.length === 0 && <li className="dim small">Nothing flagged yet.</li>}
        {list.map((e) => (
          <li key={e.id}><button className={`aq-row aq--${e.level} ${selected === e.id ? 'is-sel' : ''}`} onClick={() => onSelect(e.id)}>
            <span className="mono" title="Risk 0 to 100">{e.risk}</span>
            <span>{TYPE_SHORT[e.type ?? ''] ?? e.level}</span>
            <span className="mono dim">{e.symbol} {human(e.amount, e.decimals, 1)}</span>
            <span className="mono dim">{utc(e.ts).slice(11, 19)}</span>
          </button></li>))}
      </ol>
    </section>
  );
}

const usdSmall = (v: number) => (v < 10 ? '$' + v.toFixed(2) : usd(v));
const CHAIN: Record<number, string> = { 1: 'Ethereum', 10: 'Optimism', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum', 59144: 'Linea', 324: 'zkSync' };
const VERDICT_TEXT: Record<string, string> = { consistent: 'Backed', pending: 'Waiting', overdue: 'Late', unknown: 'Not enough data', violation: 'No deposit' };

function LiveTail() {
  const { live, err } = useLive(true);
  return (
    <section className="plate">
      <header className="plate-head"><span className="label">A real bridge, right now · Across</span>
        {live && <span className="mono small dim">updated {new Date(live.polled_at * 1000).toLocaleTimeString()}</span>}</header>
      <div className="plate-body">
        {err && <p className="bad">{err}</p>}
        {live?.error && <p className="warn">{live.error}</p>}
        <p className="lede">These are the latest real transfers on the Across bridge, checked live. The rule is simple: <b>the value paid out must not exceed the value deposited</b> (we allow 1% + $1 for price rounding). Our learned models stay silent here on purpose: they have no history for these routes, and say so instead of guessing.</p>
        {live && <div className="live-stats">{Object.entries(live.counts).map(([k, n]) => <Stat key={k} k={VERDICT_TEXT[k] ?? k} v={String(n)} tone={k === 'violation' && n ? 'bad' : k === 'consistent' ? 'ok' : undefined} />)}</div>}
        <div style={{ overflowX: 'auto' }}><table className="sc"><thead><tr><th>Result</th><th>Route</th><th>Token</th><th>Deposited</th><th>Paid out</th><th>Took</th><th>Deposit transaction</th></tr></thead><tbody>
          {live?.rows.map((r) => <tr key={r.id}><td className={`v-${r.verdict}`}>{VERDICT_TEXT[r.verdict]}</td><td>{CHAIN[r.src] ?? `chain ${r.src}`} → {CHAIN[r.dst] ?? `chain ${r.dst}`}</td><td>{r.symbol ?? '?'}</td>
            <td className="mono">{r.in_usd == null ? '—' : usdSmall(r.in_usd)}</td><td className="mono">{r.out_usd == null ? '—' : usdSmall(r.out_usd)}</td>
            <td className="mono">{r.delay_s == null ? '—' : r.delay_s <= 0 ? 'under 1 s' : `${r.delay_s} s`}</td><td className="mono dim">{r.deposit_tx?.slice(0, 10)}…</td></tr>)}
        </tbody></table></div>
      </div>
    </section>
  );
}
