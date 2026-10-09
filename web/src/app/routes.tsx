import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SiteLayout } from './SiteLayout';
import { ConsoleLayout } from './ConsoleLayout';
import { Landing } from '../pages/site/Landing';

// Console and docs pages load on demand; the landing ships in the first chunk.
const Monitor = lazy(() => import('../pages/console/Monitor'));
const Lab = lazy(() => import('../pages/console/Lab'));
const Replay = lazy(() => import('../pages/console/Replay'));
const Graph = lazy(() => import('../pages/console/Graph'));
const Witness = lazy(() => import('../pages/console/Witness'));
const Incidents = lazy(() => import('../pages/console/Incidents'));
const Evidence = lazy(() => import('../pages/console/Evidence'));
const Gauntlet = lazy(() => import('../pages/console/Gauntlet'));
const Theatre = lazy(() => import('../pages/console/Theatre'));
const Eval = lazy(() => import('../pages/console/Eval'));
const EvidenceSpec = lazy(() => import('../pages/docs/EvidenceSpec'));
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

const Loading = () => <div className="page-loading label">Loading…</div>;

export function AppRoutes() {
  return (
    <>
      <ScrollTop />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Landing />} />
            <Route path="docs/evidence-spec" element={<EvidenceSpec />} />
            <Route path="docs/architecture" element={<Architecture />} />
          </Route>
          <Route path="console" element={<ConsoleLayout />}>
            <Route index element={<Navigate to="monitor" replace />} />
            <Route path="monitor" element={<Monitor />} />
            <Route path="lab" element={<Lab />} />
            <Route path="replay" element={<Replay />} />
            <Route path="graph" element={<Graph />} />
            <Route path="witness" element={<Witness />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<Incidents />} />
            <Route path="evidence" element={<Evidence />} />
            <Route path="evidence/:sha" element={<Evidence />} />
            <Route path="gauntlet" element={<Gauntlet />} />
            <Route path="theatre" element={<Theatre />} />
            <Route path="eval" element={<Eval />} />
          </Route>
          <Route path="*" element={<SiteLayout notFound />} />
        </Routes>
      </Suspense>
    </>
  );
}
