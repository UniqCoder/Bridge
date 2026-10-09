import { useEffect, useMemo, useRef, useState } from 'react';
import type { Ev, Replay } from './data';
import { SOURCE_CHAIN, TYPE_SHORT, human } from './data';
import { usd } from '../lib/format';

/**
 * The conservation ledger: the bridge is the centre line. Deposits locked on the source chain sit above it,
 * payouts released on the destination chain sit below it, both at height = value (log scale).
 * A backed payout is tethered to the deposit the pairing matched it to; a payout with no deposit hangs from nothing.
 * Everything drawn comes from the replay events; nothing is interpolated.
 */
type Props = {
  data: Replay; n: number; t: number; domain: [number, number];
  selected: string | null; onSelect: (id: string) => void;
  focus: ((e: Ev) => boolean) | null;
};

const M = { l: 70, r: 18, t: 34, b: 34 };
const GAP = 9; // half-height of the bridge band

type Geo = { e: Ev; x: number; y: number; r: number; dep?: { x: number; y: number; inView: boolean } };

export function Ledger({ data, n, t, domain, selected, onSelect, focus }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  const [hover, setHover] = useState<Ev | null>(null);
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 640 ? 380 : 460;
  const mid = M.t + (H - M.t - M.b) / 2;
  const half = (H - M.t - M.b) / 2 - GAP;
  const [d0, d1] = domain;
  const x = (ts: number) => M.l + ((ts - d0) / (d1 - d0)) * (W - M.l - M.r);

  // Value scale shared by both halves: $1 at the bridge line, the feed's largest value at the edge.
  const hi = useMemo(() => Math.ceil(Math.log10(Math.max(10, ...data.events.map((e) => e.usd ?? 0)))), [data]);
  const off = (v: number | null) => (v == null ? 4 : 4 + (Math.max(0, Math.log10(Math.max(v, 1))) / hi) * (half - 4));

  // Geometry for every event in view (independent of the clock, so playing only filters).
  const geo = useMemo(() => {
    const out: Geo[] = [];
    for (const e of data.events) {
      if (e.ts < d0 || e.ts > d1) continue;
      const v = e.usd;
      const r = 2.2 + Math.max(0, Math.log10(Math.max(v ?? 1, 1))) * 0.62;
      if (e.kind === 'deposit') { out.push({ e, x: x(e.ts), y: mid - GAP - off(v), r: r * 0.9 }); continue; }
      const g: Geo = { e, x: x(e.ts), y: mid + GAP + off(v), r };
      if (e.deposit) {
        const inView = e.deposit.ts >= d0;
        // Paired deposit, valued at the payout's price scaled by the deposit/payout amount ratio (same token).
        const ratio = Number(BigInt(e.deposit.amount)) / Math.max(1, Number(BigInt(e.amount)));
        g.dep = { x: inView ? x(e.deposit.ts) : Math.max(M.l, g.x - 46), y: mid - GAP - off(v == null ? null : v * ratio), inView };
      }
      out.push(g);
    }
    return out;
  }, [data, d0, d1, W, H, hi]);

  const seen = useMemo(() => geo.filter((g) => g.e.ts <= t), [geo, n, Math.floor(t)]);
  const sel = selected ? geo.find((g) => g.e.id === selected) ?? null : null;
  const cluster = sel?.e.signals && sel.e.signals.cluster_size > 1 ? sel.e.signals.cluster : null;

  // Axis ticks: whole hours (or 10/30 min when zoomed in), UTC.
  const ticks = useMemo(() => {
    const span = d1 - d0;
    const step = span > 6 * 3600 ? 3600 : span > 2 * 3600 ? 1800 : span > 3600 ? 900 : 300;
    const out: number[] = [];
    for (let s = Math.ceil(d0 / step) * step; s <= d1; s += step) out.push(s);
    return out;
  }, [d0, d1]);
  const vals = [3, 6, 9].filter((p) => p <= hi);
  const px = x(Math.min(Math.max(t, d0), d1));
  const tone = (e: Ev) => (e.kind === 'deposit' ? 'dep' : e.status === 'violation' ? 'bad' : e.level === 'suspicious' ? 'warn' : 'ok');
  const dim = (e: Ev) => (focus && e.kind === 'withdrawal' && !focus(e) ? ' is-dim' : '');
  const src = SOURCE_CHAIN[data.feed] ?? data.src;
  const info = hover ?? sel?.e ?? null;

  return (
    <div ref={box} className="lx">
      <div className={`lx-read${info ? '' : ' is-empty'}`} aria-live="off">
        {info ? <>
          <b className={`lx-read-k lx-k-${tone(info)}`}>{info.kind === 'deposit' ? `Deposit on ${src}` : info.status === 'violation' ? 'Payout, rule broken' : info.level === 'suspicious' ? 'Payout, suspicious' : 'Payout, backed'}</b>
          <span className="mono">{info.symbol} {human(info.amount, info.decimals, 2)}{info.usd != null ? ` · ${usd(info.usd)}` : ' · unpriced'}</span>
          <span className="mono dim">{new Date(info.ts * 1000).toISOString().slice(11, 19)} UTC</span>
          {info.kind === 'withdrawal' && info.type && info.level !== 'none' && <span>{TYPE_SHORT[info.type] ?? info.type}</span>}
        </> : <span className="dim">Point at a mark to read it. Click a payout to open its case file.</span>}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Conservation ledger for ${data.label}: deposits on ${src} above the bridge line, payouts on ${data.dst} below. Red payouts have no deposit behind them.`}>
        <defs>
          <linearGradient id="lx-src" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--moon)" stopOpacity="0.07" /><stop offset="1" stopColor="var(--moon)" stopOpacity="0" /></linearGradient>
          <linearGradient id="lx-dst" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="var(--eth)" stopOpacity="0.06" /><stop offset="1" stopColor="var(--eth)" stopOpacity="0" /></linearGradient>
        </defs>
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={half} fill="url(#lx-src)" />
        <rect x={M.l} y={mid + GAP} width={W - M.l - M.r} height={half} fill="url(#lx-dst)" />

        {/* value gridlines, mirrored */}
        {vals.map((p) => [mid - GAP - off(10 ** p), mid + GAP + off(10 ** p)].map((y, i) => (
          <g key={`${p}${i}`} className="lx-grid"><line x1={M.l} x2={W - M.r} y1={y} y2={y} /><text x={M.l - 8} y={y + 4} textAnchor="end">{p === 3 ? '$1k' : p === 6 ? '$1M' : '$1B'}</text></g>)))}
        {ticks.map((s) => (
          <g key={s} className="lx-grid"><line x1={x(s)} x2={x(s)} y1={M.t} y2={H - M.b} /><text x={x(s)} y={H - M.b + 18} textAnchor="middle">{new Date(s * 1000).toISOString().slice(11, 16)}</text></g>))}

        {/* lane labels */}
        <text className="lx-lane lx-lane--src" x={M.l + 10} y={M.t + 16}>{src} · deposits locked (source)</text>
        <text className="lx-lane lx-lane--dst" x={M.l + 10} y={H - M.b - 10}>{data.dst} · payouts released (destination)</text>

        {/* the bridge */}
        <rect className="lx-bridge" x={M.l} y={mid - GAP} width={W - M.l - M.r} height={GAP * 2} />
        <text className="lx-bridge-t" x={M.l - 8} y={mid + 4} textAnchor="end">bridge</text>

        {/* tethers: payout -> matched deposit; stems: payout with nothing above it */}
        <g className="lx-links">
          {seen.map(({ e, x: gx, y, dep }) => {
            if (e.kind !== 'withdrawal') return null;
            const c = `${tone(e)}${dim(e)}${cluster && e.signals?.cluster === cluster ? ' is-mate' : ''}${e.id === selected ? ' is-sel' : ''}`;
            if (dep) {
              const my = mid;
              return <path key={e.id} className={`lx-tether lx-${c}${dep.inView ? '' : ' is-early'}`}
                d={`M${gx},${y} C${gx},${my} ${dep.x},${my} ${dep.x},${dep.y}`} />;
            }
            return <path key={e.id} className={`lx-stem lx-${c}`} d={`M${gx},${y} L${gx},${mid + GAP}`} />;
          })}
        </g>

        <g className="lx-marks">
          {seen.map(({ e, x: gx, y, r }) => (
            <circle key={e.id} cx={gx} cy={y} r={e.id === selected ? r + 2 : r}
              className={`lx-dot lx-${tone(e)}${dim(e)}${e.usd == null ? ' is-unpriced' : ''}${cluster && e.signals?.cluster === cluster ? ' is-mate' : ''}${e.id === selected ? ' is-sel' : ''}`}
              onClick={() => e.kind === 'withdrawal' && onSelect(e.id)}
              onPointerEnter={() => setHover(e)} onPointerLeave={() => setHover(null)} />))}
        </g>

        {sel && sel.e.ts <= t && <g className="lx-focus">
          <circle cx={sel.x} cy={sel.y} r={sel.r + 9} />
          {sel.dep?.inView && <circle cx={sel.dep.x} cy={sel.dep.y} r={sel.r + 6} />}
          {!sel.dep && <text x={sel.x} y={mid - GAP - 6} textAnchor="middle">no deposit</text>}
        </g>}

        {t >= d0 && t <= d1 && <g className="lx-play"><line x1={px} x2={px} y1={M.t - 8} y2={H - M.b} /><text x={Math.min(Math.max(px, M.l + 34), W - M.r - 34)} y={M.t - 14} textAnchor="middle">{new Date(t * 1000).toISOString().slice(11, 19)}</text></g>}
      </svg>
    </div>
  );
}
