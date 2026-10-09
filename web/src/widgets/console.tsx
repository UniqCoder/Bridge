import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { NOMAD } from '../data';
import { CFG, controls, END, ESCALATION, useClock, type Decision, type ReplayState } from '../data/replay';
import { Chain, Hash, Odometer, Plate, Tag, Verdict, short } from '../design/ui';
import { Glyph } from '../design/glyphs';
import { duration, formatUnits, usd, utc } from '../lib/format';

const SPEEDS = [1, 10, 60, 300, 1000];
const BINS = 160;

// Event-density scrubber over the replay window: copper = attack releases, patina = matched transfers.
export function Scrubber() {
  const { t } = useClock();
  const span = END - CFG.start;
  const bins = useMemo(() => {
    const a = new Array(BINS).fill(0), n = new Array(BINS).fill(0);
    const bin = (ts: number) => Math.floor(((ts - CFG.start) / span) * BINS);
    for (const r of NOMAD.attack) { const b = bin(r.ts); if (b >= 0 && b < BINS) a[b]++; }
    for (const r of NOMAD.normal) { const b = bin(r.ts); if (b >= 0 && b < BINS) n[b]++; }
    const max = Math.max(...a, ...n, 1);
    return { a: a.map((x) => x / max), n: n.map((x) => x / max) };
  }, [span]);
  const x = (ts: number) => ((ts - CFG.start) / span) * 100;
  return (
    <div className="scrubber">
      <svg viewBox={`0 0 ${BINS} 40`} preserveAspectRatio="none" aria-hidden="true">
        {bins.n.map((h, i) => h > 0 && <rect key={`n${i}`} x={i} y={40 - h * 36} width={0.7} height={h * 36} className="sb-normal" />)}
        {bins.a.map((h, i) => h > 0 && <rect key={`a${i}`} x={i} y={40 - Math.max(2, h * 36)} width={0.7} height={Math.max(2, h * 36)} className="sb-attack" />)}
      </svg>
      <span className="sb-mark" style={{ left: `${x(ESCALATION.route)}%` }}><span className="label">21:32:31 first unbacked</span></span>
      <span className="sb-mark sb-mark--b" style={{ left: `${x(ESCALATION.verifier)}%` }}><span className="label">verifier scope</span></span>
      <span className="sb-head" style={{ left: `${x(t)}%` }} />
      <input type="range" min={CFG.start} max={END} value={Math.floor(t)} onChange={(e) => controls.seek(+e.target.value)} aria-label="Seek replay" />
      <div className="sb-axis label"><span>{utc(CFG.start).slice(11, 16)} UTC</span><span>{utc(END).slice(11, 16)}</span></div>
    </div>
  );
}

export function Transport({ compact }: { compact?: boolean }) {
  const { playing, speed, blindAt } = useClock();
  return (
    <div className={`transport ${compact ? 'transport--compact' : ''}`}>
      <div className="row" style={{ gap: 8 }}>
        <button className="btn btn--sm" onClick={controls.toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? Glyph.pause : Glyph.play}{playing ? 'Pause' : 'Play'}</button>
        <button className="btn btn--line btn--sm" onClick={() => controls.seek(ESCALATION.route - 20)}>Jump to the first theft (21:32)</button>
      </div>
      <div className="row speeds" role="group" aria-label="Speed">
        {SPEEDS.map((s) => <button key={s} className="btn btn--line btn--sm" aria-pressed={speed === s} onClick={() => controls.speed(s)}>{s}×</button>)}
      </div>
      {!compact && (
        <button className="btn btn--line btn--sm" aria-pressed={blindAt !== null} onClick={() => controls.blind(blindAt === null)} title="S3 preview: the source observer stalls while the destination keeps flowing">
          {blindAt !== null ? 'Restore the source data feed' : 'Cut the source data feed'}
        </button>
      )}
      <Scrubber />
    </div>
  );
}

export function WatermarkGauges({ s }: { s: ReplayState }) {
  const lagSrc = s.t - s.wmSource;
  const rows = [
    { id: NOMAD.chains.source, wm: s.wmSource, lag: lagSrc, role: 'source · deposits', stalled: s.blinded },
    { id: NOMAD.chains.destination, wm: s.wmDest, lag: s.t - s.wmDest, role: 'destination · releases', stalled: false },
  ];
  return (
    <Plate title="How far we have seen each chain" actions={s.blinded ? <span className="tag" style={{ color: 'var(--pending)', borderColor: 'var(--pending)' }}>feed down</span> : <Tag>feeds healthy</Tag>}>
      <div className="gauges">
        {rows.map((r) => (
          <div key={r.id} className="gauge">
            <div className="spread"><Chain id={r.id} /><span className="label">{r.role}</span></div>
            <span className="readout-value" style={{ fontSize: 22 }}>{utc(r.wm).slice(11, 19)}</span>
            <div className="meter"><span style={{ width: `${Math.max(2, 100 - Math.min(100, r.lag))}%`, background: r.stalled ? 'var(--pending)' : 'var(--text-2)' }} /></div>
            <span className="label">{duration(r.lag)} behind live{r.stalled ? ' · feed cut: new releases show as unknown' : ''}</span>
          </div>
        ))}
        <div className="gauge-foot mono dim">pending {s.pending} · overdue {s.overdue} · unknown {s.unknown}</div>
      </div>
    </Plate>
  );
}

export function IncidentCard({ s, link = true }: { s: ReplayState; link?: boolean }) {
  const inc = s.incident;
  if (!inc) {
    return (
      <Plate title="Incident" actions={<Tag>none open</Tag>}>
        <p className="dim" style={{ fontSize: 13 }}>No violations yet. {s.t < ESCALATION.route ? `The first unbacked release lands at ${utc(ESCALATION.route).slice(11, 19)} UTC.` : ''}</p>
      </Plate>
    );
  }
  const p = inc.priority;
  const tokens = [...inc.exposure.entries()].sort((a, b) => b[1].usd - a[1].usd);
  return (
    <Plate title={<>Incident <b>{inc.id}</b></>} meta={inc.copycat ? <span className="tag" style={{ color: 'var(--violation)', borderColor: 'var(--violation)' }}>copycat swarm</span> : null}
      actions={link && <Link to="/console/incidents/inc_nomad" className="cap-link">Open →</Link>}>
      <div className="incident">
        <div className="readout">
          <span className="label">Exposure · dataset USD</span>
          <span className="incident-usd"><Odometer value={usd(inc.exposureUsd)} /></span>
        </div>
        <div className="incident-stats">
          <div><span className="label">violations</span><span className="mono">{inc.count}</span></div>
          <div><span className="label">beneficiaries</span><span className="mono">{inc.beneficiaries}</span></div>
          <div><span className="label">since</span><span className="mono">{utc(inc.firstSeen).slice(11, 19)}</span></div>
          <div><span className="label">scope</span><span className="mono">{inc.scope}</span></div>
        </div>
        <div className="row-wrap">{tokens.map(([t, e]) => <span key={t} className="token-chip mono">{t} <span className="dim">{usd(e.usd)}</span></span>)}</div>
        <div className="prio">
          <div className="spread"><span className="label">Priority, out of 100 (a ranking, not a probability)</span><span className="mono">{p.total}</span></div>
          <div className="prio-bar">
            <span style={{ flex: p.base }} className="prio-base">base {p.base}</span>
            <span style={{ flex: p.exposure }} className="prio-exp">+{p.exposure.toFixed(1)}</span>
            {p.campaign > 0 && <span style={{ flex: p.campaign }} className="prio-camp">+{p.campaign}</span>}
            <span style={{ flex: 100 - p.base - p.exposure - p.campaign }} />
          </div>
          <span className="label">attack type (80) + size bonus (up to 15) + copycat bonus (up to 5), scaled by how complete our view is ({p.completeness})</span>
        </div>
      </div>
    </Plate>
  );
}

const sevBar = (u: number) => Math.min(1, Math.log10(Math.max(1, u)) / 8);

export function DecisionRow({ d, onClick }: { d: Decision; onClick?: () => void }) {
  const conf = d.status === 'unknown' ? 0.25 : 0.9;
  return (
    <tr onClick={onClick} className={onClick ? 'is-clickable' : ''}>
      <td className="mono">{utc(d.ts).slice(11, 19)}</td>
      <td><Verdict status={d.status} /></td>
      <td className="mono">{d.kind === 'attack' ? d.rules[0] ?? d.reason : d.reason ?? 'matched deposit'}</td>
      <td className="num mono">{d.decimals !== null ? formatUnits(d.amount, d.decimals).replace(/\.?0+$/, '') : short(d.amount)} {d.token}</td>
      <td className="mono hide-md">id {d.id}</td>
      <td className="hide-md"><Hash value={d.tx} chain={6648936} head={6} tail={4} /></td>
      <td className="bars hide-md" title="size of loss · how certain the evidence is">
        <span className="bar"><i style={{ width: `${sevBar(d.usd) * 100}%` }} /></span>
        <span className="bar bar--c"><i style={{ width: `${conf * 100}%` }} /></span>
      </td>
    </tr>
  );
}

export function DecisionFeed({ s, limit = 60, title = 'Verdict stream' }: { s: ReplayState; limit?: number; title?: string }) {
  const rows = s.decisions.slice(0, limit);
  return (
    <Plate title={title} actions={<span className="label">{s.decisions.length} decisions</span>} bodyClass="feed">
      {rows.length === 0 ? <p className="dim" style={{ padding: 16, fontSize: 13 }}>Press play. Releases appear as the destination watermark passes them.</p> : (
        <table className="table">
          <thead><tr><th>time</th><th>verdict</th><th>why</th><th className="num">amount</th><th className="hide-md">message</th><th className="hide-md">tx</th><th className="hide-md">size · certainty</th></tr></thead>
          <tbody>{rows.map((d) => <DecisionRow key={d.key} d={d} />)}</tbody>
        </table>
      )}
    </Plate>
  );
}
