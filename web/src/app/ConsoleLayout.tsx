import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Glyph } from '../design/glyphs';
import { Chain, Mark, Tag } from '../design/ui';
import { MODE } from '../data';
import { controls, useClock, useReplay } from '../data/replay';
import { utc } from '../lib/format';

export const TABS: { to: string; label: string; glyph: JSX.Element; hint: string; short?: string }[] = [
  { to: 'live', label: 'Live console', short: 'Live', glyph: Glyph.monitor, hint: 'Replay real attacks or tail a live bridge: graph, alerts, reasons, proof' },
  { to: 'monitor', label: 'Monitor (v2)', short: 'v2', glyph: Glyph.eval, hint: 'Previous fixture-mode dashboard' },
  { to: 'lab', short: 'USPs', label: 'USP demos', glyph: Glyph.seal, hint: 'Try each of our 7 USPs' },
  { to: 'gauntlet', short: 'Attacks', label: 'Attack tests', glyph: Glyph.gauntlet, hint: 'Run 12 attacks against a simulated bridge' },
  { to: 'evidence', label: 'Evidence', glyph: Glyph.evidence, hint: 'Check an alert yourself, or try to tamper with it' },
  { to: 'incidents', label: 'Incidents', glyph: Glyph.incident, hint: 'Many alerts grouped into one incident' },
  { to: 'theatre', label: 'What-if', glyph: Glyph.theatre, hint: 'What if we had responded faster?' },
  { to: 'replay', label: 'Nomad', glyph: Glyph.replay, hint: 'Replay the real 2022 Nomad hack' },
  { to: 'graph', short: 'Map', label: 'Flow map', glyph: Glyph.graph, hint: 'Where the Nomad money came from, in 3D' },
  { to: 'witness', short: 'Bridge', label: 'Live bridge', glyph: Glyph.witness, hint: 'The bridge as a 3D scene' },
  { to: 'eval', label: 'Results', glyph: Glyph.eval, hint: 'Measured numbers and the ML model card' },
];

function StatusBar() {
  const s = useReplay();
  const { playing, speed } = useClock();
  const { pathname } = useLocation();
  const tab = TABS.find((t) => pathname.includes(`/console/${t.to}`));
  const usesClock = ['replay', 'graph', 'witness'].includes(tab?.to ?? '');
  return (
    <header className="statusbar">
      <div className="row" style={{ gap: 14, minWidth: 0 }}>
        <h1 className="statusbar-title">{tab?.label ?? 'Console'}</h1>
        <span className="label hide-md">{tab?.hint}</span>
      </div>
      {usesClock && <div className="statusbar-chains hide-md">
        <div className="wm">
          <Chain id={1650811245} showId={false} />
          <span className="mono">{utc(s.wmSource).slice(11, 19)}</span>
          {s.blinded && <span className="tag tag--pending" style={{ color: 'var(--pending)' }}>stalled</span>}
        </div>
        <div className="wm">
          <Chain id={6648936} showId={false} />
          <span className="mono">{utc(s.wmDest).slice(11, 19)}</span>
        </div>
      </div>}
      <div className="row" style={{ gap: 10 }}>
        {usesClock && <>
          <button className="icon-btn" onClick={controls.toggle} aria-label={playing ? 'Pause replay' : 'Play replay'}>{playing ? Glyph.pause : Glyph.play}</button>
          <span className="mono clock">Nomad {utc(s.t).slice(5, 19).replace('T', ' ')} <span className="dim">· {speed}×</span></span>
        </>}
        <Tag kind={MODE === 'live' ? 'live' : undefined}>{MODE === 'live' ? 'live api' : 'fixture'}</Tag>
      </div>
    </header>
  );
}

export function ConsoleLayout() {
  return (
    <div className="console">
      <nav className="rail" aria-label="Console">
        <Link to="/" className="rail-home" aria-label="Back to site"><Mark size={24} /></Link>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className="rail-tab" title={t.hint}>
            {t.glyph}
            <span>{t.short ?? t.label}</span>
          </NavLink>
        ))}
        <NavLink to="/docs/evidence-spec" className="rail-tab rail-tab--end" title="Evidence spec">{Glyph.docs}<span>Spec</span></NavLink>
      </nav>
      <div className="console-main">
        <StatusBar />
        <div className="console-page"><Suspense fallback={<div className="page-loading label">Loading…</div>}><Outlet /></Suspense></div>
      </div>
    </div>
  );
}
