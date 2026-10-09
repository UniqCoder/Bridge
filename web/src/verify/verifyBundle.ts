import { assess, type Bundle } from './accounting.ts';
import { bundleSha256 } from './canonical.ts';
import { headerHash, verifyInclusion } from './proofs.ts';

export type StepStatus = 'pass' | 'fail' | 'pending' | 'skip';
export type Step = { id: string; label: string; status: StepStatus; detail: string };
type Expected = { sha256?: string; status?: string; violations?: string[] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const RULES = ['exact-lock-mint-v1'];

function attempt(id: string, label: string, fn: () => [boolean, string] | null): Step {
  try {
    const r = fn();
    if (!r) return { id, label, status: 'skip', detail: 'not present in this bundle' };
    return { id, label, status: r[0] ? 'pass' : 'fail', detail: r[1] };
  } catch (e) {
    return { id, label, status: 'fail', detail: (e as Error).message };
  }
}

// Mirrors verify_bundle (structure) + verify_event (execution proofs) + assess_accounting, client-side.
export async function verifyBundle(b: Any, expected: Expected = {}): Promise<{ steps: Step[]; trusted: string[]; verdict?: ReturnType<typeof assess> }> {
  const steps: Step[] = [];
  const events = [b.release, ...(b.authorizations ?? []), ...(b.previous_releases ?? [])];
  const proven = events.filter((e: Any) => e?.execution_proof);

  const sha = await bundleSha256(b);
  steps.push({
    id: 'sha', label: 'sha256 of canonical JSON', status: !expected.sha256 ? 'skip' : sha === expected.sha256 ? 'pass' : 'fail',
    detail: expected.sha256 && sha !== expected.sha256 ? `${sha.slice(0, 16)}… ≠ exhibit ${expected.sha256.slice(0, 16)}…` : `${sha.slice(0, 16)}…`,
  });

  steps.push(attempt('rule', 'rule version supported', () => [RULES.includes(b.rule_version), b.rule_version]));

  steps.push(attempt('route', 'route binding', () => {
    const r = b.route;
    for (const e of events) {
      const auth = e.kind === 'authorization';
      const ok = e.route_id === r.route_id && e.chain_id === (auth ? r.source_chain_id : r.destination_chain_id)
        && e.contract === (auth ? r.source_contract : r.destination_contract) && e.token === (auth ? r.source_token : r.destination_token);
      if (!ok) return [false, `${e.kind} ${e.tx_hash?.slice(0, 10)}… not on route ${r.route_id}`];
      if (e.message_id !== b.release.message_id) return [false, 'evidence message mismatch'];
    }
    return [true, `${events.length} event(s) on ${r.route_id}`];
  }));

  steps.push(attempt('order', 'evidence ordering', () => {
    const key = (e: Any) => [e.timestamp, e.block_number, e.log_index];
    const before = (a: Any, z: Any) => { const x = key(a), y = key(z); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i]; return false; };
    if ((b.previous_releases ?? []).some((e: Any) => !before(e, b.release))) return [false, 'prior release is not earlier in canonical ordering'];
    if (b.coverage && b.coverage.route_id !== b.route.route_id) return [false, 'coverage route mismatch'];
    return [true, `${b.previous_releases?.length ?? 0} prior release(s), coverage bound to route`];
  }));

  const trusted: string[] = [];
  steps.push(attempt('header', 'block header hash', () => {
    if (!proven.length) return null;
    for (const e of proven) {
      const h = e.execution_proof.header;
      if (headerHash(h) !== h.hash) return [false, `header ${h.hash.slice(0, 12)}… does not re-encode to its hash`];
      trusted.push(h.hash);
    }
    return [true, `${proven.length} header(s) re-encoded with RLP + keccak256`];
  }));
  steps.push(attempt('receipt', 'receipt inclusion proof', () => {
    if (!proven.length) return null;
    for (const e of proven) {
      const p = e.execution_proof;
      if (!verifyInclusion(p.header.receiptsRoot, p.transaction_index, p.receipt, p.receipt_nodes)) return [false, 'receipt not in receiptsRoot'];
    }
    return [true, `under receiptsRoot, ${proven.map((e: Any) => e.execution_proof.receipt_nodes.length).join('+')} node(s)`];
  }));
  steps.push(attempt('tx', 'transaction inclusion proof', () => {
    if (!proven.length) return null;
    for (const e of proven) {
      const p = e.execution_proof;
      if (!verifyInclusion(p.header.transactionsRoot, p.transaction_index, p.transaction, p.transaction_nodes)) return [false, 'transaction not in transactionsRoot'];
    }
    return [true, 'under transactionsRoot'];
  }));
  steps.push({
    id: 'state', label: 'deposit slot empty (state proof)', status: b.state_proof ? 'pass' : 'pending',
    detail: b.state_proof ? 'storage exclusion verified' : 'bundle has no state_proof yet · backend Step 2',
  });

  let verdict: ReturnType<typeof assess> | undefined;
  steps.push(attempt('accounting', 'accounting recompute', () => {
    verdict = assess(b as Bundle);
    const same = (!expected.status || expected.status === verdict.status)
      && (!expected.violations || expected.violations.join() === verdict.violations.join());
    const what = verdict.violations.length ? verdict.violations.join(', ') : verdict.unknown_reasons.join(', ') || 'no violations';
    return [same, `${verdict.status} · ${what}${verdict.excess !== null ? ` · excess ${verdict.excess}` : ''}`];
  }));

  return { steps, trusted, verdict };
}
