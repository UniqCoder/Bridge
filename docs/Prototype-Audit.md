# BridgeWitness prototype check — 9 October 2026

Reviewed `C:/Users/Admin/Downloads/BridgeWitness-Prototype-Guide.pdf` against the actual Python engine, API, generated artifacts and React pages. This is a local prototype check, not a production security audit. The downloaded PDF was preserved.

## Does it do what the guide says?

| Guide claim | Result after the fixes |
|---|---|
| Nomad and Ronin replays | Working. The UI plays generated events on a virtual clock; it does not perform a fresh chain scan during replay. |
| All 384 historical attack payouts flagged | Reproduced: Nomad 382/382, Ronin 2/2. Labels and source completeness come from the supplied XChainWatcher datasets. |
| No normal payout called an exploit | Reproduced on the 27,312 matched normal payouts. This is not a guarantee for new traffic. |
| Practice attacks and controls | All 30 injected attack payouts flagged; both backed controls produce no alert. Early swarm events can be typed as unbacked or replay before a cluster forms. |
| Real signer recovery | Saved data contains 4,200 normal Ronin withdrawals and both attack withdrawals. Recovery code exists; bulk chain recovery was not rerun in this check. |
| Attack signer group was also used normally | Reproduced in the saved sample: 276 withdrawals, about 6.6%. |
| Withdrawal IDs prove numbers were never issued | Too strong. The sample shows an unusually large ID gap; that alone does not prove absence from the source chain. UI wording corrected. |
| Pairing stops reused messages | Fixed. Each payout is now bound to route, token and message, with exact amount, recipient and prior-use checks. |
| Learned delay window | Working as advice. Per-feed calibration and pre-evaluation training are used. Coverage and interval widths are reported in metrics, rather than promised for future traffic. |
| Copycat clusters | Working. MinHash groups similar withdrawals with recipients masked. The spread fit now uses the complete merged cluster history. |
| Spread proves one payout caused another | Too strong. Hawkes is a fitted timing model. It cannot prove causation or authorize a hold. UI wording corrected. |
| Risk-scored alerts | Working, with a new visible score breakdown and a clear boundary between exploit verdicts and behavioral advice. |
| Browser evidence verification | Previously just a backed-pair edit toy. Now exported bundles have SHA-256 digests, and the browser recomputes exact backing and replay rules for flagged and backed payouts. |
| Browser proves no deposit ever existed | Not established. The history and completeness claim are still supplied by the server. These bundles do not contain chain-state exclusion proofs or independently trusted block headers. |
| Live Across feed | Public API returned 40 current records in a local smoke check. It is now honestly shown as API-reported fills/pending/refunds, not independently proven backing. Models abstain. |
| Stops funds before execution | Not implemented in this current runtime. The zero-latency counterfactual assumes an integrated pre-execution gate; it is a modeled scenario. |
| Deployed on Render/Vercel, fixed memory usage | Deployment configuration exists. No hosted deployment or memory benchmark was performed in this check. |

## What was fixed

1. **Unrelated backing could be accepted.** Amount/recipient matching could substitute a deposit from a different message. Exact authorization identity now decides backing.
2. **Future events could change a past match.** Batch-wide matching let later withdrawals compete for earlier deposits. The ledger now processes events in order.
3. **Replay was reported as merely missing backing.** Prior consumption is tracked and reported as `message_replayed`.
4. **Source gaps were not an explicit input.** Missing history now returns `unknown` unless complete coverage is explicitly asserted. Historical replay explicitly labels that assertion as a dataset assumption.
5. **Risk equated surprise with severity.** Priority now uses rule severity, bounded historical USD exposure, campaign size and a small advisory term. ML cannot erase a violation or promote an otherwise backed transfer to exploit.
6. **Model evaluation reused calibration rows.** The attack-type model now uses separate 60/20/20 training, calibration and test partitions. Reported classifier accuracy remains synthetic-only.
7. **Delay training included later traffic.** Delay training now uses data before each replay evaluation cutoff. Calibration is separated by feed.
8. **Simulation used Nomad delay features for Ronin-style events.** Simulated Ronin events now use the Ronin feature encoding and calibration.
9. **Signer scoring depended on inference batch composition.** Missing-feature replacements are frozen from training. Missing signatures abstain; signer-model training uses rows with recovered signers.
10. **Route value normalization used future daily totals.** It now uses earlier completed days only. The volume baseline also uses causal outflow and includes empty time bins.
11. **MIDAS hashes changed between Python processes.** Stable hashing makes replay results reproducible.
12. **Merged cluster history could be lost.** Hawkes now reads the cluster union's complete timestamp history.
13. **Across prices could create false exploit verdicts.** Prices are display-only. An API record cannot establish chain finality, actual fill execution or independent backing.
14. **SSE events could arrive early.** The server now waits the full scheduled delay and sends heartbeat comments during long gaps.
15. **Failed upstream polls looked fresh.** Retained rows keep their original successful-update time and show a stale-data error. Concurrent viewers share one poll.
16. **Clock and chart errors.** Hidden-tab timers no longer create extra animation loops; feed switches reset the console; first-alert pauses land on the exact event; charts hide unfinished minute totals.
17. **Misleading UI wording.** Removed guaranteed false-alarm claims, “ever issued” source-ID claims, “% sure” attack probabilities and automatic holds based on fitted spread. A z-score is correctly described as standard deviations, not a volume multiplier.

## Risk and ML behavior

Exploit priority = rule base + capped exposure + campaign + advisory context, capped at 100.

- Replay base: 85; missing source authorization: 80; recipient mismatch: 75; amount mismatch: 70.
- Exposure: up to 15 points from historical dataset USD. Prices never decide whether backing is valid.
- Campaign: 5 points when the cluster has at least five members.
- Advisory context: up to 5 points from statistical surprise.
- Backed transfers remain below 70, even with a large amount or statistical alarm.
- Unknown or pending observations receive no exploit priority.

The attack-type model is trained on synthetic scenarios, with distinct calibration and test rows. Its score is not a calibrated real-world probability. Exact facts constrain its possible labels; recovered signatures are required for a suspected-key-compromise label. A recovered signer set still does not prove a private key was stolen.

Rolling ranks and accumulated scores remain advisory. We report measured false-alarm counts; we do not claim that the current sliding-window construction establishes an e-CUSUM run-length guarantee on live bridge traffic. The theoretical guarantee needs valid sequential evidence assumptions. See [the e-detector paper](https://nejsds.nestat.org/journal/NEJSDS/article/59/text).

Across is an intent bridge with relayer-funded destination fills and later settlement. It needs a dedicated chain adapter for genuine backing verification. See [Across's lifecycle documentation](https://docs.across.to/guides/concepts/intent-lifecycle).

## Validation

- Rebuilt the Python models and all three replay artifacts.
- 30 regression tests cover authorization identity, replay, amount/recipient tampering, coverage, model independence, scoring limits, stream scheduling, stale data and artifact recomputation.
- 15 historical artifact checks and algorithm self-checks.
- Frontend TypeScript and production Vite build.
- Browser navigation across all ten guide pages, evidence digest/rule checks across all 541 exported payouts, tamper interactions, feed switching, exact first-alert pause, score breakdown and mobile verification.
- API smoke checks for health, feeds, metrics and live status. No secrets or public-chain transactions were submitted.

## Reproduce

```powershell
python -m bridgewitness.pipeline
python -m unittest bridgewitness.test_regressions
python -m bridgewitness.selfcheck
python -m bridgewitness.algos
cd web
npm run data
npm run build
```

For UI checks, start Vite on port 5190 and run `python scripts/check_prototype_browser.py` from the project root. The browser check uses locally installed Playwright and Edge; it does not add runtime dependencies.

Remaining work: independent incident evaluation, chain-backed absence proofs and finality, actual pre-execution enforcement, deployment/load testing, and refreshing the original guide's screenshots and numerical text. Large JavaScript chunks still produce a Vite warning.
