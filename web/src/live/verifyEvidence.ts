import type { EvidenceBundle, EvidenceFact } from './data';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function assessEvidence(bundle: EvidenceBundle): { status: string; rule: string | null } {
  if (bundle.rule_version !== 'exact-message-v1') throw new Error('Unsupported evidence rule');
  const r = bundle.release;
  const amount = (e: EvidenceFact) => {
    if (!/^\d+$/.test(e.amount)) throw new Error('Invalid token amount');
    const n = BigInt(e.amount);
    if (n >= 2n ** 256n) throw new Error('Amount outside uint256');
    return n;
  };
  amount(r);
  const auths = bundle.authorizations.filter((d) => d.route === r.route && d.token === r.token && d.msg_id === r.msg_id && d.ts <= r.ts);
  if (!auths.length) return bundle.coverage.source_complete
    ? { status: 'violation', rule: 'missing_source_deposit' }
    : { status: 'unknown', rule: 'source_history_incomplete' };
  if (auths.length !== 1) return { status: 'unknown', rule: 'ambiguous_source_deposits' };
  const d = auths[0];
  if (amount(r) !== amount(d)) return { status: 'violation', rule: 'amount_mismatch' };
  if (r.recipient.toLowerCase() !== d.recipient.toLowerCase()) return { status: 'violation', rule: 'recipient_mismatch' };
  if (bundle.previous_releases.some((p) => p.matched === d.event_id && p.status === 'consistent' && p.ts <= r.ts && p.event_id !== r.event_id)) {
    return { status: 'violation', rule: 'message_replayed' };
  }
  return { status: 'consistent', rule: null };
}

export async function verifyEvidence(bundle: EvidenceBundle, expectedDigest: string) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(bundle)));
  const sha256 = Array.from(new Uint8Array(raw), (b) => b.toString(16).padStart(2, '0')).join('');
  return { ...assessEvidence(bundle), sha256, integrity: sha256 === expectedDigest };
}
