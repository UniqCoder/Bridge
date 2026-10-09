import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCard } from '../../live/AlertCard';
import { LiveGraph } from '../../live/LiveGraph';
import { CHARTS, Timeline } from '../../live/Timelines';
import { FEEDS, TYPE_SHORT, useClock, useLive, useReplayData, useView, type Ev, type FeedId, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/live.css';

const SPEEDS = [60, 300, 1000, 3000];

export default function Live() {
  const [qs, setQs] = useSearchParams();
  const feed = (qs.get('feed') as FeedId) ?? 'nomad';
  const setFeed = (f: FeedId) => setQs({ feed: f }, { replace: true });
  return (
    <div className="live">
      <div className="live-feeds" role="tablist" aria-label="Feed">
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
  if (!data) return <div className="plate live-msg label">Loading {feed} replay…</div>;
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
  const startAt = useStartParam();
  const [tour, setTour] = useState(!startAt);
  useEffect(() => { if (startAt) setT(Math.min(Math.max(startAt, data.window[0]), data.window[1])); }, [data, startAt]);
  const firstAttack = useMemo(() => data.events.find((e) => e.truth === 'attack')?.ts, [data]);
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);

  // Guided flow: pause on the first alert and open it, so a viewer sees the moment conservation breaks.
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

  return (
    <>
      <div className="live-transport plate">
        <button className="btn btn--sm" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'Pause' : t >= data.window[1] ? 'Done' : 'Play'}</button>
        <div className="row" style={{ gap: 4 }}>
          {SPEEDS.map((s) => <button key={s} className="btn btn--line btn--sm" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
        {firstAttack && <button className="btn btn--line btn--sm" onClick={() => { setT(firstAttack - 180); setPlaying(true); }}>Jump to attack</button>}
        <input className="live-scrub" type="range" min={data.window[0]} max={data.window[1]} value={Math.floor(t)} aria-label="Replay time"
          onChange={(e) => setT(+e.target.value)} style={{ ['--p' as string]: `${progress * 100}%` }} />
        <span className="mono live-clock">{utc(t).slice(5, 19)}</span>
        <label className="row small dim" style={{ gap: 6 }}><input type="checkbox" checked={tour} onChange={(e) => setTour(e.target.checked)} /> pause on first alert</label>
      </div>

      <div className="live-stats">
        <Stat k="Releases checked" v={v.withdrawals.length.toLocaleString()} />
        <Stat k="Backed" v={usd(v.backed)} tone="ok" />
        <Stat k="Unbacked (gap)" v={usd(v.unbacked)} tone={v.unbacked > 0 ? 'bad' : undefined} />
        <Stat k="Exploit alerts" v={String(v.exploits.length)} tone={v.exploits.length ? 'bad' : undefined} />
        <Stat k="Suspicious" v={String(v.alerts.length - v.exploits.length)} tone={v.alerts.length - v.exploits.length ? 'warn' : undefined} />
        <Stat k="Spread n̂" v={nNow.toFixed(2)} tone={nNow > 0.8 ? 'bad' : undefined} sub={nNow > 0.8 ? 'self-sustaining' : 'quiet'} />
      </div>

      <div className="live-main">
        <section className="plate live-graph">
          <header className="plate-head"><span className="label">Live flow graph · {data.label}</span>
            <span className="legend"><i className="lg-ok" />backed <i className="lg-bad" />unbacked <i className="lg-warn" />suspicious <i className="lg-cl" />copycat cluster</span></header>
          <LiveGraph data={data} n={v.n} selected={top?.id ?? null} onSelect={setSelected} />
        </section>
        <aside className="live-side">
          <AlertCard e={top} data={data} />
          <AlertQueue alerts={v.alerts} selected={top?.id ?? null} onSelect={setSelected} />
        </aside>
      </div>

      <div className="live-tl plate">{CHARTS.map((c, i) => <Timeline key={c.title} data={data} t={t} spec={c} idx={i} />)}</div>

      <div className="live-bottom">
        <Scorecard data={data} />
        <section className="plate"><header className="plate-head"><span className="label">Measured on this feed</span></header>
          <div className="plate-body small">
            <p><b>{m.attack_flagged_exploit}/{m.attack_releases}</b> attack releases labelled exploit · <b>{m.normal_false_exploit}</b> normal releases ever labelled exploit.</p>
            <p>Held-out normal traffic: <b>{m.heldout_normal.toLocaleString()}</b> releases over {m.heldout_days} days → <b>{m.heldout_false_alarms}</b> statistical alarm{m.heldout_false_alarms === 1 ? '' : 's'} (guarantee: on average ≥ 1,000 normal releases per false alarm).</p>
            <p>Statistics alone (rules switched off) alarm on <b>{m.stat_alarms_on_attack}/{m.attack_releases}</b> attack releases{m.stat_first_alarm_after_s != null ? `, first ${m.stat_first_alarm_after_s} s after the attack began` : ' — this attack is caught by the conservation rule only'}.</p>
            {m.max_cluster > 1 && <p>Largest copycat cluster <b>{m.max_cluster}</b>, peak spread n̂ <b>{m.max_hawkes_n.toFixed(2)}</b>.</p>}
            {m.auth_attack_p && <p>Signer & auth model (ML2) on the attack: p = {m.auth_attack_p.slice(0, 3).join(', ')} vs median {m.auth_heldout_median_p} on normal days.</p>}
            <p className="dim">Types on attack releases: {Object.entries(m.types_on_attack).map(([k, n]) => `${TYPE_SHORT[k] ?? k} ${n}`).join(' · ')}.</p>
          </div></section>
      </div>
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
      <header className="plate-head"><span className="label">Alert queue · {alerts.length}</span></header>
      <ol className="aq-list">
        {list.length === 0 && <li className="dim small">Nothing flagged yet.</li>}
        {list.map((e) => (
          <li key={e.id}><button className={`aq-row aq--${e.level} ${selected === e.id ? 'is-sel' : ''}`} onClick={() => onSelect(e.id)}>
            <span className="mono">{e.risk}</span>
            <span>{TYPE_SHORT[e.type ?? ''] ?? e.level}</span>
            <span className="mono dim">{e.symbol} {(e.usd == null ? 'unpriced' : usd(e.usd))}</span>
            <span className="mono dim">{utc(e.ts).slice(11, 19)}</span>
          </button></li>))}
      </ol>
    </section>
  );
}

function Scorecard({ data }: { data: Replay }) {
  return (
    <section className="plate">
      <header className="plate-head"><span className="label">Scorecard · same feed, common methods vs ours</span></header>
      <div className="plate-body" style={{ overflowX: 'auto' }}>
        <table className="sc"><thead><tr><th>Method</th><th>Attack releases flagged</th><th>Value out before 1st alert</th><th>False alerts (held-out normal)</th></tr></thead>
          <tbody>{data.metrics.scorecard.map((r) => (
            <tr key={r.method} className={r.method.startsWith('BridgeWitness') ? 'ours' : ''}>
              <td>{r.method}</td><td className="mono">{r.attack_flagged}</td>
              <td className="mono">{r.usd_before_first_alert == null ? '—' : usd(r.usd_before_first_alert)}</td>
              <td className="mono">{r.false_alerts} <span className="dim">({r.false_alerts_per_day}/day)</span></td>
            </tr>))}</tbody></table>
        <p className="dim small">Normal-day false alerts are counted on held-out days the models never saw. Labels come from XChainWatcher's matching rules (circular for the rule layer; stated).</p>
      </div>
    </section>
  );
}

function LiveTail() {
  const { live, err } = useLive(true);
  const chain = (id: number) => ({ 1: 'Ethereum', 10: 'Optimism', 56: 'BNB', 137: 'Polygon', 8453: 'Base', 42161: 'Arbitrum', 59144: 'Linea', 324: 'zkSync' } as Record<number, string>)[id] ?? `chain ${id}`;
  return (
    <section className="plate">
      <header className="plate-head"><span className="label">Live tail · Across bridge · conservation check on real current transfers</span>
        {live && <span className="mono small dim">polled {new Date(live.polled_at * 1000).toLocaleTimeString()}</span>}</header>
      <div className="plate-body">
        {err && <p className="bad">{err}</p>}
        {live?.error && <p className="warn">{live.error}</p>}
        {live && <div className="live-stats">{Object.entries(live.counts).map(([k, n]) => <Stat key={k} k={k} v={String(n)} tone={k === 'violation' && n ? 'bad' : k === 'consistent' ? 'ok' : undefined} />)}</div>}
        <p className="dim small">Rule: value released on the destination ≤ value locked on the origin (Across' own prices, decimals from its token list, 1% + $1 tolerance). The ML models <b>abstain</b> here: they have no calibration history for these routes, and say so instead of guessing.</p>
        <div style={{ overflowX: 'auto' }}><table className="sc"><thead><tr><th>Verdict</th><th>Route</th><th>Token</th><th>In</th><th>Out</th><th>Fill delay</th><th>Deposit tx</th></tr></thead><tbody>
          {live?.rows.map((r) => <tr key={r.id}><td className={`v-${r.verdict}`}>{r.verdict}</td><td>{chain(r.src)} → {chain(r.dst)}</td><td>{r.symbol ?? '?'}</td>
            <td className="mono">{r.in_usd == null ? '—' : usd(r.in_usd)}</td><td className="mono">{r.out_usd == null ? '—' : usd(r.out_usd)}</td>
            <td className="mono">{r.delay_s == null ? '—' : `${r.delay_s}s`}</td><td className="mono dim">{r.deposit_tx?.slice(0, 10)}…</td></tr>)}
        </tbody></table></div>
      </div>
    </section>
  );
}
