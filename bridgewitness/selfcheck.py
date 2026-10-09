"""Golden checks on the built artifacts. Run after `python -m bridgewitness.pipeline`.

    python -m bridgewitness.selfcheck
"""
import json
from pathlib import Path

import pandas as pd

from .signers import ATTACK_SIGNERS

ART = Path(__file__).parent / "artifacts"


def main():
    m = json.loads((ART / "metrics.json").read_text(encoding="utf-8"))
    F = m["feeds"]
    checks = {
        "ML1 conformal coverage >= 0.98 on test": m["ml1_delay_cqr"]["test_coverage"] >= 0.98,
        "Nomad: 382/382 attack releases are exploits": F["nomad"]["attack_flagged_exploit"] == 382,
        "Ronin: 2/2 attack releases are exploits": F["ronin"]["attack_flagged_exploit"] == 2,
        "Simulated: 38/38 attack releases are exploits (incl. 8-payout slow drain)": F["simulated"]["attack_flagged_exploit"] == F["simulated"]["attack_releases"] == 38,
        "No 'exploit' label on any normal or control release": all(F[f]["normal_false_exploit"] == 0 for f in F),
        "Observed held-out advisory false-alarm rate <= 0.2% on these replays": all(
            (F[f]["heldout_false_alarm_rate"] or 0) <= 2e-3 for f in F),
        "Ronin attacks typed key_compromise": F["ronin"]["types_on_attack"].get("key_compromise") == 2,
        "All Nomad exploit types are non-benign and accounted for": sum(F['nomad']['types_on_attack'].values()) == 382
            and not any(t.startswith('benign') for t in F['nomad']['types_on_attack']),
        "Nomad copycat cluster >= 250 and Hawkes n near-critical (> 0.9)":
            F["nomad"]["max_cluster"] >= 250 and F["nomad"]["max_hawkes_n"] > 0.9,
        "Never 'key compromise' without recovered signatures (Nomad has none)":
            "key_compromise" not in F["nomad"]["types_on_attack"],
        "Statistics alone (no rule) alarm on Nomad's swarm from its first release":
            F["nomad"]["stat_alarms_on_attack"] >= 100 and F["nomad"]["stat_first_alarm_after_s"] == 0,
        "Statistics alone (no rule) catch a Ronin attack payout with 0 held-out Ronin false alarms":
            F["ronin"]["stat_alarms_on_attack"] >= 1 and F["ronin"]["heldout_false_alarms"] == 0,
        "Simulated controls raise nothing": all(not s["types"] for s in F["simulated"]["scenarios"].values()
                                                 if s["truth"] == "control"),
    }
    rep = json.loads((ART / "replay_nomad.json").read_text(encoding="utf-8"))
    first = min(e["ts"] for e in rep["events"] if e.get("level") == "exploit")
    checks["Nomad first exploit at 2022-08-01 21:32:31 UTC"] = str(pd.to_datetime(first, unit="s")) == "2022-08-01 21:32:31"
    checks["Nomad: 0 of 193 normal 1-2 Aug releases flagged"] = not any(
        e.get("level") == "exploit" for e in rep["events"] if e["truth"] == "normal")
    sig = pd.read_parquet(Path(__file__).parent / "data" / "signers.parquet")
    att = sig[sig.is_attack]
    checks["Ronin attack signers = the 5 verified validators"] = len(att) == 2 and all(
        sorted(s.split(",")) == ATTACK_SIGNERS for s in att.signers)
    for k, ok in checks.items():
        print("PASS" if ok else "FAIL", k)
    assert all(checks.values()), "selfcheck failed"
    print(f"selfcheck: {len(checks)}/{len(checks)} passed")


if __name__ == "__main__":
    main()
