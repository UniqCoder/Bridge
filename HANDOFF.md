# BridgeWitness v3: handoff

Read this first. Then `NEW.md` (the locked product spec, with a PDF beside it in `docs/`). Everything older (PRD v2.2, PROGRESS.md, BridgeWitness-ML-Reliability.md, `pitch/`, `docs/BridgeWitness-Hackathon-Brief.*`) describes the **first prototype** and is stale: do not copy numbers or claims from it.

| | |
|---|---|
| Problem statement | CSB-01 · Real-time detection of cross-chain bridge exploits (Chainalysis): dashboard over a live or replayed feed; flag volume spikes, unusual signer behaviour, mismatched deposit/withdrawal pairs; risk-scored alert with suspected exploit type |
| Repo | https://github.com/UniqCoder/Bridge (private), branch `main`, git root `D:\fusionhack`, local identity `UniqCoder` |
| Brand line | "Signatures can be stolen. Conservation can't." |
| Status (10 Oct 2026) | **Deployed on Render** (free plan, one Blueprint): website https://bridgewitness-web.onrender.com · API https://bridgewitness-api.onrender.com (`/health`). Verified live: pages and deep links, "live server" tag, Across live feed, CORS locked to the site. See §6 |

## 1. What exists

```
D:\fusionhack
  NEW.md, docs/BridgeWitness-NEW.pdf     locked spec (+ docs/build_new_pdf.py to rebuild the PDF)
  Dockerfile, .dockerignore, render.yaml  API image (python:3.10-slim, uvicorn, 1 worker)
  scripts/shots.ps1                       headless full-page screenshots of every page (visual checks)
  bridgewitness/                          Python backend
    ingest.py        Nomad + Ronin CSVs -> one event table (identity = tx hash + ordinal, NOT message id)
    signers.py       recovers REAL Ronin validator signers from calldata (ecrecover); data/signers.parquet
    algos.py         the 6 algorithms (see §2)
    ml.py            the 3 ML models (see §2)
    pipeline.py      offline build: trains, replays 3 feeds, writes artifacts/*.json
    selfcheck.py     15 golden checks (must stay green)
    api.py           FastAPI: /health /feeds /replay/{feed} /stream/{feed} (SSE) /metrics /live
    live_tail.py     live Across bridge feed through the deposit rule (models abstain there)
    artifacts/       replay_{nomad,ronin,simulated}.json, metrics.json (committed), models.pkl
    data/raw/        pinned XChainWatcher CSVs (MIT, see web/public/THIRD_PARTY_NOTICES.txt)
    requirements-api.txt (runtime, 3 pins) · requirements-build.txt (training)
  web/                                    React 18 + Vite + TS
    src/pages/site/Landing.tsx            plain-language landing (numbers come from metrics.json)
    src/pages/console/{Live,Usps,Evidence,Results}.tsx
    src/pages/docs/Architecture.tsx       "How it works"
    src/live/                             data.ts (types, hooks, labels), LiveGraph (Sigma.js), Timelines (uPlot), AlertCard, *.css
    src/app/                              routes, layouts, landing.css, console.css, site.css (old rules still there, mostly unused)
    public/data/                          copy of the artifacts (static fallback when the API is asleep)
    vercel.json                           SPA rewrites
```

Old pages (Monitor, Gauntlet, Incidents, Theatre, Replay, Graph, Witness, Lab, Eval, evidence bundles, 3D scenes, fixtures, browser verifier) were **deleted**. Their URLs redirect to `/console/live`, `/console/usps` or `/console/results`.

## 2. How the detection works (what the numbers mean)

**Rule layer (the only thing allowed to say "exploit")**: Hungarian matching pairs each payout with one deposit by token, amount and recipient, using the ML1 delay window; a payout with no deposit is `missing_source_deposit`. Deposits stay open until claimed (real users claim up to 159 days later; a 7-day expiry once caused 1,597 false violations).

**Statistics layer (can only say "suspicious")**: seven signals -> rolling conformal p-values (latest 2,000 *backed* payouts only, causal) -> e-values averaged (Vovk & Wang, valid under any dependence) -> e-CUSUM alarm (Shin, Ramdas & Rinaldo; threshold 1,000 = on average at most one false alarm per 1,000 normal payouts). Risk is capped at 69 unless the rule breaks.

| Algorithm | File | Used for |
|---|---|---|
| A1/A2 conservation ledger + Hungarian pairing | `algos.pair_and_ledger` | mismatched pairs (USP 4) |
| A3 MinHash-LSH (verified merges, 2 h window) | `CopycatClusters` | copy-paste clusters (USP 2) |
| A4 MIDAS-R, repeat-edge score only, 65,536-wide sketch | `MidasR` | same message repeating (USP 2) |
| A5 Hawkes branching ratio (kernel timescale bounded 1 s to 1 h) | `hawkes_branching` | attack spread n̂ (USP 2) |
| A6 rolling conformal -> e-mean -> e-CUSUM | `RollingConformal`, `e_mean`, `ECusum` | Accusation Budget (USP 1) |
| 10-min volume spike vs 7-day rate | `pipeline.stream_signals` | volume spikes |

| Model | Where | Data |
|---|---|---|
| ML1 delay window: LightGBM quantile + conformalized quantile regression | `ml.DelayCQR` | 27,312 real matched pairs; 98.8% test coverage (target 99%) |
| ML2 signer/ID anomaly: Isolation Forest + signer-group likelihood | `ml.AuthModel` | 4,200 real Ronin withdrawals with recovered signers; Ronin feeds only, Nomad abstains |
| ML3 attack type: LightGBM multiclass + isotonic + exact TreeSHAP (`pred_contrib`, no shap library) | `ml.ExploitTyper` | synthetic scenarios over real normal rows; rule-constrained (no benign label after a violation; "key compromise" only with recovered signatures) |

**Measured (from `artifacts/metrics.json`, asserted by selfcheck 16/16, 10 Oct 2026)**: Nomad 382/382 attack payouts labelled exploit, 0 normal; Ronin 2/2, 0 normal; practice attacks 38/38 (incl. an 8-payout slow drain), controls clean. Held-out statistical false alarms: 0/1,826 (Nomad), 0/6,316 (Ronin), 2/2,126 (practice). Statistics alone (rule off): Nomad 187/382 from the first payout, Ronin 1/2 (the second, 115 s in), practice 16/38. Baselines on Nomad: whale threshold 43/382 (11 false alerts), volume z-score 321/382 (52 false alerts), message-id join 41/382. Counterfactual: holding before the first payout keeps $159.6M (100%); 1 minute after the first alert keeps 89.9%. Rolling-conformal window is 25,000 backed payouts (sweep of 2k/10k/25k kept in metrics; `scripts/conformal_window_sweep.py`). Tested and rejected (worse on held-out data): learned Poisson volume baseline; recipient-novelty signal (duplicates the rule).

**Honest findings that must stay in every claim**:
- Ronin attack signers were an ordinary group (6.6% of normal withdrawals): *who* signed is NOT the signal. The signal is the withdrawal ID (2,000,000 vs max normal 1,064,238).
- ML3 accuracy is only on synthetic rows; real incidents are reported per incident, never as a global F1.
- Labels come from XChainWatcher's rules (circular for the rule layer). $624M is the public Ronin estimate; the dataset total is $565.4M.
- The live Across tail runs only the deposit rule (value out <= value in + 1% + $1); the models abstain there.

## 3. Commands

```powershell
# one-time
pip install -r bridgewitness\requirements-build.txt          # training deps (most already installed)
cd web; npm install

# rebuild every artifact (about 1 minute), then check
$env:PYTHONUTF8=1; python -W ignore -m bridgewitness.pipeline
python -m bridgewitness.selfcheck                             # must print 15/15
cd web; npm run data                                          # copy artifacts to web/public/data
npx tsc --noEmit; npm run build

# run locally
python -m uvicorn bridgewitness.api:app --port 8077           # or the Docker container below
cd web; npm run dev -- --port 5180                            # launch config "web-v3"; 5173 is used by another session
powershell -File scripts\shots.ps1 <outdir>                   # screenshots of every page
```

Selfcheck note: if a count in this file disagrees with the script output, trust the script.

**Docker (local)**: container `bridgewitness-api` on host port **8790** (port 8000 belongs to the user's argus project; do not touch other containers). Artifacts are bind-mounted from `D:\fusionhack\bridgewitness\artifacts`, so after a pipeline rebuild just `docker restart bridgewitness-api`. Image `bridgewitness-api:3.0` (263 MB, about 40 MB RAM at runtime, run with `--memory 512m`). Rebuild the image after changing `api.py`/`live_tail.py`.

`web/.env.local` (git-ignored) sets `VITE_BW_API=http://localhost:8790`. Without it the site uses `public/data/*.json`.

## 4. Where the user stands

Done and verified by the user's request list: new ML + algorithms, real signer recovery, live graph console, USP demos on real data, evidence page without bundles, results page, plain-language wording, landing, docs page, Docker image, Render/Vercel config, `NEW.md` + PDF.

Rules the user set: **no AI subagents** (they burn the user's credits; saved in memory); `NEW.md` is locked (only small corrections and measured numbers); keep claims honest; hosting is Render free (512 MB), API + static site.

## 5. Next steps (in priority order)

1. Deployed (§6). Before a demo, wake the API with `/health`.
2. Check the layouts at phone width by eye (375 px) on Live, Ideas, Check and Results; desktop (1440) was reviewed from screenshots.
3. Landing page: add a one-screen "try it now" strip with the live graph (currently text and numbers only).
4. Trim dead CSS in `app/console.css` and `app/site.css` (rules for the deleted pages); several generic class names there collide with new ones (`.bars`, `.kv`, `.readouts`, `.big`), which is why the new pages use `sigbars`, `facts`, `reads`, `bignum`.
5. Optional depth if time remains: Harmony/Orbit multisig signer recovery (needs a free Etherscan key; keyless RPC refuses historic `eth_getLogs`), a Wormhole or LayerZero live tail as a second source.
6. Update the pitch deck in `pitch/` from `NEW.md` (the existing deck is the old product).

## 6. Deploying (done, 10 Oct 2026)

| | URL | Render service |
|---|---|---|
| Website | https://bridgewitness-web.onrender.com | `bridgewitness-web`, static site built from `web/` (`npm ci && npm run build`, publishes `dist`, SPA rewrite) |
| API | https://bridgewitness-api.onrender.com | `bridgewitness-api`, Docker (`Dockerfile`), free plan, health check `/health` |
| Blueprint | `bridge` (exs-db4l60nlot8c73bfbq00), repo `UniqCoder/Bridge`, branch `main` | `render.yaml` |

- Both services redeploy on every push to `main`; the Blueprint syncs env vars from `render.yaml`.
- `VITE_BW_API=https://bridgewitness-api.onrender.com` (site) and `BW_ALLOWED_ORIGIN=https://bridgewitness-web.onrender.com` (API) are set as plain values. **Do not use `fromService ... property: host`**: Render returns the internal host name (`bridgewitness-api`), which browsers cannot reach, so the site silently fell back to its bundled files and the live feed failed.
- Image: 263 MB on disk (about 61 MB compressed), about 45 MB RAM of the 512 MB free limit. Models are not in the image; it serves the prebuilt JSON artifacts.
- Free plan sleeps after about 15 min idle; the first request then takes about 50 s. Before a demo, open `/health` once. Meanwhile the site uses `web/public/data/*.json`.
- Vercel is no longer needed (`web/vercel.json` is kept only as an alternative).

## 7. Pitfalls already found

1. **Nomad message ids are reused by attackers** (14 distinct ids across 382 payouts; `4922` x279). Event identity is `(tx_hash, ordinal)`, and matching never relies on the id alone.
2. **Keyless RPC `eth.drpc.org` accepts at most 3 calls per JSON-RPC batch**; bigger batches return 500 after a 30 s timeout. `signers.py` uses 3.
3. **Never let NaN reach the e-CUSUM** (`max(NaN, 1)` is NaN and silently disables the detector). `ECusum.update` treats missing evidence as neutral; there is a self-test.
4. **Do not use LORD++/e-LOND for a long stream** (error budget decays to nothing) and **do not use the Cauchy combination with p near 1** (one uninformative signal cancels strong evidence). The code uses e-value averaging and e-CUSUM; selfcheck guards the false-alarm rate.
5. **A first-seen MIDAS edge scores about t** (grows with stream age) and node scores track traffic level: only repeat-edge bursts are used.
6. **MinHash-LSH candidates must be verified** (estimated Jaccard >= threshold) or unrelated releases chain into one giant cluster.
7. **JSON must be strict**: artifacts are written with `allow_nan=False` after `_clean()` (unpriced Nomad tokens become `null`; the UI shows "unpriced").
8. **Sigma graph needs `multi: true`**: one recipient can get several payouts of the same token.
9. **Tooling on this machine**:
   - Bash heredocs containing apostrophes or backticks break (and may half-execute): write patch scripts with the Write tool and run them (`PYTHONUTF8=1 python script.py`).
   - A shell command containing the Python word `del` inside a PowerShell string can trip the "protected path removal" filter; use script files.
   - Python defaults to cp1252: set `PYTHONUTF8=1` or open files with `encoding="utf-8"`.
   - PowerShell turns git's stderr (progress) into red errors; check `git status -sb` instead of trusting the exit text.
   - Another session holds port 5173 and the in-app browser pane is small/hidden: verify with `scripts/shots.ps1` (headless Edge, own user-data-dir) rather than browser-pane screenshots.
   - The Write tool refuses to overwrite a file edited since it was read: re-read first.
10. The pipeline reads `bridgewitness/data/signers.parquet`; if missing, `python -m bridgewitness.signers` rebuilds it (about 12 minutes, polite rate limit, checkpoints as it goes).

## 7b. UI v4 notes (10 Oct 2026)

- Landing (`pages/site/Landing.tsx`, `app/landing.css`): full-bleed WebGL hero (`Map3D` with `bare`, lazy-loaded), floating nav island with mobile menu, proof tickers, Ronin vs Nomad, live bento of the four ideas (real metrics), scroll-drawn steps, console screenshot (`public/img/console.webp`).
- `live/Map3D.tsx`: block vault, ledger chains, packet tunnels, breach alarm, bloom + chromatic aberration; `bare` hides labels/HUD for the hero.
- Icons: `@phosphor-icons/react` (light weight). Fonts: Geist + Geist Mono (self-hosted via @fontsource).
- Design skills from Leonxlnx/taste-skill live in `.claude/skills` (design-taste-frontend, redesign-existing-projects, high-end-visual-design).
- Screenshots: `scripts/shot.ps1 <out.png> <url> [w,h]` (headless Edge with `--use-angle=d3d11`; swiftshader renders the 3D canvas black).
- PDF guide: `python docs/build_guide_pdf.py` (needs `docs/shots/*.png` from `scripts/shots.ps1`).

## 8. Kickoff prompt for the next session

Open with working directory `D:\fusionhack` and paste:

```text
You are continuing BridgeWitness v3 (CSB-01). Read D:\fusionhack\HANDOFF.md, then NEW.md.
The product is built and verified locally; the open items are in HANDOFF §5 and the deployment in §6.
Rules: do not spawn AI subagents; NEW.md is locked (small corrections and measured numbers only);
no invented numbers; keep UI wording plain (payout, deposit, backed); selfcheck, tsc and npm run build must stay green.
Start by asking whether Render/Vercel access is ready, then do the next step.
```
