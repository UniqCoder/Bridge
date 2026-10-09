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
_origins = [o.strip() for o in os.environ.get("BW_ALLOWED_ORIGIN", "*").split(",") if o.strip()]
# Render passes a bare host name between services; turn it into an https origin.
_origins = [o if o == "*" or o.startswith("http") else f"https://{o}" for o in _origins]
app.add_middleware(CORSMiddleware, allow_origins=_origins,
                   allow_methods=["GET"], allow_headers=["*"])
_live = {'at': 0, 'successful_at': 0, 'rows': [], 'error': None}
_live_lock = asyncio.Lock()


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
    t0 = r['window'][0] if start is None else start
    if not r['window'][0] <= t0 <= r['window'][1]:
        raise HTTPException(400, 'start is outside replay window')
    items = [(e["ts"], "event", e) for e in r["events"] if e["ts"] >= t0] + \
            [(k["t"] + 59, "tick", k) for k in r["ticks"] if k["t"] >= t0]
    items.sort(key=lambda x: (x[0], x[1] == "tick"))

    async def gen():
        wall0 = time.monotonic()
        for ts, kind, payload in items:
            while (delay := (ts - t0) / speed - (time.monotonic() - wall0)) > 0:
                await asyncio.sleep(min(delay, 15))
                if delay > 15:
                    yield ': heartbeat\n\n'
            yield f"event: {kind}\ndata: {json.dumps(payload)}\n\n"
        yield "event: end\ndata: {}\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/live")
async def live():
    async with _live_lock:
        if time.time() - _live['at'] > 15:
            try:
                _live['rows'] = await asyncio.to_thread(live_tail.poll)
                _live['error'] = None
                _live['successful_at'] = time.time()
            except Exception as e:
                _live['error'] = f'Across API unavailable: {type(e).__name__}; retained rows are stale'
            _live['at'] = time.time()
    rows = _live["rows"]
    counts = {v: sum(r['verdict'] == v for r in rows) for v in ('reported_filled', 'pending', 'overdue', 'unknown', 'refunded')}
    return {"source": "Across (app.across.to/api/deposits)", "polled_at": int(_live['successful_at']), "attempted_at": int(_live['at']), "error": _live["error"],
            "counts": counts, "rows": rows}
