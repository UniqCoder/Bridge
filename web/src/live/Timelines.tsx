import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { Replay } from './data';

const AX = { stroke: '#6b727d', grid: { stroke: '#1c1f24', width: 1 }, ticks: { stroke: '#23262c' }, font: '10px Martian Mono, monospace' };
const SYNC = uPlot.sync('bw-live');

type Spec = { title: string; note: string; series: { label: string; color: string; get: (k: Replay['ticks'][number]) => number; fill?: string; scale?: string }[];
  scales?: uPlot.Scales; axes?: uPlot.Axis[]; hline?: { y: number; label: string; scale?: string } };

export const CHARTS: Spec[] = [
  { title: 'Conservation ledger', note: 'value released with a deposit behind it vs without (USD, cumulative)',
    series: [
      { label: 'backed', color: '#2fd4b5', get: (k) => k.backed_usd, fill: 'rgba(47,212,181,0.08)' },
      { label: 'unbacked (gap)', color: '#ff6a3d', get: (k) => k.unbacked_usd, fill: 'rgba(255,106,61,0.14)' }] },
  { title: 'Contagion radar', note: 'largest copy-paste cluster · Hawkes branching ratio n̂ (spread; ≈1 = self-sustaining)',
    series: [
      { label: 'cluster size', color: '#ff6a3d', get: (k) => k.cluster_max },
      { label: 'n̂', color: '#e3b04b', get: (k) => k.hawkes_n, scale: 'n' }],
    scales: { n: { range: [0, 3.2] } } },
  { title: 'Accusation budget', note: 'e-CUSUM evidence (log₁₀). Alarm at 3 = average ≥ 1,000 normal releases per false alarm',
    series: [{ label: 'log₁₀ evidence', color: '#e3b04b', get: (k) => (k.ecusum > 0 ? Math.log10(k.ecusum) : 0) }],
    scales: { y: { range: [-1, 6] } }, hline: { y: 3, label: 'alarm' } },
];

function fmtUsd(v: number) { return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`; }

export function Timeline({ data, t, spec, idx }: { data: Replay; t: number; spec: Spec; idx: number }) {
  const box = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    const el = box.current!;
    const hl = spec.hline;
    const opts: uPlot.Options = {
      width: el.clientWidth || 600, height: 120, legend: { show: true, live: true },
      cursor: { sync: { key: SYNC.key }, drag: { x: false, y: false } },
      scales: { x: { time: true }, ...(spec.scales ?? {}) },
      axes: [
        { ...AX, values: (_u, vals) => vals.map((v) => new Date(v * 1000).toISOString().slice(11, 16)) },
        { ...AX, size: 56, values: idx === 0 ? (_u, vals) => vals.map(fmtUsd) : undefined },
        ...(spec.series.some((s) => s.scale === 'n') ? [{ ...AX, scale: 'n', side: 1 as const, size: 34, grid: { show: false } }] : []),
      ],
      series: [{}, ...spec.series.map((s) => ({ label: s.label, stroke: s.color, width: 1.6, fill: s.fill, scale: s.scale, points: { show: false } }))],
      hooks: hl ? { draw: [(u) => {
        const y = u.valToPos(hl.y, hl.scale ?? 'y', true);
        const ctx = u.ctx; ctx.save(); ctx.strokeStyle = '#ff6a3d'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(u.bbox.left, y); ctx.lineTo(u.bbox.left + u.bbox.width, y); ctx.stroke();
        ctx.fillStyle = '#ff6a3d'; ctx.font = '10px Martian Mono, monospace'; ctx.fillText(hl.label, u.bbox.left + 6, y - 4); ctx.restore();
      }] } : undefined,
    };
    const u = new uPlot(opts, [[]], el);
    plot.current = u;
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: 120 }));
    ro.observe(el);
    return () => { ro.disconnect(); u.destroy(); plot.current = null; };
  }, [data, spec, idx]);

  // Full x-range always; values after the clock are hidden so the line "draws" as the replay runs.
  useEffect(() => {
    const u = plot.current;
    if (!u) return;
    const xs = data.ticks.map((k) => k.t);
    const ys = spec.series.map((s) => data.ticks.map((k) => (k.t <= t ? s.get(k) : null)));
    u.setData([xs, ...ys] as uPlot.AlignedData);
  }, [data, spec, Math.floor(t / 30)]);

  return (
    <div className="tl">
      <div className="tl-head"><span className="label">{spec.title}</span><span className="tl-note">{spec.note}</span></div>
      <div ref={box} className="tl-plot" />
    </div>
  );
}
