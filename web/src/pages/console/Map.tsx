import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Pause, Play } from '@phosphor-icons/react';
import { CaseFile } from '../../live/CaseFile';
import { Map3D } from '../../live/Map3D';
import { Scrubber } from '../../live/Scrubber';
import { FEEDS, useClock, useMetrics, useReplayData, useView, type Replay } from '../../live/data';
import { usd, utc } from '../../lib/format';
import '../../live/ws.css';

const SHOWN = FEEDS.filter((f) => f.id !== 'live');

export default function MapPage() {
  const [feed, setFeed] = useState('nomad');
  const { data, err } = useReplayData(feed);
  return (
    <div className="ws">
      <nav className="ws-feeds ws-feeds--3" role="tablist" aria-label="Choose a replay">
        {SHOWN.map((f) => (
          <button key={f.id} role="tab" aria-selected={feed === f.id} className="ws-feed" onClick={() => setFeed(f.id)}>
            <b>{f.label}</b><span>{f.note}</span>
          </button>))}
      </nav>
      {err ? <div className="ws-msg ws-msg--bad">Could not load: {err}</div>
        : !data ? <div className="ws-msg" aria-busy="true"><span className="ws-skel" />Loading the map…</div>
        : <MapView data={data} key={feed} />}
    </div>
  );
}

function MapView({ data }: { data: Replay }) {
  const metrics = useMetrics();
  const [playing, setPlaying] = useState(true);
  const start = data.events[Math.min(data.events.length - 1, 15)].ts;
  const [t, setT] = useClock(data.window, (data.window[1] - data.window[0]) / 40, playing);
  const v = useView(data, Math.max(t, start))!;
  const [sel, setSel] = useState<string | null>(null);
  const [qs] = useSearchParams();
  useEffect(() => {
    const q = Number(qs.get('t'));
    if (q > 0) { setT(Math.min(Math.max(q, data.window[0]), data.window[1])); setPlaying(false); }
  }, [data]);
  const byId = useMemo(() => new Map(data.events.map((e) => [e.id, e])), [data]);
  const top = sel ? byId.get(sel) ?? null : v.alerts[v.alerts.length - 1] ?? null;
  const mates = top?.signals && top.signals.cluster_size > 1 ? v.withdrawals.filter((e) => e.signals?.cluster === top.signals!.cluster).length : 0;
  return (
    <>
      <section className="ws-transport" aria-label="Replay controls">
        <div className="ws-tbtns">
          <button className="btn ws-play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}{playing ? 'Pause' : 'Play'}
          </button>
          <span className="ws-clock mono">{utc(t).slice(0, 19)}<small>UTC</small></span>
        </div>
        <Scrubber data={data} t={t} setT={(x) => { setPlaying(false); setT(x); }} domain={data.window} />
        <div className="ws-scrub-legend"><span><i className="k-ok" />payouts backed by a deposit</span><span><i className="k-bad" />payouts breaking the rule</span><span><i className="k-tick" />exploit alert</span></div>
      </section>
      <div className="ws-grid">
        <section className="ws-panel">
          <header className="ws-ph">
            <div><h2 className="ws-h">3D flow map</h2><p className="dim">{data.label}. Drag to orbit, scroll to zoom, click a payout to open its case.</p></div>
            <span className="mono dim">{v.withdrawals.length} payouts · <span className="bad">{usd(v.unbacked)}</span> not backed</span>
          </header>
          <div className="ws-map"><Map3D data={data} n={v.n} selected={top?.id ?? null} onSelect={(id) => { setSel(id); setPlaying(false); }} spin={playing} /></div>
        </section>
        <div className="ws-right"><CaseFile e={top} data={data} threshold={metrics?.ecusum_threshold ?? null} mates={mates} /></div>
      </div>
    </>
  );
}
