"""Scroll smoothness check: frame times while wheel-scrolling a page in Edge (GPU on).
usage: python scripts/scroll_perf.py [url] ; prints median / p95 frame time and long frames (> 34 ms)."""
import json
import sys

from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5180/"
PROBE = """() => { window.__ft = []; let last = performance.now();
  const f = (now) => { window.__ft.push(now - last); last = now; requestAnimationFrame(f); }; requestAnimationFrame(f); }"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=False, args=["--enable-gpu", "--ignore-gpu-blocklist", "--window-position=-2400,0"])
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(3000)
    pg.evaluate(PROBE)
    pg.mouse.move(700, 450)
    for _ in range(60):
        pg.mouse.wheel(0, 120)
        pg.wait_for_timeout(40)
    pg.wait_for_timeout(500)
    d = sorted(pg.evaluate("window.__ft.slice(1)"))
    print(json.dumps({"url": URL, "frames": len(d), "median_ms": round(d[len(d) // 2], 1),
                      "p95_ms": round(d[int(len(d) * .95)], 1), "long_frames": sum(x > 34 for x in d)}))
    b.close()
