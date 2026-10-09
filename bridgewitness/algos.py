"""The six deterministic algorithms (no training).

A1 conservation ledger + rule verdicts   A2 exact message pairing    A3 MinHash-LSH copycat clusters
A4 MIDAS-R edge-stream bursts            A5 Hawkes branching ratio   A6 conformal p -> e-values (averaged) -> e-CUSUM alarm
"""
import math
import hashlib
from collections import defaultdict

import numpy as np
from datasketch import MinHash, MinHashLSH
from scipy.optimize import minimize
from scipy.special import expit

# ---------------------------------------------------------------- A1 + A2: pairing and conservation ledger
def assess_release(release, authorizations, previous_releases, source_complete=False):
    """Exact one-deposit/one-release route rule; an observer must explicitly supply coverage."""
    def amount(e):
        s = e['amount']
        if not isinstance(s, str) or not s.isascii() or not s.isdecimal() or int(s) >= 2**256:
            raise ValueError('amount must be a uint256 decimal string')
        return int(s)
    amount(release)
    if release.get('finalized') is False:
        return 'pending', 'destination_not_finalized', None
    key = tuple(release[k] for k in ('route', 'token', 'msg_id'))
    auth = [d for d in authorizations if tuple(d[k] for k in ('route', 'token', 'msg_id')) == key
            and d['ts'] <= release['ts'] and d.get('finalized') is not False]
    if not auth:
        return ('violation', 'missing_source_deposit', None) if source_complete else ('unknown', 'source_history_incomplete', None)
    if len(auth) != 1:
        return 'unknown', 'ambiguous_source_deposits', None
    d = auth[0]
    if amount(release) != amount(d):
        return 'violation', 'amount_mismatch', d['event_id']
    if release['recipient'].lower() != d['recipient'].lower():
        return 'violation', 'recipient_mismatch', d['event_id']
    if any(p.get('matched') == d['event_id'] and p.get('status') == 'consistent'
           and p['ts'] <= release['ts'] and p['event_id'] != release['event_id'] for p in previous_releases):
        return 'violation', 'message_replayed', d['event_id']
    return 'consistent', None, d['event_id']


def pair_and_ledger(ev, window_fn, source_complete=False):
    """Causal pairing by route/token/message; learned timing is advisory, never authorization."""
    if not ev.ts.is_monotonic_increasing or ev.event_id.duplicated().any():
        raise ValueError('events must be time-ordered with unique identities')
    out = {k: [None] * len(ev) for k in ("status", "rule", "matched", "delay", "win_lo", "win_hi")}
    w_idx = np.where(ev.kind.values == "withdrawal")[0]
    lo_all, hi_all = window_fn(ev.iloc[w_idx])
    win = {i: (lo, hi) for i, lo, hi in zip(w_idx, lo_all, hi_all)}
    deposits, used = defaultdict(list), defaultdict(list)
    for i, r in enumerate(ev.to_dict('records')):
        key = tuple(r[k] for k in ('route', 'token', 'msg_id'))
        if r['kind'] == 'deposit':
            deposits[key].append(r)
            out['status'][i] = 'deposit'
            continue
        lo, hi = win[i]
        if not (math.isfinite(lo) and math.isfinite(hi) and 0 <= lo <= hi):
            raise ValueError('invalid delay window')
        out['win_lo'][i], out['win_hi'][i] = float(lo), float(hi)
        status, rule, matched = assess_release(r, deposits[key], used[key], source_complete)
        out['status'][i], out['rule'][i], out['matched'][i] = status, rule, matched
        if matched:
            d = next(d for d in deposits[key] if d['event_id'] == matched)
            out['delay'][i] = float(r['ts'] - d['ts'])
            if status == 'consistent' and not lo <= out['delay'][i] <= hi:
                out['rule'][i] = 'outside_usual_delay'
        used[key].append({**r, 'matched': matched, 'status': status})
    return out


def risk_score(status, rule, usd, p_comb, cluster_size=1, alarm=False):
    """Operator priority, not an exploit probability. ML never changes the rule verdict."""
    if status not in ('consistent', 'violation'):
        return {'base': 0, 'exposure': 0, 'campaign': 0, 'behavior': 0, 'total': 0}
    p = p_comb if p_comb is not None and math.isfinite(p_comb) and 0 < p_comb <= 1 else 1
    surprise = min(1.0, -math.log10(p) / 3)
    if status == 'violation':
        base = {'message_replayed': 85, 'missing_source_deposit': 80,
                'recipient_mismatch': 75, 'amount_mismatch': 70}.get(rule, 70)
        exposure = round(min(15, 2.5 * math.log10(1 + usd))) if usd is not None and math.isfinite(usd) and usd >= 0 else 0
        campaign = 5 if cluster_size >= 5 else 0
        behavior = round(5 * surprise)
    else:
        base, exposure, campaign = 20 if alarm else 0, 0, 0
        behavior = round(49 * surprise)
    return {'base': base, 'exposure': exposure, 'campaign': campaign,
            'behavior': behavior, 'total': min(100 if status == 'violation' else 69, base + exposure + campaign + behavior)}


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
        self.num_perm, self.threshold, self.parent, self.times, self.sig = num_perm, threshold, {}, {}, {}

    def _root(self, k):
        while self.parent[k] != k:
            self.parent[k] = self.parent[self.parent[k]]
            k = self.parent[k]
        return k

    def add(self, key, sh, ts, window=7200):
        """Insert a release; returns (cluster id, members seen in the last `window` seconds).
        LSH candidates are verified (estimated Jaccard >= threshold) before merging, so chance
        collisions cannot chain unrelated releases into one giant cluster."""
        m = MinHash(num_perm=self.num_perm, seed=2410)
        for x in sh:
            m.update(x.encode())
        self.parent[key], self.times[key] = key, [ts]
        for other in self.lsh.query(m):
            if m.jaccard(self.sig[other]) < self.threshold:
                continue
            ra, rb = self._root(key), self._root(other)
            if ra != rb:
                self.parent[ra] = rb
                self.times[rb] += self.times.pop(ra)
        self.lsh.insert(key, m)
        self.sig[key] = m
        root = self._root(key)
        tl = self.times[root] = [x for x in self.times[root] if x > ts - window]
        return root, len(tl)


# ---------------------------------------------------------------- A4: MIDAS-R (Bhatia et al., AAAI 2020)
class MidasR:
    """MIDAS-R edge scoring with a count-min sketch: chi-square burst score with temporal decay.

    Only the edge sketch is kept (see score()). Width 65,536 keeps collisions negligible for the
    ~10^4-10^5 distinct (message, token) edges a bridge sees, so "seen before" is not a hash artefact."""

    def __init__(self, rows=4, buckets=65536, decay=0.5, seed=2410):
        rng = np.random.default_rng(seed)
        self.a, self.b = rng.integers(1, 2**31 - 1, rows), rng.integers(0, 2**31 - 1, rows)
        self.cur, self.tot = np.zeros((rows, buckets)), np.zeros((rows, buckets))
        self.buckets, self.decay, self.tick = buckets, decay, 1

    def _idx(self, key):
        stable = int.from_bytes(hashlib.blake2s(repr(key).encode(), digest_size=4).digest(), 'big') & 0x7FFFFFFF
        h = (self.a * stable + self.b) % 2147483647 % self.buckets
        return np.arange(len(h)), h

    def advance(self, tick):
        if tick > self.tick:  # decay once for the whole jump (identical to per-tick decay)
            self.cur *= self.decay ** (tick - self.tick)
            self.tick = tick

    def score(self, u, v):
        """Repeat-edge burst: an edge scores only once it repeats. (A first-seen edge scores ~t in MIDAS,
        and node scores on sparse streams track the traffic level; both drift, so they are not used.)"""
        idx = self._idx((u, v))
        self.cur[idx] += 1
        self.tot[idx] += 1
        a, s, t = self.cur[idx].min(), self.tot[idx].min(), self.tick
        if s <= 1 or t == 1:
            return 0.0
        return math.log1p((a - s / t) ** 2 * t * t / (s * (t - 1)))


# ---------------------------------------------------------------- A5: Hawkes branching ratio
BETA_MIN, BETA_MAX = 1 / 3600, 1.0  # kernel timescale between 1 s and 1 h (keeps n identifiable)
LOG_SPAN = 0.0


def _beta(x):
    return BETA_MIN + (BETA_MAX - BETA_MIN) * expit(x)


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
        mu, n, beta = np.exp(np.clip(p[0], -30, 30)), 3.0 * expit(p[1]), _beta(p[2])
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
    mu, n, beta = math.exp(np.clip(best.x[0], -30, 30)), 3.0 * expit(best.x[1]), float(_beta(best.x[2]))
    return n, mu, beta


# ---------------------------------------------------------------- A6: conformal p -> e-value -> e-CUSUM
def conformal_p(calib_sorted, s):
    """P(normal score >= s), split-conformal (Bates et al. 2023). calib_sorted ascending."""
    n = len(calib_sorted)
    ge = n - np.searchsorted(calib_sorted, s, side="left")
    return (1 + ge) / (n + 1)


class RollingConformal:
    """Split-conformal p-values against the most recent K calibration scores (sliding window).
    Handles slow drift; only releases the deterministic rule found BACKED enter the window, so an attacker's
    unbacked releases can never poison the notion of "normal"."""

    def __init__(self, k=2000, warmup=200):
        from collections import deque
        self.k, self.warmup, self.q, self.sorted = k, warmup, deque(), []

    def p(self, s):
        import bisect
        n = len(self.sorted)
        if n < self.warmup or s is None:
            return None
        ge = n - bisect.bisect_left(self.sorted, s)
        return (1 + ge) / (n + 1)

    def add(self, s):
        import bisect
        self.q.append(s)
        bisect.insort(self.sorted, s)
        if len(self.q) > self.k:
            old = self.q.popleft()
            self.sorted.pop(bisect.bisect_left(self.sorted, old))


KAPPAS = (0.05, 0.1, 0.2, 0.5)


def p_to_e(p):
    """Mixture of p-to-e calibrators kappa * p^(kappa-1): a valid e-value (E <= 1 under the null)."""
    return float(np.mean([k * p ** (k - 1) for k in KAPPAS]))


def e_mean(ps):
    """Combine signals by averaging their e-values (Vovk & Wang, Ann. Stat. 2021): the mean of e-values is an
    e-value under ANY dependence, and an uninformative signal (p ~ 1) adds ~0 instead of cancelling evidence.
    Returns (e, p) with p = min(1, 1/e) (Markov), used for display and the risk score."""
    es = [p_to_e(max(p, 1e-15)) for p in ps if p is not None and math.isfinite(p) and 0 < p <= 1]
    if not es:
        return None, None
    e = float(np.mean(es))
    return e, min(1.0, 1.0 / e)


class ECusum:
    """e-CUSUM e-detector (Shin, Ramdas & Rinaldo, arXiv 2203.03532).

    M_t = max(M_{t-1}, 1) * e_t. Alarm when M_t >= c. Under the null (normal traffic, calibrated p-values)
    the average run length to a false alarm is >= c observations. Resets after an alarm.
    """

    def __init__(self, c=1000.0):
        self.c, self.m = c, 1.0

    def update(self, e):
        # Missing evidence is neutral (e = 1). A NaN must never reach the statistic: max(NaN, 1) is NaN,
        # which would silently disable the detector for the rest of the stream.
        if e is None or not math.isfinite(e):
            e = 1.0
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
    d = ECusum(1000)
    d.update(float("nan"))
    assert any(d.update(p_to_e(1 / 2000))[0] for _ in range(3)), "NaN must not disable the detector"
    # e-value mean: E[e] <= 1 under the null even with perfectly dependent signals; p ~ 1 cannot cancel evidence
    u = rng.uniform(size=20000)
    assert np.mean([e_mean([p, p, p])[0] for p in u]) < 1.1
    assert e_mean([3.8e-4] * 3 + [1.0, 1.0, 0.066])[1] < 0.05
    print("algos selftest ok", false)


if __name__ == "__main__":
    _selftest()
