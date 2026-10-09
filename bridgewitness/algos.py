"""The six deterministic algorithms (no training).

A1 conservation ledger + rule verdicts   A2 Hungarian pairing        A3 MinHash-LSH copycat clusters
A4 MIDAS-R edge-stream bursts            A5 Hawkes branching ratio   A6 conformal p -> e-value -> e-CUSUM alarm
"""
import math
from collections import defaultdict

import numpy as np
from datasketch import MinHash, MinHashLSH
from scipy.optimize import linear_sum_assignment, minimize

# ---------------------------------------------------------------- A1 + A2: pairing and conservation ledger
BIG = 1e6


def pair_and_ledger(ev, window_fn, batch_s=600):
    """Match withdrawals to deposits per token with the Hungarian algorithm, then apply the backing rule.

    window_fn(withdrawal_rows) -> (lo, hi) arrays: plausible deposit delay in seconds (ML1 interval).
    Cost: exact amount+recipient inside window = 0, outside window = 1 (consistent, timing note),
    amount-only or recipient-only agreement = 5 (mismatched pair), anything else infeasible.
    Returns per-event columns: status, rule, matched (event_id of the deposit), delay, win_lo, win_hi.
    """
    out = {k: [None] * len(ev) for k in ("status", "rule", "matched", "delay", "win_lo", "win_hi")}
    # Deposits stay open until claimed (real users claim up to months later). Indexed by (token, amount)
    # and (token, recipient) so each withdrawal only sees plausible candidates.
    by_amt, by_rcp = defaultdict(set), defaultdict(set)
    ts, kind, tok = ev.ts.values, ev.kind.values, ev.token.values
    amt, rcp, eid = ev.amount.values, ev.recipient.values, ev.event_id.values
    w_idx = np.where(kind == "withdrawal")[0]
    lo_all, hi_all = window_fn(ev.iloc[w_idx])
    win = {i: (lo, hi) for i, lo, hi in zip(w_idx, lo_all, hi_all)}
    i, n = 0, len(ev)
    while i < n:
        t0 = ts[i]
        j = i
        while j < n and ts[j] < t0 + batch_s:
            j += 1
        for k in range(i, j):  # deposits of this batch become available first (delay is always > 0)
            if kind[k] == "deposit":
                by_amt[(tok[k], amt[k])].add(k)
                by_rcp[(tok[k], rcp[k])].add(k)
                out["status"][k] = "deposit"
        by_tok = defaultdict(list)
        for k in range(i, j):
            if kind[k] == "withdrawal":
                by_tok[tok[k]].append(k)
        for t, ws in by_tok.items():
            pool = sorted(set().union(*[by_amt[(t, amt[w])] | by_rcp[(t, rcp[w])] for w in ws]))
            cost = np.full((len(ws), max(len(pool), 1)), BIG)
            for a, w in enumerate(ws):
                lo, hi = win[w]
                for b, d in enumerate(pool):
                    if ts[d] > ts[w]:
                        continue
                    same_amt, same_rcp = amt[d] == amt[w], rcp[d] == rcp[w]
                    if same_amt and same_rcp:
                        cost[a, b] = 0 if lo <= ts[w] - ts[d] <= hi else 1
                    elif same_amt or same_rcp:
                        cost[a, b] = 5
            rows, cols = linear_sum_assignment(cost) if pool else ([], [])
            got = {r: c for r, c in zip(rows, cols) if cost[r, c] < BIG}
            used = set()
            for a, w in enumerate(ws):
                lo, hi = win[w]
                out["win_lo"][w], out["win_hi"][w] = float(lo), float(hi)
                if a in got and cost[a, got[a]] <= 1:
                    d = pool[got[a]]
                    used.add(d)
                    out["status"][w], out["matched"][w], out["delay"][w] = "consistent", eid[d], float(ts[w] - ts[d])
                    out["rule"][w] = None if cost[a, got[a]] == 0 else "outside_usual_delay"
                elif a in got:  # partial agreement: the release does not match what was deposited
                    d = pool[got[a]]
                    out["status"][w], out["matched"][w] = "violation", eid[d]
                    out["rule"][w] = "amount_mismatch" if rcp[d] == rcp[w] else "recipient_mismatch"
                else:
                    out["status"][w], out["rule"][w] = "violation", "missing_source_deposit"
            for d in used:
                by_amt[(t, amt[d])].discard(d)
                by_rcp[(t, rcp[d])].discard(d)
        i = j
    return out


# ---------------------------------------------------------------- A3: MinHash-LSH copycat clusters
def shingles(r, batch):
    # Recipient deliberately masked: copycats change only the recipient. The reused message id is
    # weighted x3 because replaying a proven message is the copycat's signature move.
    s = {f"tok:{r.symbol}", f"amt:{round(math.log10(max(float(r.amount), 1)), 1)}", f"batch:{batch}",
         f"rule:{r.rule}"} | {f"mid{k}:{r.msg_id}" for k in range(3)}
    return s


class CopycatClusters:
    def __init__(self, threshold=0.6, num_perm=64):
        self.lsh = MinHashLSH(threshold=threshold, num_perm=num_perm)
        self.num_perm, self.parent, self.size = num_perm, {}, defaultdict(int)

    def _root(self, k):
        while self.parent[k] != k:
            self.parent[k] = self.parent[self.parent[k]]
            k = self.parent[k]
        return k

    def add(self, key, sh):
        m = MinHash(num_perm=self.num_perm, seed=2410)
        for x in sh:
            m.update(x.encode())
        self.parent[key], self.size[key] = key, 1
        for other in self.lsh.query(m):
            ra, rb = self._root(key), self._root(other)
            if ra != rb:
                self.parent[ra] = rb
                self.size[rb] += self.size.pop(ra)
        self.lsh.insert(key, m)
        root = self._root(key)
        return root, self.size[root]


# ---------------------------------------------------------------- A4: MIDAS-R (Bhatia et al., AAAI 2020)
class MidasR:
    """Count-min sketches over edges and both endpoints; chi-square burst score with temporal decay."""

    def __init__(self, rows=4, buckets=1024, decay=0.5, seed=2410):
        rng = np.random.default_rng(seed)
        self.a, self.b = rng.integers(1, 2**31 - 1, rows), rng.integers(0, 2**31 - 1, rows)
        self.cur = {k: np.zeros((rows, buckets)) for k in ("e", "u", "v")}
        self.tot = {k: np.zeros((rows, buckets)) for k in ("e", "u", "v")}
        self.buckets, self.decay, self.tick = buckets, decay, 1

    def _h(self, key):
        return (self.a * (hash(key) & 0x7FFFFFFF) + self.b) % 2147483647 % self.buckets

    def _score(self, k, key):
        h = self._h(key)
        idx = (np.arange(len(h)), h)
        self.cur[k][idx] += 1
        self.tot[k][idx] += 1
        a, s, t = self.cur[k][idx].min(), self.tot[k][idx].min(), self.tick
        return 0.0 if s == 0 or t == 1 else (a - s / t) ** 2 * t * t / (s * (t - 1))

    def advance(self, tick):
        while self.tick < tick:
            for k in self.cur:
                self.cur[k] *= self.decay
            self.tick += 1

    def score(self, u, v):
        return math.log1p(max(self._score("e", (u, v)), self._score("u", u), self._score("v", v)))


# ---------------------------------------------------------------- A5: Hawkes branching ratio
BETA_MIN, BETA_MAX = 1 / 3600, 1.0  # kernel timescale between 1 s and 1 h (keeps n identifiable)
LOG_SPAN = 0.0


def _beta(x):
    return BETA_MIN + (BETA_MAX - BETA_MIN) / (1 + np.exp(-x))


def hawkes_branching(times, horizon=None):
    """MLE of a univariate Hawkes process lambda(t) = mu + n*beta*sum exp(-beta (t - t_i)).

    Returns (n_hat, mu_hat, beta_hat). n_hat = expected children per event: >1 means self-sustaining spread.
    """
    t = np.asarray(sorted(times), float)
    if len(t) < 8:
        return None
    t = t - t[0]
    T = horizon - times[0] if horizon else t[-1] + 1.0
    T = max(T, t[-1] + 1.0)

    def nll(p):
        mu, n, beta = np.exp(p[0]), 3.0 / (1 + np.exp(-p[1])), _beta(p[2])
        a = np.zeros(len(t))
        for i in range(1, len(t)):
            a[i] = math.exp(-beta * (t[i] - t[i - 1])) * (1 + a[i - 1])
        lam = mu + n * beta * a
        comp = mu * T + n * np.sum(1 - np.exp(-beta * (T - t)))
        return comp - np.sum(np.log(lam + 1e-300))

    best = None
    for b0 in (1 / 30, 1 / 300, 1 / 1800):
        r = minimize(nll, [math.log(len(t) / T / 2), -2.0, math.log(b0 / (1 - b0)) - LOG_SPAN], method="Nelder-Mead",
                     options={"maxiter": 400, "xatol": 1e-3, "fatol": 1e-3})
        if best is None or r.fun < best.fun:
            best = r
    mu, n, beta = math.exp(best.x[0]), 3.0 / (1 + math.exp(-best.x[1])), float(_beta(best.x[2]))
    return n, mu, beta


# ---------------------------------------------------------------- A6: conformal p -> e-value -> e-CUSUM
def conformal_p(calib_sorted, s):
    """P(normal score >= s), split-conformal (Bates et al. 2023). calib_sorted ascending."""
    n = len(calib_sorted)
    ge = n - np.searchsorted(calib_sorted, s, side="left")
    return (1 + ge) / (n + 1)


def cauchy_combine(ps):
    """Cauchy combination test (Liu & Xie, JASA 2020): valid combined p under arbitrary dependence (tail)."""
    ps = [min(max(p, 1e-15), 1 - 1e-15) for p in ps if p is not None]
    if not ps:
        return None
    T = np.mean([math.tan((0.5 - p) * math.pi) for p in ps])
    return float(min(1.0, max(1e-15, 0.5 - math.atan(T) / math.pi)))


KAPPAS = (0.05, 0.1, 0.2, 0.5)


def p_to_e(p):
    """Mixture of p-to-e calibrators kappa * p^(kappa-1): a valid e-value (E <= 1 under the null)."""
    return float(np.mean([k * p ** (k - 1) for k in KAPPAS]))


class ECusum:
    """e-CUSUM e-detector (Shin, Ramdas & Rinaldo, arXiv 2203.03532).

    M_t = max(M_{t-1}, 1) * e_t. Alarm when M_t >= c. Under the null (normal traffic, calibrated p-values)
    the average run length to a false alarm is >= c observations. Resets after an alarm.
    """

    def __init__(self, c=1000.0):
        self.c, self.m = c, 1.0

    def update(self, e):
        self.m = max(self.m, 1.0) * e
        if self.m >= self.c:
            peak, self.m = self.m, 1.0
            return True, peak
        return False, self.m


def _selftest():
    rng = np.random.default_rng(0)
    # e-CUSUM: uniform p-values should rarely alarm; tiny p-values must alarm within a few steps.
    d = ECusum(1000)
    false = sum(d.update(p_to_e(p))[0] for p in rng.uniform(size=20000))
    assert false <= 40, false  # ARL >= 1000 -> expect <= ~20 in 20k
    d = ECusum(1000)
    assert any(d.update(p_to_e(1 / 2000))[0] for _ in range(3))
    # Hawkes: a Poisson stream has n ~ 0; a self-exciting cascade has n clearly > 0.5
    pois = np.cumsum(rng.exponential(60, 200))
    assert hawkes_branching(pois)[0] < 0.3
    casc = list(pois[:20]) + list(pois[19] + np.cumsum(rng.exponential(3, 150)))
    assert hawkes_branching(casc)[0] > 0.5
    assert conformal_p(np.arange(99.0), 1000) == 0.01
    print("algos selftest ok", false)


if __name__ == "__main__":
    _selftest()
