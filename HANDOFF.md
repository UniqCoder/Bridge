# BridgeWitness — Implementation Handoff

Read this first, then the PRD. This file tells a fresh session **what exists, what is decided, what to build, in what order, and how to know each step is done.**

| | |
|---|---|
| Problem statement | **CSB-01 · Real-Time Detection of Cross-Chain Bridge Exploits (Chainalysis).** Dashboard over a replayed/simulated bridge feed; flag volume spikes, unusual signer behaviour, mismatched deposit/withdrawal pairs; risk-scored alert with suspected exploit type. The product must lead with this, not with Nomad |
| Spec | `D:\fusionhack\BridgeWitness-PRD.md` **v2.2** (source of truth; §A–§E at the top map CSB-01, explain every USP in plain words, list the data, the measured results and the pitch content) |
| Progress + claims | `D:\fusionhack\PROGRESS.md` (what is real, demo, synthetic, planned; every claim with its evidence and caveat) |
| Hackathon brief | `D:\fusionhack\docs\BridgeWitness-Hackathon-Brief.pdf` (9 pages, rendered from the `.html` beside it with headless Edge) |
| **Build location** | `D:\fusionhack\web` (frontend, **built**) · `D:\fusionhack\bridgewitness` (backend, **not started**) |
| Reference code | `D:\OM\bridgewitness` (Python 3.10, FastAPI, Solidity 0.8.26, Ganache 7.9.2; `pytest -q` 55 passed). **Read-only:** port from it, never edit it |
| Spike | `D:\fusionhack\spikes\proof_spike.py`: storage inclusion/exclusion proof on Ganache, verified |
| **Status (9 Oct 2026)** | Frontend prototype complete in **fixture mode** (no backend, no API, no live stream). Every USP has a working in-browser demo. Next: backend Steps 1→5, then swap fixtures for the API endpoint by endpoint |

---

## 0. Current state of the frontend (read first)

### 0.1 Run it
```powershell
cd D:\fusionhack\web
npm install
npm run fixtures   # reads D:\OM\bridgewitness (override with BW_REF), asserts every number, writes src/data/fixtures/*.json
npm run check      # in-browser demo logic: Ethereum trie test vector, proof bridge, all 12 attacks
npm run dev        # http://localhost:5173  (launch config: D:\fusionhack\.claude\launch.json, name "web")
npm run build      # tsc --noEmit && vite build; must stay green
```
Node ≥ 23.6 is required: the fixture and check scripts import `.ts` files directly (type stripping).

### 0.2 Pages (react-router; URL → on-screen name)
| URL | Name | What it does |
|---|---|---|
| `/` | Landing | CSB-01 framing in plain words, requirement checklist, three signals + one explained alert, Ronin "why checks miss it", ledger playground, 7 USPs each linking to its demo, flow-map teaser, data, architecture, three ways to try |
| `/console/monitor` (console home) | Monitor | **The CSB-01 dashboard.** Feed picker (simulated · Nomad · Ronin), play/seek, numbered event pins + legend, three signal panels (pairs, bursts, signer heatmap), alert queue with risk breakdown + suspected attack + reasons, incidents, transaction stream. `?feed=nomad|ronin` |
| `/console/lab` | USP demos | One interactive demo per USP (anchors `#usp-1` … `#usp-7`) |
| `/console/gauntlet` | Attack tests | 12 attacks run in the browser through the real rule; "Run all 12" scores them (12/12) |
| `/console/evidence[/:sha]` | Evidence | 12 reference bundles, tree with violating fields, in-browser verify, tamper + diff |
| `/console/incidents[/:id]` | Incidents | `inc_nomad`, `inc_live` |
| `/console/theatre` | What-if | Counterfactual lanes, latency slider, loss vs scope |
| `/console/replay` | Nomad | Nomad case study with watermarks and "Cut the source data feed" |
| `/console/graph` | Flow map | three.js cross-chain graph of the Nomad releases |
| `/console/witness` | Live bridge | 3D bridge + alert takeover |
| `/console/eval` | Results | Three signals measured on the datasets, simulated-replay table, model card, pending baselines |
| `/docs/evidence-spec`, `/docs/architecture` | Docs | Bundle spec; architecture, API contract, routes |

### 0.3 Code map (`web/src`)
| Path | Holds |
|---|---|
| `verify/` | Browser verifier: `canonical.ts` (Python-identical JSON + SHA-256), `bytes.ts`, `proofs.ts` (header RLP+keccak, MPT walk `mptGet`), `accounting.ts` (**TS port of `assess_accounting`**), `verifyBundle.ts` (step list) |
| `detect/` | CSB-01 signals: `velocity.ts` (port of the reference velocity baseline; threshold from `behavior_model.json`), `classify.ts` (signer behaviour, exploit-type classifier, risk score, `CONTAINS`), `analyze.ts` (one pass over any feed), `simulate.ts` (seeded simulated attack replay, seed 2410) |
| `demo/` | USP demos: `trie.ts` (MPT builder; reproduces the Ethereum "doe/dog/dogglesworth" root), `proofBridge.ts` (simulated SourceBridge storage → account → state root; account + storage proofs), `attacks.ts` (the 12 attacks) |
| `data/` | `fixtures/*.json` (generated, do not edit), `index.ts` (typed access, `DET` summary), `monitor.ts` (feed clock + alerts + incidents), `replay.ts` (Nomad clock + watermarks + incident) |
| `widgets/` | `demos.tsx` (ProofDemo, WatermarkDemo, GateDemo, SelfTest), `EvidenceMini`, `Verifier`, `Counterfactual`, `LedgerPlayground`, `console.tsx`, `diagrams.tsx`, `showcase.tsx` |
| `three/` | `WitnessCanvas.tsx` (bridge), `FlowGraph.tsx` + `graphData.ts`, threads/towers/gates/fog shaders |
| `pages/`, `app/`, `design/` | Pages; routes and layouts; design system (`design/system.css` = Oxide Vault tokens) |
| `scripts/build-fixtures.mjs` | Builds all fixtures from the real data **and asserts** HANDOFF §5 facts, the Step 4 counterfactual table, the golden verifier (12/12), the simulated-replay outcomes and the detection numbers |
| `scripts/check-demo.mjs` | Asserts the demo logic (trie vector, proofs, tamper, 12/12 attacks, which are held) |

### 0.4 What is real, demo or pending
- **Real data, real logic:** backing rule on Nomad/Ronin rows (TS port, "engine preview"), velocity detector, counterfactual, incident grouping on Nomad, browser verification of the 12 reference bundles, flow map.
- **Demo (real logic, simulated data, labelled on screen):** simulated attack replay; signer behaviour; Proof of Non-Deposit (simulated bridge, real MPT mechanics); watermark demo; pre-execution gate with adaptive scope (6× fast 30 s window); the 12 attacks (three use a thin, labelled engine layer: reorg #7, early-release rule #10, overdue timer #11).
- **Preview constants owned by the backend later:** observer lags (4 s / 2 s), SLA 1,800 s, copycat thresholds (≥10 from ≥5 in 15 min), Monitor incident window and campaign rule (≥5 on a route in 15 min). In `data/replay.ts` and `data/monitor.ts`.
- **Pending backend (shown as such, never filled):** live API/SSE, real-chain state proofs, on-chain optimistic gate and verifier hold, Gauntlet launch on real chains, S0–S7 fault injection, baselines B1–B3, ablation, disruption metric (users blocked).

### 0.5 How backend work plugs in
`data/index.ts` exposes `API` / `MODE` (`VITE_BW_API`). Swap one fixture at a time for its endpoint (§4). The TS modules in `verify/`, `detect/` and `demo/attacks.ts` are the **behavioural spec** for the Python ports: the backend must produce the same verdicts, exploit types and scores, and `build-fixtures.mjs` / `check-demo.mjs` assertions become the golden tests on both sides.

---

## 1. Reference implementation (in `D:\OM\bridgewitness`; port from it, don't edit it)

The new build in `D:\fusionhack` starts empty. These modules are verified working, so **port their logic and tests** rather than redesigning. When the backend is built, copy the raw data (`data/raw/*.csv`, `manifest.json`, `license.txt`) and `artifacts/contracts.json` across, re-run the 55 reference tests against the ported code, and keep them green.

| Module | Does | Verified by |
|---|---|---|
| `accounting.py` | Exact uint256 backing rules, `verify_bundle`, rule `exact-lock-mint-v1` | `tests/test_accounting.py` |
| `engine.py` | SQLite WAL ledger, idempotent ingest, finalize, reorg invalidation + rebuild, coverage | `tests/test_execution.py`, `test_api.py` |
| `proofs.py` | Header hash recompute; tx and receipt MPT inclusion proofs (legacy → EIP-7702) | tests |
| `evm.py` | RPC client, calldata, event extraction for the WitnessDemo ABI | `live_demo.py` |
| `monitor.py` | Finalized, contiguous, hash-linked scanner (= watermark cursor) | `live_demo.py` |
| `live_demo.py` + `contracts/WitnessDemo.sol` | Two Ganache chains; compromised-validator release blocked; healthy route settles 25,000,000 units | `artifacts/live_demo_report.json` |
| `model.py`, `train.py`, `features.py` | Abstaining Isolation Forest, causal features, statistical baseline | `tests/test_model.py`, `artifacts/evaluation.json` |
| `data.py` | Pinned, checksummed Nomad/Ronin CSVs (`data/raw/manifest.json`) | — |
| `api.py` | Bearer-auth FastAPI: `/health /events /decisions /coverage /finalize /reorg /evidence/verify /model/report /historical/replay` | `tests/test_api.py` |

Commands (run from `D:\OM\bridgewitness`):

```powershell
python -m pytest -q
python -m bridgewitness.demo
python -m bridgewitness.live_demo
npm run compile
```

`npm run compile` recompiles the Solidity into `artifacts/contracts.json`.

---

## 2. Locked decisions (don't relitigate; ask the user before changing any of these)

1. **Lead with the problem statement (CSB-01).** The product is first the dashboard the brief asks for (three signals, risk-scored alert, suspected exploit type, replayed + simulated feeds). Nomad and Ronin are real-world case studies, not the frame. *(Decided 9 Oct, v2.2.)*
2. **Thesis:** "Signatures can be stolen. Conservation can't." The backing invariant is the foundation and is cited prior art (XChainWatcher, Count of Monte Crypto); our novelty is the seven capabilities (PRD §6.1–6.7, §B.3).
3. **Rules decide; signals advise.** Only a broken deposit or signer rule can hold funds. Volume and signer-behaviour signals rank and explain. ML is advisory and never triggers a hold.
4. **Visual identity: "Oxide Vault"** (PRD §9.0): graphite plates, Unbounded / Instrument Sans / Martian Mono; colour is semantic (patina = consistent, copper = violation, brass = pending/overdue, unknown = hatch, orphaned = outline + strike; chain hues only on chain ids). Banned list still applies. *(Replaced "Forensic Instrument" on 9 Oct, v2.1.)*
5. **Information architecture:** multi-section landing + console (Monitor home, USP demos, Attack tests, Evidence, Incidents, What-if, Nomad, Flow map, Live bridge, Results) + two docs pages. *(Replaced the 8-chapter scroll story and six tabs on 9 Oct.)*
6. **Plain language** in the UI: say "deposit and withdrawal don't match", "sudden burst", "advice only", "can be held"; keep rule identifiers (e.g. `missing_source_authorization`) only as small technical reasons.
7. **Every USP must be demonstrable**, and every demo labelled real vs simulated.
8. **No inflated claims.** Every on-screen number comes from a script that fails on drift. Never "100 % accurate", "AI-powered", "funds saved". PRD §15 non-claims stay in the footer. `unknown` instead of false alarms; label circularity disclosed; trust line in Verify.

---

## 3. Build plan (each step with a done-test)

**Execution order chosen by the user: Step 6 (frontend) first, then Steps 1 → 5.** The frontend is built against the **frozen API contract (§4)**, using fixtures until the backend exists.

**Fixtures must be real-data derived, not invented:**
- `web/scripts/build-fixtures.mjs` reads `D:\OM\bridgewitness\data\raw\nomad_normal.csv`, `nomad_attack.csv` and `ronin_attack.csv`, plus `artifacts/demo_report.json`, `live_demo_report.json`, `evaluation.json` and `example_evidence_bundle.json`.
- It emits JSON matching §4: a replay event stream, decisions, the Nomad incident, the counterfactual lanes computed from the CSVs, and the model card.
- Fixture files carry `"provenance": "fixture"`.
- Values the backend doesn't produce yet are clearly marked `"pending_backend": true` and shown in the UI as such, never as real results. This applies to the `eval/results.json` numbers, the S0–S7 outcomes and Gauntlet results.

Frontend dependencies:
- Pin exact versions. A known-compatible set: `react@18.3.1`, `three@0.170.0`, `@react-three/fiber@8.18.0`, `@react-three/drei@9.122.0`, `@react-three/postprocessing@2.19.1`, `gsap@3.12.5`, `lenis@1.1.20`, `vite@5.4.11`, `typescript@5.6.3`.
- Add the rest of the PRD §9.7 stack only when a feature needs it.
- A thin `api.ts` that switches between fixtures and the live API is enough; MSW is optional.

### Step 1 — Correctness spine: Nomad reconciliation replay
- [ ] `bridgewitness/reconcile_replay.py`: build a `BridgeEvent` stream from `data/raw/nomad_normal.csv` (both legs) and `nomad_attack.csv` (destination-only).
  - Order by `(timestamp, chain, tx_hash)`.
  - Virtual clock, speed 1–1000×, seek.
  - Per-chain observer lag; `wm[1650811245]` (Moonbeam source) advances from source-event time minus lag.
- [ ] Map Nomad rows onto the existing `Event` schema. Add a `nomad` route config with domain IDs `6648936` (eth) and `1650811245` (moon), `withdrawal_id` as `message_id`, token mapping from the CSV pairs.
  - **Event identity is not `withdrawal_id`.** Use `(dst_tx_hash, row ordinal within that tx)`, with the ordinal standing in for `log_index`. Attack transactions batch up to 10 releases (167 distinct tx hashes for 382 rows).
  - **Copycats reused real message IDs:** only 14 distinct `withdrawal_id`s among the 382 attack rows; `4922` alone appears 279 times; 9 IDs collide with legitimate matched transfers. So the attacks resolve to a **mix** of rules: `missing_source_authorization` where no deposit exists, and `message_replayed` / `authorization_overconsumed` / `recipient_mismatch` / `amount_mismatch` where they reuse a legitimate deposit's ID. That is semantically correct (Nomad copycats literally replayed proven messages). Report the per-rule breakdown; don't force everything into "unbacked".
- [ ] *(P1)* `bridgewitness/cleanroom.py`: fetch raw facts + `SC_WithdrawalsWithoutMatch.csv` from the XChainWatcher repo. Pin the commit + SHA-256 in `data/raw/manifest.json`. Join `sc_token_withdrew` ⋈ `tc_token_withdrew` on `withdrawal_id` + token map and diff.
- **Done when:**
  - The replay produces **382** `invariant_violation` verdicts (any backing rule; per-rule counts printed), the first at `2022-08-01 21:32:31 UTC`.
  - **0** violations among the 193 normal transfers on 1–2 Aug.
  - It is deterministic across two runs.

### Step 2 — On-chain differentiators (`contracts/WitnessDemo.sol`, `live_demo.py`, `proofs.py`)
- [ ] **SourceBridge commitment:** `mapping(bytes32 => bytes32) public deposits;` storing `keccak256(abi.encode(token, amount, recipient, destinationChainId))`. Reject duplicates via `deposits[id] != 0`.
- [ ] **Optimistic WitnessGate:**
  - `requestRelease` records `executableAt = block.timestamp + challengeWindow`.
  - `execute` is permissionless after that, unless the message, route or verifier is held.
  - Remove the per-release `approve`.
- [ ] **Accountable holds:**
  - `holdWithEvidence(uint8 scope, bytes32 target, bytes32 bundleHash, bytes32 reasonCode)` with scope 0 = message, 1 = route, 2 = verifier;
  - `resolve(scope, target, resolutionHash)`;
  - events for both;
  - guardian-only.
- [ ] **`VulnerableSourceBridge.authorizeUnchecked`:** emits `Authorized` without a transfer (Gauntlet #9). Configure it on a third route.
- [ ] **`proofs.py`:** `make_state_proof(rpc, contract, slot, block)` and `verify_state_proof(proof)` → `{account_verified, slot_value}`. Port the logic in `spikes/proof_spike.py`. Normalize short storage keys to 32 bytes.
- [ ] **Bundle field:** `state_proof` + `evidence_mode: "state_proof" | "watermark"`. In `accounting.py`, a state-proof empty slot at finalized block N is sufficient for `missing_source_authorization`. A non-empty commitment that matches the release is sufficient for backing.
- **Done when:**
  - `live_demo.py` passes with: the healthy release executing **without** guardian action after the window; the attack held via `holdWithEvidence`; `execute` reverting.
  - The attack bundle contains a state proof that verifies in Python, and a tampered proof node fails.
  - The 55 existing tests still pass, adjusted only where the gate API changed.

### Step 3 — Operational layer
- [ ] **Rules** (`accounting.py`, released as `exact-lock-mint-v2`; `verify_bundle` still accepts `v1`):
  - `early_release`: `release_ts − deposit_ts < finality`;
  - `fake_deposit`: no ERC-20 Transfer into the bridge in the same receipt.
- [ ] **`engine.py` lifecycle:**
  - `overdue` state after `finality + SLA`;
  - late arrivals promote `unknown` → `consistent`;
  - a `violation` can only be retracted with an audit row (`observer_fault`).
- [ ] **`bridgewitness/incidents.py`:**
  - group by (destination chain, destination contract/verifier) within a window W. The **rule is not part of the key**, because Nomad's attack mixes unbacked and replayed-ID violations that belong to one incident; keep the rule set on the incident;
  - per-token exposure and USD (from dataset `value_usd`, labelled);
  - copycat escalation (≥ N violations, ≥ M beneficiaries in W);
  - the priority formula and breakdown from PRD §6.6;
  - scope recommendation (route → verifier on a 2nd route behind the same verifier).
- [ ] **`api.py`:**
  - SSE `GET /stream`, using `StreamingResponse` with an in-process asyncio fan-out; the engine stays a single writer with `--workers 1`;
  - a read-only **viewer token**, separate from the adapter token;
  - `/incidents`, `/incidents/{id}`, `/ledger`, `/replay*`, `/coverage` (GET).
- **Done when:**
  - Nomad S1 yields **exactly 1 incident** whose exposure equals the sum of the attack rows' `value_usd` ($159,577,598).
  - The copycat flag is raised.
  - The scope recommendation becomes `verifier` at +2,986 s (the second token hit).

- [ ] **Port the CSB-01 detectors** from `web/src/detect/` (velocity, signer behaviour, classifier, risk score) into the engine so `/stream` decisions carry `exploit_type`, `signals` and `risk` with the same values the fixtures assert.

### Step 4 — Evaluation and counterfactual
- [ ] **`bridgewitness/inject.py`:** scenarios S0–S7 from PRD §6.7, seeded.
- [ ] **`bridgewitness/evaluate.py`:** writes `eval/results.json`, with a `npm run eval` / `python -m bridgewitness.evaluate` entry point. On Windows there may be no `make`; add a `Makefile` alias only if harmless. It contains:
  - per-scenario expected vs. observed and pass/fail;
  - baselines B1 (per-tx > $1M), B2 (10-min z-score, reusing `features.py`), and optional B3 (forest);
  - the 4-step ablation;
  - targets;
  - commit and seed.
- [ ] **`bridgewitness/counterfactual.py`:** the 5 lanes from PRD §6.5 for Nomad and Ronin at a given latency.
- **Done when:** it reproduces these numbers from `nomad_attack.csv`:

  | Latency | Pause everything | Hold routes | Adaptive |
  |---|---|---|---|
  | 0 s | 5.8% | 13.2% | 7.0% |
  | 60 s | 10.1% | 17.7% | 11.5% |
  | 900 s | 10.4% | 65.8% | 33.8% |

  Ronin post-execution recovery is ≤ 4.5%. `eval/results.json` regenerates identically from the seed.

### Step 5 — Interaction
- [ ] **`POST /gauntlet/{1..12}`:** only when `BRIDGEWITNESS_DEMO=1` and bound to 127.0.0.1. One long-lived pair of Ganache chains is started by the API at boot in demo mode. Reuse `live_demo.py` helpers.
- [ ] **`/guardian/hold`, `/guardian/resolve`:** wrap the contract calls and record the hold in the engine.
- [x] **TS verifier** (`web/src/verify/`), **built**:
  - canonical JSON identical to Python (sorted keys, `(",",":")` separators, `ensure_ascii` escaping);
  - MPT walk written in-house (`proofs.ts`, no `@ethereumjs/trie`: it pulls Node stream polyfills); header RLP + keccak recompute;
  - accounting recompute with `BigInt` (`accounting.ts`). State-proof verification exists in the demo (`demo/proofBridge.ts`); wire it to real `eth_getProof` output in Step 2.
- [~] **Golden tests:** done for the 12 existing bundles (`build-fixtures.mjs` asserts TS = Python on hash and verdict). Add the new Gauntlet runs' bundles when they exist.
- [ ] **Gauntlet parity:** the Python runs must reproduce `web/src/demo/attacks.ts` outcomes (expected verdicts and which are held: 1, 2, 3, 4, 5, 9, 10, 12).
- **Done when:** all 12 Gauntlet scenarios resolve to their expected verdict (PRD §7.1) within 5 s and the golden suite is green.

### Step 6 — Frontend (`D:\fusionhack\web`) — **done in fixture mode**
- [x] Scaffold React 18 + Vite + TS, pinned versions (react 18.3.1, three 0.170.0, R3F 8.18.0, drei 9.122.0, postprocessing 2.19.1, lenis 1.1.20, react-router-dom 6.28.0, framer-motion 11.11.17, @ethereumjs/rlp 5.0.2, @noble/hashes 1.5.0, vite 5.4.11, typescript 5.6.3). GSAP was removed (unused).
- [x] Fixtures generated from the real CSVs/artifacts with assertions (no MSW; `data/index.ts` switches on `VITE_BW_API`).
- [x] All pages in §0.2; CSB-01 Monitor; USP demos; Attack tests; Evidence verify + tamper; flow map; reduced-motion respected; aria-live twin on Live bridge; verdicts never colour-only.
- [x] Overlap/overflow sweep: automated text-overlap detector at 375 / 820 / 1280 px on every page, clean.
- [ ] Remaining: live API wiring per endpoint; 2D fallback when WebGL is unavailable; first JS chunk ≈ 660 KB (could be split); a real 60 fps / FCP measurement (the browser pane used for testing was often hidden, which pauses rendering).

### Cut order (only if forced)
F14 → F12 → F6 → F24 → Theatre slider (static chart) → Tamper (keep Verify).

**Never cut:** F1–F5, F11, F16, F17, F19, F21, F25–F29 (CSB-01 dashboard, velocity, signer, classifier, simulated replay), Verify-in-Browser, the USP demos, the violation moment.

---

## 4. Frozen API contract (frontend builds against this)

All amounts are **decimal strings**: the frontend uses `BigInt`, never `Number`. Timestamps are unix seconds. Decision objects keep every field `assess_accounting` returns today, plus the additions marked `+`.

```jsonc
// Decision (from /decisions, /stream type=decision)
{
  "event_id": "...", "route_id": "nomad-usdc", "message_id": "5078",
  "status": "invariant_violation|consistent_under_supplied_evidence|unknown|pending|overdue|orphaned",
  "violations": ["missing_source_authorization"], "unknown_reasons": [],
  "suspected_exploit_type": "suspected_unbacked_release",
  "execution_phase": "requested_not_executed|executed",
  "accounting": { "released_common_units": "10000000000", "authorized_common_units": "0",
                  "excess_common_units": "10000000000", "released_display": "100.00000000", "usd_value": "2297085.88" },
  "+priority": 92, "+breakdown": { "base": 80, "exposure": 15, "campaign": 5, "completeness": 1.0 },
  "+severity": "critical|high|medium|low", "+confidence": "high|medium|low",
  "+incident_id": "inc_1", "+tx_url": "https://etherscan.io/tx/0x…",
  "evidence": { "bundle_sha256": "…", "+evidence_mode": "state_proof|watermark", "bundle": { } }
}

// SSE GET /stream — one JSON object per `data:` line
{ "type": "decision",  "decision": { } }
{ "type": "watermark", "chain_id": 1650811245, "wm_timestamp": 1659389500, "finalized_block": null,
                       "healthy": true, "lag_s": 4 }
{ "type": "incident",  "incident": {
    "id": "inc_1", "kind": "unbacked_release", "status": "open|contained|resolved",
    "first_seen": 1659389551, "last_seen": 1659398653, "violation_count": 382, "beneficiaries": 279,
    "tokens": ["USDC","WBTC"], "exposure": { "USDC": { "units": "…", "usd": "…" } },
    "exposure_usd_total": "159577598", "priority": 100, "breakdown": { }, "copycat": true,
    "recommended_scope": "message|route|verifier", "decision_ids": ["…"] } }
{ "type": "hold",   "scope": "route", "target": "0x…", "bundle_sha256": "…", "reason_code": "missing_source_authorization",
                    "tx_hash": "0x…", "guardian": "0x…", "active": true }
{ "type": "replay", "scenario": "S1", "clock_ts": 1659389551, "speed": 60, "playing": true }

// GET /counterfactual?incident=nomad&latency=60
{ "incident": "nomad", "latency_s": 60,
  "lanes": [ { "policy": "no_monitor|alert_human|pause_all|hold_routes|adaptive",
               "lost_usd": "16079601", "lost_pct": 10.1, "legit_blocked": 0, "contained_at": 1659389611 } ],
  "assumptions": ["attackers behave identically after a hold", "detection at first unbacked release", "dataset USD"] }

// GET /eval/latest
{ "generated_at": 0, "commit": "…", "seed": 2410,
  "scenarios": { "S0": { "expected": "…", "observed": "…", "pass": true } },
  "baselines": [ { "name": "ours|B1_whale|B2_zscore|B3_forest", "precision": 0, "recall": 0,
                   "fp_s2": 0, "fp_s3": 0, "alerts_per_incident": 0, "latency_s": 0 } ],
  "ablation":  [ { "step": "rule_only|+watermark|+incidents|+soft_signals", "fp_s2": 0, "fp_s3": 0, "alerts_per_incident": 0 } ],
  "targets": { }, "disclaimers": ["labels derive from XChainWatcher matching rules"] }

// POST /gauntlet/{n} → { "scenario": n, "accepted": true }; the result arrives on /stream
// POST /replay {"scenario":"S1","speed":60,"start_ts":1659387600}; /replay/pause; /replay/seek {"ts":…}
```

---

## 5. Verified facts (use these numbers; don't re-derive them in copy)

- **Nomad attack:** 382 releases in 167 transactions · only 14 distinct message IDs (`4922` ×279) · 9 tokens · 279 recipients · $159,577,598 (dataset USD) · 2.53 h · first `2022-08-01 21:32:31 UTC` · second token hit at +2,986 s.
- **Nomad normal:** 4,482 matched pairs (11 Jan → 1 Aug 2022), 193 on 1–2 Aug, all Moonbeam → Ethereum, min delay 1,860 s (> 1,800 s finality).
- **Ronin attack:** 2 releases 115 s apart, 173,600 WETH (~$539.9M) then ~$25.5M.
- **ML (held-out):** recall 2.34% (9/384), FPR 0.44%, ROC AUC 0.982 raw score. Advisory only.
- **Engine latency:** p50 0.82 ms, p99 2.6 ms per deposit + release pair (local, SQLite FULL).
- **Ganache:** supports the `finalized` tag and `eth_getProof` (not on forks); py-trie `get_from_proof` verifies exclusion.
- **Ronin dataset USD:** $565,376,765 ($539.9M + $25.5M). The $624M headline is the public estimate; always label it.
- **Backing rule (TS port) on the datasets:** Nomad 382/382 attack releases (45 `missing_source_authorization`, 337 replayed ids led by `recipient_mismatch`), 0/4,482 normal; Ronin 2/2, 0/22,830 normal. Labels are XChainWatcher's (circular; say so).
- **Velocity (volume-spike) detector:** threshold 10.99 from `behavior_model.json`. Nomad: first flag +2,986 s, 314/382 eventually, 17 releases = $23,591,072 (14.8 %) gone before the first flag, 141/4,482 normal false alarms (3.1 %). Ronin: 0/2 (deviation 6.93, 4.63), 343/22,830 normal (1.5 %). There was **no** "normal volume" on Ronin in the sense of size: a whale alert (> $1M) fires 2/2, after execution.
- **Simulated replay (seed 2410):** 130 releases = 101 background + 19 attack (6 scenarios) + 10 control. 6/6 scenarios typed correctly; controls raise no exploit alert (the honest burst raises a low-ranked volume advisory); 6/101 background volume advisories. Example alert: validator-key compromise, risk 100 = 80 + 15 + 5.
- **Demo checks:** MPT builder reproduces root `0x8aad789d…1168d3` (Ethereum test vector); proof bridge includes 6 deposits, excludes absent ids, rejects tampering and a wrong root; 12/12 attacks match, held = 1, 2, 3, 4, 5, 9, 10, 12.
- **Reference artifacts change:** `live_demo_report.json` was regenerated at 12:15 on 9 Oct; the live attack bundle hash is now `2d4716e5…`. Fixtures always follow the artifacts; never hard-code hashes.

---

## 6. Pitfalls already found

0. **Nomad `withdrawal_id` is reused by attackers** (14 distinct IDs across 382 attack rows; 9 collide with legitimate transfers). Event identity = `(tx_hash, ordinal)`; expect mixed rule types; group incidents without the rule in the key.
1. Routes pin the source contract, so a lookalike contract at another address is ignored. Fake deposit must use a **configured** vulnerable route (Step 2).
2. `used[id]` (a boolean) proves existence only. Store the **commitment** so a state proof proves amount and recipient.
3. The derived CSVs lack `tx_index` / `log_index`; order by `(ts, chain, tx_hash)`.
4. The API must run with **one worker** (in-memory behavioral history); SSE fan-out lives in-process.
5. The TS bundle hash must match Python's `json.dumps(sort_keys=True, separators=(",",":"))` **including `ensure_ascii` escaping**.
6. Keep `verify_bundle` accepting `exact-lock-mint-v1` after bumping to `v2`.
7. Never expose the adapter bearer token to the browser; use the viewer token.
8. Gauntlet and guardian routes must not exist outside `BRIDGEWITNESS_DEMO=1`.
9. **Python on this machine defaults to cp1252.** Any script that edits UTF-8 source must set `PYTHONUTF8=1` or open files with `encoding='utf-8'`, otherwise non-ASCII text (…, →, —) is corrupted or replacements silently fail to match.
10. **Bash heredocs containing backticks and quotes** were mangled by the tool wrapper; write patch scripts to the scratchpad and run them instead.
11. **After installing new npm packages, restart the Vite dev server** (stale optimized deps give "504 Outdated Optimize Dep" and a blank page).
12. **The browser pane can be hidden** (`document.visibilityState === 'hidden'`): rAF and CSS transitions freeze, so screenshots look stale or blank. Verify with DOM checks, or force frames with repeated screenshots.
13. Node-imported TS modules (`build-fixtures.mjs`, `check-demo.mjs`) must use explicit `.ts` import extensions (`allowImportingTsExtensions` is on).
14. The velocity baseline's forest gate ("route seen in training") is intentionally **not** applied in the TS port, so it runs on any route; keep that deviation documented if the Python port differs.

---

## 7. Kickoff prompt for the next session (backend phase)

Open the new session with working directory **`D:\fusionhack`** and paste:

```text
You are continuing BridgeWitness (CSB-01: real-time detection of cross-chain bridge exploits).
The frontend prototype in D:\fusionhack\web is complete in fixture mode. Now build the backend.

Read first: D:\fusionhack\HANDOFF.md (§0 current state, §2 locked decisions, §3 Steps 1–5,
§4 frozen API, §5 verified facts, §6 pitfalls), D:\fusionhack\PROGRESS.md, and PRD §A–§E.
Reference code (READ-ONLY): D:\OM\bridgewitness.

Rules:
- Backend goes in D:\fusionhack\bridgewitness. Port logic and tests from the reference repo; keep its 55 tests green.
- Port the TS behaviour in web/src/verify, web/src/detect and web/src/demo/attacks.ts to Python with
  identical outputs; the assertions in web/scripts/build-fixtures.mjs and check-demo.mjs are the golden tests.
- Then swap fixtures for live endpoints one at a time (VITE_BW_API), keeping npm run fixtures/check/build green.
- Locked decisions in HANDOFF §2 need my approval to change. No invented numbers; label demo vs real.
- Set PYTHONUTF8=1 for any script that edits files.

Start with a short plan for Step 1 (Nomad reconciliation replay in Python) and its done-test, then build.
```
