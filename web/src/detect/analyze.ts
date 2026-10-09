// One pass over any bridge feed (simulated or historical): backing rule + volume + signer signals,
// classified into a problem-statement exploit type. Pure and deterministic, so the fixture script runs
// it once and asserts the outcomes the UI later shows.
import { assess } from '../verify/accounting.ts';
import { velocityStream, type VelocityParams } from './velocity.ts';
import { classify, signerStream, type ExploitType } from './classify.ts';

export type FeedEvent = {
  ts: number; tx: string; ord: number; id: string; route: string; decimals: number | null; amount: string; usd: number;
  recipient: string; signers: string[] | null;
  auth: { ts: number; tx: string; amount: string; recipient: string; value_verification: string } | null;
  truth: 'normal' | 'attack' | 'control'; scenario?: string;
};
export type RouteCfg = { validators: string[]; quorum: number; allowPartial: boolean };

export function analyzeFeed(events: FeedEvent[], cfg: RouteCfg, vp: VelocityParams) {
  const vel = velocityStream(vp);
  const sig = signerStream();
  const prior = new Map<string, { amount: string; recipient: string; timestamp: number; finalized: boolean }[]>();
  return [...events].sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx) || a.ord - b.ord).map((e) => {
    const key = `${e.route}:${e.id}`;
    const prev = prior.get(key) ?? [];
    const d = e.decimals ?? 18;
    const r = assess({
      rule_version: 'exact-lock-mint-v1',
      route: { source_decimals: d, destination_decimals: d, source_fee_bps: 0, allow_partial: cfg.allowPartial, validator_addresses: cfg.validators, quorum: cfg.quorum },
      release: { amount: e.amount, recipient: e.recipient, timestamp: e.ts, finalized: true, signer_addresses: e.signers, signature_verification: e.signers ? 'adapter_verified' : 'not_checked' },
      authorizations: e.auth ? [{ amount: e.auth.amount, recipient: e.auth.recipient, timestamp: e.auth.ts, finalized: true, value_verification: e.auth.value_verification }] : [],
      previous_releases: prev,
      coverage: { healthy: true, complete_from_bridge_deployment: true, through_timestamp: e.ts },
    });
    prior.set(key, [...prev, { amount: e.amount, recipient: e.recipient, timestamp: e.ts, finalized: true }]);
    const v = vel(e.route, e.ts, BigInt(e.amount));
    const s = sig(e.route, e.ts, e.signers, r.violations.includes('missing_source_authorization'), r.violations);
    const type: ExploitType = classify(r.violations, s, v.warn, !!e.signers);
    return {
      ...e, status: r.status, rules: r.violations, exploit: type,
      authorized: r.authorized?.toString() ?? null, excess: r.excess?.toString() ?? null,
      velocity: { dev: +v.dev.toFixed(2), warn: v.warn, abstained: v.abstained, count5m: v.count5m },
      signer: s.reasons,
    };
  });
}
export type Analyzed = ReturnType<typeof analyzeFeed>[number];
