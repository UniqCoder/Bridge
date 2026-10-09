import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { BookOpenText, ChartBar, MagnifyingGlass, Pulse } from '@phosphor-icons/react';
import { Mark, Tag } from '../design/ui';
import { CaseBar } from '../live/CaseBar';
import '../live/live.css';
import { API } from '../data';

export const TABS: { to: string; label: string; glyph: JSX.Element; hint: string; short?: string; also?: string[] }[] = [
  { to: 'live', label: 'Monitor', glyph: <Pulse size={20} weight="light" />, hint: 'Replay a real hack or launch an attack: every alert explained' },
  { to: 'pairing', label: 'Investigate', glyph: <MagnifyingGlass size={20} weight="light" />, hint: 'How each check works, on real data, and the proof you can verify', also: ['budget', 'contagion', 'signers', 'evidence', 'map'] },
  { to: 'results', label: 'Results', glyph: <ChartBar size={20} weight="light" />, hint: 'What we caught, what we got wrong, measured' },
];


export function ConsoleLayout() {
  const { pathname } = useLocation();
  const tab = TABS.find((t) => [t.to, ...(t.also ?? [])].some((p) => pathname.includes(`/console/${p}`)));
  return (
    <div className="console">
      <nav className="rail" aria-label="Console">
        <Link to="/" className="rail-home" aria-label="Back to site"><Mark size={24} /></Link>
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={() => `rail-tab${tab === t ? ' active' : ''}`} title={t.hint}>{t.glyph}<span>{t.short ?? t.label}</span></NavLink>
        ))}
        <NavLink to="/docs/architecture" className="rail-tab rail-tab--end" title="How it is built"><BookOpenText size={20} weight="light" /><span>How</span></NavLink>
      </nav>
      <div className="console-main">
        <header className="statusbar">
          <div className="row" style={{ gap: 14, minWidth: 0 }}>
            <h1 className="statusbar-title">{tab?.label ?? 'Console'}</h1>
            <span className="label hide-md">{tab?.hint}</span>
          </div>
          <Tag kind={API ? 'live' : undefined}>{API ? 'live server' : 'built-in replay files'}</Tag>
        </header>
        {tab?.to === 'pairing' && !pathname.endsWith('/map') && <CaseBar />}
        <main className="console-page"><Suspense fallback={<div className="page-loading label">Loading…</div>}><Outlet /></Suspense></main>
      </div>
    </div>
  );
}
