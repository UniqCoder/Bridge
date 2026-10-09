import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCard } from '../../live/AlertCard';
import { LiveGraph } from '../../live/LiveGraph';
import { CHARTS, Timeline } from '../../live/Timelines';
import { FEEDS, TYPE_SHORT, human, useClock, useLive, useReplayData, useView, type Ev, type FeedId, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/live.css';

const Map3D = lazy(() => import('../../live/Map3D').then((m) => ({ default: m.Map3D })));

const SPEEDS = [60, 300, 1000, 3000];

export default function Live() {
  const [qs, setQs] = useSearchParams();
  const requested = qs.get('feed');
  const feed = FEEDS.some((f) => f.id === requested) ? requested as FeedId : 'nomad';
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
  return <Console key={data.feed} data={data} />;
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
  const [showMap, setShowMap] = useState(false);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const startAt = useStartParam();
  const [tour, setTour] = useState(!startAt);
  useEffect(() => { if (startAt) setT(Math.min(Math.max(startAt, data.window[0]), data.window[1])); }, [data, startAt]);
  const attacks = useMemo(() => data.events.filter((e) => e.kind === 'withdrawal' && e.truth === 'attack'), [data]);
  const firstAttack = attacks[0]?.ts;
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  const alertsBefore = (ts: number) => data.events.filter((e) => e.kind === 'withdrawal' && e.ts <= ts && e.level && e.level !== 'none').length;

  // Guided flow: stop on the next alert after a launch and open it, so a viewer sees the moment the deposit rule breaks.
  const armed = useRef<number | null>(0);
  useEffect(() => { armed.current = 0; setSelected(null); setPausedAt(null); }, [data]);
  useEffect(() => {
    if (tour && armed.current != null && v.alerts.length > armed.current) {
      const hit = v.alerts[armed.current];
      armed.current = null; setPlaying(false); setSelected(hit.id); setT(hit.ts);
    }
  }, [v.alerts.length, tour]);
  const launch = (ts: number) => { const at = Math.max(data.window[0], ts - 120); armed.current = alertsBefore(at); setPausedAt(null); setSelected(null); setT(at); setPlaying(true); };

  const top = selected ? byId.get(selected) ?? null : v.alerts[v.alerts.length - 1] ?? null;
  const allAlerts = useMemo(() => data.events.filter((e) => e.kind === 'withdrawal' && e.level && e.level !== 'none'), [data]);
  const curIdx = top ? allAlerts.findIndex((e) => e.id === top.id) : -1;
  const nextAlert = curIdx >= 0 ? allAlerts[curIdx + 1] : allAlerts.find((e) => e.ts > t);
  const prevAlert = curIdx > 0 ? allAlerts[curIdx - 1] : null;
  const goto = (e: Ev) => { setPlaying(false); armed.current = null; setT(e.ts); setSelected(e.id); };
  const reset = () => { setPlaying(false); setT(data.window[0]); armed.current = 0; setSelected(null); setPausedAt(null); };
  const progress = (t - data.window[0]) / (data.window[1] - data.window[0]);
  const nNow = v.last?.hawkes_n ?? 0;
  const suspicious = v.alerts.length - v.exploits.length;
  const caught = v.exploits.filter((e) => e.truth === 'attack').length;
  const seenAttacks = v.withdrawals.filter((e) => e.truth === 'attack').length;

  // Attack Lab: one button per practice scenario (attacks and honest controls).
  const scenarios = useMemo(() => {
    const m = new Map<string, { ts: number; attack: boolean }>();
    for (const e of data.events) if (e.scenario && !m.has(e.scenario)) m.set(e.scenario, { ts: e.ts, attack: e.truth === 'attack' });
    return [...m.entries()].sort((x, y) => Number(y[1].attack) - Number(x[1].attack));
  }, [data]);

  return (
    <>
      {scenarios.length > 0 && <section className="plate lab">
        <span className="label">Attack Lab · pick one, watch it get caught</span>
        <div className="lab-btns">{scenarios.map(([name, sc]) => (
          <button key={name} className={`btn btn--sm ${sc.attack ? '' : 'btn--line'}`} onClick={() => launch(sc.ts)} title={sc.attack ? 'Launch this attack' : 'Honest traffic: should raise no exploit alert'}>
            {sc.attack ? '▶ ' : ''}{name}</button>))}</div>
      </section>}

      <section className="ctx plate">
        <div><span className="ctx-k">Watching</span><b>{data.label.split(' · ')[0]} bridge</b></div>
        <div><span className="ctx-k">Route</span><b>{routeText(data.route)}</b></div>
        <div><span className="ctx-k">Data</span><b>{scenarios.length ? 'Practice attacks injected into real traffic' : 'Replay of recorded on-chain data'}</b><small>{data.label.split(' · ')[1] ?? ''}</small></div>
        <div><span className="ctx-k">State</span><b className={top?.level === 'exploit' ? 'bad' : playing ? 'ok' : ''}>{playing ? '● Replaying' : top?.level === 'exploit' ? '✗ Stopped on an exploit alert' : t >= data.window[1] ? 'Replay finished' : '❚❚ Paused'}</b><small>{utc(t).slice(0, 16)} UTC</small></div>
      </section>

      <div className="live-transport plate">
        <button className="btn btn--sm" onClick={() => { if (t >= data.window[1]) { setT(data.window[0]); armed.current = 0; setSelected(null); setPausedAt(null); } setPlaying((p) => !p); }} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : t >= data.window[1] ? 'Replay' : 'Play'}</button>
        <div className="row" style={{ gap: 4 }} title="Replay speed">
          {SPEEDS.map((s) => <button key={s} className="btn btn--line btn--sm" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
        <button className="btn btn--line btn--sm" onClick={reset} title="Back to the start of the replay">⟲ Reset</button>
        <button className="btn btn--line btn--sm" disabled={!prevAlert} onClick={() => prevAlert && goto(prevAlert)} title="Previous alert">◀ Alert</button>
        <button className="btn btn--line btn--sm" disabled={!nextAlert} onClick={() => nextAlert && goto(nextAlert)} title="Jump to the next alert">Alert ▶</button>
        {firstAttack && !scenarios.length && <button className="btn btn--sm btn--hot" onClick={() => launch(firstAttack)}>▶ Run the attack</button>}
        <input className="live-scrub" type="range" min={data.window[0]} max={data.window[1]} value={Math.floor(t)} aria-label="Replay time"
          onChange={(e) => setT(+e.target.value)} style={{ ['--p' as string]: `${progress * 100}%` }} />
        <span className="mono live-clock">{utc(t).slice(5, 19)}</span>
        <label className="row small dim" style={{ gap: 6 }}><input type="checkbox" checked={tour} onChange={(e) => setTour(e.target.checked)} /> stop at the next alert</label>
      </div>

      <div className="mon-main">
        <AlertQueue alerts={v.alerts} selected={top?.id ?? null} onSelect={setSelected} />
        <div className="mon-analysis">
          {!top && <p className="hint">Press <b>{scenarios.length ? 'an Attack Lab button' : '▶ Run the attack'}</b>. Every payout is checked against the deposits behind it, and the replay stops on the first alert.</p>}
          <AlertCard e={top} data={data} />
          {v.exploits.length > 0 && <PauseRoute t={t} pausedAt={pausedAt} attacks={top?.scenario ? attacks.filter((a) => a.scenario === top.scenario) : attacks} onPause={() => { setPausedAt(t); setPlaying(false); }} onResume={() => setPausedAt(null)} />}
        </div>
      </div>

      <div className="live-stats">
        <Stat k="Payouts checked" v={v.withdrawals.length.toLocaleString()} />
        <Stat k="Backed by a deposit" v={usd(v.backed)} tone="ok" />
        <Stat k="No deposit behind it" v={usd(v.unbacked)} tone={v.unbacked > 0 ? 'bad' : undefined} />
        <Stat k="Exploit alerts" v={String(v.exploits.length)} tone={v.exploits.length ? 'bad' : undefined} sub={seenAttacks ? `${caught} of ${seenAttacks} attack payouts so far` : undefined} />
        <Stat k="Suspicious (advice only)" v={String(suspicious)} tone={suspicious ? 'warn' : undefined} />
        <Stat k="Estimated spread" v={nNow.toFixed(2)} tone={nNow >= 1 ? 'warn' : undefined} sub={nNow >= 1 ? 'strong fitted spread' : nNow > 0.3 ? 'cluster building' : 'quiet'} />
      </div>

      <HeadToHead data={data} caught={caught} seen={seenAttacks} />

      <section className="plate"><header className="plate-head"><h3 className="sec-h">Bridge activity over time</h3><span className="dim small">red line = the selected alert</span></header>
        <div className="live-tl">{CHARTS.map((c, i) => <Timeline key={c.title} data={data} t={t} spec={c} idx={i} alertTs={top && top.ts <= t ? top.ts : null} />)}</div></section>

      <details className="plate mapbox" onToggle={(e) => setShowMap((e.target as HTMLDetailsElement).open)}>
        <summary className="plate-head"><span className="label">Money flow map · {data.label}</span><span className="dim small">open to see deposits and payouts as a graph</span></summary>
        {showMap && <section className="live-graph">
          <header className="plate-head">
            <span className="seg" role="tablist" aria-label="Graph style"><button aria-selected={!view3d} onClick={() => setView3d(false)}>Network</button><button aria-selected={view3d} onClick={() => setView3d(true)}>3D map</button></span>
            <span className="legend"><i className="lg-ok" />payout with a deposit <i className="lg-bad" />payout with no deposit <i className="lg-warn" />suspicious <i className="lg-cl" />copycat cluster</span></header>
          <Suspense fallback={<div className="label">Loading…</div>}>
            {view3d ? <Map3D data={data} n={v.n} selected={top?.id ?? null} onSelect={setSelected} spin={!playing} /> : <LiveGraph data={data} n={v.n} selected={top?.id ?? null} onSelect={setSelected} />}
          </Suspense>
        </section>}
      </details>
    </>
  );
}

/** What-if (not an action): what holding the route at this moment would have kept in the bridge, estimated from the replay. */
function PauseRoute({ t, pausedAt, attacks, onPause, onResume }: { t: number; pausedAt: number | null; attacks: Ev[]; onPause: () => void; onResume: () => void }) {
  const total = attacks.reduce((s, e) => s + (e.usd ?? 0), 0);
  const at = pausedAt ?? t;
  const lost = attacks.filter((e) => e.ts <= at).reduce((s, e) => s + (e.usd ?? 0), 0);
  const kept = total - lost;
  return (
    <section className={`plate pause ${pausedAt ? 'is-paused' : ''}`}>
      {pausedAt ? <>
        <b>What-if: route held at {utc(pausedAt).slice(11, 19)}.</b>
        <span>Kept in the bridge: <b className="ok mono">{usd(kept)}</b> of {usd(total)} ({total ? Math.round(kept / total * 1000) / 10 : 0}%) · already lost <b className="bad mono">{usd(lost)}</b></span>
        <button className="btn btn--line btn--sm" onClick={onResume}>Clear</button>
      </> : <>
        <button className="btn btn--line btn--sm" onClick={onPause}>What if the route were held here?</button>
        <span>Holding now would keep <b className="ok mono">{usd(kept)}</b> of the {usd(total)} this attack takes in total ({total ? Math.round(kept / total * 1000) / 10 : 0}%).</span>
      </>}
      <small className="dim">A what-if estimate from the replay, not an action: BridgeWitness alerts, it does not pause bridges. Assumes the attackers would not have changed course.</small>
    </section>
  );
}

const routeText = (r: string) => r.split(':').pop()!.split('→').map((x) => x[0].toUpperCase() + x.slice(1)).join(' → ');

const SHORT: Record<string, string> = { 'B1 whale > $1M': 'Big-transfer alarm (> $1M)', 'B2 volume z-score > 3': 'Volume-spike alarm', 'B3 message-id join': 'Match by message ID', 'BridgeWitness (exploit)': 'BridgeWitness' };
/** Same stream, simpler detectors: how many attack payouts each catches and how many false alarms it raises. */
function HeadToHead({ data, caught, seen }: { data: Replay; caught: number; seen: number }) {
  const rows = (data.metrics.scorecard ?? []).filter((r) => SHORT[r.method]);
  if (!rows.length) return null;
  return (
    <section className="plate h2h">
      <header className="plate-head"><span className="label">Same attack, other detectors (whole replay)</span><Link className="small" to="/console/results">All results →</Link></header>
      <div className="h2h-rows">{rows.map((r) => {
        const [a, b] = r.attack_flagged.split('/').map(Number);
        const us = r.method.startsWith('BridgeWitness');
        return <div key={r.method} className={`h2h-row ${us ? 'is-us' : ''}`}>
          <span>{SHORT[r.method]}</span>
          <i><em style={{ width: `${b ? a / b * 100 : 0}%` }} /></i>
          <b className="mono">{r.attack_flagged}</b>
          <span className={`mono ${r.false_alerts ? 'bad' : 'ok'}`}>{r.false_alerts} false alarm{r.false_alerts === 1 ? '' : 's'}</span>
        </div>;
      })}</div>
      {seen > 0 && <p className="dim small">Live so far: BridgeWitness has labelled <b>{caught}</b> of the <b>{seen}</b> attack payouts seen as exploits.</p>}
    </section>
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
const VERDICT_TEXT: Record<string, string> = { reported_filled: 'Reported filled', refunded: 'Refunded', pending: 'Waiting', overdue: 'Late', unknown: 'Not enough data' };

function LiveTail() {
  const { live, err } = useLive(true);
  return (
    <section className="plate">
      <header className="plate-head"><span className="label">A real bridge, right now · Across</span>
        {!!live?.polled_at && <span className="mono small dim">last successful update {new Date(live.polled_at * 1000).toLocaleTimeString()}</span>}</header>
      <div className="plate-body">
        {err && <p className="bad">{err}</p>}
        {live?.error && <p className="warn">{live.error}</p>}
        <p className="lede">These are transfers reported by the Across API. Across uses relayer-funded fills, so a price comparison cannot prove whether a transfer is backed. We show reported fills, pending transfers and refunds. Chain finality and backing are not independently verified; our models abstain because these routes have no calibration history.</p>
        {live && <div className="live-stats">{Object.entries(live.counts).map(([k, n]) => <Stat key={k} k={VERDICT_TEXT[k] ?? k} v={String(n)} />)}</div>}
        <div style={{ overflowX: 'auto' }}><table className="sc"><thead><tr><th>Result</th><th>Route</th><th>Token</th><th>Deposited</th><th>Paid out</th><th>Took</th><th>Deposit transaction</th></tr></thead><tbody>
          {live?.rows.map((r) => <tr key={r.id}><td className={`v-${r.verdict}`}>{VERDICT_TEXT[r.verdict]}</td><td>{CHAIN[r.src] ?? `chain ${r.src}`} → {CHAIN[r.dst] ?? `chain ${r.dst}`}</td><td>{r.symbol ?? '?'}</td>
            <td className="mono">{r.in_usd == null ? '—' : usdSmall(r.in_usd)}</td><td className="mono">{r.out_usd == null ? '—' : usdSmall(r.out_usd)}</td>
            <td className="mono">{r.delay_s == null ? '—' : r.delay_s <= 0 ? 'under 1 s' : `${r.delay_s} s`}</td><td className="mono dim">{r.deposit_tx?.slice(0, 10)}…</td></tr>)}
        </tbody></table></div>
      </div>
    </section>
  );
}
