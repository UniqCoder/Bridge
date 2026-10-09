import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';
import { ConsoleLayout } from './ConsoleLayout';
import { Landing } from '../pages/site/Landing';

// Console and docs pages load on demand; the landing ships in the first chunk.
const Live = lazy(() => import('../pages/console/Live'));
const MapPage = lazy(() => import('../pages/console/Map'));
const Usps = lazy(() => import('../pages/console/Usps'));
const Evidence = lazy(() => import('../pages/console/Evidence'));
const Results = lazy(() => import('../pages/console/Results'));
const Architecture = lazy(() => import('../pages/docs/Architecture'));

function ScrollTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo(0, 0); return; }
    // Pages load lazily, so the anchor may not exist yet: retry for about a second.
    let tries = 0;
    const id = setInterval(() => {
      const el = document.getElementById(hash.slice(1));
      if (el) { el.scrollIntoView(); clearInterval(id); } else if (++tries > 20) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, [pathname, hash]);
  return null;
}

// Old page addresses (from the first prototype) land on their replacements.
const MOVED: Record<string, string> = { lab: 'budget', eval: 'results', graph: 'map' };

export function AppRoutes() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<div className="page-loading label">Loading…</div>}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Landing />} />
            <Route path="docs/architecture" element={<Architecture />} />
          </Route>
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<Navigate to="live" replace />} />
            <Route path="live" element={<Live />} />
            <Route path="map" element={<MapPage />} />
            <Route path="usps" element={<Navigate to="budget" replace />} />
            <Route path="budget" element={<Usps n={1} />} />
            <Route path="contagion" element={<Usps n={2} />} />
            <Route path="signers" element={<Usps n={3} />} />
            <Route path="pairing" element={<Usps n={4} />} />
            <Route path="evidence" element={<Evidence />} />
            <Route path="results" element={<Results />} />
            {['monitor', 'lab', 'replay', 'graph', 'witness', 'incidents', 'gauntlet', 'theatre', 'eval'].map((p) => (
              <Route key={p} path={`${p}/*`} element={<Navigate to={`/console/${MOVED[p] ?? 'live'}`} replace />} />))}
          </Route>
          <Route path="*" element={<SiteLayout notFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
