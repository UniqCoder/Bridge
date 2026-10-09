"""BridgeWitness API. Streams pre-built replay artifacts and a live Across tail; no heavy work per request.

    uvicorn bridgewitness.api:app --port 8000          (one worker)
"""
import asyncio
import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import live_tail

ART = Path(os.environ.get("BW_ARTIFACTS", Path(__file__).parent / "artifacts"))
FEEDS = ("nomad", "ronin", "simulated")
REPLAYS = {f: json.loads((ART / f"replay_{f}.json").read_text(encoding="utf-8")) for f in FEEDS}
METRICS = json.loads((ART / "metrics.json").read_text(encoding="utf-8"))

app = FastAPI(title="BridgeWitness", version="3.0")
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("BW_ALLOWED_ORIGIN", "*").split(","),
                   allow_methods=["GET"], allow_headers=["*"])
_live = {"at": 0, "rows": [], "error": None}


@app.get("/health")
def health():
    return {"ok": True, "feeds": list(FEEDS), "generated_at": METRICS["generated_at"]}


@app.get("/feeds")
def feeds():
    return [{"feed": f, "label": r["label"], "window": r["window"], "route": r["route"],
             "events": len(r["events"]), "metrics": r["metrics"]} for f, r in REPLAYS.items()]


@app.get("/replay/{feed}")
def replay(feed: str):
    if feed not in REPLAYS:
        raise HTTPException(404, "unknown feed")
    return REPLAYS[feed]


@app.get("/metrics")
def metrics():
    return METRICS


@app.get("/stream/{feed}")
async def stream(feed: str, speed: float = Query(60, ge=1, le=5000), start: int | None = None):
    """Server-Sent Events on the replay clock: one `event` per bridge event, one `tick` per replay minute."""
    if feed not in REPLAYS:
        raise HTTPException(404, "unknown feed")
    r = REPLAYS[feed]
    t0 = start or r["window"][0]
    items = [(e["ts"], "event", e) for e in r["events"] if e["ts"] >= t0] + \
            [(k["t"] + 59, "tick", k) for k in r["ticks"] if k["t"] >= t0]
    items.sort(key=lambda x: (x[0], x[1] == "tick"))

    async def gen():
        wall0 = time.monotonic()
        for ts, kind, payload in items:
            delay = (ts - t0) / speed - (time.monotonic() - wall0)
            if delay > 0:
                await asyncio.sleep(min(delay, 15))
            yield f"event: {kind}\ndata: {json.dumps(payload)}\n\n"
        yield "event: end\ndata: {}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/live")
async def live():
    if time.time() - _live["at"] > 15:  # poll Across at most every 15 s, shared by all viewers
        try:
            _live["rows"] = await asyncio.to_thread(live_tail.poll)
            _live["error"] = None
        except Exception as e:  # upstream down: keep last rows, say so
            _live["error"] = f"Across API unavailable: {type(e).__name__}"
        _live["at"] = time.time()
    rows = _live["rows"]
    counts = {v: sum(r["verdict"] == v for r in rows) for v in ("consistent", "pending", "overdue", "unknown", "violation")}
    return {"source": "Across (app.across.to/api/deposits)", "polled_at": int(_live["at"]), "error": _live["error"],
            "counts": counts, "rows": rows}
