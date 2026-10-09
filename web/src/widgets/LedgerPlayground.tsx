import { useMemo, useState } from 'react';
import { assess } from '../verify/accounting';
import { formatUnits } from '../lib/format';
import { Verdict, type Status } from '../design/ui';

// The real backing rule (TS port of assess_accounting), run on a toy route you control.
const AUTH = '100000000'; // 100.000000 USDC authorized by one deposit (6 decimals)
const ME = '0x9cbbcd3db186ee773d59544398fea980b0df5a45';
const OTHER = '0x098b716b8aaf21512996dc57eb0615e2383e2f96';
const PRESETS = [
  { name: 'Exact', amount: '100000000', prior: [] as string[], to: ME },
  { name: 'One wei too many', amount: '100000001', prior: [], to: ME },
  { name: 'Replay', amount: '100000000', prior: ['100000000'], to: ME },
  { name: 'Swap the recipient', amount: '100000000', prior: [], to: OTHER },
  { name: 'Salami (20 × 5)', amount: '5000001', prior: Array(19).fill('5000000'), to: ME },
];

export function LedgerPlayground() {
  const [p, setP] = useState(0);
  const [amount, setAmount] = useState(PRESETS[0].amount);
  const preset = PRESETS[p];
  const valid = /^\d{1,78}$/.test(amount);
  const r = useMemo(() => valid ? assess({
    rule_version: 'exact-lock-mint-v1',
    route: { source_decimals: 6, destination_decimals: 6, source_fee_bps: 0, allow_partial: true, validator_addresses: [], quorum: 0 },
    release: { amount, recipient: preset.to, timestamp: 2, finalized: true },
    authorizations: [{ amount: AUTH, recipient: ME, timestamp: 1, finalized: true, value_verification: 'adapter_verified' }],
    previous_releases: preset.prior.map((a) => ({ amount: a, recipient: ME, timestamp: 1, finalized: true })),
    coverage: { healthy: true, complete_from_bridge_deployment: true, through_timestamp: 2 },
  }) : null, [amount, preset, valid]);
  const released = r ? r.consumed + r.released : 0n;

  return (
    <div className="ledger">
      <div className="row-wrap" role="group" aria-label="Scenario">
        {PRESETS.map((x, i) => (
          <button key={x.name} className="btn btn--line btn--sm" aria-pressed={p === i} onClick={() => { setP(i); setAmount(x.amount); }}>{x.name}</button>
        ))}
      </div>
      <div className="ledger-grid">
        <div className="ledger-cell"><span className="label">Authorized by deposit</span><span className="mono ledger-num">{formatUnits(AUTH, 6)}</span><span className="label">USDC · to 0x9cbb…5a45</span></div>
        <div className="ledger-cell">
          <label className="label" htmlFor="rel">This release (base units)</label>
          <input id="rel" className="mono ledger-input" value={amount} inputMode="numeric" onChange={(e) => setAmount(e.target.value.trim())} aria-invalid={!valid} />
          <span className="label">{preset.prior.length ? `after ${preset.prior.length} prior release(s)` : 'first release'} · to {preset.to === ME ? '0x9cbb…5a45' : '0x098b…2f96'}</span>
        </div>
        <div className="ledger-cell">
          <span className="label">Σ released · excess</span>
          <span className={`mono ledger-num ${r?.excess ? 'c-violation' : ''}`}>{r ? formatUnits(released.toString(), 6) : '—'}</span>
          <span className={`label ${r?.excess ? 'c-violation' : ''}`}>excess = {r?.excess?.toString() ?? '—'} wei</span>
        </div>
      </div>
      <div className="spread ledger-out">
        <span className="mono formula">Σ released(message) ≤ authorized(message)</span>
        {r && <span className="row-wrap"><Verdict status={r.status as Status} />{r.violations.map((v) => <span key={v} className="mono dim" style={{ fontSize: 11 }}>{v}</span>)}</span>}
      </div>
    </div>
  );
}
