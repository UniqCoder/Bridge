"""Unify the Nomad and Ronin CSVs into one deposit/withdrawal event table.

Normal CSVs hold matched pairs (both legs); attack CSVs hold destination-side releases only.
Event identity is (tx_hash, ordinal within tx): Nomad copycats batch several releases per tx
and reuse real message ids, so withdrawal_id is NOT an identity.
"""
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"

# Token symbols + decimals for the tokens that appear in the datasets (display only; rules use raw units).
TOKENS = {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": ("USDC", 6), "0xdac17f958d2ee523a2206206994597c13d831ec7": ("USDT", 6),
    "0x6b175474e89094c44da98b954eedeac495271d0f": ("DAI", 18), "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": ("WBTC", 8),
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": ("WETH", 18), "0x853d955acef822db058eb8505911ed77f175b99e": ("FRAX", 18),
    "0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0": ("FXS", 18), "0xbb0e17ef65f82ab018d8edd776e8dd940327b28b": ("AXS", 18),
    "0xcc8fa225d80b9c7d42f96e9570156c65d6caaa25": ("SLP", 0), "0x8a9c67fee641579deba04928c4bc45f66e26343a": ("JRT", 18),
    "0xb8c77482e45f1f44de1745f52c74426c631bdd52": ("BNB", 18), "0xd417144312dbf50465b1c641d016962017ef6240": ("CQT", 18),
    "0x3d6f0dea3ac3c607b3998e6ce14b6350721752d9": ("CARDS", 18), "0x9ed8e7c9604790f7ec589f99b94361d8aab64e5e": ("unknown", 18),
}
FEEDS = {"nomad": {"route": "nomad:moonbeam→ethereum", "src": "Moonbeam", "dst": "Ethereum"},
         "ronin": {"route": "ronin:ronin→ethereum", "src": "Ronin", "dst": "Ethereum"}}


def _sym(addr):
    return TOKENS.get(str(addr).lower(), (str(addr)[:8], 18))


def load_pairs(feed):
    df = pd.read_csv(RAW / f"{feed}_normal.csv", dtype={"amount": str, "withdrawal_id": str})
    df = df.rename(columns={"orig_timestamp": "dep_ts", "dst_timestamp": "ts"})
    df["feed"] = feed
    df["delay"] = df.ts - df.dep_ts
    df["token"] = df.dst_token.str.lower()
    df["symbol"] = df.token.map(lambda a: _sym(a)[0])
    return df.sort_values(["ts", "dst_tx_hash"]).reset_index(drop=True)


def load_events(feed):
    """Event stream for one feed: deposits (source leg) + withdrawals (destination leg), time-ordered."""
    pairs = load_pairs(feed)
    att = pd.read_csv(RAW / f"{feed}_attack.csv", dtype={"amount": str, "withdrawal_id": str})
    att = att.rename(columns={"dst_timestamp": "ts"})
    common = lambda d: dict(feed=feed, token=d.dst_token.str.lower(), amount=d.amount, value_usd=d.value_usd,
                            msg_id=d.withdrawal_id, recipient=d.beneficiary.str.lower())
    dep = pd.DataFrame(dict(**common(pairs), ts=pairs.dep_ts, kind="deposit", tx=pairs.orig_tx_hash,
                            chain=pairs.orig_chain_id, truth="normal"))
    wdr = pd.DataFrame(dict(**common(pairs), ts=pairs.ts, kind="withdrawal", tx=pairs.dst_tx_hash,
                            chain=pairs.dst_chain_id, truth="normal"))
    atk = pd.DataFrame(dict(**common(att), ts=att.ts, kind="withdrawal", tx=att.dst_transaction_hash,
                            chain=att.dst_chain_id, truth="attack"))
    ev = pd.concat([dep, wdr, atk], ignore_index=True)
    ev["symbol"] = ev.token.map(lambda a: _sym(a)[0])
    ev["decimals"] = ev.token.map(lambda a: _sym(a)[1])
    ev["route"] = FEEDS[feed]["route"]
    ev = ev.sort_values(["ts", "kind", "tx"], kind="stable").reset_index(drop=True)
    ev["ordinal"] = ev.groupby(["tx", "kind"]).cumcount()
    ev["event_id"] = ev.tx + ":" + ev.kind.str[0] + ev.ordinal.astype(str)
    return ev


if __name__ == "__main__":
    for f in FEEDS:
        ev = load_events(f)
        w = ev[ev.kind == "withdrawal"]
        print(f, len(ev), "events |", (w.truth == "attack").sum(), "attack withdrawals |",
              w[w.truth == "attack"].tx.nunique(), "attack txs | symbols", sorted(ev.symbol.unique())[:12])
