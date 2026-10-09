import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Glyph } from '../design/glyphs';
import { Mark, Tag } from '../design/ui';
import { API } from '../data';

export const TABS: { to: string; label: string; glyph: JSX.Element; hint: string; short?: string }[] = [
  { to: 'live', label: 'Live console', short: 'Live', glyph: Glyph.monitor, hint: 'Replay a real hack or watch a real bridge: graph, alerts, reasons' },
  { to: 'map', label: '3D map', short: 'Map', glyph: Glyph.graph, hint: 'The bridge as a 3D map: deposits on one side, payouts on the other' },
  { to: 'usps', label: 'Our four ideas', short: 'Ideas', glyph: Glyph.seal, hint: 'Try each idea on real data' },
  { to: 'evidence', label: 'Check it yourself', short: 'Check', glyph: Glyph.evidence, hint: 'Pick a payout and see the proof, or try to cheat it' },
  { to: 'results', label: 'Results', glyph: Glyph.eval, hint: 'What we caught, what we got wrong, measured' },
];

export function ConsoleLayout() {
  const { pathname } = useLocation();
  const tab = TABS.find((t) => pathname.includes(`/console/${t.to}`));
  return (
    <div className="console">
      <nav className="rail" aria-label="Console">
        <Link to="/" className="rail-home" aria-label="Back to site"><Mark size={24} /></Link>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className="rail-tab" title={t.hint}>{t.glyph}<span>{t.short ?? t.label}</span></NavLink>
        ))}
        <NavLink to="/docs/architecture" className="rail-tab rail-tab--end" title="How it is built">{Glyph.docs}<span>How</span></NavLink>
      </nav>
      <div className="console-main">
        <header className="statusbar">
          <div className="row" style={{ gap: 14, minWidth: 0 }}>
            <h1 className="statusbar-title">{tab?.label ?? 'Console'}</h1>
            <span className="label hide-md">{tab?.hint}</span>
          </div>
          <Tag kind={API ? 'live' : undefined}>{API ? 'live server' : 'built-in replay files'}</Tag>
        </header>
        <div className="console-page"><Suspense fallback={<div className="page-loading label">Loading…</div>}><Outlet /></Suspense></div>
      </div>
    </div>
  );
}
