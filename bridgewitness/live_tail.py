"""Live tail: real, current Across bridge traffic through the conservation rule.

Each Across deposit record carries both legs (deposit + fill). Rule: value released on the destination
must not exceed value locked on the origin (USD via Across' own prices, decimals from its token list),
with a 1% + $1 tolerance for price noise. Models abstain: no calibration history exists for these routes.
"""
import time
from datetime import datetime

import requests

API = "https://app.across.to/api"
_tokens, _tokens_at = {}, 0.0


def _ts(s):
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()) if s else None


def token_meta():
    global _tokens, _tokens_at
    if time.time() - _tokens_at > 3600 or not _tokens:
        rows = requests.get(f"{API}/swap/tokens", timeout=20).json()
        _tokens = {(int(t["chainId"]), t["address"].lower()): (t["symbol"], int(t["decimals"])) for t in rows}
        _tokens_at = time.time()
    return _tokens


def check(d, meta):
    tin = meta.get((int(d["originChainId"]), d["inputToken"].lower()))
    tout = meta.get((int(d["destinationChainId"]), d["outputToken"].lower()))
    out = {"id": f"across:{d['depositId']}:{d['originChainId']}", "deposit_tx": d.get("depositTxHash"),
           "fill_tx": d.get("fillTx"), "src": d["originChainId"], "dst": d["destinationChainId"],
           "symbol": tin[0] if tin else None, "status": d.get("status"),
           "deposit_ts": _ts(d.get("depositBlockTimestamp")), "fill_ts": _ts(d.get("fillBlockTimestamp")),
           "in_usd": None, "out_usd": None, "verdict": "pending", "reason": None,
           "ml": "abstain: no calibration history for this route"}
    if d.get("status") != "filled":
        dl = _ts(d.get("fillDeadline"))
        out["verdict"] = "overdue" if dl and time.time() > dl else "pending"
        return out
    out["delay_s"] = (out["fill_ts"] or 0) - (out["deposit_ts"] or 0)
    pin, pout = d.get("inputPriceUsd"), d.get("outputPriceUsd")
    if not (tin and tout and pin and pout):
        out["verdict"], out["reason"] = "unknown", "token metadata or price missing"
        return out
    vin = int(d["inputAmount"]) / 10 ** tin[1] * float(pin)
    vout = int(d["outputAmount"]) / 10 ** tout[1] * float(pout)
    out["in_usd"], out["out_usd"] = round(vin, 2), round(vout, 2)
    if vout > vin * 1.01 + 1.0:
        out["verdict"], out["reason"] = "violation", "released value exceeds deposited value"
    else:
        out["verdict"] = "consistent"
    return out


def poll(limit=40):
    meta = token_meta()
    rows = requests.get(f"{API}/deposits", params={"limit": limit}, timeout=20).json()
    return [check(d, meta) for d in rows]


if __name__ == "__main__":
    from collections import Counter
    res = poll()
    print(Counter(r["verdict"] for r in res))
    for r in res[:5]:
        print(r)
