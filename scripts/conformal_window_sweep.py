"""usage: python scripts/conformal_window_sweep.py <K> <outdir>
Sweep the rolling-conformal window K: statistics-only detection vs held-out false alarms. Writes to a temp dir."""
import sys, json, functools, contextlib, io
from pathlib import Path
sys.path.insert(0, r"D:\fusionhack")
from bridgewitness import pipeline, algos

OUT = Path(sys.argv[2])
K = int(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
pipeline.ART = OUT
pipeline.RollingConformal = functools.partial(algos.RollingConformal, k=K)
with contextlib.redirect_stdout(io.StringIO()):
    pipeline.main()
m = json.loads((OUT / "metrics.json").read_text())
for f, x in m["feeds"].items():
    print(K, f, "stat_alarms_on_attack", f"{x['stat_alarms_on_attack']}/{x['attack_releases']}", "first_after_s", x["stat_first_alarm_after_s"],
          "heldout_false", f"{x['heldout_false_alarms']}/{x['heldout_normal']}", "exploit", f"{x['attack_flagged_exploit']}/{x['attack_releases']}", "normal_false_exploit", x["normal_false_exploit"])
