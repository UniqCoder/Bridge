import { Suspense } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { ButtonLink, Logo } from '../design/ui';

const NOT_CLAIMED = [
  'Two real hacks plus practice attacks show the idea works. They are not a promise for every future attack.',
  'Only the deposit rule can say “exploit”. Statistics and machine learning rank and explain; they never accuse alone.',
  'The reference answers come from XChainWatcher’s matching rules. We reproduce them; we did not discover the hacks independently.',
  'Dollar values are the dataset’s historic prices. “Money kept” figures are estimates, not funds recovered.',
];

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="stack" style={{ gap: 16 }}>
          <Logo />
          <p className="t-body" style={{ fontSize: 14 }}>Signatures can be stolen. Conservation can’t.</p>
        </div>
        <div className="stack">
          <span className="label">What we do not claim</span>
          <ol className="nonclaims">{NOT_CLAIMED.map((c) => <li key={c}>{c}</li>)}</ol>
        </div>
        <div className="stack">
          <span className="label">Data</span>
          <p className="dim" style={{ fontSize: 13 }}>Nomad and Ronin transfers from XChainWatcher (Augusto et al., arXiv 2410.02029), MIT licence. Live feed: Across public API. <a href="/THIRD_PARTY_NOTICES.txt">Full notice</a>.</p>
        </div>
      </div>
    </footer>
  );
}

export function SiteLayout({ notFound }: { notFound?: boolean }) {
  return (
    <div className="site">
      <header className="site-nav">
        <div className="wrap spread">
          <Link to="/" aria-label="BridgeWitness home"><Logo /></Link>
          <nav className="site-links" aria-label="Primary">
            <NavLink to="/console/live">Live console</NavLink>
            <NavLink to="/console/usps">Our four ideas</NavLink>
            <NavLink to="/console/evidence">Check it yourself</NavLink>
            <NavLink to="/console/results">Results</NavLink>
            <NavLink to="/docs/architecture">How it works</NavLink>
          </nav>
          <ButtonLink to="/console/live" size="sm">Open the console</ButtonLink>
        </div>
      </header>
      <main>
        {notFound ? (
          <section className="wrap notfound">
            <span className="label">404 · no such page</span>
            <h1 className="t-h2">Nothing backs this address.</h1>
            <div className="row"><ButtonLink to="/">Back to the start</ButtonLink><ButtonLink to="/console/live" variant="line">Open the console</ButtonLink></div>
          </section>
        ) : <Suspense fallback={<div className="page-loading label">Loading…</div>}><Outlet /></Suspense>}
      </main>
      <Footer />
    </div>
  );
}
