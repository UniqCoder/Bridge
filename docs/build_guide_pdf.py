"""Build docs/BridgeWitness-Prototype-Guide.pdf: a plain-English, page-by-page tour of the prototype.
Needs docs/shots/*.png (scripts/shots.ps1) and headless Edge."""
import base64
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "shots"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"


def img(name: str) -> str:
    f = SHOTS / f"{name}.png"
    if not f.exists():
        return ""
    return f'<img src="data:image/png;base64,{base64.b64encode(f.read_bytes()).decode()}" alt="{name}"/>'


def page(title, url, what, steps, why, shot, note=""):
    li = "".join(f"<li>{s}</li>" for s in steps)
    return f"""
<section class="pg">
  <div class="kick">Page · {url}</div>
  <h2>{title}</h2>
  <p class="what">{what}</p>
  <div class="shot">{img(shot)}</div>
  <div class="cols">
    <div><h3>What you can do here</h3><ol>{li}</ol></div>
    <div><h3>Why it matters</h3><p>{why}</p>{f'<p class="note">{note}</p>' if note else ''}</div>
  </div>
</section>"""


PAGES = [
    page("Landing page", "/", "The front door. It explains the problem in one screen and proves the result with three numbers.",
         ["Read the headline: catch a bridge hack while it is happening, and only accuse with proof.",
          "Watch the 3D map on the right replay the real Nomad hack. Drag it to turn it around.",
          "Read the three proof numbers: 384 of 384 real attack payouts caught, 0 honest payouts wrongly accused (out of 27,312), and $159.6M traced to no deposit.",
          "Scroll to Key features, Why this matters, the four ideas and the five-step explanation. Every tile is a link to the page that shows it working."],
         "A judge sees the whole product in under a minute: what a bridge is, why hacks happen, what we built, and the evidence.",
         "landing", "The numbers come straight from the measured results file, not typed in by hand."),
    page("Live console", "/console/live", "The main dashboard. It replays a real hack (or a made-up practice attack, or a real bridge right now) and shows alerts as they appear.",
         ["Pick a feed at the top: Nomad hack, Ronin hack, Practice attacks, or A real bridge right now.",
          "Press Play. Every payout on the destination chain is checked against the deposits made on the source chain.",
          "The replay stops at the first alert. The alert card shows a risk score from 0 to 100, the attack type, and the top reasons.",
          "Use the 3D map / Network switch to see the money flow as a 3D scene or as a labelled diagram.",
          "Read the three charts under the map: money in versus money out, is the attack spreading, and the alarm evidence."],
         "This answers the challenge brief directly: a dashboard over a live or replayed feed that flags volume spikes, unusual signers and mismatched pairs, with a risk-scored alert and the suspected exploit type.",
         "live", "The 'real bridge right now' feed uses the public Across API and only runs the simple deposit rule. Our learned models say 'not enough history' there instead of guessing."),
    page("3D map", "/console/map", "The same replay as a 3D scene, built to be understood at a glance.",
         ["Left block of squares: the source chain, where deposits are made. Right block: the destination chain, where payouts are made.",
          "The glowing cube in the middle is the bridge vault. Teal packets are money that has a deposit behind it.",
          "When a payout has no deposit, the vault turns copper, flashes BREACH, and copper packets stream out to the right.",
          "The three numbers at the bottom keep score: money in, paid out with a deposit, paid out with no deposit.",
          "Click any dot on the right to open its alert card. Drag to orbit, scroll to zoom."],
         "It turns an abstract idea (coins out must never exceed coins in) into something anyone can see. The no-deposit total jumping to $126.9M is the hack.",
         "map"),
    page("Idea 1 · Accusation Budget", "/console/budget", "Our answer to false alarms. Many tools shout whenever one number looks big. We only accuse when the evidence adds up, and we measure how often we are wrong.",
         ["Choose Nomad or Ronin, then pick a payout (an everyday one, the biggest honest one, the first attack, a later attack).",
          "Step 1 shows how unusual each warning sign is compared with recent normal traffic.",
          "Step 2 adds the signs into one evidence score. Several weak signs add up; one noisy sign barely moves it.",
          "Step 3 asks whether the deposit rule broke. Only a broken rule can produce the word EXPLOIT."],
         "On days of normal traffic the model had never seen, there were 0 false alarms out of 1,826 payouts on Nomad. Statistics alone can only say 'suspicious'; the rule makes the final call.",
         "budget"),
    page("Idea 2 · Contagion Radar", "/console/contagion", "Detects whether an attack is spreading by itself, the way an outbreak does.",
         ["Drag the time slider through the Nomad hack and watch the chart.",
          "The orange area is money released with no deposit. The yellow line is the spread number (n-hat).",
          "Near or above 1 means each stolen payout is causing about one more, so the attack will keep going on its own.",
          "Copy-paste payouts are grouped into one cluster by fingerprinting each payout with the address hidden."],
         "Nomad was not one theft. One person found a bug and hundreds of copycats pasted the same transaction. Size alerts see many small payments; we see a swarm. The biggest cluster reached 275 payouts.",
         "contagion"),
    page("Idea 3 · Signer DNA", "/console/signers", "Recovers who really signed each Ronin withdrawal, straight from the signatures on the blockchain.",
         ["Tab 1 lists the real addresses that signed the two stolen Ronin withdrawals, recovered from the signatures inside each transaction, with a link to check each on a block explorer.",
          "Tab 2 shows how often each of the 9 validators signs normal withdrawals (4,200 recovered). Amber marks the ones that signed the attack.",
          "Tab 3 shows the real signal: the withdrawal ID."],
         "Honest finding: the attackers' signer group was ordinary (it also signed 6.6% of normal withdrawals), so who signed is not the clue. The clue is the withdrawal ID, 2,000,000 against a normal maximum of 1,064,238. We report this openly.",
         "signers", "Only Ronin has recoverable signatures in our data. For Nomad the signer model says 'not applicable' instead of making something up."),
    page("Idea 4 · Ledger Pairing", "/console/pairing", "Every coin paid out must match a coin locked. We pair each payout to one deposit and show the gap.",
         ["Compare the two boxes: matching by message ID only catches 41 of 382 attacks; our pairing catches 382 of 382.",
          "Scroll the table to see each payout, what ID-matching says, and what pairing says.",
          "Tick the filter to show only the payouts that ID-matching misses."],
         "Nomad's copycats re-used real message IDs, so tools that match by ID saw nothing wrong. We match by amount, recipient and timing, and each deposit can be used only once.",
         "pairing"),
    page("Check it yourself", "/console/evidence", "Proof anyone can repeat. Pick any payout and see exactly what we searched.",
         ["Pick a payout from the list.",
          "Read the search: how many deposits were checked and what we looked for (same amount and recipient, same message ID, and so on).",
          "Try the cheat: change the amount or recipient and watch the verdict change."],
         "A security tool that says 'trust me' is not enough. Here a judge can test the verdict, not just read it.",
         "evidence"),
    page("Results", "/console/results", "Everything we measured, including the things we got wrong.",
         ["See attack payouts caught and honest payouts wrongly accused, per incident.",
          "See the scorecard against simple baselines: whale threshold, volume z-score and message-ID matching.",
          "See the what-if: holding funds before the first payout would have kept $159.6M of Nomad (100%).",
          "Read the honest limits: where the models are weaker."],
         "Judges trust numbers that come with their limits. The ML3 attack-type accuracy is on synthetic rows only, and real incidents are reported one by one.",
         "results"),
    page("How it works", "/docs/architecture", "The pipeline in plain steps, for judges who want to look under the hood.",
         ["Read: deposits and payouts from the dataset or a live bridge.",
          "Pair: match each payout to a deposit.",
          "Measure: spread, volume, signers and size against normal days.",
          "Decide: EXPLOIT only if the deposit rule breaks, otherwise at most SUSPICIOUS.",
          "Explain: attack type, top reasons, closest past hack, and a repeatable check."],
         "It lists the six algorithms and three models and what each is used for.",
         "arch"),
]

HTML = f"""<!doctype html><html><head><meta charset="utf-8"><title>BridgeWitness prototype guide</title><style>
@page {{ size: A4; margin: 14mm 14mm 16mm; }}
* {{ box-sizing: border-box; }}
body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #1d2126; font-size: 10.3pt; line-height: 1.5; margin: 0; }}
.cover {{ height: 255mm; display: flex; flex-direction: column; justify-content: center; border-left: 6px solid #ff6a3d; padding-left: 14mm; page-break-after: always; }}
.cover .k {{ font: 600 9pt Consolas, monospace; letter-spacing: .12em; text-transform: uppercase; color: #b4532a; }}
.cover h1 {{ font-size: 42pt; margin: 6mm 0 3mm; letter-spacing: -.02em; }}
.cover .s {{ font-size: 15pt; color: #5b636d; max-width: 140mm; }}
.cover .l {{ margin-top: 12mm; font-size: 13pt; }} .cover .l b {{ color: #1e8c78; }} .cover .l i {{ color: #b4532a; font-style: normal; font-weight: 700; }}
.cover .links {{ margin-top: 12mm; display: grid; gap: 1.5mm; font-size: 11pt; }} .cover .links b {{ font-size: 9pt; letter-spacing: .12em; text-transform: uppercase; color: #b4532a; }} .cover .links a {{ color: #1e8c78; font-weight: 700; font-size: 15pt; text-decoration: none; }} .cover .links span a {{ font-size: 11pt; font-weight: 400; }} .cover .links i {{ font-size: 9pt; color: #5b636d; }}
.cover .m {{ margin-top: 26mm; font: 8.5pt Consolas, monospace; color: #5b636d; line-height: 1.9; }}
h1.t {{ font-size: 20pt; margin: 0 0 3mm; }}
.intro p, .intro li {{ margin: 0 0 2.2mm; }}
.big {{ display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; margin: 4mm 0; }}
.big div {{ border: 1px solid #d9dde2; padding: 3mm 4mm; background: #f6f7f8; }} .big b {{ display: block; font: 700 17pt Consolas, monospace; color: #1e8c78; }} .big span {{ font-size: 9pt; color: #5b636d; }}
.pg {{ page-break-before: always; }}
.kick {{ font: 600 8.5pt Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; color: #b4532a; }}
h2 {{ font-size: 18pt; margin: 1mm 0 2mm; }}
h3 {{ font-size: 10.5pt; margin: 3mm 0 1.5mm; color: #1e8c78; }}
.what {{ font-size: 11pt; margin: 0 0 3mm; }}
.shot {{ border: 1px solid #d9dde2; background: #08090b; margin-bottom: 3mm; max-height: 120mm; overflow: hidden; }} .shot img {{ width: 100%; display: block; }}
.cols {{ display: grid; grid-template-columns: 1.25fr 1fr; gap: 6mm; }}
ol {{ margin: 0; padding-left: 5mm; }} li {{ margin-bottom: 1.4mm; }}
.note {{ background: #f6f7f8; border-left: 3px solid #e3b04b; padding: 2mm 3mm; font-size: 9.2pt; color: #3b424a; }}
table {{ width: 100%; border-collapse: collapse; font-size: 9.2pt; margin: 2mm 0 4mm; }} th {{ background: #1d2126; color: #fff; text-align: left; padding: 1.8mm 2.4mm; }} td {{ padding: 1.6mm 2.4mm; border-bottom: 1px solid #d9dde2; vertical-align: top; }}
</style></head><body>
<section class="cover"><div class="k">CSB-01 · Real-time detection of cross-chain bridge exploits</div><h1>BridgeWitness</h1>
<div class="s">A page-by-page guide to the prototype, in plain English.</div>
<div class="l"><b>Signatures can be stolen.</b> <i>Conservation can't.</i></div>
<div class="m">4 ideas · 3 machine-learning models · 6 algorithms<br/>Real data from the Nomad and Ronin hacks · a live bridge feed<br/>October 2026</div>
<div class="links"><b>Try it live</b><a href="https://bridgewitness-web.onrender.com">bridgewitness-web.onrender.com</a><span>API: <a href="https://bridgewitness-api.onrender.com/health">bridgewitness-api.onrender.com</a></span><i>Free hosting sleeps when idle: the first visit can take about 50 seconds to wake up.</i></div></section>

<section class="intro"><h1 class="t">The prototype from A to Z</h1>
<h3>The problem</h3>
<p>A <b>bridge</b> lets you move coins between two blockchains. It locks your coins on chain A (a <b>deposit</b>) and pays out the same value on chain B (a <b>payout</b>). Bridges hold huge sums, so they are the biggest target in crypto: about $2 billion was stolen from bridges in 2022 (Chainalysis estimate).</p>
<p>Two hacks show why simple alerts fail. At <b>Ronin</b> (March 2022) attackers stole validator keys, so every signature was genuine and signature checks saw nothing. At <b>Nomad</b> (August 2022) a bug let anyone withdraw money that was never deposited; one person found it, then hundreds copied the same transaction.</p>
<h3>Our answer in one sentence</h3>
<p><b>Signatures can be stolen. Conservation can't.</b> Coins paid out must never exceed coins locked. BridgeWitness checks that every payout has a deposit behind it, and only says <b>EXPLOIT</b> when that check breaks. Everything else (statistics, machine learning) can only say <b>SUSPICIOUS</b> and help explain.</p>
<h3>What we measured (on real data)</h3>
<div class="big"><div><b>384 / 384</b><span>real attack payouts labelled exploit (Nomad 382, Ronin 2)</span></div><div><b>0 of 27,312</b><span>honest payouts wrongly accused</span></div><div><b>$159.6M</b><span>Nomad money paid out with no deposit</span></div></div>
<p><b>Open it:</b> <a href="https://bridgewitness-web.onrender.com">https://bridgewitness-web.onrender.com</a></p>
<h3>How it works, in five steps</h3>
<ol><li><b>Read</b> deposits and payouts, replayed from real hacks or read live.</li><li><b>Pair</b> each payout with one deposit by amount, person and timing.</li><li><b>Measure</b> spread, volume, signers and size against normal days.</li><li><b>Decide</b>: EXPLOIT only if the deposit rule breaks.</li><li><b>Explain</b>: attack type, top reasons, the closest past hack, and a check anyone can repeat.</li></ol>
<h3>The challenge brief and where to see each part</h3>
<table><tr><th>The brief asks for</th><th>Where it is</th></tr>
<tr><td>A dashboard over a live or replayed feed</td><td>Live console, 3D map</td></tr>
<tr><td>Volume spikes</td><td>Idea 2 · Contagion Radar, charts in the Live console</td></tr>
<tr><td>Unusual signer behaviour</td><td>Idea 3 · Signer DNA</td></tr>
<tr><td>Mismatched deposit and payout pairs</td><td>Idea 4 · Ledger Pairing</td></tr>
<tr><td>A risk-scored alert with the suspected exploit type</td><td>Alert card (Live console), Idea 1 · Accusation Budget</td></tr></table>
</section>

{''.join(PAGES)}

<section class="pg intro"><h1 class="t">What is under the hood</h1>
<h3>Six algorithms</h3>
<table><tr><th>Name</th><th>What it does, simply</th></tr>
<tr><td>Conservation ledger + pairing</td><td>Matches each payout to one deposit; tracks money in versus money out.</td></tr>
<tr><td>Copy-paste detector (MinHash)</td><td>Groups payouts that are copies of each other, ignoring the address.</td></tr>
<tr><td>Repeat-message score (MIDAS-R)</td><td>Notices the same message showing up again and again in a burst.</td></tr>
<tr><td>Spread number (Hawkes)</td><td>Measures whether each payout triggers more payouts, like an outbreak.</td></tr>
<tr><td>Evidence stack (conformal + e-values + e-CUSUM)</td><td>Combines warning signs into one score with a stated false-alarm rate.</td></tr>
<tr><td>Volume spike check</td><td>Compares the last 10 minutes with the usual 7-day rate.</td></tr></table>
<h3>Three machine-learning models</h3>
<table><tr><th>Model</th><th>What it does</th><th>Trained on</th></tr>
<tr><td>Delay window</td><td>Predicts how long a payout normally takes after its deposit, with a 99% coverage target (98.8% measured on unseen data).</td><td>27,312 real matched pairs</td></tr>
<tr><td>Signer and ID anomaly</td><td>Spots unusual signer groups and withdrawal IDs. Ronin only.</td><td>4,200 real Ronin withdrawals with recovered signers</td></tr>
<tr><td>Attack type</td><td>Names the likely attack (copycat swarm, message replay, key compromise and so on) and shows the top reasons. It can never call something benign after the rule broke.</td><td>Synthetic scenarios built over real normal rows</td></tr></table>
<h3>Honest limits (we say these out loud)</h3>
<ol><li>Two real hacks plus practice attacks show the idea works. They are not a promise for every future attack.</li>
<li>The reference answers come from the XChainWatcher project's matching rules. We reproduce them; we did not discover the hacks independently.</li>
<li>The Ronin attackers' signer group looked ordinary. Who signed is not the clue; the withdrawal ID is.</li>
<li>The attack-type model's accuracy is on synthetic rows only. Real incidents are reported one by one.</li>
<li>The live bridge feed (Across) only runs the deposit rule; the models say "not enough history" there.</li>
<li>Dollar values use the dataset's historic prices. "Money kept" figures are estimates, not recovered funds.</li>
<li>The public Ronin loss estimate is $624M; the dataset total is $565.4M.</li></ol>
<h3>Data and credits</h3>
<p>Nomad and Ronin transfers: XChainWatcher (Augusto et al., arXiv 2410.02029), MIT licence. Live feed: Across public API.</p>
<h3>Tech, for the curious</h3>
<p>Python backend (FastAPI, LightGBM, scikit-learn) packaged in Docker (about 45 MB of memory). Website built with React, Vite and TypeScript, with three.js for the 3D map. Both run on Render: the website at bridgewitness-web.onrender.com and the API at bridgewitness-api.onrender.com. A self-check of 16 tests and 30 regression tests must pass before every release.</p></section>
</body></html>"""

out_html = ROOT / "docs" / "guide.html"
out_html.write_text(HTML, encoding="utf-8")
pdf = ROOT / "docs" / "BridgeWitness-Prototype-Guide.pdf"
pdf.unlink(missing_ok=True)
subprocess.run([EDGE, "--headless=new", f"--user-data-dir={ROOT / 'docs' / 'shots' / 'prof2'}", "--no-pdf-header-footer",
                f"--print-to-pdf={pdf}", out_html.as_uri()], check=True, timeout=180)
import time
for _ in range(120):  # the Edge launcher returns before the PDF is written
    if pdf.exists() and pdf.stat().st_size > 0:
        time.sleep(2)
        break
    time.sleep(1)
print(pdf, pdf.stat().st_size)
