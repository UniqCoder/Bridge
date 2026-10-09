import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowCounterClockwise, CaretLeft, CaretRight, Lightning, Pause, Play } from '@phosphor-icons/react';
import { CaseFile } from '../../live/CaseFile';
import { Ledger } from '../../live/Ledger';
import { Scrubber } from '../../live/Scrubber';
import { CHARTS, Timeline } from '../../live/Timelines';
import { FEEDS, SOURCE_CHAIN, TYPE_SHORT, human, useClock, useLive, useMetrics, useReplayData, useView, type Ev, type FeedId, type Replay } from '../../live/data';
import { duration, usd, utc } from '../../lib/format';
import '../../live/live.css';
import '../../live/ws.css';

const SPEEDS = [60, 300, 1000, 3000];

export default function Live() {
  const [qs, setQs] = useSearchParams();
  const requested = qs.get('feed');
  const feed = FEEDS.some((f) => f.id === requested) ? requested as FeedId : 'nomad';
  const setFeed = (f: FeedId) => setQs({ feed: f }, { replace: true });
  return (
    <div className="ws">
      <nav className="ws-feeds" role="tablist" aria-label="Choose what to watch">
        {FEEDS.map((f) => (
          <button key={f.id} role="tab" aria-selected={feed === f.id} className="ws-feed" onClick={() => setFeed(f.id)}>
            <b>{f.label}</b><span>{FEED_KIND[f.id]}</span>
          </button>))}
      </nav>
      {feed === 'live' ? <LiveTail /> : <ReplayView feed={feed} />}
    </div>
  );
}

const FEED_KIND: Record<FeedId, string> = {
  nomad: 'Recorded on-chain data · copycat drain', ronin: 'Recorded on-chain data · stolen validator keys',
  simulated: 'Synthetic attacks in real traffic', live: 'Across API, polled every 15 s',
};

function ReplayView({ feed }: { feed: string }) {
  const { data, err } = useReplayData(feed);
  if (err) return <div className="ws-msg ws-msg--bad">Could not load this replay: {err}</div>;
  if (!data) return <div className="ws-msg" aria-busy="true"><span className="ws-skel" />Loading the replay…</div>;
  return <Console key={data.feed} data={data} />;
}

/** ?t=<unix seconds> deep-links to a moment in the replay (demo links, screenshots). */
function useStartParam() {
  const [qs] = useSearchParams();
  const v = Number(qs.get('t'));
  return Number.isFinite(v) && v > 0 ? v : null;
}

type Level = 'all' | 'exploit' | 'suspicious';
type Zoom = 'all' | 'attack' | 'sel';

function Console({ data }: { data: Replay }) {
  const metrics = useMetrics();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(300);
  const [t, setT] = useClock(data.window, speed, playing);
  const v = useView(data, t)!;
  const [selected, setSelected] = useState<string | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [level, setLevel] = useState<Level>('all');
  const [type, setType] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Zoom>('all');
  const startAt = useStartParam();
  const [tour, setTour] = useState(!startAt);
  useEffect(() => { if (startAt) setT(Math.min(Math.max(startAt, data.window[0]), data.window[1])); }, [data, startAt]);

  const withdrawals = useMemo(() => data.events.filter((e) => e.kind === 'withdrawal'), [data]);
  const attacks = useMemo(() => withdrawals.filter((e) => e.truth === 'attack'), [withdrawals]);
  const allAlerts = useMemo(() => withdrawals.filter((e) => e.level && e.level !== 'none'), [withdrawals]);
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  const firstAlert = allAlerts.find((e) => e.level === 'exploit') ?? allAlerts[0];
  const sim = data.feed === 'simulated';

  // Guided flow: stop on the next alert after a launch and open it, so a viewer sees the moment the rule breaks.
  const armed = useRef<number | null>(0);
  useEffect(() => { armed.current = 0; setSelected(null); setPausedAt(null); }, [data]);
  useEffect(() => {
    if (tour && armed.current != null && v.alerts.length > armed.current) {
      const hit = v.alerts[armed.current];
      armed.current = null; setPlaying(false); setSelected(hit.id); setT(hit.ts);
    }
  }, [v.alerts.length, tour]);
  const alertsBefore = (ts: number) => allAlerts.filter((e) => e.ts <= ts).length;
  const launch = (ts: number) => { const at = Math.max(data.window[0], ts - 120); armed.current = alertsBefore(at); setPausedAt(null); setSelected(null); setT(at); setPlaying(true); };

  const top = selected ? byId.get(selected) ?? null : v.alerts[v.alerts.length - 1] ?? null;
  const curIdx = top ? allAlerts.findIndex((e) => e.id === top.id) : -1;
  const nextAlert = curIdx >= 0 ? allAlerts[curIdx + 1] : allAlerts.find((e) => e.ts > t);
  const prevAlert = curIdx > 0 ? allAlerts[curIdx - 1] : null;
  const goto = (e: Ev) => { setPlaying(false); armed.current = null; setT(Math.max(t, e.ts)); setSelected(e.id); };
  const reset = () => { setPlaying(false); setT(data.window[0]); armed.current = 0; setSelected(null); setPausedAt(null); };
  const togglePlay = () => { if (t >= data.window[1]) reset(); setPlaying((p) => !p); };
  const showAll = () => { setPlaying(false); armed.current = null; setT(data.window[1]); };

  // Keyboard: Space plays/pauses, J/K step through alerts.
  const keys = useRef({ togglePlay, prev: () => prevAlert && goto(prevAlert), next: () => nextAlert && goto(nextAlert) });
  keys.current = { togglePlay, prev: () => prevAlert && goto(prevAlert), next: () => nextAlert && goto(nextAlert) };
  useEffect(() => {
    const on = (ev: KeyboardEvent) => {
      const tag = (ev.target as HTMLElement).tagName;
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(tag) || ev.metaKey || ev.ctrlKey) return;
      if (ev.key === ' ') { ev.preventDefault(); keys.current.togglePlay(); }
      if (ev.key === 'j') keys.current.prev();
      if (ev.key === 'k') keys.current.next();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  // Ledger range: whole replay, the attack period, or 15 minutes either side of the open case.
  const domain = useMemo<[number, number]>(() => {
    const [w0, w1] = data.window;
    if (zoom === 'attack' && attacks.length) return [Math.max(w0, attacks[0].ts - 900), Math.min(w1, attacks[attacks.length - 1].ts + 900)];
    if (zoom === 'sel' && top) return [Math.max(w0, top.ts - 900), Math.min(w1, top.ts + 900)];
    return [w0, w1];
  }, [data, zoom, attacks, zoom === 'sel' ? top?.id : null]);

  const focus = useMemo(() => {
    if (level === 'all' && !type) return null;
    return (e: Ev) => (level === 'all' ? e.level !== 'none' : e.level === level) && (!type || e.type === type);
  }, [level, type]);
  const shown = v.alerts.filter((e) => !focus || focus(e));
  const mates = top?.signals && top.signals.cluster_size > 1 ? v.withdrawals.filter((e) => e.signals?.cluster === top.signals!.cluster).length : 0;

  const scenarios = useMemo(() => {
    const m = new Map<string, { ts: number; attack: boolean }>();
    for (const e of data.events) if (e.scenario && !m.has(e.scenario)) m.set(e.scenario, { ts: e.ts, attack: e.truth === 'attack' });
    return [...m.entries()].sort((x, y) => Number(y[1].attack) - Number(x[1].attack));
  }, [data]);

  const src = SOURCE_CHAIN[data.feed] ?? data.src;
  const started = t > data.window[0];
  const done = t >= data.window[1];

  return (
    <>
      <Situation data={data} v={v} src={src} started={started} />

      <section className="ws-transport" aria-label="Replay controls">
        <div className="ws-tbtns">
          <button className="btn ws-play" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}{playing ? 'Pause' : done ? 'Replay' : 'Play'}</button>
          {firstAlert && !sim && <button className="btn btn--line ws-jump" onClick={() => launch(firstAlert.ts)}><Lightning size={17} weight="fill" />Jump to first alert</button>}
          <span className="ws-seg" role="group" aria-label="Replay speed">{SPEEDS.map((s) => <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}</span>
          <span className="ws-seg" role="group" aria-label="Step through alerts">
            <button disabled={!prevAlert} onClick={() => prevAlert && goto(prevAlert)} title="Previous alert (J)"><CaretLeft size={16} />Alert</button>
            <button disabled={!nextAlert} onClick={() => nextAlert && goto(nextAlert)} title="Next alert (K)">Alert<CaretRight size={16} /></button>
          </span>
          <button className="ws-icon" onClick={reset} title="Back to the start" aria-label="Back to the start"><ArrowCounterClockwise size={18} /></button>
          <span className="ws-clock mono" aria-live="off">{utc(t).slice(0, 19)}<small>UTC</small></span>
          <label className="ws-check"><input type="checkbox" checked={tour} onChange={(e) => setTour(e.target.checked)} />Stop at the next alert</label>
        </div>
        <Scrubber data={data} t={t} setT={(x) => { setT(x); }} domain={domain} />
        <div className="ws-scrub-legend"><span><i className="k-ok" />payouts backed by a deposit</span><span><i className="k-bad" />payouts breaking the rule</span><span><i className="k-tick" />exploit alert</span><span className="dim">Drag or use arrow keys to seek · Space plays · J / K step alerts</span></div>
      </section>

      {scenarios.length > 0 && <section className="ws-lab" aria-label="Attack Lab">
        <div><h2 className="ws-h">Attack Lab</h2><p className="dim">Each button jumps to a scripted attack or an honest control injected into real Ronin traffic. Controls should raise no exploit alert.</p></div>
        <div className="ws-lab-btns">{scenarios.map(([name, sc]) => (
          <button key={name} className={`ws-chip ${sc.attack ? 'is-attack' : 'is-control'}`} onClick={() => launch(sc.ts)}>{sc.attack ? <Lightning size={14} weight="fill" /> : null}{name}</button>))}</div>
      </section>}

      <div className="ws-grid">
        <div className="ws-left">
          <section className="ws-panel ws-ledger">
            <header className="ws-ph">
              <div><h2 className="ws-h">Conservation ledger</h2><p className="dim">Each payout is tethered to the deposit that backs it. Red payouts have no valid one.</p></div>
              <span className="ws-seg" role="group" aria-label="Ledger range">
                <button aria-pressed={zoom === 'all'} onClick={() => setZoom('all')}>Whole replay</button>
                {attacks.length > 0 && <button aria-pressed={zoom === 'attack'} onClick={() => setZoom('attack')}>Attack period</button>}
                <button aria-pressed={zoom === 'sel'} disabled={!top} onClick={() => setZoom('sel')}>Around case</button>
              </span>
            </header>
            <div className="ws-ledger-body">
              <Ledger data={data} n={v.n} t={t} domain={domain} selected={top?.id ?? null} onSelect={(id) => { setSelected(id); setPlaying(false); }} focus={focus} />
              {!started && <div className="ws-start">
                <p className="ws-start-k">{sim ? 'Synthetic attacks injected into real traffic' : `Recorded ${data.label.split(' · ')[0]} bridge traffic`}</p>
                <p className="ws-start-h">{sim ? 'Launch an attack from the Attack Lab and watch the rule catch it.' : `Replay ${duration(data.window[1] - data.window[0])} of ${src} → ${data.dst} payouts and watch each one get checked.`}</p>
                <div className="row" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {firstAlert && !sim && <button className="btn" onClick={() => launch(firstAlert.ts)}><Lightning size={17} weight="fill" />Jump to first alert</button>}
                  <button className="btn btn--line" onClick={() => setPlaying(true)}><Play size={16} weight="fill" />Play from start</button>
                  <button className="btn btn--line" onClick={showAll}>Show everything</button>
                </div>
              </div>}
            </div>
            <footer className="ws-legend">
              <span><i className="k-dep" />deposit on {src}</span><span><i className="k-ok" />backed payout</span><span><i className="k-bad" />payout breaking the rule</span>
              {data.feed === 'simulated' && <span><i className="k-warn" />suspicious (advisory)</span>}
              <span><i className="k-teth" />tether to its deposit</span><span><i className="k-stem" />no deposit</span><span className="dim">Dot size and height: USD value (log scale)</span>
            </footer>
          </section>

          <div className="ws-split">
            <AlertRail alerts={shown} total={v.alerts.length} all={v.alerts} selected={top?.id ?? null} onSelect={(id) => { setSelected(id); setPlaying(false); }}
              level={level} setLevel={setLevel} type={type} setType={setType} />
            <Impact data={data} v={v} t={t} top={top} attacks={attacks} pausedAt={pausedAt} setPausedAt={(x) => { setPausedAt(x); if (x) setPlaying(false); }} />
          </div>
        </div>
        <div className="ws-right">
          <CaseFile e={top} data={data} threshold={metrics?.ecusum_threshold ?? null} mates={mates} />
        </div>
      </div>

      <section className="ws-panel">
        <header className="ws-ph"><div><h2 className="ws-h">Detector evidence over time</h2><p className="dim">Same clock as the ledger. The red line marks the open case.</p></div></header>
        <div className="ws-charts">{CHARTS.map((c, i) => <Timeline key={c.title} data={data} t={t} spec={c} idx={i} alertTs={top && top.ts <= t ? top.ts : null} />)}</div>
      </section>

      <HeadToHead data={data} />
    </>
  );
}

/** Top band: the one sentence that matters right now, and the value balance behind it. */
function Situation({ data, v, src, started }: { data: Replay; v: NonNullable<ReturnType<typeof useView>>; src: string; started: boolean }) {
  const total = v.backed + v.unbacked;
  const bad = v.exploits.length;
  const sus = v.alerts.length - bad;
  const first = v.exploits[0];
  const sim = data.feed === 'simulated';
  return (
    <section className={`ws-sit${bad ? ' is-bad' : ''}`} aria-live="polite">
      <div className="ws-sit-main">
        <p className="ws-sit-k">{sim ? 'Synthetic replay' : 'Historical replay'} · {data.label} · {src} → {data.dst}</p>
        {bad ? <>
          <h1 className="ws-sit-h"><span className="bad mono">{usd(v.unbacked)}</span> paid out without a valid deposit behind it</h1>
          <p className="ws-sit-sub"><b>{bad}</b> payout{bad === 1 ? '' : 's'} broke the conservation rule since {utc(first.ts).slice(11, 16)} UTC. Each was flagged as it executed{sus ? <>, plus <b>{sus}</b> suspicious (advisory only)</> : null}.</p>
        </> : started ? <>
          <h1 className="ws-sit-h"><span className="ok mono">{v.withdrawals.length.toLocaleString()}</span> payouts checked. {sus ? <>{sus} suspicious, none break the rule.</> : 'Every one is backed by a deposit.'}</h1>
          <p className="ws-sit-sub">Each payout on {data.dst} is paired with a deposit on {src} by token, amount and recipient. A payout with no valid deposit is the only thing allowed to raise an exploit alert.</p>
        </> : <>
          <h1 className="ws-sit-h">Every payout must be backed by a deposit. BridgeWitness checks each one as it happens.</h1>
          <p className="ws-sit-sub">Signatures can be stolen. Conservation can't. This replay runs the real detection output over {sim ? 'synthetic attacks mixed into recorded traffic' : 'recorded on-chain data'}; it is not live monitoring.</p>
        </>}
      </div>
      <div className="ws-bal" aria-label="Value released so far">
        <div className="ws-bal-head"><span>Value released so far, at dataset prices</span><b className="mono">{usd(total)}</b></div>
        <div className="ws-bal-bar">
          <i className="ok" style={{ flexGrow: total ? v.backed / total : 0 }} />
          <i className="bad" style={{ flexGrow: total ? v.unbacked / total : 0 }} />
          {!total && <i className="none" style={{ flexGrow: 1 }} />}
        </div>
        <dl className="ws-bal-k">
          <div><dt><i className="k-ok" />Backed</dt><dd className="mono">{usd(v.backed)}</dd></div>
          <div><dt><i className="k-bad" />Not backed</dt><dd className="mono bad">{usd(v.unbacked)}</dd></div>
          <div><dt>Payouts checked</dt><dd className="mono">{v.withdrawals.length.toLocaleString()}</dd></div>
          <div><dt>Exploit alerts</dt><dd className={`mono${bad ? ' bad' : ''}`}>{bad}</dd></div>
        </dl>
        
      </div>
    </section>
  );
}

function AlertRail({ alerts, all, total, selected, onSelect, level, setLevel, type, setType }: {
  alerts: Ev[]; all: Ev[]; total: number; selected: string | null; onSelect: (id: string) => void;
  level: Level; setLevel: (l: Level) => void; type: string | null; setType: (t: string | null) => void;
}) {
  const types = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of all) if (e.type) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all.length]);
  const sus = all.filter((e) => e.level === 'suspicious').length;
  const list = alerts.slice(-150).reverse();
  return (
    <section className="ws-panel ws-alerts" aria-label="Alerts">
      <header className="ws-ph">
        <h2 className="ws-h">Alerts <span className="dim mono">{total}</span></h2>
        <span className="ws-seg" role="group" aria-label="Filter by level">
          {(['all', 'exploit', 'suspicious'] as Level[]).map((l) => <button key={l} aria-pressed={level === l} disabled={l === 'suspicious' && !sus} onClick={() => setLevel(l)}>{l === 'all' ? 'All' : l === 'exploit' ? 'Exploit' : 'Suspicious'}</button>)}
        </span>
      </header>
      {types.length > 1 && <div className="ws-types" role="group" aria-label="Filter by suspected type">
        {types.map(([k, c]) => <button key={k} className="ws-chip" aria-pressed={type === k} onClick={() => setType(type === k ? null : k)}>{TYPE_SHORT[k] ?? k}<b className="mono">{c}</b></button>)}
      </div>}
      <ol className="ws-alist">
        {list.length === 0 && <li className="ws-empty">{total ? 'No alert matches this filter.' : 'Nothing flagged yet. Alerts appear here the moment a payout breaks the rule.'}</li>}
        {list.map((e) => (
          <li key={e.id}><button className={`ws-arow is-${e.level}${selected === e.id ? ' is-sel' : ''}`} onClick={() => onSelect(e.id)} aria-current={selected === e.id}>
            <span className="ws-arisk mono">{e.risk}</span>
            <span className="ws-atype">{TYPE_SHORT[e.type ?? ''] ?? e.level}<small className="mono">{e.symbol} {human(e.amount, e.decimals, 2)}{e.usd != null ? ` · ${usdShort(e.usd)}` : ''}</small></span>
            <span className="mono dim">{utc(e.ts).slice(11, 19)}</span>
          </button></li>))}
      </ol>
      {alerts.length > 150 && <p className="ws-more dim">Showing the latest 150 of {alerts.length}.</p>}
    </section>
  );
}

const usdShort = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`);

/** Impact, with each quantity named for what it is: released without backing, attack total, and what-if estimates. */
function Impact({ data, v, t, top, attacks, pausedAt, setPausedAt }: {
  data: Replay; v: NonNullable<ReturnType<typeof useView>>; t: number; top: Ev | null; attacks: Ev[]; pausedAt: number | null; setPausedAt: (x: number | null) => void;
}) {
  const cf = data.metrics.counterfactual;
  const scoped = top?.scenario ? attacks.filter((a) => a.scenario === top.scenario) : attacks;
  const total = scoped.reduce((s, e) => s + (e.usd ?? 0), 0);
  const at = pausedAt ?? t;
  const lost = scoped.filter((e) => e.ts <= at).reduce((s, e) => s + (e.usd ?? 0), 0);
  const kept = total - lost;
  const pct = total ? Math.round((kept / total) * 1000) / 10 : 0;
  return (
    <section className="ws-panel ws-impact" aria-label="Impact">
      <header className="ws-ph"><h2 className="ws-h">Impact</h2></header>
      <dl className="ws-imp">
        <div><dt>Released without a valid deposit, so far</dt><dd className="mono bad">{usd(v.unbacked)}</dd></div>
        <div><dt>Attack payouts in the whole replay{top?.scenario ? `, ${top.scenario}` : ''}</dt><dd className="mono">{usd(total)}</dd><small>labelled by the dataset, not by us</small></div>
      </dl>
      {total > 0 && <div className="ws-whatif">
        <p className="ws-whatif-h">What if the route had been held {pausedAt ? <>at <b className="mono">{utc(pausedAt).slice(11, 19)}</b></> : 'right now'}?</p>
        <div className="ws-kept"><i style={{ width: `${pct}%` }} /></div>
        <p><b className="ok mono">{usd(kept)}</b> of {usd(total)} ({pct}%) would have stayed in the bridge.</p>
        <div className="row" style={{ gap: 8 }}>
          {pausedAt ? <button className="btn btn--line btn--sm" onClick={() => setPausedAt(null)}>Clear</button>
            : <button className="btn btn--line btn--sm" onClick={() => setPausedAt(t)}>Hold the route here</button>}
        </div>
        {cf && !top?.scenario && <table className="ws-cf"><thead><tr><th>Held</th><th>Kept</th><th>Honest payouts delayed</th></tr></thead><tbody>
          {cf.lanes.map((l) => <tr key={l.latency_s}><td>{l.latency_s === 0 ? 'Before the first flagged payout' : `${duration(l.latency_s)} after the first alert`}</td><td className="mono">{l.kept_pct}%</td><td className="mono">{l.legit_held}</td></tr>)}
        </tbody></table>}
        <p className="ws-note">Estimates from the replay that assume attackers would not change course. BridgeWitness raises alerts; it does not pause bridges or recover funds.</p>
      </div>}
    </section>
  );
}

const SHORT: Record<string, string> = { 'B1 whale > $1M': 'Large-transfer alarm (> $1M)', 'B2 volume z-score > 3': 'Volume-spike alarm', 'B3 message-id join': 'Match by message ID', 'BridgeWitness (exploit)': 'BridgeWitness rule layer' };
/** Same stream, simpler detectors: attack payouts caught and false alarms raised over the whole replay. */
function HeadToHead({ data }: { data: Replay }) {
  const rows = (data.metrics.scorecard ?? []).filter((r) => SHORT[r.method]);
  if (!rows.length) return null;
  return (
    <section className="ws-panel ws-h2h">
      <header className="ws-ph"><div><h2 className="ws-h">Same replay, simpler detectors</h2><p className="dim">Attack payouts caught and false alarms raised over the whole replay. Attack labels come from the XChainWatcher dataset.</p></div><Link className="ws-link" to="/console/results">All measured results →</Link></header>
      <div className="ws-h2h-rows">{rows.map((r) => {
        const [a, b] = r.attack_flagged.split('/').map(Number);
        const us = r.method.startsWith('BridgeWitness');
        return <div key={r.method} className={`ws-h2h-row${us ? ' is-us' : ''}`}>
          <span>{SHORT[r.method]}</span>
          <i><em style={{ width: `${b ? (a / b) * 100 : 0}%` }} /></i>
          <b className="mono">{r.attack_flagged}</b>
          <span className={`mono ${r.false_alerts ? 'bad' : 'ok'}`}>{r.false_alerts} false alarm{r.false_alerts === 1 ? '' : 's'}</span>
        </div>;
      })}</div>
    </section>
  );
}

const usdSmall = (v: number) => (v < 10 ? '$' + v.toFixed(2) : usd(v));
const CHAIN: Record<number, string> = { 1: 'Ethereum', 10: 'Optimism', 56: 'BNB Chain', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum', 59144: 'Linea', 324: 'zkSync' };
const VERDICT_TEXT: Record<string, string> = { reported_filled: 'Reported filled', refunded: 'Refunded', pending: 'Waiting', overdue: 'Late', unknown: 'Not enough data' };

function LiveTail() {
  const { live, err } = useLive(true);
  return (
    <section className="ws-panel">
      <header className="ws-ph"><div><h2 className="ws-h">A real bridge, right now: Across</h2>
        <p className="dim">Transfers reported by the Across API. Across uses relayer-funded fills, so a price comparison cannot prove backing. Only the deposit rule runs here; the models abstain because these routes have no calibration history.</p></div>
        {!!live?.polled_at && <span className="mono dim">updated {new Date(live.polled_at * 1000).toLocaleTimeString()}</span>}</header>
      <div className="ws-live">
        {err && <p className="ws-msg ws-msg--bad">{err}</p>}
        {!live && !err && <p className="ws-msg" aria-busy="true"><span className="ws-skel" />Contacting the backend…</p>}
        {live?.error && <p className="warn">{live.error}</p>}
        {live && <dl className="ws-bal-k ws-live-k">{Object.entries(live.counts).map(([k, n]) => <div key={k}><dt>{VERDICT_TEXT[k] ?? k}</dt><dd className="mono">{n}</dd></div>)}</dl>}
        {live && <div style={{ overflowX: 'auto' }}><table className="ws-table"><thead><tr><th>Result</th><th>Route</th><th>Token</th><th>Deposited</th><th>Paid out</th><th>Took</th><th>Deposit transaction</th></tr></thead><tbody>
          {live.rows.map((r) => <tr key={r.id}><td className={`v-${r.verdict}`}>{VERDICT_TEXT[r.verdict]}</td><td>{CHAIN[r.src] ?? `chain ${r.src}`} → {CHAIN[r.dst] ?? `chain ${r.dst}`}</td><td>{r.symbol ?? '?'}</td>
            <td className="mono">{r.in_usd == null ? 'n/a' : usdSmall(r.in_usd)}</td><td className="mono">{r.out_usd == null ? 'n/a' : usdSmall(r.out_usd)}</td>
            <td className="mono">{r.delay_s == null ? 'n/a' : r.delay_s <= 0 ? 'under 1 s' : `${r.delay_s} s`}</td><td className="mono dim">{r.deposit_tx ? `${r.deposit_tx.slice(0, 10)}…` : 'n/a'}</td></tr>)}
        </tbody></table></div>}
      </div>
    </section>
  );
}
