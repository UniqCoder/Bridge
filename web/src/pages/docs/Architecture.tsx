import { Pending, Tag } from '../../design/ui';
import { Pipeline } from '../../widgets/diagrams';

const COMPONENTS: [string, string, string, boolean][] = [
  ['Chain adapters · evm.py', 'RPC client, calldata, event extraction; finalized tag only', 'built', true],
  ['Watermark cursor · monitor.py', 'Finalized, contiguous, hash-linked scanner per chain = wm[chain]', 'built', true],
  ['Conservation ledger · accounting.py + engine.py', 'Exact uint256 backing rule; SQLite WAL, idempotent ingest, reorg rebuild', 'built', true],
  ['Proofs · proofs.py', 'Header re-encoding, receipt/tx MPT inclusion (legacy → EIP-7702); state proofs next', 'built · state proofs step 2', true],
  ['Nomad replay · reconcile_replay.py', 'Real stream, virtual clock, per-chain observer lag', 'step 1', false],
  ['Incident engine · incidents.py', 'Group by destination verifier within W; exposure, copycat, scope, priority', 'step 3', false],
  ['Witness Gate · WitnessDemo.sol', 'Optimistic window; holdWithEvidence / resolve; message → route → verifier', 'route hold built · step 2', true],
  ['Evaluation · inject.py, evaluate.py, counterfactual.py', 'S0–S7, baselines, ablation, five response lanes', 'step 4', false],
  ['API · api.py', 'Bearer auth, viewer token, SSE /stream (single writer, one worker)', 'built · SSE step 3', true],
  ['Signals · web/src/detect', 'Velocity (volume-spike) port, signer forensics, CSB-01 exploit classifier + risk score, seeded simulated attack replay', 'built · TS (backend port next)', true],
  ['Browser verifier · web/src/verify','Canonical JSON, header hash, MPT proofs, accounting port', 'built · golden 12/12', true],
];

const API: [string, string, string][] = [
  ['GET', '/stream', 'SSE: decision · watermark · incident · hold · replay'],
  ['GET', '/decisions · /incidents/{id} · /ledger · /coverage', 'Current state, read with the viewer token'],
  ['GET', '/counterfactual?incident=&latency=', 'Five lanes, lost_usd / lost_pct / contained_at'],
  ['GET', '/eval/latest', 'Scenarios, baselines, ablation, targets, commit + seed'],
  ['POST', '/replay · /replay/pause · /replay/seek', 'Drive Act 1'],
  ['POST', '/gauntlet/{1..12}', 'Act 2 attacks · only with BRIDGEWITNESS_DEMO=1 on 127.0.0.1'],
  ['POST', '/guardian/hold · /guardian/resolve', 'Accountable holds, recorded on-chain with the bundle hash'],
];

const ROUTES: [string, string][] = [
  ['/', 'Landing: problem, invariant playground, seven capabilities, flow-graph teaser, two acts'],
  ['/console/monitor', 'CSB-01 dashboard: feeds (simulated / Nomad / Ronin), three signals, risk-scored alerts with exploit type'],
  ['/console/replay', 'Nomad case study: transport, watermarks, incident card, per-token ledger, verdict stream'],
  ['/console/graph', 'Cross-chain flow graph (three.js), fan-out analysis, inspector'],
  ['/console/witness', '3D Witness Bridge, verdict stream, alert takeover'],
  ['/console/incidents/:id', 'Exposure over time, scope timeline, priority breakdown'],
  ['/console/evidence/:sha', 'Bundle tree, in-browser verify, tamper + diff'],
  ['/console/gauntlet', 'Act 2: twelve sealed attacks, lying-observer split view'],
  ['/console/theatre', 'Counterfactual lanes, latency slider, loss vs breadth'],
  ['/console/eval', 'Scenarios, baselines, ablation, model card'],
  ['/docs/*', 'Evidence spec, this page'],
];

export default function Architecture() {
  return (
    <div className="doc">
      <nav className="doc-toc" aria-label="On this page">
        <span className="label">Architecture</span>
        {[['flow', 'Data flow'], ['components', 'Components'], ['api', 'API contract'], ['frontend', 'Frontend'], ['principles', 'Principles']].map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}
      </nav>
      <article className="doc-body">
        <section id="flow">
          <span className="label">One engine, two acts</span>
          <h1 className="t-h2">Observe finalized facts. Reconcile exactly. Hold before execution.</h1>
          <p>The same engine replays the real Nomad exploit (Act 1) and watches two live local EVM chains a judge attacks (Act 2). Data moves one way: adapters ingest finalized events, the watermark decides what is observable, the ledger decides what is backed, incidents decide how wide to hold, and every decision emits a bundle the browser can re-run.</p>
          <Pipeline />
        </section>
        <section id="components">
          <h2>Components</h2>
          <table className="table"><thead><tr><th>component</th><th>does</th><th>status</th></tr></thead>
            <tbody>{COMPONENTS.map(([a, b, c, ok]) => <tr key={a}><td className="mono">{a}</td><td>{b}</td><td>{ok ? <Tag kind="real">{c}</Tag> : <Pending what={c} />}</td></tr>)}</tbody>
          </table>
        </section>
        <section id="api">
          <h2>API contract (frozen)</h2>
          <p>Amounts are decimal strings; clients use BigInt. Timestamps are unix seconds. The adapter token never reaches the browser; the UI uses a read-only viewer token.</p>
          <table className="table"><tbody>{API.map(([m, p, d]) => <tr key={p}><td className="mono">{m}</td><td className="mono">{p}</td><td>{d}</td></tr>)}</tbody></table>
        </section>
        <section id="frontend">
          <h2>Frontend</h2>
          <p>React 18 + Vite + TypeScript, react-router, three.js via react-three-fiber, framer-motion, Lenis. Fixtures are generated from the real CSVs and artifacts by <span className="mono">scripts/build-fixtures.mjs</span>, which also runs the golden verifier test; <span className="mono">VITE_BW_API</span> switches to the live API endpoint by endpoint.</p>
          <table className="table"><tbody>{ROUTES.map(([r, d]) => <tr key={r}><td className="mono">{r}</td><td>{d}</td></tr>)}</tbody></table>
        </section>
        <section id="principles">
          <h2>Principles</h2>
          <ol className="plain">
            <li>Invariants decide; ML advises. Only a deterministic rule violation can trigger containment.</li>
            <li>Every verdict carries its evidence.</li>
            <li>Blind spots are named: missing data is unknown, never attack and never fine.</li>
            <li>Smallest sufficient intervention, recorded on-chain.</li>
            <li>No inflated claims: a priority is a ranking; ROC AUC is not accuracy; USD has a stated source.</li>
          </ol>
        </section>
      </article>
    </div>
  );
}
