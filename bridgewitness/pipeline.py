"""Offline build: train the 3 models, run every feed through the 6 algorithms, write replay artifacts.

    python -m bridgewitness.pipeline        -> artifacts/{replay_nomad,replay_ronin,replay_simulated,metrics}.json
                                              + artifacts/models.pkl (used by the live tail)

The API only streams these artifacts (keeps the Render container < 512 MB); nothing heavy runs per visitor.
"""
import json
import math
import pickle
import hashlib
import time
from pathlib import Path

import numpy as np
import pandas as pd

from .algos import (CopycatClusters, ECusum, MidasR, RollingConformal, e_mean, hawkes_branching,
                    pair_and_ledger, risk_score, shingles)
from .ingest import FEEDS, load_events, load_pairs
from .ml import CLF_FEATS, PRECEDENT, TYPE_TEXT, TYPES, AuthModel, DelayCQR, ExploitTyper, synth_training

ROOT = Path(__file__).parent
ART = ROOT / "artifacts"
SEED = 2410
ECUSUM_C = 1000.0       # Advisory alarm threshold; rolling ranks do not establish a live false-alarm guarantee.
HOLD_LATENCIES = [0, 60, 300, 900]

# Time splits (unix seconds, UTC). Calibration = normal history; held-out = later normal days before the attack.
SPLITS = {
    "nomad": {"calib_end": 1656633600, "window": (1659376800, 1659402000), "label": "Nomad · 1–2 Aug 2022"},   # 1 Jul; 18:00→01:00
    "ronin": {"calib_end": 1646092800, "window": (1648026000, 1648044000), "label": "Ronin · 23 Mar 2022"},   # 1 Mar; 09:00→14:00
    "simulated": {"calib_end": 1646092800, "window": (1646899200, 1646913600), "label": "Simulated attack replay (seed 2410)"},
}
SIGNALS = ["burst", "midas", "cluster_log", "hawkes_n", "value_vs_route", "id_jump_pos", "auth"]


# ---------------------------------------------------------------- simulated attack replay
def signers_of_attack():
    from .signers import ATTACK_SIGNERS
    return ATTACK_SIGNERS


def simulated_events(seed=SEED):
    """Real Ronin traffic up to 10 Mar 2022 12:00 + injected, labelled attack scenarios and benign controls."""
    rng = np.random.default_rng(seed)
    ev = load_events("ronin")
    t0, t1 = SPLITS["simulated"]["window"]
    ev = ev[ev.ts < t1].copy()
    ev["scenario"] = None
    base = ev[(ev.kind == "withdrawal") & (ev.ts >= t0)]
    weth = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
    usdc = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"
    max_id = int(pd.to_numeric(ev.msg_id, errors="coerce").max())
    addr = lambda: "0x" + "".join(rng.choice(list("0123456789abcdef"), 40))
    txh = lambda: "0x" + "".join(rng.choice(list("0123456789abcdef"), 64))
    rows = []

    def add(ts, kind, token, amount, usd, msg, rcp, truth, scen, dec=18, sym="WETH"):
        rows.append(dict(feed="simulated", ts=int(ts), kind=kind, token=token, amount=str(amount), value_usd=usd,
                         msg_id=str(msg), recipient=rcp, tx=txh(), chain=1 if kind == "withdrawal" else 2020,
                         truth=truth, symbol=sym, decimals=dec, route="sim:ronin→ethereum", scenario=scen))

    T = lambda m: t0 + m * 60
    add(T(30), "withdrawal", weth, 85 * 10**18, 250_000, max_id + 3, addr(), "attack", "Fake deposit")
    old = base.iloc[5]
    add(T(55), "withdrawal", old.token, old.amount, old.value_usd, old.msg_id, old.recipient, "attack", "Replay",
        old.decimals, old.symbol)
    add(T(80), "withdrawal", weth, 13_000 * 10**18, 38_000_000, max_id + 900_000, addr(), "attack", "Key compromise")
    rows[-1]["sim_signers"] = ",".join(sorted(signers_of_attack()))  # validly signed by a (stolen) real quorum
    gap_t = T(110)
    for i in range(25):  # self-exciting: each copycat shortens the wait for the next (contagion)
        gap_t += float(rng.exponential(max(4.0, 90 * 0.85 ** i)))
        add(gap_t, "withdrawal", usdc, (100_000 + int(rng.integers(0, 900))) * 10**6, 100_400, 4922_000,
            addr(), "attack", "Copycat swarm", 6, "USDC")
    a, r = addr(), addr()
    add(T(150), "deposit", usdc, 12_500 * 10**6, 12_500, max_id + 11, a, "attack", "Amount mismatch", 6, "USDC")
    add(T(156), "withdrawal", usdc, 12_500 * 10**6 + 1, 12_500, max_id + 11, a, "attack", "Amount mismatch", 6, "USDC")
    add(T(165), "deposit", usdc, 9_000 * 10**6, 9_000, max_id + 12, a, "attack", "Recipient mismatch", 6, "USDC")
    add(T(171), "withdrawal", usdc, 9_000 * 10**6, 9_000, max_id + 12, r, "attack", "Recipient mismatch", 6, "USDC")
    w = addr()
    add(T(180), "deposit", usdc, 3_000_000 * 10**6, 3_000_000, max_id + 13, w, "control", "Whale (control)", 6, "USDC")
    add(T(186), "withdrawal", usdc, 3_000_000 * 10**6, 3_000_000, max_id + 13, w, "control", "Whale (control)", 6, "USDC")
    for i in range(12):
        b = addr()
        amt = int(rng.integers(50, 400)) * 10**6
        add(T(200) + i * 8, "deposit", usdc, amt, amt / 1e6, max_id + 20 + i, b, "control", "Honest burst (control)", 6, "USDC")
        add(T(206) + i * 8, "withdrawal", usdc, amt, amt / 1e6, max_id + 20 + i, b, "control", "Honest burst (control)", 6, "USDC")
    ev = pd.concat([ev, pd.DataFrame(rows)], ignore_index=True)
    ev["feed"], ev["route"] = "simulated", "sim:ronin→ethereum"
    ev = ev.sort_values(["ts", "kind", "tx"], kind="stable").reset_index(drop=True)
    ev["ordinal"] = ev.groupby(["tx", "kind"]).cumcount()
    ev["event_id"] = ev.tx + ":" + ev.kind.str[0] + ev.ordinal.astype(str)
    return ev


# ---------------------------------------------------------------- streaming signals over a feed
def stream_signals(ev, signers):
    """One causal pass: every signal uses only events at or before the current one."""
    w = ev.kind == "withdrawal"
    n = len(ev)
    S = {k: np.zeros(n) for k in ("burst", "midas", "cluster_size", "hawkes_n", "id_reused", "id_jump", "value_vs_route")}
    from collections import deque
    recent10, recent7d = deque(), deque()  # volume spike: releases in last 10 min vs trailing 7-day rate
    S["cluster"] = np.array([None] * n, dtype=object)
    midas, lsh = MidasR(), CopycatClusters()
    seen_ids, max_id = set(), None
    batch = ev.groupby("tx").kind.transform("size").values
    t_start = ev.ts.iloc[0]
    day_usd = {}
    hawkes_cache = {}
    msg = pd.to_numeric(ev.msg_id, errors="coerce").values
    for i, r in enumerate(ev.itertuples(index=False)):
        if r.kind != "withdrawal":
            if not math.isnan(msg[i]):
                max_id = msg[i] if max_id is None else max(max_id, msg[i])
            continue
        midas.advance(int((r.ts - t_start) // 60) + 1)
        S["midas"][i] = midas.score(f"m:{r.msg_id}", f"t:{r.symbol}")
        for q, span in ((recent10, 600), (recent7d, 7 * 86400)):
            q.append(r.ts)
            while q and q[0] <= r.ts - span:
                q.popleft()
        expected10 = len(recent7d) * 600 / (7 * 86400)
        S["burst"][i] = math.log((len(recent10) + 1) / (expected10 + 1))
        identity = (r.route, r.token, r.msg_id)
        S["id_reused"][i] = identity in seen_ids
        seen_ids.add(identity)
        if not math.isnan(msg[i]):
            S["id_jump"][i] = 0 if max_id is None else msg[i] - max_id
        day = int(r.ts // 86400)
        prior_days = [v for d, v in day_usd.items() if day - 7 <= d < day]
        route_daily = float(np.median(prior_days)) if prior_days else 1.0
        value = float(r.value_usd) if pd.notna(r.value_usd) and math.isfinite(r.value_usd) and r.value_usd >= 0 else 0.0
        S["value_vs_route"][i] = value / max(route_daily, 1.0)
        day_usd[day] = day_usd.get(day, 0.0) + value
        root, size = lsh.add(r.event_id, shingles(r, batch[i]), r.ts)
        S["cluster"][i], S["cluster_size"][i] = root, size
        if size >= 8:  # exploit R0: Hawkes fit on this cluster's last 2 h, refreshed at most once a minute
            # The LSH union may merge/change roots; use its complete merged history, not a second cache.
            recent = lsh.times[root][-150:]
            key = (root, r.ts // 60)
            if key not in hawkes_cache and len(recent) >= 8:
                fit = hawkes_branching(recent, horizon=r.ts + 1)
                hawkes_cache[key] = fit[0] if fit else 0.0
            S["hawkes_n"][i] = hawkes_cache.get(key, 0.0)
    out = pd.DataFrame(S)
    out["cluster_log"] = np.log(np.maximum(out.cluster_size, 1))
    out["id_jump_pos"] = np.log1p(np.maximum(out.id_jump, 0))  # ids beyond anything issued so far
    sig = signers.set_index("tx_hash") if signers is not None else None
    q, ns = [None] * n, [np.nan] * n
    if sig is not None:
        for i, tx in enumerate(ev.tx.values):
            if tx in sig.index:
                s = sig.loc[tx]
                q[i], ns[i] = ",".join(sorted(s.signers.split(","))), s.n_signers
    if "sim_signers" in ev:  # simulated scenarios carry their (labelled) signer set directly
        for i, s in enumerate(ev.sim_signers.values):
            if isinstance(s, str):
                q[i], ns[i] = s, len(s.split(","))
    out["quorum"], out["n_signers"] = q, ns
    return out


def clf_frame(ev):
    return pd.DataFrame({
        "unbacked": ev.rule.isin(['missing_source_deposit', 'message_replayed']).astype(float),
        "amount_mismatch": (ev.rule == "amount_mismatch").astype(float),
        "recipient_mismatch": (ev.rule == "recipient_mismatch").astype(float),
        "id_reused": ev.id_reused.astype(float),
        "id_jump_log": np.sign(ev.id_jump) * np.log1p(np.abs(ev.id_jump)),
        "cluster_log": ev.cluster_log, "hawkes_n": ev.hawkes_n, "midas": ev.midas,
        "log_usd": np.log1p(ev.value_usd.fillna(0).astype(float)), "value_vs_route": ev.value_vs_route,
        "signed": ev.quorum.notna().astype(float),
    })[CLF_FEATS]


# ---------------------------------------------------------------- one feed end to end
def run_feed(name, ev, delay, signers, typer=None):
    sp = SPLITS[name]
    for k, v in pair_and_ledger(ev, delay.window, source_complete=True).items():
        ev[k] = v
    sig = stream_signals(ev, signers if name != "nomad" else None)
    for c in sig.columns:
        ev[c] = sig[c].values
    w = ev.kind == "withdrawal"
    normal = w & (ev.truth == "normal")
    cal = normal & (ev.ts < sp["calib_end"])

    # ML2: authorization model (Ronin-family feeds only; Nomad has no signer data and abstains)
    ev["auth"] = np.nan
    auth, cut = None, 0
    if name != "nomad":
        # time split inside the calibration period: fit on the first 2/3, conformal-calibrate on the last 1/3
        cut = ev.loc[cal, "ts"].quantile(2 / 3)
        auth = AuthModel().fit(ev[cal & (ev.ts < cut) & ev.quorum.notna()])
        eligible = w & (ev.ts >= cut) & ev.quorum.notna() & (ev.status == 'consistent')
        # Proven violations may receive advisory context too, but never missing-signature guesses.
        eligible |= w & (ev.ts >= cut) & ev.quorum.notna() & (ev.status == 'violation')
        ev.loc[eligible, "auth"] = auth.score(ev[eligible])

    # Rolling conformal p-values per signal: each release is compared with the latest 2,000 BACKED releases
    # before it (causal; label-free). ML2 scores enter its window only after ML2's training cut (no in-sample).
    roll = {s: RollingConformal() for s in SIGNALS}
    P = {s: [None] * len(ev) for s in SIGNALS}
    vals = {s: ev[s].values for s in SIGNALS}
    tsv, stv, kv = ev.ts.values, ev.status.values, ev.kind.values
    for i in range(len(ev)):
        if kv[i] != "withdrawal":
            continue
        for s in SIGNALS:
            v = vals[s][i]
            if v is None or (isinstance(v, float) and math.isnan(v)):
                continue
            P[s][i] = roll[s].p(v)
            if stv[i] == "consistent" and (s != "auth" or tsv[i] >= cut):
                roll[s].add(float(v))
    for s in SIGNALS:
        ev[f"p_{s}"] = P[s]
    comb = [e_mean([r[f"p_{s}"] for s in SIGNALS]) if wi else (None, None)
            for (_, r), wi in zip(ev[[f"p_{s}" for s in SIGNALS]].iterrows(), w.values)]
    ev["e_comb"], ev["p_comb"] = [c[0] for c in comb], [c[1] for c in comb]

    # e-CUSUM alarm from the end of calibration onward (held-out normal days + the incident)
    det, alarm, mval = ECusum(ECUSUM_C), [False] * len(ev), [None] * len(ev)
    for i in np.where(w.values & (ev.ts.values >= sp["calib_end"]))[0]:
        fired, m = det.update(ev.e_comb.iat[i])
        alarm[i], mval[i] = fired, m
    ev["alarm"], ev["ecusum"] = alarm, mval

    # Risk + level: only a broken conservation rule may say "exploit"
    viol = ev.status == "violation"
    breakdown = [risk_score(r.status, r.rule, r.value_usd, r.p_comb, r.cluster_size, r.alarm)
                 for r in ev.itertuples()]
    ev['risk_breakdown'] = breakdown
    ev['risk'] = [b['total'] for b in breakdown]
    ev["level"] = np.where(viol, "exploit", np.where(ev.alarm, "suspicious", "none"))
    ev.loc[~w, "level"] = "none"

    # ML3: exploit type for every flagged release
    feats = clf_frame(ev)
    ev["type"], ev["type_prob"], ev["reasons"] = None, None, None
    flagged = (ev.level != "none").values
    if typer is not None and flagged.any():
        ex = typer.explain(feats[flagged].reset_index(drop=True))
        idx = np.where(flagged)[0]
        for i, e in zip(idx, ex):
            ev.at[i, "type"], ev.at[i, "type_prob"], ev.at[i, "reasons"] = e["type"], e["prob"], e["reasons"]
    return ev, feats, auth


# ---------------------------------------------------------------- scorecard, counterfactual, artifacts
def baselines(ev, sp):
    w = ev[(ev.kind == "withdrawal") & (ev.ts >= sp["calib_end"])].copy()
    flags = {"B1 whale > $1M": w.value_usd.astype(float) > 1e6}
    bins = (w.ts // 600)
    releases = ev[ev.kind == 'withdrawal']
    out_bin = releases.groupby(releases.ts // 600).value_usd.sum()
    out_bin = out_bin.reindex(range(int(out_bin.index.min()), int(out_bin.index.max()) + 1), fill_value=0)
    roll = out_bin.rolling(6 * 24 * 7, min_periods=12)
    mean, std = roll.mean().shift(1), roll.std().shift(1)
    # Count only withdrawals already observed in the current bin, not the rest of its future outflow.
    current = w.groupby(bins).value_usd.cumsum()
    z = (current - bins.map(mean)) / bins.map(std).clip(lower=1)
    flags['B2 volume z-score > 3'] = z.fillna(0).values > 3
    deposit_times = ev[ev.kind == 'deposit'].groupby('msg_id').ts.min()
    flags['B3 message-id join'] = w.msg_id.map(deposit_times).fillna(float('inf')) > w.ts
    flags["BridgeWitness (exploit)"] = (w.level == "exploit").values
    flags["BridgeWitness (any alert)"] = (w.level != "none").values
    rows = []
    att = w.truth == "attack"
    first_att = w.loc[att, "ts"].min() if att.any() else None
    normal_days = max((w.loc[w.truth == "normal", "ts"].max() - w.loc[w.truth == "normal", "ts"].min()) / 86400, 1e-9)
    for name, f in flags.items():
        f = np.asarray(f, bool)
        hit = w[f & att.values]
        first = hit.ts.min() if len(hit) else None
        rows.append({
            "method": name,
            "attack_flagged": f"{int((f & att.values).sum())}/{int(att.sum())}",
            "first_alert_after_s": None if first is None or first_att is None else int(first - first_att),
            "usd_before_first_alert": None if first_att is None else
                float(w.loc[att & (w.ts < (first if first is not None else 1e18)), "value_usd"].sum()),
            "false_alerts": int((f & (w.truth == "normal").values).sum()),
            "false_alerts_per_day": round(float((f & (w.truth == "normal").values).sum()) / normal_days, 2),
        })
    return rows, round(normal_days, 1)


def counterfactual(ev, sp):
    w = ev[(ev.kind == "withdrawal") & (ev.ts < sp["window"][1])]
    att = w[w.truth == "attack"]
    first = w[w.level == "exploit"].ts.min()
    total = float(att.value_usd.sum())
    lanes = []
    for L in HOLD_LATENCIES:
        hold = first + L
        kept = float(att[att.ts >= hold].value_usd.sum())
        lanes.append({"latency_s": L, "hold_at": int(hold), "kept_usd": kept, "kept_pct": round(100 * kept / total, 1),
                      "legit_held": int(((w.truth == "normal") & (w.ts >= hold)).sum())})
    return {"attack_usd": total, "first_exploit_alert": int(first), "lanes": lanes,
            "assumptions": ["latency 0 = held before the first flagged release executes (pre-execution gate)",
                            "otherwise the route is held at first alert + latency", "legit_held counts normal releases delayed until the end of the replay window", "attackers behave identically otherwise",
                            "dataset USD values"]}


def to_replay(name, ev, sp, feats):
    t0, t1 = sp["window"]
    win = ev[(ev.ts >= t0) & (ev.ts < t1)]
    deps = ev[ev.kind == "deposit"]
    dep_by_id = {r.event_id: r for r in deps.itertuples()}
    by_token = {k: g for k, g in deps.groupby("token")}
    auth_by_key = {k: g for k, g in deps.groupby(['route', 'token', 'msg_id'])}
    consistent = ev[(ev.kind == 'withdrawal') & (ev.status == 'consistent')]
    used_by_key = {k: g for k, g in consistent.groupby(['route', 'token', 'msg_id'])}
    def fact(row):
        return {k: (int(row[k]) if k == 'ts' else str(row[k]))
                for k in ('event_id', 'route', 'token', 'msg_id', 'amount', 'recipient', 'ts')}
    rec = []
    for i, r in win.iterrows():
        d = {"id": r.event_id, "ts": int(r.ts), "kind": r.kind, "tx": r.tx, "symbol": r.symbol,
             "amount": str(r.amount), "decimals": int(r.decimals), "usd": round(float(r.value_usd or 0), 2),
             "msg_id": str(r.msg_id), "recipient": r.recipient, "truth": r.truth,
             "scenario": r.get("scenario") if isinstance(r.get("scenario"), str) else None}
        if r.kind == "withdrawal":
            key = (r.route, r.token, r.msg_id)
            auths = auth_by_key.get(key, deps.iloc[:0])
            auths = auths[auths.ts <= r.ts]
            prior = used_by_key.get(key, consistent.iloc[:0])
            prior = prior[prior.index < i]
            bundle = {'rule_version': 'exact-message-v1', 'release': fact(r),
                      'authorizations': [fact(a) for _, a in auths.iterrows()],
                      'previous_releases': [{**fact(p), 'matched': p.matched, 'status': p.status} for _, p in prior.iterrows()],
                      'coverage': {'source_complete': True, 'mode': 'historical_dataset_assumption'}}
            digest = hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
            d['evidence'] = {'bundle': bundle, 'sha256': digest}
            # Plain facts a reader can re-check: what the full deposit history contains for this release.
            past = by_token.get(r.token)
            past = past[past.ts <= r.ts] if past is not None else deps.iloc[0:0]
            m = dep_by_id.get(r.matched) if isinstance(r.matched, str) else None
            d["deposit"] = None if m is None else {"tx": m.tx, "ts": int(m.ts), "amount": str(m.amount),
                                                   "recipient": m.recipient, "msg_id": str(m.msg_id)}
            d["search"] = {"deposits_checked": int(len(past)),
                           "since": int(past.ts.min()) if len(past) else None,
                           "same_amount_and_recipient": int(((past.amount == r.amount) & (past.recipient == r.recipient)).sum()),
                           "same_amount_other_recipient": int(((past.amount == r.amount) & (past.recipient != r.recipient)).sum()),
                           "same_recipient_other_amount": int(((past.amount != r.amount) & (past.recipient == r.recipient)).sum()),
                           "same_message_id": int((past.msg_id == r.msg_id).sum())}
            d.update({"status": r.status, "rule": r.rule, "matched": r.matched,
                      "delay": None if pd.isna(r.delay) else int(r.delay),
                      "window": [int(r.win_lo), int(min(r.win_hi, 10**9))],
                      "signals": {"midas": round(float(r.midas), 2), "cluster": r.cluster, "cluster_size": int(r.cluster_size),
                                  "hawkes_n": round(float(r.hawkes_n), 3), "id_reused": bool(r.id_reused),
                                  "id_jump": int(r.id_jump), "id_jump_pos": round(float(r.id_jump_pos), 2), "auth": None if pd.isna(r.auth) else round(float(r.auth), 3),
                                  "signers": r.quorum.split(",") if isinstance(r.quorum, str) else None},
                      "p": {s: None if r[f"p_{s}"] is None else float(f"{r[f'p_{s}']:.3g}") for s in SIGNALS},
                      "p_comb": None if r.p_comb is None else float(f"{r.p_comb:.3g}"),
                      "e_comb": None if r.e_comb is None else float(f"{r.e_comb:.3g}"),
                      "ecusum": None if r.ecusum is None else float(f"{r.ecusum:.3g}"), "alarm": bool(r.alarm),
                      "risk": int(r.risk), "risk_breakdown": r.risk_breakdown, "level": r.level,
                      "type": r.type, "type_text": TYPE_TEXT.get(r.type), "type_prob": None if r.type_prob is None else round(r.type_prob, 3),
                      "precedent": PRECEDENT.get(r.type), "reasons": r.reasons})
        rec.append(d)
    # timeline: one point per minute
    ticks = []
    ww = win[win.kind == "withdrawal"]
    for t in range(t0, t1, 60):
        upto = ww[ww.ts < t + 60]
        cur = ww[(ww.ts >= t) & (ww.ts < t + 60)]
        ticks.append({"t": t, "backed_usd": round(float(upto[upto.status == "consistent"].usd.sum() if "usd" in upto else upto[upto.status == "consistent"].value_usd.sum()), 2),
                      "unbacked_usd": round(float(upto[upto.status == "violation"].value_usd.sum()), 2),
                      "midas": round(float(cur.midas.max()) if len(cur) else 0.0, 2),
                      "cluster_max": int(upto.cluster_size.max()) if len(upto) else 0,
                      "hawkes_n": round(float(upto.hawkes_n.iloc[-1]) if len(upto) else 0.0, 3),
                      "ecusum": float(f"{max([v for v in cur.ecusum if v is not None] or [0]):.3g}"),
                      "releases": int(len(cur))})
    return {"feed": name, "label": sp["label"], "window": [t0, t1], "route": ev.route.iloc[0],
            "src": FEEDS.get(name, FEEDS["ronin"])["src"], "dst": "Ethereum", "events": rec, "ticks": ticks}


def signer_dna(sg):
    """Facts about the real Ronin validators recovered from calldata (4,200 sampled normal withdrawals + the 2 attacks)."""
    from collections import Counter
    from .signers import ATTACK_SIGNERS
    n = sg[~sg.is_attack]
    sets = n.signers.map(lambda s: ",".join(sorted(s.split(","))))
    atk = ",".join(sorted(ATTACK_SIGNERS))
    cnt = Counter(x for s in n.signers for x in s.split(","))
    validators = sorted(set(cnt) | set(ATTACK_SIGNERS))
    ids = n.withdrawal_id.astype(int)
    return {
        "normal_sampled": int(len(n)),
        "validators": [{"addr": v, "participation": round(cnt[v] / len(n), 3), "signed_attack": v in ATTACK_SIGNERS} for v in validators],
        "attack_quorum_seen_in_normal": int((sets == atk).sum()),
        "attack_quorum_share": round(float((sets == atk).mean()), 4),
        "distinct_quorums": int(sets.nunique()),
        "quorum_size": {str(k): int(v) for k, v in n.n_signers.value_counts().sort_index().items()},
        "normal_id_min": int(ids.min()), "normal_id_max": int(ids.max()),
        "attack_ids": [int(x) for x in sg[sg.is_attack].withdrawal_id.sort_values()],
    }


def main():
    t_all = time.time()
    ART.mkdir(exist_ok=True)
    signers = pd.read_parquet(ROOT / "data" / "signers.parquet")
    pairs = pd.concat([load_pairs("nomad"), load_pairs("ronin")])
    pairs = pairs[pairs.ts < pairs.feed.map({f: SPLITS[f]['calib_end'] for f in FEEDS})]
    delay = DelayCQR().fit(pairs)
    print("ML1", delay.report)

    feeds = {"nomad": load_events("nomad"), "ronin": load_events("ronin"), "simulated": simulated_events()}
    for f in feeds.values():
        if "scenario" not in f:
            f["scenario"] = None
    done = {}
    for name, ev in feeds.items():  # first pass: signals (no typer yet)
        t = time.time()
        done[name] = run_feed(name, ev, delay, signers)
        print(name, "signals", round(time.time() - t, 1), "s")

    # ML3 trained on synthetic scenarios over REAL normal calibration rows (Nomad + Ronin)
    normal_rows = pd.concat([done[n][1][(done[n][0].kind == "withdrawal") & (done[n][0].truth == "normal") &
                                        (done[n][0].ts < SPLITS[n]["calib_end"])] for n in ("nomad", "ronin")])
    X, y = synth_training(normal_rows)
    typer = ExploitTyper().fit(X, y)
    print("ML3", typer.report)

    metrics = {"signer_dna": signer_dna(signers), "generated_at": int(time.time()), "seed": SEED, "ecusum_threshold": ECUSUM_C,
               'risk_policy': 'rule severity + capped exposure + campaign + advisory surprise; not probability',
               'statistical_claim': 'observed replay false-alarm counts; rolling ranks do not prove an ARL guarantee',
               "ml1_delay_cqr": delay.report, "ml3_exploit_typer": typer.report, "feeds": {}}
    for name in feeds:
        ev, feats, auth = run_feed(name, feeds[name], delay, signers, typer)
        sp = SPLITS[name]
        w = ev[ev.kind == "withdrawal"]
        held = w[(w.ts >= sp["calib_end"]) & (w.truth == "normal")]
        att = w[w.truth == "attack"]
        score, days = baselines(ev, sp)
        m = {"withdrawals": int(len(w)), "attack_releases": int(len(att)),
             "attack_flagged_exploit": int((att.level == "exploit").sum()),
             "normal_false_exploit": int(((w.truth != "attack") & (w.level == "exploit")).sum()),
             "heldout_normal": int(len(held)), "heldout_days": days,
             "heldout_false_alarms": int(held.alarm.sum()),
             "heldout_false_alarm_rate": round(float(held.alarm.mean()), 5) if len(held) else None,
             "rules": att.rule.value_counts().to_dict(),
             # the statistical layer on its own (no conservation rule): does it see the attack?
             "stat_alarms_on_attack": int(att.alarm.sum()),
             "stat_first_alarm_after_s": None if not att.alarm.any() else int(att[att.alarm].ts.min() - att.ts.min()),
             "types_on_attack": att.type.value_counts().to_dict(),
             "max_cluster": int(att.cluster_size.max()) if len(att) else 0,
             "max_hawkes_n": round(float(att.hawkes_n.max()), 3) if len(att) else 0,
             "scorecard": score, "counterfactual": counterfactual(ev, sp) if len(att) else None}
        if name != "nomad" and auth is not None:
            ra = w[w.truth == "attack"]
            m["auth_attack_p"] = [float(f"{p:.3g}") for p in ra.p_auth if p is not None]
            m["auth_heldout_median_p"] = round(float(np.nanmedian([p for p in held.p_auth if p is not None])), 3)
        if name == "simulated":
            m["scenarios"] = {s: {"truth": g.truth.iloc[0], "levels": g[g.kind == "withdrawal"].level.value_counts().to_dict(),
                                  "types": g[g.kind == "withdrawal"].type.value_counts().to_dict()}
                              for s, g in ev[ev.scenario.notna()].groupby("scenario")}
        metrics["feeds"][name] = m
        rep = to_replay(name, ev, sp, feats)
        rep["metrics"] = m
        (ART / f"replay_{name}.json").write_text(json.dumps(_clean(rep), default=_json, allow_nan=False), encoding="utf-8")
        print(name, json.dumps({k: v for k, v in m.items() if k not in ("scorecard", "counterfactual", "scenarios")}, default=_json))
    (ART / "metrics.json").write_text(json.dumps(_clean(metrics), indent=1, default=_json, allow_nan=False), encoding="utf-8")
    with open(ART / "models.pkl", "wb") as fh:
        pickle.dump({"delay": delay}, fh)
    print("done", round(time.time() - t_all, 1), "s")


def _clean(o):
    """Unknown values (e.g. releases the dataset could not price) become null, never NaN: strict JSON only."""
    if isinstance(o, dict):
        return {k: _clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_clean(v) for v in o]
    if isinstance(o, (float, np.floating)) and not math.isfinite(o):
        return None
    return o


def _json(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return None if np.isnan(o) else float(o)
    if isinstance(o, (np.bool_,)):
        return bool(o)
    return str(o)


if __name__ == "__main__":
    main()
