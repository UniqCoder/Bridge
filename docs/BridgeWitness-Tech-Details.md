# BridgeWitness: technical details of the prototype

> **What this file is for:** give this file to any AI model as the only source for slides, a pitch deck, a report or speaker notes about BridgeWitness. It describes the prototype as it is built and deployed on **10 October 2026**. Every number comes from `bridgewitness/artifacts/metrics.json` (built by the pipeline) or from running the code. Section 14 lists the honesty rules that any generated content must follow.
>
> **Instruction to the AI model reading this:** use only the facts in this file. Do not invent numbers, customers, partners, users or results. If a slide needs a number this file does not give, write "not measured" instead.

---

## 0. One-screen summary

| | |
|---|---|
| Product | **BridgeWitness**: real-time detection of cross-chain bridge exploits, accusing only with proof |
| Brand line | *"Signatures can be stolen. Conservation can't."* |
| Problem statement | **CSB-01 · Real-Time Detection of Cross-Chain Bridge Exploits** (Chainalysis) |
| Core idea | Every payout on the destination chain must be backed by a matching deposit on the source chain (conservation). Stolen keys can forge valid signatures, but they cannot create a deposit that never happened. |
| What it does | Replays real bridge hacks (Nomad 2022, Ronin 2022), a practice feed of injected attacks inside real traffic, and a live tail of a real bridge (Across). It checks every payout, scores risk 0–100, names the suspected attack type, explains why, and lets anyone re-verify the proof in the browser. |
| Headline results | **422 / 422** attack payouts labelled "exploit" across the three replays (Nomad 382/382, Ronin 2/2, practice 38/38); **0** honest payouts ever labelled "exploit" |
| Statistical false alarms on held-out normal days | Nomad **0 / 1,826**, Ronin **0 / 6,316**, practice **2 / 2,126** |
| Stack | Python 3.10 (pandas, NumPy, SciPy, LightGBM, scikit-learn, datasketch, eth-keys) · FastAPI + Uvicorn · React 18 + Vite + TypeScript · Three.js (React Three Fiber) · uPlot |
| Hosting | Render free plan, one Blueprint: Docker API + static website |
| Live URLs | Website https://bridgewitness-web.onrender.com · API https://bridgewitness-api.onrender.com (`/health`) |
| Repo | https://github.com/UniqCoder/Bridge (private), branch `main` |
| Cost to run | $0. No paid services and no required API keys |
| Quality gates | `selfcheck` **16/16** golden checks pass · **30** regression unit tests pass · algorithm self-test passes · TypeScript build clean |

---

## 1. The problem

A **cross-chain bridge** moves value between blockchains: a user locks (deposits) coins on chain A, and the bridge pays out (releases) the same value on chain B. The bridge contract holds everyone's locked coins, so it is one of the biggest targets in crypto.

- Chainalysis estimated about **$2 billion stolen from bridges in 2022**, roughly two thirds of all crypto stolen that year.
- **Ronin (23 March 2022):** attackers stole 5 of the 9 validator keys and signed two withdrawals **115 seconds apart**. Every signature was valid, so normal checks saw nothing wrong. Public estimate **~$624M**; the value in our dataset is **$565.4M**.
- **Nomad (1–2 August 2022, ~$190M public estimate):** a bug let anyone withdraw money that was never deposited. One attacker went first, then **hundreds of copycats** pasted the same transaction with their own address. In our dataset: **382 attack payouts** in about **2.5 hours**; the priced attack payouts total **$159.6M** (some tokens in the dataset have no price).

**Why current tools fail:** exploits finish in minutes. Fixed-threshold monitors either alert too late, alert too often (teams start ignoring them), or cannot explain *why* something is an attack. Matching deposits to payouts by message ID is fooled when attackers reuse real IDs (Nomad: one message ID was reused **279** times).

## 2. What CSB-01 asks for, and where the prototype does it

| CSB-01 asks for | Where BridgeWitness does it |
|---|---|
| A monitoring dashboard | **Monitor** console: conservation ledger chart, alert list, case file, impact panel, timelines |
| A live or replayed transaction feed from a public bridge dataset | Real Nomad and Ronin data replayed at 60×–3000× speed; a practice feed (Attack Lab); a **live tail of the Across bridge** |
| Flag volume spikes | Volume-spike signal (last 10 minutes vs the 7-day rate) + **Contagion Radar** (copycat clusters, repeat-message bursts, Hawkes spread) |
| Flag unusual signer behaviour | **Signer DNA**: real Ronin validator signers recovered from transaction data with `ecrecover`, scored by an anomaly model |
| Flag mismatched deposit/withdrawal pairs | **Deposit check / conservation rule**: every payout is checked against its deposit (route, token, message, amount, recipient, single use) |
| A risk-scored alert | Risk 0–100, capped at 69 unless the conservation rule breaks |
| The suspected exploit type | ML3 exploit-type classifier with probability, top-3 reasons (TreeSHAP) and the closest past incident |
| A working demo on a simulated attack replay | Seeded practice feed: 9 scenarios (7 attacks + 2 honest controls) injected into real Ronin traffic |

---

## 3. The four unique ideas (USPs)

### USP 1 · Accusation Budget: "We only accuse with proof, and we measure our false-alarm rate"

- Seven signals are each turned into a **rolling conformal p-value**: "how surprising is this payout compared with the latest **25,000** payouts the rule found backed?" Only backed payouts enter the reference window, so an attacker's unbacked payouts can never poison "normal".
- Each p-value becomes an **e-value** (a betting score against "everything is normal") using a mixture of calibrators. The seven e-values are **averaged** (Vovk & Wang), which stays valid however strongly the signals are correlated.
- An **e-CUSUM** detector (Shin, Ramdas & Rinaldo) accumulates evidence over the stream and raises a "suspicious" alarm when it crosses **1,000**. The design target is on average at most one false alarm per 1,000 normal payouts. Because the p-values are ranked against a rolling window, this is a design target, not a proof; **the measured held-out rate is what we report** (0/1,826 Nomad, 0/6,316 Ronin, 2/2,126 practice).
- Two alert levels:
  - **Suspicious** (risk ≤ 69): statistics say it is unusual. Advice only.
  - **Exploit** (risk 70–100): only when the conservation rule breaks, with an evidence bundle anyone can re-check.
- Window choice was measured, not guessed: sweep of 2,000 / 10,000 / 25,000 (table in §9).

### USP 2 · Contagion Radar: "The R₀ of an exploit"

- **Fingerprint** every payout (token, amount on a log scale, batch size, rule outcome, and the message ID weighted ×3), with the recipient address deliberately masked because copycats change only the recipient. Group near-identical payouts with **MinHash-LSH** (64 permutations, Jaccard threshold 0.6, candidates verified before merging, 2-hour window).
- Score bursts of the **same message being paid out again and again** with **MIDAS-R** (count-min sketch, 4 rows × 65,536 buckets, decay 0.5 per minute, repeat-edge score only).
- Fit a **Hawkes self-exciting process** on each cluster of 8+ payouts (last 150 events, refit at most once a minute). Its **branching ratio n̂** is the attack's reproduction number: below 1 it dies out; near or above 1 it is self-sustaining.
- Measured on Nomad: largest copycat cluster **275** payouts, **n̂ = 0.979** (near-critical).

### USP 3 · Signer DNA: "Who actually signed, recovered from the blockchain"

- Each Ronin withdrawal (`withdrawERC20For`, selector `0x993e1c42`) carries validator signatures inside its calldata. The code ABI-decodes the calldata, rebuilds the signed message (`keccak("withdrawERC20", id, user, token, amount)` wrapped in the EIP-191 prefix) and recovers each signer with secp256k1 `ecrecover`.
- Verified: both Ronin attack withdrawals were signed by exactly **5 of the 9 validators**, matching the public post-mortem. The selfcheck asserts this.
- Normal behaviour built from **4,200** real normal Ronin withdrawals (stratified sample, January–March 2022) with recovered signers: **34** distinct signer groups; group sizes 5 to 9 signers.
- **Honest finding:** the attackers' 5-validator group also signed **276 normal withdrawals (6.6%)**, and four validators sign almost every withdrawal. So *who* signed was **not** unusual by itself; that is exactly why Ronin's own checks saw nothing.
- What **was** unusual: the **withdrawal ID**. Normal IDs ran from **1,029,086 to 1,064,238**; the attack used **2,000,000 and 2,000,001**, about 936,000 beyond any ID the sidechain had issued. ML2 scores this ID jump plus value, hour and group likelihood. Its conformal p-values on the two attacks: **0.0616 and 0.0626** (held-out normal median **0.505**).

### USP 4 · Ledger Pairing / Deposit check: "Every coin out must have a coin in"

- Each payout is checked against the deposit history on its route, using the key **(route, token, message ID)**, then amount (exact integer token units, uint256), recipient and **single use**. Event identity is **(transaction hash, position in transaction)**, never the message ID alone, because Nomad copycats reused real IDs.
- Outcomes: `consistent` (backed), `violation` with a reason (`missing_source_deposit`, `amount_mismatch`, `recipient_mismatch`, `message_replayed`), or `unknown` when the history is incomplete or ambiguous. A deposit that appears *after* a payout can never back it retroactively.
- **ML1** learns the normal deposit-to-payout delay for each route (conformal window). A backed payout outside that window is annotated `outside_usual_delay`; timing is **advisory** and never decides a verdict.
- A per-token **conservation ledger** (coins locked minus coins paid out) is drawn live; red payouts have no valid deposit. Clicking a payout opens its case file.
- Measured Nomad reasons: recipient mismatch **334**, missing deposit **45**, amount mismatch **3**.

---

## 4. Other features

| Feature | What it does |
|---|---|
| Exploit-type label | Names the suspected attack (unbacked release, message replay, copycat swarm, key compromise, amount mismatch, recipient mismatch) with a probability and the top 3 reasons |
| Precedent match | "Looks most like": e.g. Nomad 2022 (copycat swarm), Ronin 2022 / Harmony 2022 (key compromise), Qubit / Wormhole 2022 (unbacked release) |
| Risk breakdown | Risk = rule severity base + capped USD exposure + campaign bonus + statistical surprise (shown as parts that add up) |
| Baseline scorecard | The same replay through common methods: whale threshold (> $1M), volume z-score (> 3), message-ID join, next to BridgeWitness |
| What-if (counterfactual) | Money that a route hold at the first alert (0 s, 1 min, 5 min, 15 min) would have kept in the bridge, and how many honest payouts that hold would delay |
| Verify it yourself | Every payout carries an evidence bundle (the payout, the matching deposits, earlier payouts) with a SHA-256 digest. The browser recomputes the digest and re-runs the rule; a "try to cheat it" box changes one unit and the check fails |
| Deposit search facts | For each payout: how many deposits were searched, since when, and how many share the amount, the recipient or the message ID, with block-explorer links (Etherscan, Moonscan, Ronin explorer) |
| Attack Lab | Buttons that jump to each injected scenario in the practice feed; controls must stay quiet |
| Live tail | Real current Across bridge transfers, polled every 15 s, with lifecycle states |
| Lifecycle states | Replays: consistent / violation / unknown / pending. Live: reported filled / pending / overdue / refunded / unknown |
| Keyboard and deep links | Space = play/pause, J/K = previous/next alert; `?feed=` and `?t=<unix seconds>` deep-link to a moment |
| Static fallback | If the API is asleep, the website loads the same replay files bundled with it, so the demo never breaks |

---

## 5. User flow (website pages)

| Page | URL | What the visitor does |
|---|---|---|
| Landing | `/` | WebGL hero, the problem, Ronin vs Nomad, live bento of the four ideas with real metrics, steps from payout to verdict, console preview |
| **Monitor** | `/console/live` | Picks a feed (Nomad hack, Ronin hack, Attack Lab, Live bridge), presses Play. The ledger fills as payouts are checked; "Stop at the next alert" pauses on the first alert and opens its case file. Panels: situation bar, transport (play, speed 60×/300×/1000×/3000×, alert stepping, scrubber), conservation ledger, alert list with level/type filters, impact (what-if, scorecard), detector timelines |
| **Investigate** | `/console/pairing`, `/console/signers`, `/console/contagion`, `/console/budget`, `/console/evidence` | One case file carried through 5 steps, each a plain-language question: 1 Deposit check ("Was a coin locked in for this coin paid out?"), 2 Signers ("Who approved it, and is that normal?"), 3 Spread ("One payout, or a copycat swarm?"), 4 Verdict & false alarms ("How sure are we, and how often are we wrong?"), 5 Verify it yourself ("Can anyone re-check the proof?") |
| 3D map | `/console/map` | Three.js scene: bridge vault between chain planes, ledger chains, packet tunnels, breach alarm, bloom; live money-in / paid-out / no-deposit readout |
| **Results** | `/console/results` | Every measured number: caught vs wrongly accused, comparison with common methods, money that would have stayed in the bridge, the three models, what we do not claim |
| How it works | `/docs/architecture` | The three parts, three models, six algorithms, data and keys, server endpoints |

Old URLs from the first prototype (`monitor`, `lab`, `replay`, `graph`, `witness`, `incidents`, `gauntlet`, `theatre`, `eval`) redirect to the new pages.

**60-second judge path:** Landing → Monitor → Nomad → "Jump to first alert" → alert case file → Verify it yourself.

---

## 6. Detection pipeline: how one payout becomes a verdict

```
payout arrives
  │
  ├─ 1. RULE LAYER (the only layer allowed to say "exploit")
  │     look up deposits with the same (route, token, message ID), finalized, at or before the payout
  │     none            → violation: missing_source_deposit   (or unknown if history incomplete)
  │     more than one   → unknown: ambiguous_source_deposits
  │     amount differs  → violation: amount_mismatch          (exact integer units, uint256)
  │     recipient differs → violation: recipient_mismatch
  │     deposit already paid out → violation: message_replayed
  │     else            → consistent (ML1 window may add "outside_usual_delay", advisory)
  │
  ├─ 2. SEVEN SIGNALS (causal: each uses only events at or before this one)
  │     burst           volume spike: payouts in last 10 min vs 7-day rate
  │     midas           MIDAS-R repeat-edge burst on (message, token)
  │     cluster_log     log size of the MinHash-LSH copycat cluster
  │     hawkes_n        Hawkes branching ratio of that cluster
  │     value_vs_route  USD value vs median daily route volume of the prior 7 days
  │     id_jump_pos     how far the withdrawal ID is beyond any ID seen so far
  │     auth            ML2 signer/ID anomaly score (Ronin-family feeds only)
  │
  ├─ 3. STATISTICS GATE ("suspicious" only)
  │     each signal → rolling conformal p-value (vs latest 25,000 backed payouts, warm-up 200)
  │     → e-values (mixture of calibrators κ·p^(κ−1), κ ∈ {0.05, 0.1, 0.2, 0.5}) → averaged
  │     → e-CUSUM  M_t = max(M_{t−1}, 1) · e_t ; alarm at M_t ≥ 1,000, then reset
  │
  ├─ 4. RISK 0–100  (operator priority, not a probability)
  │     violation: base 70–85 by rule + exposure ≤ 15 (2.5·log10(1+USD)) + campaign 5 (cluster ≥ 5) + surprise ≤ 5 → cap 100
  │     backed:    base 20 if alarm + surprise ≤ 49 → cap 69
  │     surprise = min(1, −log10(p_combined)/3)
  │
  ├─ 5. ML3 EXPLOIT TYPE for every flagged payout (rule-constrained) + TreeSHAP top-3 reasons + precedent
  │
  └─ 6. EVIDENCE BUNDLE (payout, deposits, earlier payouts, coverage) + SHA-256 → browser re-verifies
```

Rule base by reason: message replayed 85, missing deposit 80, recipient mismatch 75, amount mismatch 70.

---

## 7. The three ML models

| | ML1 · Pairing-delay window | ML2 · Signer / authorization anomaly | ML3 · Exploit-type classifier |
|---|---|---|---|
| Method | LightGBM quantile regression (α/2 and 1−α/2) + **conformalized quantile regression (CQR)**, calibrated separately per feed | **Isolation Forest** (200 trees) on 6 features, including a **Dirichlet–multinomial** signer-group likelihood (surprisal) | **LightGBM multiclass** (200 trees, 15 leaves) + **isotonic calibration** per class + exact **TreeSHAP** via LightGBM `pred_contrib` |
| Features | feed, token, log USD, hour, weekday | withdrawal-ID jump (signed log), log USD, hour, number of signers, group surprisal, signers known | unbacked, amount mismatch, recipient mismatch, ID reused, ID jump, cluster size, Hawkes n̂, MIDAS, log USD, value vs route, signed |
| Data | **19,170** real matched deposit→payout pairs dated before each feed's calibration cut (out of 27,312 in the dataset: 4,482 Nomad + 22,830 Ronin) | **4,200** real Ronin withdrawals with signers recovered from chain | Synthetic scenarios (1,500 per class × 8 classes = 12,000 rows) built on **real normal feature rows** |
| Split | Time-ordered 60/20/20 per feed: 11,501 train / 3,834 calibrate / 3,835 test | Time split inside the calibration period: fit on first 2/3, conformal calibration on the rest | Disjoint 60/20/20: 7,200 / 2,400 / 2,400 |
| Measured | Test coverage **98.3%** (target 99%); Nomad 99.6%, Ronin 98.1% | Attack p-values **0.0616, 0.0626** vs normal median **0.505** | Synthetic hold-out accuracy 100% (synthetic only; not a real-world accuracy) |
| Role | Advisory only: annotates a backed payout outside its usual delay | Advisory signal into the statistics gate; Nomad has no signer data, so it abstains there | Names the attack type of an already-flagged payout; cannot raise or lower a verdict |

**Rule constraints on ML3** (hard-coded): a payout that broke conservation can never be typed "benign"; one that did not break it can never be typed as an unbacked/mismatch exploit; "key compromise" is allowed only when real signatures were recovered; "copycat swarm" only when the cluster has 8+ members; an exact amount or recipient mismatch outside a swarm is typed as that mismatch.

The 8 classes: unbacked_release, message_replay, copycat_swarm, key_compromise, amount_mismatch, recipient_mismatch, benign_whale, benign_burst.

**Why no PyTorch or `shap`:** reasons use LightGBM's built-in exact TreeSHAP, and all training happens offline, so the server stays tiny (about 40–45 MB RAM).

## 8. The six algorithms

| | Algorithm | Code | Used for |
|---|---|---|---|
| A1 | **Conservation ledger + rule verdicts** (double-entry invariant: coins out ≤ coins in, per token) | `algos.assess_release`, `algos.pair_and_ledger` | The only path to "exploit" |
| A2 | **Exact one-deposit/one-payout pairing** by (route, token, message ID) with amount, recipient and single-use checks; ML1 delay window as advisory | `algos.pair_and_ledger` | Mismatched pairs (USP 4) |
| A3 | **MinHash-LSH** copycat clustering with verified merges and union-find | `algos.CopycatClusters` | Copycat clusters (USP 2) |
| A4 | **MIDAS-R** count-min-sketch edge-burst score (+ separate 10-min vs 7-day volume spike) | `algos.MidasR`, `pipeline.stream_signals` | Repeat-message bursts, volume spikes (USP 2) |
| A5 | **Hawkes process MLE** (exponential kernel, timescale bounded 1 s to 1 h, Nelder–Mead from 3 starts) | `algos.hawkes_branching` | Attack spread n̂ (USP 2) |
| A6 | **Rolling conformal p-values → averaged e-values → e-CUSUM** | `algos.RollingConformal`, `p_to_e`, `e_mean`, `ECusum` | Accusation Budget (USP 1) |

Note: earlier planning documents (NEW.md, the pitch book builder) describe A2 as "Hungarian matching". The built code uses exact keyed pairing with single-use enforcement, which needs no assignment solver; describe it that way.

---

## 9. Measured results (from `metrics.json`, asserted by `selfcheck` 16/16)

### Per incident

| | Nomad (1–2 Aug 2022) | Ronin (23 Mar 2022) | Practice feed (simulated, seed 2410) |
|---|---|---|---|
| Payouts in the dataset (withdrawals) | 4,864 | 22,832 | 18,691 |
| Attack payouts | 382 | 2 | 38 |
| Attack payouts labelled **exploit** | **382 / 382** | **2 / 2** | **38 / 38** |
| Honest payouts ever labelled exploit | **0** | **0** | **0** (controls clean) |
| Held-out normal payouts (never used for calibration) | 1,826 over 31.9 days | 6,316 over 28.6 days | 2,126 over 9.5 days |
| Statistical false alarms on held-out normal | **0** | **0** | **2** (0.094%) |
| Statistics alone (rule switched off) on the attack | 187 / 382, from the first attack payout | 1 / 2 (the second, 115 s after the first) | 16 / 38 (first after 1,500 s) |
| Rule reasons on the attack | recipient mismatch 334 · missing deposit 45 · amount mismatch 3 | missing deposit 2 | missing deposit 35 · replay 1 · amount 1 · recipient 1 |
| Exploit type on attack payouts | copycat swarm 317 · recipient mismatch 28 · message replay 22 · unbacked 10 · amount mismatch 5 | key compromise 2 | copycat swarm 18 · unbacked 11 · replay 6 · key compromise 1 · amount 1 · recipient 1 |
| Largest copycat cluster / max Hawkes n̂ | 275 / 0.979 | 1 / 0 | 25 / 3.0 |
| Attack value in the replay (dataset USD) | $159.6M (priced tokens) | $565.4M | $40.8M |

### Baseline scorecard (same data, same held-out period)

| Method | Nomad: caught / false alerts | Ronin: caught / false alerts | Practice: caught / false alerts |
|---|---|---|---|
| B1 whale threshold > $1M | 43/382 · 11 (0.35/day) | 2/2 · 21 (0.73/day) | 1/38 · 7 |
| B2 volume z-score > 3 | 321/382 · 52 (1.63/day) | 1/2 · 50 (1.75/day) | 2/38 · 21 |
| B3 message-ID join | 41/382 · 0 | 2/2 · 0 | 35/38 · 0 |
| **BridgeWitness (exploit level)** | **382/382 · 0** | **2/2 · 0** | **38/38 · 0** |
| BridgeWitness (any alert) | 382/382 · 0 | 2/2 · 0 | 38/38 · 2 |

### What-if: holding the route at the first exploit alert (dataset USD)

| Hold latency | Nomad kept in bridge | Ronin kept | Practice kept |
|---|---|---|---|
| 0 s (pre-execution gate, before the first flagged payout executes) | $159.6M (100%) | $565.4M (100%) | $40.8M (100%) |
| 1 minute | $143.5M (89.9%) | $25.5M (4.5%) | 100% |
| 5 minutes | $143.5M (89.9%) | $0 (0%) | 100% |
| 15 minutes | $143.0M (89.6%) | $0 (0%) | 100% |
| Honest payouts delayed by the hold (0 s lane) | 13 | 4 | 38 |

Ronin's two withdrawals were 115 s apart, so only a pre-execution gate (or a hold within about a minute) keeps that money. Nomad's swarm lasted hours, so even a 15-minute hold keeps about 90%. Assumptions: attackers behave identically otherwise; dataset USD values.

### Practice-feed scenarios (Attack Lab)

| Scenario | Truth | Result |
|---|---|---|
| Fake deposit | attack | 1/1 exploit (unbacked release) |
| Replay of a used message | attack | 1/1 exploit (message replay) |
| Key compromise (validly signed by the real Ronin attack group, ID jump +900,000, $38M) | attack | 1/1 exploit (key compromise) |
| Copycat swarm (25 self-exciting payouts) | attack | 25/25 exploit (18 copycat swarm, 5 replay, 2 unbacked: the first ones look like replays until the cluster forms) |
| Amount mismatch (+1 unit) | attack | 1/1 exploit |
| Recipient mismatch | attack | 1/1 exploit |
| Slow drain (8 small unbacked payouts, 25 min apart, no volume spike) | attack | 8/8 exploit (unbacked) |
| Whale ($3M, fully backed) | control | no alert |
| Honest burst (12 backed payouts) | control | no alert |

### Rolling-conformal window sweep (statistics only: attacks alarmed / held-out false alarms)

| Window K | Nomad | Ronin | Practice* |
|---|---|---|---|
| 2,000 | 183/382 · 0/1,826 | 0/2 · 4/6,316 | 12/30 · 3/2,126 |
| 10,000 | 187/382 · 0/1,826 | 1/2 · 5/6,316 | 12/30 · 4/2,126 |
| **25,000 (chosen)** | **187/382 · 0/1,826** | **1/2 · 0/6,316** | 13/30 · 2/2,126 |

*The sweep was run before the 8-payout slow drain was added (30 practice attacks then, 38 now).

### Rejected ideas (tested and worse on held-out data)

- A learned Poisson volume baseline (replaced by the simple 10-min vs 7-day ratio).
- A recipient-novelty signal (it duplicates the rule).
- LORD++ / e-LOND online FDR control (the error budget decays to nothing on long streams).
- Cauchy p-value combination (one uninformative signal with p near 1 cancels strong evidence).

---

## 10. System architecture

```
┌──────────────────────────── OFFLINE BUILD (laptop, about 1 minute) ────────────────────────────┐
│  data/raw/*.csv  (XChainWatcher, pinned, MIT)          public Ethereum RPC (eth.drpc.org)         │
│        │                                                       │                                 │
│  ingest.py  → one time-ordered event table          signers.py → ecrecover real Ronin signers    │
│               (deposits + payouts, identity =                   → data/signers.parquet           │
│                tx hash + ordinal)                                 (about 12 min, one time)        │
│        └───────────────────────┬───────────────────────────────┘                                 │
│  pipeline.py: train ML1 → run 3 feeds through A1–A6 + ML2 → train ML3 → rerun with typer         │
│               → baselines, what-if, signer facts                                                  │
│        ▼                                                                                          │
│  artifacts/replay_{nomad,ronin,simulated}.json · metrics.json (strict JSON, no NaN) · models.pkl │
│  selfcheck.py (16 golden checks) · test_regressions.py (30 tests) · algos self-test              │
└──────────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                           │ committed JSON artifacts (models are NOT shipped)
┌──────────────────────────────────────────▼───── RENDER: bridgewitness-api (Docker, free) ───────┐
│  api.py (FastAPI + Uvicorn, 1 worker) loads the JSON once at start                               │
│   GET /health · /feeds · /replay/{feed} · /metrics · /stream/{feed} (SSE) · /live                │
│  live_tail.py → Across public API (app.across.to/api/deposits, /swap/tokens), cached 15 s        │
│  CORS: only https://bridgewitness-web.onrender.com, GET only                                     │
└──────────────────────────────────────────┬──────────────────────────────────────────────────────┘
                                           │ HTTPS (JSON; SSE stream available)
┌──────────────────────────────────────────▼───── RENDER: bridgewitness-web (static, free) ───────┐
│  React 18 + Vite + TypeScript SPA                                                                 │
│  fetch API first (6 s timeout) → fall back to bundled /data/*.json if the API is asleep          │
│  replay clock in event time (requestAnimationFrame, ~12 renders/s) → ledger, alerts, case file   │
│  in-browser evidence check: canonical JSON → SHA-256 (WebCrypto) → re-run the rule with BigInt   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
          ▲
GitHub Actions "keep-awake": curl /health every 10 minutes so the free API does not sleep
```

**Design choice:** all heavy work (training, joins, sketches, Hawkes fits) happens **offline**. The server only streams precomputed replays and polls one public API. That is why it fits easily in Render's free 512 MB (measured about 40–45 MB RAM; image 263 MB on disk, about 61 MB compressed).

### API endpoints

| Endpoint | Returns |
|---|---|
| `GET /health` | `{ok, feeds, generated_at}` |
| `GET /feeds` | each feed's label, time window, route, event count, metrics |
| `GET /replay/{feed}` | full replay (`nomad`, `ronin`, `simulated`): events, per-minute ticks, metrics |
| `GET /metrics` | all measured numbers (`metrics.json`) |
| `GET /stream/{feed}?speed=1..5000&start=<unix>` | Server-Sent Events on the replay clock: one `event` per bridge event, one `tick` per replay minute, heartbeats, `end` |
| `GET /live` | latest Across transfers with lifecycle verdicts and counts; cached 15 s; reports errors and stale data honestly |

### Replay artifact shape (per payout)

`id, ts, kind, tx, symbol, amount (string, raw units), decimals, usd, msg_id, recipient, truth, scenario, status, rule, matched, delay, window, signals {midas, cluster, cluster_size, hawkes_n, id_reused, id_jump, id_jump_pos, auth, signers}, p {7 signals}, p_comb, e_comb, ecusum, alarm, risk, risk_breakdown {base, exposure, campaign, behavior, total}, level (exploit | suspicious | none), type, type_text, type_prob, precedent, reasons [{feature, value, push}], deposit, search {deposits_checked, since, same_amount_and_recipient, …}, evidence {bundle, sha256}`

Replay sizes: Nomad 418 events in the window (410 payouts, 420 one-minute ticks, 1.3 MB); Ronin 86 events (48 payouts, 300 ticks, 183 KB); practice 139 events (91 payouts, 240 ticks, 282 KB).

### Live tail (Across)

- Polls the latest 40 deposits and the token list (token list cached 1 hour).
- Verdicts: `reported_filled`, `pending`, `overdue` (past its fill deadline), `refunded`, `unknown` (missing references or timestamps).
- **Honest scope:** this is a lifecycle viewer of what the Across API reports. Chain finality and backing are not independently verified, prices are display-only and can never prove an exploit, and the ML models abstain ("no calibration history for this route").

---

## 11. Data and keys

| Data | Source | Key needed |
|---|---|---|
| Nomad and Ronin transfers (normal pairs + attack payouts), labelled | XChainWatcher public dataset (Augusto et al.), pinned CSVs with manifest, MIT licence | No |
| Ronin validator signatures | Public Ethereum transactions via `https://eth.drpc.org` (keyless; at most 3 calls per JSON-RPC batch) | No |
| Live bridge traffic | Across public API `app.across.to/api` | No |
| Optional faster chain reads | Etherscan free tier | Optional, not used |

Time splits: Nomad calibration up to 1 Jul 2022, replay window 1 Aug 18:00 → 2 Aug 01:00 UTC; Ronin calibration up to 1 Mar 2022, replay window 23 Mar 09:00 → 14:00 UTC; practice feed = real Ronin traffic up to 10 Mar 2022 with injected scenarios, window 10 Mar 08:00 → 12:00 UTC. First Nomad exploit payout: **2022-08-01 21:32:31 UTC** (asserted by selfcheck).

---

## 12. Tech stack

| Layer | Technology | Version / note |
|---|---|---|
| Backend language | Python | 3.10 |
| API | FastAPI + Uvicorn | 0.111.1 / 0.30.1, one worker |
| HTTP client | requests | 2.32.3 |
| Data | pandas, NumPy, PyArrow | 2.2.2, 2.2.6 |
| Maths | SciPy | 1.15.3 (Nelder–Mead for the Hawkes MLE, `expit`) |
| ML | LightGBM | 4.3.0 (quantile, multiclass, `pred_contrib` TreeSHAP) |
| ML | scikit-learn | 1.5.0 (Isolation Forest, isotonic regression) |
| Similarity | datasketch | MinHash, MinHashLSH |
| Crypto | eth-keys, eth-utils | 0.8.0 (secp256k1 recovery, keccak) |
| Runtime image | python:3.10-slim + FastAPI, Uvicorn, requests only | ML libraries are build-time only |
| Frontend | React 18.3.1, React Router 6.28, TypeScript 5.6, Vite 5.4 | SPA, lazy-loaded pages |
| 3D | Three.js 0.170 via React Three Fiber 8, drei, postprocessing (bloom, chromatic aberration) | Landing hero and `/console/map` |
| Charts | uPlot 1.6.31 | detector timelines |
| Motion and icons | framer-motion 11, Phosphor icons | |
| Fonts | Geist and Geist Mono (self-hosted via @fontsource) | |
| Design system | "Oxide Vault" (dark, colour-meaningful: teal = backed, red = breaks the rule, amber = suspicious) | |
| Hosting | Render Blueprint (`render.yaml`): Docker web service + static site, auto-deploy on push to `main` | free plan |
| Keep-awake | GitHub Actions cron `*/10 * * * *` → `curl /health` | free |

Also installed but no longer rendered: Sigma.js + Graphology + ForceAtlas2 (an earlier network-graph view, `web/src/live/LiveGraph.tsx`, is not imported by any page).

## 13. Code map

```
D:\fusionhack
  Dockerfile, .dockerignore, render.yaml, .github/workflows/keep-awake.yml
  bridgewitness/
    ingest.py           CSVs → event table                                    (71 lines)
    signers.py          calldata decode + ecrecover of Ronin signers          (118)
    algos.py            A1–A6 + self-test                                     (310)
    ml.py               ML1, ML2, ML3 + synthetic training scenarios          (254)
    pipeline.py         offline build, practice feed, baselines, what-if      (508)
    selfcheck.py        16 golden checks                                      (56)
    test_regressions.py 30 behaviour tests (rule edge cases, leakage, live tail, evidence digest) (197)
    api.py              FastAPI server                                        (96)
    live_tail.py        Across lifecycle viewer                               (90)
    artifacts/          replay_*.json, metrics.json (committed), models.pkl
    data/raw/           pinned dataset CSVs + manifest + licence; data/signers.parquet
  web/src/
    pages/site/Landing.tsx · pages/console/{Live,Usps,Evidence,Results,Map}.tsx · pages/docs/Architecture.tsx
    live/  data.ts (types, hooks, plain-language labels) · Ledger · Scrubber · Timelines · AlertCard · CaseFile · CaseBar · Map3D · verifyEvidence.ts
    app/   routes, layouts, CSS
  web/public/data/      static copy of the artifacts (fallback)
  scripts/              screenshots, conformal window sweep, scroll performance, browser check
```

Examples of what the 30 regression tests guard: an unrelated message or another route cannot borrow backing; a one-wei change breaks the match; a deposit after the payout cannot back it; missing coverage or unfinalized data abstains as `unknown`; ML cannot raise an `unknown` to exploit; invalid p-values cannot manufacture evidence; streaming features do not see the future; prices cannot prove an exploit; the evidence digest and rule recompute match.

---

## 14. Honesty rules (any generated slide must follow these)

1. Never say "100% accurate", "AI-powered", "guaranteed" or "funds saved". Say "labelled X of Y attack payouts as exploit" and "would have kept in the bridge, computed from the data".
2. Report results **per incident** (Nomad, Ronin, practice), never as one global accuracy or F1: there are only two real incidents.
3. Dataset labels come from XChainWatcher's rules, and our rule layer checks a similar invariant, so the rule-layer catch rate is partly circular. Say so if asked about validation.
4. The practice feed is **simulated** (scripted attacks injected into real Ronin traffic). Always label it simulated.
5. ML3's 100% accuracy is on **synthetic** data only. Never present it as real-world accuracy.
6. The e-CUSUM "one false alarm per 1,000" is a **design target**; with rolling ranks it is not a proven guarantee. Show the **measured** held-out rates next to it.
7. Ronin: $624M is the public estimate; the dataset value is $565.4M. Label both. Nomad: ~$190M public estimate; $159.6M of priced attack payouts in the dataset.
8. Signer DNA: the attack's signer group was **common** (6.6% of normal withdrawals). Never claim the signers were unusual; the signal was the withdrawal-ID jump.
9. The live Across tail shows reported lifecycle states only; it does not verify backing on chain, and the models abstain there.
10. Statistics and ML can only say "suspicious"; only the broken conservation rule says "exploit".
11. No customers, users, pilots, partners or revenue exist. Do not invent any. Use "who would pay" language only (§16).
12. Pairing is exact keyed pairing with single-use enforcement, not Hungarian matching.

---

## 15. Why it stands out (comparison)

| | Typical hackathon project | Research tools (XChainWatcher, BridgeShield) | Industry bots (Forta) | **BridgeWitness** |
|---|---|---|---|---|
| Real time | Simulated | Offline | Yes, one chain per bot | Event-time replay of both chains + live tail |
| Mismatched pairs | ID join | Rules / graph model | No | Keyed pairing with amount, recipient and single-use checks, learned delay windows, per-payout drill-down |
| Signer behaviour | Simulated | No | No | Real signers recovered from chain, reported honestly |
| Volume spikes | z-score | No | z-score | Spread measurement (Hawkes n̂, copycat clusters, repeat bursts) |
| False-alarm control | None | None | None | e-value gate with measured held-out false-alarm rate |
| Exploit type | LLM guess | Coarse | No | Calibrated, rule-constrained type + TreeSHAP reasons + precedent |
| Evidence | None | Paper | None | Re-verifiable in the browser (SHA-256 + rule recompute) |

Comparison rows describe what we found when surveying those tools; they are not measured benchmarks of them.

## 16. Impact, feasibility and viability

**Who benefits:** bridge operators (early warning with a reason and a recommended action: hold the route); investigators such as Chainalysis (culprit transactions, signer evidence and type in one place from minute one); exchanges and custodians (know which incoming bridged funds are unbacked); ordinary users (fewer drained bridges and fewer false pauses).

**Feasibility:** built in a hackathon window; the whole offline build runs in about a minute on a laptop; signer recovery is a one-time ~12-minute fetch; everything runs on free tiers with no required keys.

**Viability:** each signal is constant-time per event (sketches, hashing, incremental ledger), so one small server per bridge is enough. A new bridge needs only an adapter that reads its deposit and payout events. Possible payers: bridge operators (protection and insurance requirements), exchanges and custodians (deposit screening), investigation firms (faster incident response).

**Limits and next steps:** only two real incidents to test on; live tail verifies lifecycle, not backing; ML2 needs signer data (Ronin only today). Next: Harmony / Orbit multisig signer recovery, a second live source (Wormhole or LayerZero), on-chain verification of live fills.

## 17. Research it builds on

- Liu et al., *Count of Monte Crypto: Accounting-based Defenses for Cross-Chain Bridges* (arXiv 2410.01107): conservation invariant
- Augusto et al., *XChainWatcher* (arXiv 2410.02029): cross-chain rules and the labelled dataset
- Lee et al., *SoK: Not Quite Water Under the Bridge* (arXiv 2210.16209); Notland et al., *SoK: Cross-Chain Bridging Design Flaws* (arXiv 2403.00405): attack taxonomy
- Romano, Patterson & Candès, *Conformalized Quantile Regression* (NeurIPS 2019): ML1
- Bates et al., *Testing for outliers with conformal p-values* (Annals of Statistics 2023): conformal p-values
- Vovk & Wang, *E-values: calibration, combination and applications* (Annals of Statistics 2021): e-value averaging
- Shin, Ramdas & Rinaldo, *E-detectors* (arXiv 2203.03532): e-CUSUM
- Bhatia et al., *MIDAS* (AAAI 2020): streaming burst detection
- Hawkes (1971): self-exciting point processes; Broder (1997): MinHash
- Qin et al., *The Blockchain Imitation Game* (USENIX Security 2023): copycat attacks are real and automatic
- Lundberg et al., TreeSHAP (Nature Machine Intelligence 2020)
- Compared against: BridgeShield (arXiv 2508.20517), BridgeGuard (WWW 2025), Forta bridge kit, XChainDataGen (arXiv 2503.13637)

## 18. Glossary

| Term | Meaning |
|---|---|
| Bridge | Moves value between blockchains by locking on one and paying out on the other |
| Deposit / payout | Locking coins on the source chain / releasing them on the destination chain |
| Conservation | Coins paid out must never exceed coins locked |
| Validator / signer / quorum | Key holders whose signatures approve a withdrawal; the quorum is the group that signed |
| ecrecover | Recovers the signer's address from a signature |
| p-value | How surprising something is if everything were normal (small = surprising) |
| e-value | A betting score against "normal"; large = evidence of a problem |
| Conformal | Turns any score into a calibrated p-value or interval using held-out normal data |
| e-CUSUM | A sequential detector that accumulates e-values and alarms past a threshold |
| Hawkes branching ratio n̂ | Average number of new events each event triggers; near or above 1 = spreading |
| MinHash-LSH | Fast near-duplicate search |
| MIDAS-R | Streaming burst detector on graph edges using count-min sketches |
| TreeSHAP | Exact per-feature contributions for tree models (the "reasons") |
| SSE | Server-Sent Events: the server pushes updates to the browser |

## 19. Suggested deck outline (12 slides)

1. Title: BridgeWitness, "Signatures can be stolen. Conservation can't."
2. The problem: $2B stolen from bridges in 2022; Ronin (115 s, stolen keys) and Nomad (copycat swarm)
3. Why current tools fail: thresholds, alert fatigue, ID joins fooled by reused IDs
4. Our solution: watch both sides; every payout must have a deposit; statistics advise, the rule accuses
5. USP 1 Accusation Budget (e-values, e-CUSUM, measured false alarms)
6. USP 2 Contagion Radar (MinHash, MIDAS-R, Hawkes n̂ = 0.979 on Nomad)
7. USP 3 Signer DNA (real ecrecover; honest finding: the signal was the ID jump, not the signers)
8. USP 4 Deposit check / ledger (exact pairing, single use, ML1 windows, verify in the browser)
9. Architecture (offline build → tiny API → static site; $0, about 45 MB RAM)
10. Results: 382/382, 2/2, 38/38, 0 honest payouts accused; baseline scorecard
11. Impact: what-if table (100% kept with a pre-execution gate; Nomad 89.9% at 1 min)
12. Live demo + what we do not claim + next steps
