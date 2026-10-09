// Signals → one risk-scored alert naming the suspected exploit type, in the problem statement's terms.
// Deterministic rule violations decide; volume and signer-behaviour signals only advise and rank.

export type SignerCheck = { reasons: string[]; lockstep: boolean };

// Unusual signer behaviour beyond the hard rules: the same exact signer set co-signing a burst of
// releases (lockstep) where honest validators rotate, and valid quorum on a release with no backing.
export function signerStream(opts = { window: 300, burst: 4 }) {
  const recent = new Map<string, { ts: number; set: string }[]>();
  return (route: string, ts: number, signers: string[] | null | undefined, unbacked: boolean, ruleViolations: string[]): SignerCheck => {
    if (!signers) return { reasons: [], lockstep: false };
    const set = [...signers].sort().join(',');
    const list = (recent.get(route) ?? []).filter((x) => x.ts >= ts - opts.window);
    list.push({ ts, set });
    recent.set(route, list);
    const same = list.filter((x) => x.set === set).length;
    const lockstep = same >= opts.burst;
    const reasons: string[] = [];
    for (const v of ruleViolations) if (/signer|signature/.test(v)) reasons.push(v);
    if (lockstep) reasons.push('lockstep_signer_set');
    if (unbacked && !reasons.some((r) => /unauthorized|quorum|duplicate|invalid/.test(r))) reasons.push('valid_quorum_on_unbacked_release');
    return { reasons, lockstep };
  };
}

export type ExploitType =
  | 'fake_deposit' | 'signature_forgery' | 'validator_key_compromise' | 'unbacked_release'
  | 'replay' | 'mismatched_pair' | 'volume_anomaly' | 'signer_anomaly' | 'none';

export const EXPLOIT_LABEL: Record<ExploitType, string> = {
  fake_deposit: 'Fake deposit',
  signature_forgery: 'Signature forgery',
  validator_key_compromise: 'Validator key compromise',
  unbacked_release: 'Unbacked release',
  replay: 'Replay or over-claim',
  mismatched_pair: 'Deposit and withdrawal mismatch',
  volume_anomaly: 'Sudden burst (advice only)',
  signer_anomaly: 'Unusual signers (advice only)',
  none: 'No anomaly',
};

// PRD §6.6 base values, extended for the advisory signals. A ranking, not a probability.
export const BASE: Record<ExploitType, number> = {
  validator_key_compromise: 80, unbacked_release: 80, replay: 80, signature_forgery: 80,
  fake_deposit: 75, mismatched_pair: 65, signer_anomaly: 35, volume_anomaly: 25, none: 0,
};

export function classify(violations: string[], signer: SignerCheck, volumeWarn: boolean, hasSigners: boolean): ExploitType {
  const has = (...v: string[]) => v.some((x) => violations.includes(x));
  if (has('unauthorized_signer', 'signer_quorum_not_met', 'duplicate_signers', 'adapter_reports_invalid_signature')) return 'signature_forgery';
  if (has('source_value_mismatch', 'fake_deposit')) return 'fake_deposit';
  if (has('missing_source_authorization')) return hasSigners ? 'validator_key_compromise' : 'unbacked_release';
  if (has('message_replayed')) return 'replay';
  if (has('recipient_mismatch', 'amount_mismatch')) return 'mismatched_pair';
  if (has('authorization_overconsumed')) return 'replay';
  if (signer.lockstep) return 'signer_anomaly';
  if (volumeWarn) return 'volume_anomaly';
  return 'none';
}

export function riskScore(type: ExploitType, usd: number, campaign: boolean, completeness = 1) {
  const base = BASE[type];
  const exposure = type === 'none' ? 0 : usd > 0 ? Math.min(15, 3 * Math.log10(usd)) : 0;
  const camp = campaign && type !== 'none' ? 5 : 0;
  return { base, exposure, campaign: camp, completeness, total: Math.round(Math.min(100, base + exposure + camp) * completeness) };
}

export const CONTAINS = (t: ExploitType) => !['volume_anomaly', 'signer_anomaly', 'none'].includes(t);
