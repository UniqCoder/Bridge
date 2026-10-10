# BridgeWitness ML reliability contract

Aligned with PRD v2.0 sections 3.2, 6.8 and 12. Updated 9 October 2026.

The ML component is a bounded **behavioral triage hint and optional evaluation baseline**. Exact accounting establishes backing violations. ML has no authority to change that verdict, declare a transfer safe, or trigger containment. Reliability here means validated input handling, reproducible calculations, explicit abstention and tested authority boundaries. It does not mean validated exploit detection or guaranteed future precision.

## Implemented contract

| Situation | ML output | Accounting/response effect |
|---|---|---|
| Supported historical route, sufficient finalized history, in-support features | Normal-tail rank; optional advisory warning | No change to accounting verdict or hold authority |
| Cold start, unseen route or unsupported features | `status=abstained`, score and tail fraction `null`, warnings disabled | Neither safe nor malicious is inferred |
| Live source coverage absent, incomplete, unhealthy or behind release time | ML rank and velocity warning suppressed | Deterministic accounting still assesses independently |
| Accounting unknown or destination pending | ML rank and warnings suppressed | Unresolved severity; no ML-driven hold |
| Model score is extreme but backing checks pass | Informational severity and a separate behavioral priority | `recommended_action=observe`, containment basis `null` |
| Finalized facts violate the accounting rule | Deterministic policy priority 100 | Containment basis explicitly identifies accounting, never ML |
| Invalid model artifact | Rejected before inference | No scores from malformed trees or calibration |

Unfinalized releases do not enter the behavioral history. Finalization rebuilds causal history; reorg handling removes invalidated observations. Restart recalculates persisted decisions using the current inference policy. Policy identifier: `advisory-v2`.

Model artifacts validate feature dimensions, finite support bounds, positive scales, sorted finite calibration values, supported route definitions, thresholds, sample counts, tree dimensions, child indices, reachable nodes and absence of cycles. Input checks reject nonfinite features, float32 overflow, boolean/string features, and coerced/negative history counts. Feature deviations explain observed context; they are not causal attributions.

## Forest and velocity baseline

The forest remains the same 128-tree, nine-feature Isolation Forest. Frozen originals are in `D:\OM\bridgewitness\artifacts\frozen-v1`. Tests verify identical trees, warning threshold and historical held-out metrics. No positive labels or held-out attacks were used to change the forest or select its threshold.

A separate positive-spike velocity baseline uses existing five-minute count, five-minute/hour rate and relative-volume features, with robust median/scale normalization. Its threshold uses only pre-attack validation negative proxies and the same Wilson-bound selection policy. This is an explicitly labeled **five-minute feature baseline**, not the PRD's full ten-minute per-token outflow z-score implementation. It is not ML and it has no containment authority.

| Historical warning policy | Detected / 384 attacks | False warnings / 8,428 negative proxies | Interpretation |
|---|---:|---:|---|
| Forest | 9 | 37 | Advisory; weak exploit recall |
| Positive-spike velocity baseline | 4 | 91 | Evaluation comparator; not promoted to exploit detection |

These historical metrics do not measure live coverage gating because the historical CSV feed does not supply live watermarks. Validation bounds are measurements on that split, not future false-positive guarantees. Matched transfers are retrospective negative proxies; two incidents do not establish generalization.

## Backend contract

- `behavior.anomaly_score`: numeric only for eligible observations; otherwise `null`.
- `behavior.warning`: advisory anomaly flag; never an exploit verdict.
- `behavior.abstention_reasons`: explicit eligibility/observation failures.
- `behavior.velocity_baseline`: separate statistical output with its own warning and semantics.
- `behavior.authority`: both accounting-verdict and containment authority are false.
- `severity`: accounting-derived; ML cannot promote consistent transfers to critical.
- `behavioral_priority`: advisory ranking or `null`, separate from severity.
- `containment_basis`: deterministic accounting violation or `null`.
- `risk_score`: existing policy-priority field retained for backend compatibility; never an exploit probability.
- `/model/report`: actual metrics, velocity comparison and reliability contract.

Historical and local routes retain distinct identities. New local/public routes abstain until independently collected normal route traffic supports appropriate calibration. No synthetic attack labels are used to manufacture a performance claim.

## Validation and operation

73 tests pass, including forced-warning isolation tests, coverage failure/recovery, pending/finalized history, artifact corruption and sample-count conservation, input validation, frozen-result comparison, and the existing accounting/proof/API suite. The two-chain EVM replay also passes after these changes. Tests establish these specific software behaviors; they are not a statistical reliability guarantee.

The added velocity calibration changes the model artifact digest. Use a new SQLite database for the updated artifact; existing databases intentionally reject a changed model hash. For example, set `BRIDGEWITNESS_DB` to `D:\OM\bridgewitness\data\advisory-v2.sqlite3`. Keep one writer/worker.

Remaining work for ML deployment validation: independently adjudicated normal traffic, additional independent incidents, route-specific external evaluation, runtime drift monitoring and route calibration. The other PRD capabilities—storage non-deposit proofs, optimistic gate redesign, browser verifier, incident correlation and counterfactual engine—are separate product work and are not claimed complete by this ML update.
