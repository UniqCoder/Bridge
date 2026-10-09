"""Signer DNA data: recover the real validator quorum of Ronin withdrawals from public calldata.

Ronin MainchainGateway `withdrawERC20For(uint256 id, address user, address token, uint256 amount, bytes sigs)`,
selector 0x993e1c42. `sigs` = N x 66 bytes (type | r | s | v), each over
keccak("\\x19Ethereum Signed Message:\\n32" || keccak(encodePacked("withdrawERC20", id, user, token, amount))).

Usage:  python -m bridgewitness.signers            # verify attack quorum, then fetch a stratified sample
        python -m bridgewitness.signers --check    # attack txs only
"""
import json, sys, time
from pathlib import Path

import pandas as pd
import requests
from eth_keys import keys
from eth_utils import keccak

RPC = "https://eth.drpc.org"
SELECTOR = "993e1c42"
ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "signers.parquet"
ATTACK_SIGNERS = sorted(a.lower() for a in [
    "0x11360EaCDEDd59bC433aFad4fc8f0417d1fbEbab", "0x1A15a5E25811FE1349d636a5053A0e59d53961C9",
    "0x70bB1FB41C8C42F6ddd53a708E2B82209495e455", "0xB9e59D56fd1632FC250935182BDd5C59188b2302",
    "0xf224beFf587362A88D859e899D0d80C080E1e812"])


def rpc_batch(hashes):
    body = [{"jsonrpc": "2.0", "id": i, "method": "eth_getTransactionByHash", "params": [h]} for i, h in enumerate(hashes)]
    for attempt in range(5):
        try:
            r = requests.post(RPC, json=body, timeout=30)
            r.raise_for_status()
            res = r.json()
            if isinstance(res, list):
                return {x["id"]: x.get("result") for x in res}
        except Exception as e:  # throttled / network: back off
            print("rpc retry", attempt, e, file=sys.stderr)
        time.sleep(2 ** attempt)
    return {}


def decode(tx):
    """Return dict with withdrawal fields + recovered signers, or None if not a withdrawERC20For call."""
    data = bytes.fromhex(tx["input"][2:])
    if data[:4].hex() != SELECTOR:
        return None
    w = lambda i: data[4 + 32 * i: 4 + 32 * (i + 1)]
    wid, amount = int.from_bytes(w(0), "big"), int.from_bytes(w(3), "big")
    user, token = w(1)[12:], w(2)[12:]
    off = 4 + int.from_bytes(w(4), "big")
    n = int.from_bytes(data[off:off + 32], "big")
    sigs = data[off + 32: off + 32 + n]
    inner = keccak(b"withdrawERC20" + wid.to_bytes(32, "big") + user + token + amount.to_bytes(32, "big"))
    digest = keccak(b"\x19Ethereum Signed Message:\n32" + inner)
    signers = []
    for k in range(0, len(sigs), 66):
        s = sigs[k:k + 66]
        r_, s_, v = int.from_bytes(s[1:33], "big"), int.from_bytes(s[33:65], "big"), s[65]
        try:
            signers.append(keys.Signature(vrs=(v - 27, r_, s_)).recover_public_key_from_msg_hash(digest).to_checksum_address().lower())
        except Exception:
            signers.append("invalid")
    return {"withdrawal_id": wid, "user": "0x" + user.hex(), "token": "0x" + token.hex(), "amount": str(amount),
            "signers": ",".join(signers), "n_signers": len(signers)}


def fetch(hashes, batch=3):
    rows = []
    for i in range(0, len(hashes), batch):
        res = rpc_batch(hashes[i:i + batch])
        for j, h in enumerate(hashes[i:i + batch]):
            tx = res.get(j)
            if tx and tx.get("input"):
                d = decode(tx)
                if d:
                    rows.append({"tx_hash": h, "block": int(tx["blockNumber"], 16), **d})
        if i // batch % 50 == 0:
            print(f"{i + batch}/{len(hashes)} fetched, {len(rows)} decoded", flush=True)
        time.sleep(0.15)
    return rows


def check_attack():
    att = pd.read_csv(RAW / "ronin_attack.csv")
    rows = fetch(list(att.dst_transaction_hash))
    for r in rows:
        got = sorted(r["signers"].split(","))
        print(r["tx_hash"][:12], r["withdrawal_id"], got)
        assert got == ATTACK_SIGNERS, "attack quorum mismatch"
    assert len(rows) == 2
    print("attack quorum verified: 5/9 validators, both txs")
    return rows


def main(sample_per_month=1400, seed=2410):
    attack = check_attack()
    if "--check" in sys.argv:
        return
    df = pd.read_csv(RAW / "ronin_normal.csv", usecols=["dst_timestamp", "dst_tx_hash", "value_usd"])
    df["month"] = pd.to_datetime(df.dst_timestamp, unit="s").dt.month
    sample = (df.groupby("month", group_keys=False)
                .apply(lambda g: g.sample(min(len(g), sample_per_month), random_state=seed))
                .sort_values("dst_timestamp"))
    rows = []
    hashes = list(sample.dst_tx_hash)
    for i in range(0, len(hashes), 400):  # checkpoint so a partial fetch is still usable
        rows += fetch(hashes[i:i + 400])
        out = pd.DataFrame(rows + [{**r, "is_attack": True} for r in attack])
        out["is_attack"] = out.get("is_attack", False).fillna(False).astype(bool)
        out.to_parquet(OUT, index=False)
    print("wrote", OUT, len(rows), "normal +", len(attack), "attack")


if __name__ == "__main__":
    main()

