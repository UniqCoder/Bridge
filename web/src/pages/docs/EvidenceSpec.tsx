import { EVIDENCE, LIVE } from '../../data';
import { ButtonLink, Pending, Tag, Verdict, VERDICT_MEANING, type Status } from '../../design/ui';

const live = EVIDENCE.find((e) => e.sha === LIVE.attack_sha)!;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const b = live.bundle as any;
const typeOf = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
const fields = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => [k, typeOf(v), typeof v === 'string' ? (v.length > 30 ? `${v.slice(0, 26)}…` : v) : Array.isArray(v) ? `[${v.length}]` : typeof v === 'object' && v ? '{…}' : String(v)]);

const VIOLATIONS = [
  ['missing_source_authorization', 'No deposit for this message on the route, with source coverage complete past the release time.'],
  ['authorization_overconsumed', 'Σ prior releases + this release > authorized amount.'],
  ['message_replayed', 'Exact routes only: a message already consumed is released again.'],
  ['amount_mismatch', 'Exact routes only: released ≠ authorized (after fee).'],
  ['recipient_mismatch', 'Release recipient ≠ deposit recipient.'],
  ['source_value_mismatch', 'Adapter saw the deposit event disagree with the token transfer.'],
  ['unauthorized_signer · signer_quorum_not_met · duplicate_signers', 'Signer forensics against the route validator set.'],
];
const UNKNOWN = [
  ['source_history_incomplete', 'wm[source] has not passed the release time. Never an alarm.'],
  ['destination_not_finalized', 'The release block is not finalized yet (status pending).'],
  ['ambiguous_source_authorizations', 'More than one finalized deposit claims this message.'],
  ['source_authorization_not_finalized', 'A deposit exists but is not finalized yet.'],
];

const TOC = [['overview', 'Overview'], ['schema', 'Bundle schema'], ['verdicts', 'Verdicts & reasons'], ['hashing', 'Canonical hashing'], ['verify', 'Verification procedure'], ['trust', 'Trust boundary'], ['example', 'Example bundle']];

export default function EvidenceSpec() {
  return (
    <div className="doc">
      <nav className="doc-toc" aria-label="On this page">
        <span className="label">Evidence spec · v1</span>
        {TOC.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}
      </nav>
      <article className="doc-body">
        <section id="overview">
          <span className="label">Witness Bundle · rule exact-lock-mint-v1</span>
          <h1 className="t-h2">Every verdict carries everything needed to recompute it.</h1>
          <p>A Witness Bundle is a self-contained JSON document: the route configuration, the release, its candidate deposits, prior consumption, the source coverage (watermark) and execution proofs. Anyone can re-run the backing rule on it and recompute its SHA-256. The verdict follows from the bundle alone; the only thing you trust is a block header.</p>
          <div className="row-wrap"><ButtonLink to={`/console/evidence/${live.sha.slice(0, 12)}`}>Verify the live exhibit</ButtonLink><Tag kind="real">{EVIDENCE.length} reference bundles · TS = Python</Tag></div>
        </section>

        <section id="schema">
          <h2>Bundle schema</h2>
          <table className="table"><thead><tr><th>field</th><th>type</th><th>meaning</th></tr></thead><tbody>
            <tr><td className="mono">rule_version</td><td>string</td><td>Rule set used; verifiers keep accepting older versions.</td></tr>
            <tr><td className="mono">route</td><td>object</td><td>Pinned chains, contracts, tokens, decimals, fee, partial-release policy, validator set and quorum.</td></tr>
            <tr><td className="mono">release</td><td>event</td><td>The destination release (or execution request) being judged.</td></tr>
            <tr><td className="mono">authorizations</td><td>event[]</td><td>Source deposits for the same message. Empty means none was observed.</td></tr>
            <tr><td className="mono">previous_releases</td><td>event[]</td><td>Earlier finalized releases of this message, in canonical order.</td></tr>
            <tr><td className="mono">coverage</td><td>object · null</td><td>Source watermark: through_timestamp, healthy, complete_from_bridge_deployment.</td></tr>
            <tr><td className="mono">state_proof</td><td>object</td><td>Account + storage proof of deposits[id] at finalized block N. <Pending what="backend step 2" /></td></tr>
          </tbody></table>
          <span className="label">Event fields (from the live exhibit)</span>
          <table className="table"><tbody>{fields(b.release).filter(([k]) => k !== 'execution_proof').map(([k, t, v]) => <tr key={k}><td className="mono">{k}</td><td>{t}</td><td className="mono dim">{v}</td></tr>)}</tbody></table>
          <span className="label">execution_proof</span>
          <table className="table"><tbody>{fields(b.release.execution_proof).map(([k, t, v]) => <tr key={k}><td className="mono">{k}</td><td>{t}</td><td className="mono dim">{v}</td></tr>)}</tbody></table>
        </section>

        <section id="verdicts">
          <h2>Verdicts & reasons</h2>
          <div className="stack">{(Object.keys(VERDICT_MEANING) as Status[]).map((s) => <div key={s} className="row-wrap"><Verdict status={s} /><span className="dim">{VERDICT_MEANING[s]}</span></div>)}</div>
          <table className="table"><thead><tr><th>violation</th><th>condition</th></tr></thead><tbody>{VIOLATIONS.map(([k, v]) => <tr key={k}><td className="mono c-violation">{k}</td><td>{v}</td></tr>)}</tbody></table>
          <table className="table"><thead><tr><th>unknown reason</th><th>condition</th></tr></thead><tbody>{UNKNOWN.map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td>{v}</td></tr>)}</tbody></table>
        </section>

        <section id="hashing">
          <h2>Canonical hashing</h2>
          <p>The bundle hash is SHA-256 over canonical JSON: keys sorted, no whitespace, ASCII-escaped, NaN forbidden. Amounts are decimal strings so no verifier ever rounds through floating point.</p>
          <pre className="code">{`# Python (reference)
hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(",", ":"),
                          allow_nan=False).encode()).hexdigest()

// TypeScript (web/src/verify/canonical.ts), byte-identical on all reference bundles
sha256(canonicalJson(bundle))   // sorted keys, ASCII \\uXXXX escapes`}</pre>
        </section>

        <section id="verify">
          <h2>Verification procedure</h2>
          <ol className="plain">
            <li><b>sha256</b>: recompute the canonical hash and compare with the exhibit.</li>
            <li><b>rule version</b>: must be a supported rule set.</li>
            <li><b>route binding</b>: every event's chain, contract and token match the pinned route; all share the release's message id.</li>
            <li><b>evidence ordering</b>: prior releases strictly precede the release; coverage is bound to the route.</li>
            <li><b>block header</b>: re-encode the execution header with RLP and check keccak256 equals its hash.</li>
            <li><b>receipt and transaction inclusion</b>: walk the Merkle-Patricia proofs from receiptsRoot / transactionsRoot to the stored bytes.</li>
            <li><b>deposit slot empty</b>: storage exclusion proof against stateRoot at finalized block N. <Pending what="backend step 2" /></li>
            <li><b>accounting recompute</b>: re-run the backing rule in exact uint256 arithmetic; status and violations must match.</li>
          </ol>
        </section>

        <section id="trust">
          <h2>Trust boundary</h2>
          <p>The browser removes trust in our <em>logic</em>, not our <em>data</em>: block headers come from our server. On a public chain, cross-check the header hash with any explorer; on local Ganache chains this is not possible and the UI says so. Finality is an RPC assumption until a light client anchors it.</p>
        </section>

        <section id="example">
          <h2>Example: the live attack bundle</h2>
          <pre className="code">{JSON.stringify(b, (k, v) => (typeof v === 'string' && v.length > 90 ? v.slice(0, 66) + '…' : v), 2)}</pre>
        </section>
      </article>
    </div>
  );
}
