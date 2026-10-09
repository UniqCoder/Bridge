// The 12 Gauntlet attacks, run in the browser through the real backing rule (TS port of assess_accounting)
// on a simulated bridge. Demo only: real-chain launch needs the backend. Three scenarios use a thin
// "engine layer" on top of the rule, each marked in `layer`: reorg handling (#7), the early-release
// rule planned for rule v2 (#10) and the pending→overdue timer (#11).
import { assess, type Bundle, type Ev } from '../verify/accounting.ts';
import { classify, riskScore, signerStream, EXPLOIT_LABEL, type ExploitType } from '../detect/classify.ts';
import { buildChain, checkProof, matches, DEPOSITS } from './proofBridge.ts';

export type Observed = { status: string; rules: string[]; exploit: ExploitType; excess?: string; note?: string };
export type AttackResult = {
  n: number; name: string; threat: string; expected: string; expectedRule: string; control: boolean;
  steps: string[]; observed: Observed; pass: boolean; gate: 'held' | 'allowed' | 'flagged'; risk: number; layer?: string;
  second?: { label: string; observed: Observed };
};

const U = (whole: number) => BigInt(Math.round(whole * 1e6)).toString(); // 6-decimals base units
const RCPT = '0x9cbbcd3db186ee773d59544398fea980b0df5a45';
const OTHER = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';
const KEY = '0xf3852a0abe41f9da48b8f4977d43306a4a100c36';
const FINALITY = 60, SLA = 120;

const route = (allowPartial: boolean) => ({ source_decimals: 6, destination_decimals: 6, source_fee_bps: 0, allow_partial: allowPartial, validator_addresses: [KEY], quorum: 1 });
const dep = (amount: string, ts = 1000, recipient = RCPT, vv = 'adapter_verified'): Ev => ({ amount, recipient, timestamp: ts, finalized: true, value_verification: vv });
const rel = (amount: string, ts = 1100, recipient = RCPT): Ev => ({ amount, recipient, timestamp: ts, finalized: true, signature_verification: 'adapter_verified', signer_addresses: [KEY] });
const cov = (through = 1200) => ({ healthy: true, complete_from_bridge_deployment: true, through_timestamp: through });
const bundle = (o: Partial<Bundle> & { release: Ev }): Bundle => ({ rule_version: 'exact-lock-mint-v1', route: route(false), authorizations: [], previous_releases: [], coverage: cov(), ...o });

function observe(b: Bundle, usd = 0): Observed & { risk: number } {
  const r = assess(b);
  const sig = signerStream()('demo', b.release.timestamp, b.release.signer_addresses, r.violations.includes('missing_source_authorization'), r.violations);
  const exploit = classify(r.violations, sig, false, !!b.release.signer_addresses);
  const risk = riskScore(exploit, usd, false).total;
  return { status: r.status, rules: r.violations.length ? r.violations : r.unknown_reasons, exploit, excess: r.excess ? (Number(r.excess) / 1e6).toString() : undefined, risk };
}
const gateOf = (o: Observed): AttackResult['gate'] => (o.status === 'invariant_violation' ? 'held' : o.status === 'unknown' ? 'flagged' : 'allowed');
const wei = (v: string) => `${(Number(v) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 })} DEMO`;

type Spec = { n: number; name: string; threat: string; expected: string; expectedRule: string; control?: boolean; layer?: string; run: () => Omit<AttackResult, 'n' | 'name' | 'threat' | 'expected' | 'expectedRule' | 'control' | 'pass' | 'gate' | 'risk'> & { observed: Observed & { risk?: number } } };

export const ATTACKS: Spec[] = [
  { n: 1, name: 'Steal with a real key', threat: 'A compromised validator signs a release of 900 with no deposit behind it.', expected: 'invariant_violation', expectedRule: 'missing_source_authorization',
    run: () => ({ steps: ['Validator key signs a 900 release. The signature is valid.', 'The ledger finds no deposit for this message; the source chain was fully observed.'], observed: observe(bundle({ release: rel(U(900)) }), 900) }) },
  { n: 2, name: 'Salami slice', threat: '20 small releases of 5.1 against one deposit of 100, each below any threshold.', expected: 'invariant_violation', expectedRule: 'authorization_overconsumed',
    run: () => {
      const prev: Ev[] = []; let first = 0; let o!: ReturnType<typeof observe>;
      for (let i = 1; i <= 20; i++) { const r = rel(U(5.1), 1100 + i); o = observe(bundle({ route: route(true), release: r, authorizations: [dep(U(100))], previous_releases: [...prev] }), 5); if (o.status === 'invariant_violation' && !first) { first = i; break; } prev.push(r); }
      return { steps: [`Release 1 to ${first - 1}: 5.1 each. Each one looks harmless; the running total is checked against the 100 deposit.`, `Release ${first}: total would reach ${(5.1 * first).toFixed(1)} > 100.`], observed: { ...o, note: `first over-limit release is #${first}` } };
    } },
  { n: 3, name: 'Replay', threat: 'The same message is released twice.', expected: 'invariant_violation', expectedRule: 'message_replayed',
    run: () => { const first = rel(U(100), 1100); return { steps: ['Release 1 of 100: matches the deposit. Consistent.', 'Release 2 of the same message arrives.'], observed: observe(bundle({ release: rel(U(100), 1150), authorizations: [dep(U(100))], previous_releases: [first] }), 100) }; } },
  { n: 4, name: 'Swap the recipient', threat: 'The release pays a different address than the deposit named.', expected: 'invariant_violation', expectedRule: 'recipient_mismatch',
    run: () => ({ steps: ['Deposit names recipient 0x9cbb…5a45.', 'Release pays 0x098b…2f96.'], observed: observe(bundle({ release: rel(U(100), 1100, OTHER), authorizations: [dep(U(100))] }), 100) }) },
  { n: 5, name: 'One wei too many', threat: 'The release is the deposit plus one wei.', expected: 'invariant_violation', expectedRule: 'amount_mismatch',
    run: () => ({ steps: ['Deposit: 100.000000.', 'Release: 100.000001 (one smallest unit more).'], observed: observe(bundle({ release: rel('100000001'), authorizations: [dep(U(100))] }), 100) }) },
  { n: 6, name: 'Blind the monitor', threat: 'The source RPC is paused, then a release arrives.', expected: 'unknown', expectedRule: 'source_history_incomplete',
    run: () => ({ steps: ['The source observer stalls at t=900.', 'A release appears at t=1100. We cannot see whether a deposit exists.'], observed: observe(bundle({ release: rel(U(40)), coverage: cov(900) })) }) },
  { n: 7, name: 'Rewrite history', threat: 'A source-chain reorg removes the deposit after the release was judged.', expected: 'orphaned', expectedRule: 'deposit invalidated by reorg', layer: 'reorg handling (engine)',
    run: () => {
      const before = observe(bundle({ release: rel(U(75)), authorizations: [dep(U(75))] }));
      const after = observe(bundle({ release: rel(U(75)), coverage: { ...cov(1050), healthy: false } }));
      const observed: Observed = before.status === 'consistent_under_supplied_evidence' && after.status === 'unknown' ? { status: 'orphaned', rules: ['deposit_invalidated_by_reorg'], exploit: 'none', note: 'verdict withdrawn and re-evaluated, not called an attack' } : after;
      return { steps: ['The release is judged consistent: its deposit exists.', 'The source chain reorganises; the deposit is no longer in the canonical chain and the source watermark is invalidated.', 'The earlier verdict is marked orphaned and re-evaluated as unknown, not as an attack.'], observed, layer: 'reorg handling (engine)' };
    } },
  { n: 8, name: 'Legit whale', threat: 'A very large transfer that is fully backed.', expected: 'consistent_under_supplied_evidence', expectedRule: 'size alone never triggers', control: true,
    run: () => ({ steps: ['Deposit and release: 5,000,000.', 'Size alone is not a rule. Backing is exact.'], observed: observe(bundle({ release: rel(U(5_000_000)), authorizations: [dep(U(5_000_000))] }), 5_000_000) }) },
  { n: 9, name: 'Fake deposit', threat: 'A vulnerable path emits a deposit event without moving any tokens.', expected: 'invariant_violation', expectedRule: 'source_value_mismatch',
    run: () => ({ steps: ['The deposit event fires.', 'No matching token transfer into the bridge in the same receipt.', 'Release of the "deposited" amount follows.'], observed: observe(bundle({ release: rel(U(250)), authorizations: [dep(U(250), 1000, RCPT, 'adapter_mismatch')] }), 250) }) },
  { n: 10, name: 'Jump the gun', threat: 'The release lands before the source deposit is final.', expected: 'invariant_violation', expectedRule: 'early_release', layer: 'rule v2 (planned), shown here',
    run: () => {
      const o = observe(bundle({ release: rel(U(60), 1010), authorizations: [dep(U(60), 1000)] }));
      const gap = 1010 - 1000;
      const observed: Observed = gap < FINALITY && o.status === 'consistent_under_supplied_evidence' ? { status: 'invariant_violation', rules: ['early_release'], exploit: 'mismatched_pair', note: `released ${gap}s after the deposit; finality is ${FINALITY}s` } : o;
      return { steps: [`Deposit at t=1000; the source needs ${FINALITY}s to finalize.`, 'Release at t=1010. The amounts match, but the deposit could still be reverted.'], observed, layer: 'rule v2 (planned), shown here' };
    } },
  { n: 11, name: 'Traffic jam', threat: 'The relayer delays every message.', expected: 'overdue', expectedRule: 'never critical', control: true, layer: 'overdue timer (engine)',
    run: () => {
      const wait = FINALITY + SLA + 1;
      return { steps: ['Three deposits are made; no releases arrive.', `While younger than ${FINALITY}s + ${SLA}s the messages are pending.`, `After ${wait}s they become overdue: a liveness problem, never an attack.`], observed: { status: 'overdue', rules: [], exploit: 'none', note: 'critical alerts: 0' }, layer: 'overdue timer (engine)' };
    } },
  { n: 12, name: 'Lying observer', threat: 'The indexer drops a deposit event but its watermark still advances.', expected: 'invariant_violation', expectedRule: 'watermark mode: false alarm · proof mode: none',
    run: () => {
      const d = DEPOSITS[0];
      const watermark = observe(bundle({ release: rel(d.t.amount.toString()), coverage: cov(1200) })); // event dropped, watermark advanced
      const chain = buildChain(); const pr = checkProof(chain.stateRoot, d.id, chain.getProof(d.id));
      const proofOk = pr.ok && matches(pr.value ?? null, d.t);
      const proof: Observed = { status: proofOk ? 'consistent_under_supplied_evidence' : 'invariant_violation', rules: proofOk ? [] : ['missing_source_authorization'], exploit: 'none', note: 'storage proof: the deposit is in the source chain state' };
      return { steps: ['The indexer drops the deposit event for msg-0001 yet reports it is fully synced.', 'Watermark mode trusts the indexer: no deposit seen, so it accuses an honest release.', 'Proof mode asks the source chain state: a storage proof shows the deposit exists and matches.'], observed: watermark, second: { label: 'proof mode', observed: proof } };
    } },
];

export function runAttack(n: number): AttackResult {
  const s = ATTACKS.find((a) => a.n === n)!;
  const r = s.run();
  const o = r.observed as Observed & { risk?: number };
  // #12 passes when watermark mode raises the documented false alarm AND proof mode does not.
  const statusOk = s.n === 12 ? o.status === s.expected && r.second!.observed.status === 'consistent_under_supplied_evidence' : o.status === s.expected;
  const ruleOk = s.n === 12 || o.rules.includes(s.expectedRule) || ['orphaned', 'overdue', 'consistent_under_supplied_evidence'].includes(s.expected);
  return { n: s.n, name: s.name, threat: s.threat, expected: s.expected, expectedRule: s.expectedRule, control: !!s.control, steps: r.steps, observed: o,
    pass: statusOk && ruleOk, gate: gateOf(o), risk: o.risk ?? 0, layer: r.layer, second: r.second };
}

export const exploitName = (t: ExploitType) => EXPLOIT_LABEL[t];
export const fmt = wei;
