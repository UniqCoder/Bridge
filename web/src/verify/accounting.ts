// TypeScript port of accounting.assess_accounting (exact-lock-mint-v1). Exact uint256 via BigInt.
// scripts/build-fixtures.mjs checks it against every Python decision in the reference artifacts.

export type Ev = {
  amount: string; recipient: string; timestamp: number; finalized: boolean;
  value_verification?: string; signature_verification?: string; signer_addresses?: string[] | null;
};
export type Route = {
  source_decimals: number; destination_decimals: number; source_fee_bps: number;
  allow_partial: boolean; validator_addresses: string[]; quorum: number;
};
export type Coverage = { healthy: boolean; complete_from_bridge_deployment: boolean; through_timestamp: number } | null;
export type Bundle = { rule_version: string; route: Route; release: Ev; authorizations: Ev[]; previous_releases: Ev[]; coverage: Coverage };

const MAX = 2n ** 256n - 1n;
const uint256 = (s: string) => {
  const v = BigInt(s);
  if (v < 0n || v > MAX) throw new Error('amount outside uint256');
  return v;
};

export function assess(b: Bundle) {
  const { route, release, authorizations, previous_releases, coverage } = b;
  const decimals = Math.max(route.source_decimals, route.destination_decimals);
  const dstScale = 10n ** BigInt(decimals - route.destination_decimals);
  const srcScale = 10n ** BigInt(decimals - route.source_decimals);
  const amount = uint256(release.amount) * dstScale;
  const consumed = previous_releases.filter((e) => e.finalized).reduce((a, e) => a + uint256(e.amount) * dstScale, 0n);
  const finalized = authorizations.filter((a) => a.finalized);
  const violations: string[] = [];
  const unknown: string[] = [];
  let authorized: bigint | null = null;

  if (!release.finalized) unknown.push('destination_not_finalized');
  if (finalized.length > 1) unknown.push('ambiguous_source_authorizations');
  else if (finalized.length === 1) {
    const auth = finalized[0];
    const src = uint256(auth.amount);
    authorized = (src - (src * BigInt(route.source_fee_bps)) / 10000n) * srcScale;
    if (auth.value_verification === 'not_checked') unknown.push('source_value_not_independently_checked_by_adapter');
    else if (auth.value_verification === 'adapter_mismatch') violations.push('source_value_mismatch');
    if (auth.timestamp > release.timestamp) unknown.push('source_timestamp_after_destination_requires_temporal_verification');
    if (release.recipient !== auth.recipient) violations.push('recipient_mismatch');
    if (consumed + amount > authorized) violations.push('authorization_overconsumed');
    if (!route.allow_partial && consumed) violations.push('message_replayed');
    if (!route.allow_partial && amount !== authorized) violations.push('amount_mismatch');
  } else if (authorizations.length) unknown.push('source_authorization_not_finalized');
  else if (coverage && coverage.healthy && coverage.complete_from_bridge_deployment && coverage.through_timestamp >= release.timestamp) {
    authorized = 0n;
    violations.push('missing_source_authorization');
  } else unknown.push('source_history_incomplete');

  if (release.signature_verification === 'adapter_invalid') violations.push('adapter_reports_invalid_signature');
  else if (release.signature_verification === 'adapter_verified' && release.signer_addresses != null) {
    const signers = release.signer_addresses;
    if (signers.length !== new Set(signers).size) violations.push('duplicate_signers');
    if (route.validator_addresses.length) {
      if (!signers.every((s) => route.validator_addresses.includes(s))) violations.push('unauthorized_signer');
      if (new Set(signers.filter((s) => route.validator_addresses.includes(s))).size < route.quorum) violations.push('signer_quorum_not_met');
    }
  }

  const status = !release.finalized ? 'pending' : violations.length ? 'invariant_violation' : unknown.length ? 'unknown' : 'consistent_under_supplied_evidence';
  const exploit = violations.includes('missing_source_authorization') ? 'suspected_unbacked_release'
    : violations.includes('source_value_mismatch') ? 'suspected_fake_source_deposit'
    : violations.includes('recipient_mismatch') ? 'suspected_message_tampering_or_replay'
    : violations.includes('message_replayed') || violations.includes('authorization_overconsumed') ? 'suspected_replay_or_overclaim'
    : violations.some((v) => v.includes('sign')) ? 'suspected_signature_or_validator_failure'
    : violations.length ? 'suspected_amount_mismatch' : null;
  const excess = authorized === null ? null : consumed + amount > authorized ? consumed + amount - authorized : 0n;

  return {
    status, violations, unknown_reasons: unknown, suspected_exploit_type: exploit,
    released: amount, consumed, authorized, excess, decimals,
  };
}
