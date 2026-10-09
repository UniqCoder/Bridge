import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCard } from '../../live/AlertCard';
import { Map3D } from '../../live/Map3D';
import { FEEDS, useClock, useReplayData, useView, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/ws.css';

const SHOWN = FEEDS.filter((f) => f.id !== 'live');

export default function MapPage() {
  const [feed, setFeed] = useState('nomad');
  const { data, err } = useReplayData(feed);
  return (
    <div className="ws">
      <div className="ws-feeds" role="tablist" aria-label="Choose a replay">
        {SHOWN.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={feed === f.id}
            className="ws-feed"
            onClick={() => setFeed(f.id)}
          >
            <b>{f.label}</b>
            <span>{f.note}</span>
          </button>
        ))}
      </div>
      {err ? (
        <div className="ws-panel ws-msg ws-msg--bad">Could not load: {err}</div>
      ) : !data ? (
        <div className="ws-panel ws-msg"><span className="ws-skel" /> Loading the map…</div>
      ) : (
        <MapView data={data} key={feed} />
      )}
    </div>
  );
}

function MapView({ data }: { data: Replay }) {
  const [playing, setPlaying] = useState(true);
  const start = data.events[Math.min(data.events.length - 1, 15)].ts;
  const [t, setT] = useClock(data.window, (data.window[1] - data.window[0]) / 40, playing);
  const v = useView(data, Math.max(t, start))!;
  const [sel, setSel] = useState<string | null>(null);
  const [qs] = useSearchParams();
  useEffect(() => {
    const q = Number(qs.get('t'));
    if (q > 0) {
      setT(Math.min(Math.max(q, data.window[0]), data.window[1]));
      setPlaying(false);
    }
  }, [data]);
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  const top = sel ? byId.get(sel) ?? null : v.alerts[v.alerts.length - 1] ?? null;
  return (
    <>
      <div className="ws-transport">
        <div className="ws-tbtns">
          <button className="btn ws-play" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
        <div className="scrub" role="slider" aria-label="Replay time" tabIndex={0}>
          <svg viewBox="0 0 1000 58" preserveAspectRatio="none" aria-hidden="true">
            <rect className="scrub-base" x="0" y="0" width="1000" height="58" rx="0" />
            {v.ticks.map((k, i) => (
              <rect
                key={i}
                className={k.unbacked_usd > 0 ? 'scrub-bad' : 'scrub-ok'}
                x={(i / (v.ticks.length - 1)) * 1000}
                y="0"
                width={Math.max(1, 1000 / v.ticks.length)}
                height="58"
              />
            ))}
            {v.alerts.map((a) => (
              <line
                key={a.id}
                className="scrub-alert"
                x1={((a.ts - data.window[0]) / (data.window[1] - data.window[0])) * 1000}
                x2={((a.ts - data.window[0]) / (data.window[1] - data.window[0])) * 1000}
                y1="0"
                y2="58"
              />
            ))}
            <line
              className="scrub-head"
              x1={((t - data.window[0]) / (data.window[1] - data.window[0])) * 1000}
              x2={((t - data.window[0]) / (data.window[1] - data.window[0])) * 1000}
              y1="0"
              y2="58"
            />
            <circle className="scrub-knob" cx={((t - data.window[0]) / (data.window[1] - data.window[0])) * 1000} cy="29" r="6" />
          </svg>
          <input
            type="range"
            min={data.window[0]}
            max={data.window[1]}
            value={Math.floor(t)}
            aria-label="Replay time"
            onChange={(e) => setT(+e.target.value)}
            style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'ew-resize' }}
          />
        </div>
        <div className="ws-scrub-legend">
          <span><i className="k-ok" />backed</span>
          <span><i className="k-bad" />no deposit</span>
          <span><i className="k-tick" />alert</span>
        </div>
        <span className="ws-clock mono">{utc(t).slice(5, 19)}</span>
      </div>
      <div className="ws-grid">
        <div className="ws-left">
          <section className="ws-panel">
            <header className="plate-head">
              <span className="label">{data.label} · drag to orbit, scroll to zoom, click a payout</span>
              <span className="mono small dim">{v.withdrawals.length} payouts · {usd(v.unbacked)} with no deposit</span>
            </header>
            <div className="ws-ledger-body" style={{ minHeight: 520 }}>
              <Map3D data={data} n={v.n} selected={top?.id ?? null} onSelect={setSel} spin={playing} />
            </div>
          </section>
        </div>
        <aside className="ws-right"><AlertCard e={top} data={data} /></aside>
      </div>
    </>
  );
}