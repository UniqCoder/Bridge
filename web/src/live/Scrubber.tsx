import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Replay } from './data';

/**
 * Replay timeline as a seek control: payouts per time bin (backed above the baseline in teal,
 * rule-breaking stacked in red), every exploit alert as a tick, the zoomed ledger range bracketed.
 */
export function Scrubber({ data, t, setT, domain }: { data: Replay; t: number; setT: (v: number) => void; domain: [number, number] }) {
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = box.current!;
    const fit = () => { if (el.clientWidth) setW(Math.max(240, el.clientWidth)); };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 58;
  const [w0, w1] = data.window;
  const BINS = Math.max(40, Math.min(160, Math.floor(W / 7)));
  const bins = useMemo(() => {
    const b = Array.from({ length: BINS }, () => ({ ok: 0, bad: 0 }));
    for (const e of data.events) {
      if (e.kind !== 'withdrawal') continue;
      const i = Math.min(BINS - 1, Math.floor(((e.ts - w0) / (w1 - w0)) * BINS));
      if (i < 0) continue;
      if (e.status === 'violation') b[i].bad++; else b[i].ok++;
    }
    return b;
  }, [data, BINS]);
  const max = Math.max(1, ...bins.map((b) => b.ok + b.bad));
  const alerts = useMemo(() => data.events.filter((e) => e.kind === 'withdrawal' && e.level === 'exploit').map((e) => e.ts), [data]);
  const bw = W / BINS;
  const h = (v: number) => (Math.sqrt(v) / Math.sqrt(max)) * (H - 16);
  const X = (ts: number) => ((ts - w0) / (w1 - w0)) * W;

  const seek = (ev: PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setT(Math.round(w0 + Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * (w1 - w0)));
  };
  const key = (ev: KeyboardEvent) => {
    const step = ev.shiftKey ? 600 : 60;
    if (ev.key === 'ArrowRight') { setT(Math.min(w1, t + step)); ev.preventDefault(); }
    if (ev.key === 'ArrowLeft') { setT(Math.max(w0, t - step)); ev.preventDefault(); }
    if (ev.key === 'Home') { setT(w0); ev.preventDefault(); }
    if (ev.key === 'End') { setT(w1); ev.preventDefault(); }
  };
  const zoomed = domain[0] > w0 || domain[1] < w1;

  return (
    <div ref={box} className="scrub" role="slider" tabIndex={0} aria-label="Replay time" aria-valuemin={w0} aria-valuemax={w1} aria-valuenow={Math.floor(t)}
      aria-valuetext={`${new Date(t * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC`}
      onPointerDown={(ev) => { (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId); seek(ev); }}
      onPointerMove={(ev) => { if (ev.buttons & 1) seek(ev); }} onKeyDown={key}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
        {zoomed && <rect className="scrub-zoom" x={X(domain[0])} y={0} width={Math.max(2, X(domain[1]) - X(domain[0]))} height={H} />}
        {bins.map((b, i) => {
          const past = (i + 1) / BINS <= (t - w0) / (w1 - w0) + 1e-9;
          const ho = h(b.ok + b.bad), hb = h(b.bad);
          return <g key={i} className={past ? 'is-past' : ''}>
            {b.ok + b.bad > 0 && <rect className="scrub-ok" x={i * bw + 0.5} y={H - 10 - ho} width={Math.max(1, bw - 1.5)} height={ho - hb} />}
            {b.bad > 0 && <rect className="scrub-bad" x={i * bw + 0.5} y={H - 10 - hb} width={Math.max(1, bw - 1.5)} height={hb} />}
          </g>;
        })}
        <line className="scrub-base" x1={0} x2={W} y1={H - 9.5} y2={H - 9.5} />
        {alerts.map((ts, i) => <line key={i} className="scrub-alert" x1={X(ts)} x2={X(ts)} y1={H - 7} y2={H - 1} />)}
        <line className="scrub-head" x1={X(t)} x2={X(t)} y1={0} y2={H} />
        <rect className="scrub-knob" x={X(t) - 4} y={0} width={8} height={8} />
      </svg>
    </div>
  );
}
