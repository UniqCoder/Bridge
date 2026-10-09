import { Suspense, useEffect } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { ButtonLink, Logo, Tag } from '../design/ui';
import { MODE, SOURCES } from '../data';

export const NON_CLAIMS = [
  'Priority is a ranking with a visible breakdown, not a probability of exploit.',
  "Inclusion and exclusion proofs verify against block headers supplied by our server; on local chains these can't be cross-checked externally.",
  'Consensus finality is an RPC assumption; a light client is on the roadmap.',
  "Nomad labels derive from XChainWatcher's matching rules; reproducing them validates implementation, not independent detection power.",
  'Counterfactual figures assume attackers behave the same after a hold, and that detection fires on the first unbacked release. They are estimates, not recovered funds.',
  "USD exposure uses the dataset's historical value_usd, not a live oracle.",
  'The live demo runs on local chains with unaudited demo contracts; no public-network funds are involved.',
  'Supported route model: lock/mint and burn/release with fixed fees. Liquidity and intent bridges need their own adapters.',
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="stack" style={{ gap: 16 }}>
          <Logo />
          <p className="t-body" style={{ fontSize: 14 }}>An independent witness and enforcement point for cross-chain bridges. Every release must consume a verified, unspent deposit, to the wei.</p>
          <div className="row-wrap"><Tag kind="real">Built on real Nomad + Ronin data</Tag><Tag>{MODE} mode</Tag></div>
        </div>
        <div className="stack">
          <span className="label">What we do not claim</span>
          <ol className="nonclaims">{NON_CLAIMS.map((c) => <li key={c}>{c}</li>)}</ol>
        </div>
        <div className="stack">
          <span className="label">Data &amp; licence</span>
          <p className="dim" style={{ fontSize: 13 }}>
            Nomad and Ronin CSVs from XChainWatcher (Augusto et al., arXiv 2410.02029), © 2024 André Augusto, MIT License.
            Pinned by SHA-256: <a href="/THIRD_PARTY_NOTICES.txt">full notice</a>.
          </p>
          <ul className="sources">{SOURCES.map((s) => <li key={s.path} className="mono">{s.path.split('/').pop()} <span className="dim">{s.sha256.slice(0, 12)}…</span></li>)}</ul>
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout({ notFound }: { notFound?: boolean }) {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.1 });
    let raf = requestAnimationFrame(function tick(t) { lenis.raf(t); raf = requestAnimationFrame(tick); });
    return () => { cancelAnimationFrame(raf); lenis.destroy(); };
  }, []);
  return (
    <div className="site">
      <header className="site-nav">
        <div className="wrap spread">
          <Link to="/" aria-label="BridgeWitness home"><Logo /></Link>
          <nav className="site-links" aria-label="Primary">
            <NavLink to="/#capabilities">Capabilities</NavLink>
            <NavLink to="/console/lab">USP demos</NavLink>
            <NavLink to="/console/graph">Flow map</NavLink>
            <NavLink to="/docs/evidence-spec">Evidence spec</NavLink>
            <NavLink to="/docs/architecture">Architecture</NavLink>
          </nav>
          <ButtonLink to="/console/monitor" size="sm">Open dashboard</ButtonLink>
        </div>
      </header>
      <main>
        {notFound ? (
          <section className="wrap notfound">
            <span className="label">404 · no such route</span>
            <h1 className="t-h2">This page was never deposited.</h1>
            <p className="t-body">Nothing backs this URL. Try the console or the evidence spec.</p>
            <div className="row"><ButtonLink to="/">Back to the start</ButtonLink><ButtonLink to="/console/monitor" variant="line">Dashboard</ButtonLink></div>
          </section>
        ) : <Suspense fallback={<div className="page-loading label">Loading…</div>}><Outlet /></Suspense>}
      </main>
      <Footer />
    </div>
  );
}
