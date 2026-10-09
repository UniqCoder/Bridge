// Volume-spike signal: TS port of the reference velocity baseline (features.py `_History` +
// model.py `velocity_baseline`). Per route: count in 5 min, 5-min rate vs 1-h rate, 5-min volume vs
// 24-h median amount. Robust deviation = max over those three of (x − median) / scale, warning at the
// threshold chosen on pre-attack validation data only (artifacts/behavior_model.json).
// Deviation from the reference: the forest's "route seen in training" gate is not applied, so the
// statistical signal also runs on routes the forest never saw. It stays advisory either way.

export type VelocityParams = { median: number[]; scale: number[]; threshold: number; minHistory: number };
export type Velocity = { dev: number; warn: boolean; abstained: boolean; count5m: number };

type Obs = { ts: number; amount: bigint };

class RouteHistory {
  short: Obs[] = [];
  long: Obs[] = [];
  recent: Obs[] = [];
  last: number | null = null;

  observe(o: Obs) {
    this.short = this.short.filter((x) => x.ts >= o.ts - 300);
    this.long = this.long.filter((x) => x.ts >= o.ts - 3600);
    this.recent = this.recent.filter((x) => x.ts >= o.ts - 86400).slice(-512);
    const sorted = this.recent.map((x) => x.amount).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const n = sorted.length;
    const median = n ? sorted[n >> 1] : o.amount;
    const shortVol = this.short.reduce((a, x) => a + x.amount, 0n);
    const lg = (x: bigint | number) => Math.log1p(Number(x));
    const features = [
      Math.log1p(this.short.length + 1),
      Math.log1p((this.short.length + 1) / (this.long.length / 12 + 1)),
      lg(shortVol + o.amount) - lg(median * BigInt(this.short.length + 1)),
    ];
    this.short.push(o);
    this.long.push(o);
    this.recent.push(o);
    this.last = o.ts;
    return { features, history: n, count5m: this.short.length };
  }
}

export function velocityStream(p: VelocityParams) {
  const routes = new Map<string, RouteHistory>();
  return (route: string, ts: number, amount: bigint): Velocity => {
    let h = routes.get(route);
    if (!h) routes.set(route, (h = new RouteHistory()));
    const { features, history, count5m } = h.observe({ ts, amount });
    const dev = Math.max(...features.map((f, i) => Math.max(0, (f - p.median[i]) / p.scale[i])));
    const abstained = history < p.minHistory;
    return { dev, warn: !abstained && dev >= p.threshold, abstained, count5m };
  };
}
