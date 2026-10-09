import '../../live/pages.css';

const STEPS: [string, string][] = [
  ['Offline, once', 'Load the real Nomad and Ronin transfers, recover real Ronin signers from the chain, train the three models, and replay every feed through the algorithms. This takes about a minute and writes small result files.'],
  ['Server (Render, Docker)', 'FastAPI serves the result files, streams a replay on a clock and polls Across API statuses. Model training stays offline; runtime memory must be measured for the deployment.'],
  ['Website (Vercel)', 'A React app that draws the live graph, the timelines and the alert cards. If the server is asleep, it falls back to the same replay files shipped with the site.'],
];
const MODELS: [string, string, string][] = [
  ['Timing model', 'LightGBM quantile regression + per-feed calibration', 'An advisory delay window with measured chronological test coverage.'],
  ['Signer and ID model', 'Isolation Forest + signer-group likelihood', 'How unusual a Ronin withdrawal’s signers, size and ID are.'],
  ['Attack-type model', 'LightGBM classifier + isotonic calibration + exact TreeSHAP', 'Names the kind of attack and why.'],
];
const ALGOS: [string, string][] = [
  ['Conservation ledger', 'Exact amount, recipient and prior-use checks. The only thing allowed to say “exploit”.'],
  ['Exact message pairing', 'Bind each payout to its route, token and source authorization; never borrow a different message’s deposit.'],
  ['MinHash-LSH', 'Finds near-identical releases (copy-paste attacks) quickly.'],
  ['MIDAS-R', 'Spots the same message repeating in a stream, in fixed memory.'],
  ['Hawkes process', 'Fits a spread estimate to cluster timing; advisory, not proof of causation.'],
  ['Rolling ranks → calibrated scores → e-CUSUM', 'Combines unusual behavior into an advisory alarm. We report observed false alarms, not a live error guarantee.'],
];

export default function Architecture() {
  return (
    <div className="pg pg--doc">
      <header className="pg-head"><span className="label">How it is built</span><h2 className="pg-title">Small server, real models, checks you can repeat.</h2></header>
      <section><h3 className="h3">The three parts</h3>
        <ol className="doc-steps">{STEPS.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}</ol></section>
      <section><h3 className="h3">The three machine-learning models</h3>
        <table className="tbl"><thead><tr><th>Model</th><th>Method</th><th>Job</th></tr></thead><tbody>{MODELS.map(([a, b, c]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td><td>{c}</td></tr>)}</tbody></table></section>
      <section><h3 className="h3">The six algorithms</h3>
        <table className="tbl"><tbody>{ALGOS.map(([a, b]) => <tr key={a}><td><b>{a}</b></td><td>{b}</td></tr>)}</tbody></table></section>
      <section><h3 className="h3">Data and keys</h3>
        <p className="lede">Real Nomad and Ronin transfers from XChainWatcher (Augusto et al., arXiv 2410.02029, MIT licence). Ronin signers come from public Ethereum transactions. The live feed reports Across API status; it does not independently verify backing or finality. Current public endpoints work without a key; replay files are available as a fallback.</p></section>
      <section><h3 className="h3">Server endpoints</h3>
        <table className="tbl"><tbody>{[['/health', 'is it up'], ['/replay/{feed}', 'a full replay: events, evidence, timelines'], ['/stream/{feed}?speed=60', 'the same replay as a live stream (Server-Sent Events)'], ['/metrics', 'every measured number'], ['/live', 'Across API-reported status; backing not independently verified']].map(([a, b]) => <tr key={a}><td className="mono">{a}</td><td>{b}</td></tr>)}</tbody></table></section>
    </div>
  );
}
