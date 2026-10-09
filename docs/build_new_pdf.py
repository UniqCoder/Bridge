"""Render NEW.md to docs/BridgeWitness-NEW.pdf (markdown -> styled HTML -> headless Edge)."""
import subprocess
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"

md = (ROOT / "NEW.md").read_text(encoding="utf-8")
# Python-Markdown (unlike GitHub) needs a blank line before a list that follows a paragraph line.
is_item = lambda s: s.lstrip().startswith(("- ", "* ")) or s.lstrip()[:3].rstrip(". ").isdigit() and ". " in s[:5]
lines = md.split("\n")
md = "\n".join(l if not (i and is_item(l) and lines[i - 1].strip() and not is_item(lines[i - 1])
                         and not lines[i - 1].startswith(("|", ">", "    "))) else "\n" + l
               for i, l in enumerate(lines))
body = markdown.markdown(md, extensions=["tables", "fenced_code", "toc", "sane_lists"])

CSS = """
@import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=Unbounded:wght@500;700&family=Martian+Mono:wght@400&display=swap');
@page { size: A4; margin: 16mm 15mm 18mm; }
:root { --ink:#1d2126; --mute:#5b636d; --line:#d9dde2; --plate:#f3f4f6; --copper:#b4532a; --patina:#2f7d6d; --brass:#a5822f; }
* { box-sizing: border-box; }
body { font-family: 'Instrument Sans', 'Segoe UI', sans-serif; color: var(--ink); font-size: 10.2pt; line-height: 1.55; margin: 0; background:#fff; }
.cover { height: 260mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always;
         border-left: 6px solid var(--copper); padding-left: 14mm; }
.cover .kicker { font-family: 'Martian Mono', monospace; font-size: 8.5pt; letter-spacing: .12em; text-transform: uppercase; color: var(--copper); }
.cover h1 { font-family: 'Unbounded', sans-serif; font-size: 40pt; margin: 6mm 0 4mm; letter-spacing: -.02em; border: 0; }
.cover .sub { font-size: 15pt; color: var(--mute); max-width: 140mm; }
.cover .line { margin-top: 14mm; font-size: 13pt; } .cover .line b { color: var(--patina); } .cover .line i { color: var(--copper); font-style: normal; font-weight: 700; }
.cover .meta { margin-top: 30mm; font-family: 'Martian Mono', monospace; font-size: 8pt; color: var(--mute); line-height: 1.9; }
h1 { font-family: 'Unbounded', sans-serif; font-size: 20pt; margin: 0 0 2mm; }
h2 { font-family: 'Unbounded', sans-serif; font-size: 14pt; margin: 9mm 0 3mm; padding-bottom: 2mm; border-bottom: 2px solid var(--copper); page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 6mm 0 2mm; color: var(--patina); page-break-after: avoid; }
p, li { orphans: 3; widows: 3; }
a { color: var(--patina); text-decoration: none; }
blockquote { margin: 3mm 0; padding: 3mm 5mm; background: var(--plate); border-left: 3px solid var(--brass); color: var(--ink); }
blockquote p { margin: 1mm 0; }
table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 8.8pt; page-break-inside: auto; }
tr { page-break-inside: avoid; }
th { background: var(--ink); color: #fff; text-align: left; padding: 2mm 2.4mm; font-weight: 600; }
td { padding: 1.8mm 2.4mm; border-bottom: 1px solid var(--line); vertical-align: top; }
tbody tr:nth-child(even) td { background: #fafafb; }
code { font-family: 'Martian Mono', Consolas, monospace; font-size: 8pt; background: var(--plate); padding: .3mm 1.2mm; border-radius: 2px; }
pre { background: #1d2126; color: #e8e6e1; padding: 4mm; border-radius: 3px; font-size: 7.2pt; line-height: 1.35; overflow: hidden; page-break-inside: avoid; }
pre code { background: none; color: inherit; padding: 0; font-size: 7.2pt; }
hr { border: 0; border-top: 1px solid var(--line); margin: 6mm 0; }
"""

# Drop the markdown title block (the cover replaces it).
body = body.split("<hr />", 1)[1] if "<hr />" in body else body
cover = """
<section class="cover">
  <div class="kicker">CSB-01 · Real-Time Detection of Cross-Chain Bridge Exploits · Chainalysis</div>
  <h1>BridgeWitness</h1>
  <div class="sub">Real-time detection of cross-chain bridge exploits, accusing only with proof.</div>
  <div class="line"><b>Signatures can be stolen.</b> <i>Conservation can't.</i></div>
  <div class="meta">Prototype specification · locked 9 October 2026<br/>
  4 unique ideas · 3 ML models · 6 algorithms · real Nomad &amp; Ronin data · live bridge tail<br/>
  Backend: Docker on Render (&lt; 512 MB) · Frontend: Vercel</div>
</section>"""

html = f"<!doctype html><html><head><meta charset='utf-8'><title>BridgeWitness Prototype</title><style>{CSS}</style></head><body>{cover}{body}</body></html>"
out_html = ROOT / "docs" / "BridgeWitness-NEW.html"
out_pdf = ROOT / "docs" / "BridgeWitness-NEW.pdf"
out_html.write_text(html, encoding="utf-8")
subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=8000",
                f"--print-to-pdf={out_pdf}", out_html.as_uri()], check=True, timeout=120)
print("wrote", out_pdf, out_pdf.stat().st_size, "bytes")
