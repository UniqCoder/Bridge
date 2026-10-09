"""Across API lifecycle viewer; prices are display-only, not backing or finality proofs."""
import time
from decimal import Decimal, InvalidOperation
from datetime import datetime

import requests

API = "https://app.across.to/api"
_tokens, _tokens_at = {}, 0.0


def _ts(s):
    if not s:
        return None
    try:
        return int(datetime.fromisoformat(s.replace('Z', '+00:00')).timestamp())
    except (ValueError, AttributeError):
        return None


def token_meta():
    global _tokens, _tokens_at
    if time.time() - _tokens_at > 3600 or not _tokens:
        response = requests.get(f'{API}/swap/tokens', timeout=20)
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list):
            raise ValueError('unexpected token response')
        _tokens = {(int(t["chainId"]), t["address"].lower()): (t["symbol"], int(t["decimals"])) for t in rows}
        _tokens_at = time.time()
    return _tokens


def check(d, meta):
    tin = meta.get((int(d["originChainId"]), d["inputToken"].lower()))
    tout = meta.get((int(d["destinationChainId"]), d["outputToken"].lower()))
    out = {"id": f"across:{d['depositId']}:{d['originChainId']}", "deposit_tx": d.get('depositTxnRef') or d.get("depositTxHash"),
           "fill_tx": d.get('fillTxnRef') or d.get("fillTx"), "src": d["originChainId"], "dst": d["destinationChainId"],
           "symbol": tin[0] if tin else None, "status": d.get("status"),
           "deposit_ts": _ts(d.get("depositBlockTimestamp")), "fill_ts": _ts(d.get("fillBlockTimestamp")),
           "in_usd": None, "out_usd": None, "verdict": "pending", "reason": None,
           "ml": "abstain: no calibration history for this route",
           "evidence_mode": "upstream_api_only", "backing_verified": False}
    if d.get('status') == 'refunded':
        out['verdict'] = 'refunded'
        return out
    if d.get("status") != "filled":
        dl = _ts(d.get("fillDeadline"))
        out["verdict"] = "overdue" if dl and time.time() > dl else "pending"
        return out
    if out['fill_ts'] is None or out['deposit_ts'] is None or not out['deposit_tx'] or not out['fill_tx']:
        out['verdict'], out['reason'] = 'unknown', 'filled record lacks transaction references or timestamps'
        return out
    out['delay_s'] = out['fill_ts'] - out['deposit_ts']
    out['verdict'], out['reason'] = 'reported_filled', 'fill reported by Across; chain finality and backing not independently verified'
    pin, pout = d.get("inputPriceUsd"), d.get("outputPriceUsd")
    if not (tin and tout and pin and pout):
        return out
    try:
        vin = Decimal(str(d['inputAmount'])) / (Decimal(10) ** tin[1]) * Decimal(str(pin))
        vout = Decimal(str(d['outputAmount'])) / (Decimal(10) ** tout[1]) * Decimal(str(pout))
        if vin.is_finite() and vout.is_finite() and vin >= 0 and vout >= 0:
            out['in_usd'], out['out_usd'] = round(float(vin), 2), round(float(vout), 2)
    except (InvalidOperation, ValueError, KeyError, OverflowError):
        pass  # Prices affect the display only; API records cannot prove a backing violation.
    return out


def poll(limit=40):
    meta = token_meta()
    response = requests.get(f'{API}/deposits', params={'limit': limit}, timeout=20)
    response.raise_for_status()
    rows = response.json()
    if not isinstance(rows, list):
        raise ValueError('unexpected deposits response')
    checked = []
    for d in rows:
        try:
            checked.append(check(d, meta))
        except (KeyError, TypeError, ValueError):
            continue  # A malformed upstream row cannot disable the other transfers.
    return checked


if __name__ == "__main__":
    from collections import Counter
    res = poll()
    print(Counter(r["verdict"] for r in res))
    for r in res[:5]:
        print(r)
