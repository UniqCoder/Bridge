import { useMemo, useState } from 'react';
import { AlertCard } from '../../live/AlertCard';
import { Map3D } from '../../live/Map3D';
import { FEEDS, useClock, useReplayData, useView, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/live.css';

const SHOWN = FEEDS.filter((f) => f.id !== 'live');

export default function MapPage() {
  const [feed, setFeed] = useState('nomad');
  const { data, err } = useReplayData(feed);
  return (
    <div className="live">
      <div className="live-feeds" role="tablist" aria-label="Choose a replay">
        {SHOWN.map((f) => <button key={f.id} role="tab" aria-selected={feed === f.id} className="feed-btn" onClick={() => setFeed(f.id)}><b>{f.label}</b><span>{f.note}</span></button>)}
      </div>
      {err ? <div className="plate live-msg">Could not load: {err}</div> : !data ? <div className="plate live-msg label">Loading the map…</div> : <MapView data={data} key={feed} />}
    </div>
  );
}

function MapView({ data }: { data: Replay }) {
  const [playing, setPlaying] = useState(true);
  const start = data.events[Math.min(data.events.length - 1, 15)].ts;
  const [t, setT] = useClock(data.window, (data.window[1] - data.window[0]) / 40, playing);
  const v = useView(data, Math.max(t, start))!;
  const [sel, setSel] = useState<string | null>(null);
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  const top = sel ? byId.get(sel) ?? null : v.alerts[v.alerts.length - 1] ?? null;
  return (
    <>
      <div className="live-transport plate">
        <button className="btn btn--sm" onClick={() => setPlaying((p) => !p)}>{playing ? 'Pause' : 'Play'}</button>
        <input className="live-scrub" type="range" min={data.window[0]} max={data.window[1]} value={Math.floor(t)} aria-label="Replay time" onChange={(e) => setT(+e.target.value)} />
        <span className="mono live-clock">{utc(t).slice(5, 19)}</span>
        <span className="legend"><i className="lg-ok" />has a deposit <i className="lg-bad" />no deposit <i className="lg-warn" />suspicious</span>
      </div>
      <div className="live-main">
        <section className="plate map-stage">
          <header className="plate-head"><span className="label">{data.label} · drag to orbit, scroll to zoom, click a payout</span>
            <span className="mono small dim">{v.withdrawals.length} payouts · {usd(v.unbacked)} with no deposit</span></header>
          <Map3D data={data} n={v.n} selected={top?.id ?? null} onSelect={setSel} spin={playing} />
        </section>
        <aside className="live-side"><AlertCard e={top} data={data} /></aside>
      </div>
    </>
  );
}
