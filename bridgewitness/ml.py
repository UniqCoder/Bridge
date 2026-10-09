"""The three ML models.

ML1 DelayCQR       LightGBM quantile regression + conformalized quantile regression (Romano et al. 2019)
ML2 AuthModel      Signer & authorization anomaly: IsolationForest + Dirichlet-multinomial quorum likelihood
ML3 ExploitTyper   LightGBM multiclass + isotonic calibration; reasons via LightGBM's exact TreeSHAP (pred_contrib)
"""
import math
from collections import Counter

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.isotonic import IsotonicRegression

SEED = 2410
QUIET = dict(verbose=-1, random_state=SEED, n_jobs=1)


# ---------------------------------------------------------------- ML1: deposit -> withdrawal delay interval
def delay_features(df):
    t = pd.to_datetime(df.ts, unit="s")
    return pd.DataFrame({
        "feed": (df.feed == "ronin").astype(int).values,
        "token": df.token.map(lambda a: int(a[2:10], 16) % 997).values,
        "log_usd": np.log1p(df.value_usd.fillna(0).astype(float)).values,
        "hour": t.dt.hour.values, "weekday": t.dt.weekday.values,
    })


class DelayCQR:
    """Predicts a [lo, hi] window for deposit->withdrawal delay with conformal coverage 1 - miscoverage."""

    def __init__(self, miscoverage=0.01):
        self.a = miscoverage

    def fit(self, pairs):
        pairs = pairs.sort_values("ts")
        parts = []
        for _, g in pairs.groupby("feed"):  # time-ordered 60/20/20 split inside each feed: no look-ahead
            n = len(g)
            parts.append((g.iloc[: int(.6 * n)], g.iloc[int(.6 * n): int(.8 * n)], g.iloc[int(.8 * n):]))
        tr, ca, te = (pd.concat([p[i] for p in parts]) for i in range(3))
        y = lambda d: np.log(d.delay.clip(lower=1).astype(float).values)
        mk = lambda q: lgb.LGBMRegressor(objective="quantile", alpha=q, n_estimators=300, learning_rate=0.05,
                                         num_leaves=31, min_child_samples=40, **QUIET)
        self.lo = mk(self.a / 2).fit(delay_features(tr), y(tr))
        self.hi = mk(1 - self.a / 2).fit(delay_features(tr), y(tr))
        lo, hi = self._raw(ca)
        scores = np.maximum(lo - y(ca), y(ca) - hi)
        n = len(scores)
        self.q = float(np.quantile(scores, min(1.0, math.ceil((n + 1) * (1 - self.a)) / n), method="higher"))
        lo, hi = self.window_log(te)
        yt = y(te)
        self.report = {"miscoverage_target": self.a, "n_train": len(tr), "n_calib": len(ca), "n_test": len(te),
                       "test_coverage": float(np.mean((yt >= lo) & (yt <= hi))),
                       "test_coverage_by_feed": {f: float(np.mean(((yt >= lo) & (yt <= hi))[te.feed.values == f]))
                                                 for f in sorted(te.feed.unique())},
                       "median_window_s": {f: [float(np.median(np.exp(lo[te.feed.values == f]))),
                                               float(np.median(np.exp(hi[te.feed.values == f])))]
                                           for f in sorted(te.feed.unique())}}
        return self

    def _raw(self, df):
        X = delay_features(df)
        lo, hi = self.lo.predict(X), self.hi.predict(X)
        return np.minimum(lo, hi), np.maximum(lo, hi)

    def window_log(self, df):
        lo, hi = self._raw(df)
        return lo - self.q, hi + self.q

    def window(self, df):
        lo, hi = self.window_log(df)
        return np.exp(lo), np.exp(hi)


# ---------------------------------------------------------------- ML2: signer & authorization model
class AuthModel:
    """Scores how unusual a withdrawal's authorization is: who signed (quorum likelihood) and with what
    withdrawal id (id jump beyond anything the source chain has issued), plus value and hour.
    IsolationForest on these features; conformal p-values come from a later normal calibration window."""

    FEATS = ["id_jump_log", "log_usd", "hour", "n_signers", "quorum_surprisal", "signers_known"]

    def fit(self, train, alpha=0.5):
        q = train.quorum.dropna()
        self.qcount, self.qtotal, self.alpha = Counter(q), len(q), alpha
        self.K = max(len(self.qcount), 1) + 1
        self.fill = {"n_signers": float(train.n_signers.median()) if train.n_signers.notna().any() else 0.0}
        X = self.features(train)
        self.forest = IsolationForest(n_estimators=200, random_state=SEED).fit(X)
        return self

    def surprisal(self, quorum):
        # Dirichlet-multinomial posterior predictive: -log P(quorum | history)
        if quorum is None or (isinstance(quorum, float) and math.isnan(quorum)):
            return np.nan
        return -math.log((self.qcount.get(quorum, 0) + self.alpha) / (self.qtotal + self.alpha * self.K))

    def features(self, df):
        X = pd.DataFrame({
            "id_jump_log": np.sign(df.id_jump) * np.log1p(np.abs(df.id_jump)),
            "log_usd": np.log1p(df.value_usd.astype(float)),
            "hour": pd.to_datetime(df.ts, unit="s").dt.hour,
            "n_signers": df.n_signers.fillna(self.fill["n_signers"]),
            "quorum_surprisal": [self.surprisal(q) for q in df.quorum],
            "signers_known": df.quorum.notna().astype(int),
        })
        X["quorum_surprisal"] = X.quorum_surprisal.fillna(X.quorum_surprisal.median() if X.quorum_surprisal.notna().any() else 0)
        return X[self.FEATS].values

    def score(self, df):
        return -self.forest.score_samples(self.features(df))  # higher = more anomalous


# ---------------------------------------------------------------- ML3: exploit-type classifier
TYPES = ["unbacked_release", "message_replay", "copycat_swarm", "key_compromise",
         "amount_mismatch", "recipient_mismatch", "benign_whale", "benign_burst"]
TYPE_TEXT = {
    "unbacked_release": "Release with no deposit behind it (fake deposit / forged message)",
    "message_replay": "Replay of an already-used bridge message",
    "copycat_swarm": "Copycat swarm: many near-identical releases spreading",
    "key_compromise": "Validator key compromise: validly signed but unbacked release",
    "amount_mismatch": "Mismatched pair: released amount differs from the deposit",
    "recipient_mismatch": "Mismatched pair: released to a different recipient",
    "benign_whale": "Large but fully backed transfer (benign)",
    "benign_burst": "Burst of backed transfers (benign)",
}
PRECEDENT = {
    "unbacked_release": "Qubit 2022 (fake deposit) · Wormhole 2022 (forged message)",
    "message_replay": "Nomad 2022 (proven messages replayed)",
    "copycat_swarm": "Nomad 2022 (279 copycat addresses in 2.5 h)",
    "key_compromise": "Ronin 2022 (5 of 9 validator keys) · Harmony 2022 (2 multisig keys)",
    "amount_mismatch": "Accounting bug class (SoK: Notland et al. 2024)",
    "recipient_mismatch": "Message-tampering class (SoK: Lee et al. 2022)",
    "benign_whale": "—", "benign_burst": "—",
}
ALLOWED_VIOL = np.array([1, 1, 1, 1, 1, 1, 0, 0])
ALLOWED_OK = np.array([0, 1, 1, 0, 0, 0, 1, 1])  # suspected replay/swarm without proof, or benign
CLF_FEATS = ["unbacked", "amount_mismatch", "recipient_mismatch", "id_reused", "id_jump_log", "cluster_log",
             "hawkes_n", "midas", "log_usd", "value_vs_route", "signed"]


def synth_training(normal_feats, n_per=1500, seed=SEED):
    """Seeded synthetic scenarios on top of REAL normal feature rows (resampled), labelled by construction."""
    rng = np.random.default_rng(seed)
    rows, labels = [], []
    base = normal_feats[CLF_FEATS].reset_index(drop=True)
    U = lambda a, b: rng.uniform(a, b)
    for typ in TYPES:
        for _ in range(n_per):
            r = base.iloc[rng.integers(len(base))].to_dict()
            r.update(unbacked=0, amount_mismatch=0, recipient_mismatch=0)
            size = 1  # real data: most releases are alone in their fingerprint cluster (log size = 0)
            if typ == "unbacked_release":
                r.update(unbacked=1, id_reused=0, hawkes_n=0.0, id_jump_log=U(0, 5))
                size = int(rng.integers(1, 3))
            elif typ == "message_replay":
                r.update(unbacked=1, id_reused=1, hawkes_n=0.0, recipient_mismatch=int(rng.random() < .3))
                size = int(rng.integers(1, 7))
            elif typ == "copycat_swarm":
                r.update(unbacked=1, id_reused=int(rng.random() < .85), hawkes_n=U(.4, 1.5), midas=U(2, 12))
                size = int(rng.integers(8, 400))
            elif typ == "key_compromise":
                r.update(unbacked=1, id_reused=0, hawkes_n=0.0, signed=float(rng.random() < .7),
                         id_jump_log=U(8, 15) if rng.random() < .75 else U(0, 3),
                         log_usd=U(13, 21), value_vs_route=10 ** U(-.5, 2.5))
            elif typ == "amount_mismatch":
                r.update(amount_mismatch=1, id_reused=0, hawkes_n=0.0)
            elif typ == "recipient_mismatch":
                r.update(recipient_mismatch=1, id_reused=0, hawkes_n=0.0)
            elif typ == "benign_whale":
                r.update(log_usd=U(13.8, 19), value_vs_route=10 ** U(-.5, 1.7), id_reused=0, hawkes_n=0.0)
            elif typ == "benign_burst":
                r.update(midas=U(2, 8), hawkes_n=U(0, 1.0), id_reused=0)
                size = int(rng.integers(1, 4))
            r["cluster_log"] = math.log(size)
            rows.append(r)
            labels.append(typ)
    return pd.DataFrame(rows)[CLF_FEATS].astype(float), np.array(labels)


class ExploitTyper:
    def fit(self, X, y, seed=SEED):
        self.classes = TYPES
        yi = np.array([TYPES.index(v) for v in y])
        rng = np.random.default_rng(seed)
        idx = rng.permutation(len(X))
        cut = int(.8 * len(X))
        tr, ca = idx[:cut], idx[cut:]
        self.model = lgb.LGBMClassifier(objective="multiclass", n_estimators=200, learning_rate=.08, num_leaves=15,
                                        **QUIET).fit(X.iloc[tr], yi[tr])
        P = self.model.predict_proba(X.iloc[ca])
        self.iso = [IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(P[:, k], yi[ca] == k)
                    for k in range(len(TYPES))]
        self.report = {"synthetic_holdout_accuracy": float(np.mean(self.predict(X.iloc[ca])[0] == yi[ca])),
                       "note": "accuracy on held-out SYNTHETIC rows only; real incidents reported per incident"}
        return self

    def predict(self, X):
        P = self.model.predict_proba(X)
        C = np.column_stack([self.iso[k].predict(P[:, k]) for k in range(len(TYPES))]) + 1e-9
        # The rule layer constrains the type: a release that broke conservation can never be "benign",
        # and one that did not break it can never be typed as an unbacked/mismatch exploit.
        viol = (X[["unbacked", "amount_mismatch", "recipient_mismatch"]].values.max(1) > 0)[:, None]
        C = np.where(viol, C * ALLOWED_VIOL, C * ALLOWED_OK)
        C = C / C.sum(1, keepdims=True)
        return C.argmax(1), C

    def explain(self, X, k_top=3):
        """Exact TreeSHAP contributions from LightGBM (no shap library needed)."""
        cls, C = self.predict(X)
        contrib = self.model.predict(X, pred_contrib=True)  # list per class or (n, (F+1)*K)
        contrib = np.asarray(contrib)
        F = len(CLF_FEATS)
        out = []
        for i, c in enumerate(cls):
            row = contrib[i].reshape(len(TYPES), F + 1)[c, :F] if contrib.ndim == 2 else contrib[c][i, :F]
            top = np.argsort(-row)[:k_top]
            out.append({"type": TYPES[c], "prob": float(C[i, c]),
                        "reasons": [{"feature": CLF_FEATS[j], "value": float(X.iloc[i, j]), "push": float(row[j])}
                                    for j in top if row[j] > 0]})
        return out
