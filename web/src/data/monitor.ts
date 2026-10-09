import { useSyncExternalStore } from 'react';
import F from './fixtures/feeds.json';
import { createStore } from '../store';
import { CONTAINS, riskScore, type ExploitType } from '../detect/classify';

// The CSB-01 dashboard engine: a virtual clock over any feed. Detection itself ran once in the fixture
// script (backing rule + volume + signer signals → exploit type); this adds time, scoring and grouping.
export type FeedId = keyof typeof F.feeds;
export type FeedEvent = Omit<(typeof F.feeds.sim.events)[number], 'signers' | 'signer' | 'rules' | 'scenario'> & { signers: string[] | null; signer: string[]; rules: string[]; scenario?: string };
export const FEEDS = F.feeds as unknown as Record<FeedId, { name: string; provenance: 'real' | 'synthetic'; t0: number; chains: number[]; validators: string[]; quorum: number; note: string; seed?: number; events: FeedEvent[] }>;
export const FEED_IDS: FeedId[] = ['sim', 'nomad', 'ronin'];

const attackTs = (id: FeedId) => FEEDS[id].events.find((e) => e.truth === 'attack')!.ts;
export const RANGE: Record<FeedId, [number, number]> = {
  sim: [FEEDS.sim.t0, FEEDS.sim.t0 + 180 * 60],
  nomad: [attackTs('nomad') - 1800, FEEDS.nomad.events.filter((e) => e.truth === 'attack').at(-1)!.ts + 600],
  ronin: [attackTs('ronin') - 2 * 3600, attackTs('ronin') + 3600],
};
const SPEED: Record<FeedId, number> = { sim: 30, nomad: 60, ronin: 60 };
export const CAMPAIGN = { n: 5, w: 900 }; // preview config: ≥5 violations on one route within 15 min

export const monitor = createStore({ feed: 'sim' as FeedId, t: RANGE.sim[0], playing: false, speed: SPEED.sim });

let raf = 0, last = 0;
function loop(now: number) {
  const s = monitor.get();
  const end = RANGE[s.feed][1];
  const t = Math.min(end, s.t + Math.min(0.25, (now - last) / 1000) * s.speed);
  last = now;
  monitor.set({ t, playing: t < end });
  if (t < end) raf = requestAnimationFrame(loop);
}
export const mon = {
  play() { const s = monitor.get(); if (s.t >= RANGE[s.feed][1]) monitor.set({ t: RANGE[s.feed][0] }); monitor.set({ playing: true }); cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); },
  pause() { cancelAnimationFrame(raf); monitor.set({ playing: false }); },
  toggle() { monitor.get().playing ? mon.pause() : mon.play(); },
  seek(t: number) { const [a, b] = RANGE[monitor.get().feed]; monitor.set({ t: Math.max(a, Math.min(b, t)) }); },
  speed(speed: number) { monitor.set({ speed }); },
  feed(feed: FeedId) { mon.pause(); monitor.set({ feed, t: RANGE[feed][0], speed: SPEED[feed] }); },
};

export type Alert = FeedEvent & { type: ExploitType; risk: ReturnType<typeof riskScore>; contains: boolean };

function compute(feed: FeedId, t: number) {
  const f = FEEDS[feed];
  const seen = f.events.filter((e) => e.ts <= t);
  const viol = seen.filter((e) => e.status === 'invariant_violation');
  const alerts: Alert[] = seen.filter((e) => e.exploit !== 'none').map((e) => {
    const campaign = viol.filter((v) => v.route === e.route && v.ts <= e.ts && v.ts > e.ts - CAMPAIGN.w).length >= CAMPAIGN.n;
    const type = e.exploit as ExploitType;
    return { ...e, type, risk: riskScore(type, e.usd, campaign), contains: CONTAINS(type) };
  });

  // Incidents: violation alerts no more than 15 min apart. A burst of unbacked releases that also
  // trips the volume signal is a liquidity drain.
  const incidents: { first: number; last: number; alerts: Alert[] }[] = [];
  for (const a of alerts.filter((x) => x.contains)) {
    const cur = incidents.at(-1);
    if (cur && a.ts - cur.last <= CAMPAIGN.w) { cur.alerts.push(a); cur.last = a.ts; } else incidents.push({ first: a.ts, last: a.ts, alerts: [a] });
  }
  const inc = incidents.map((i, k) => {
    const unbacked = i.alerts.filter((a) => a.type === 'validator_key_compromise' || a.type === 'unbacked_release').length;
    const drain = unbacked >= CAMPAIGN.n && i.alerts.some((a) => a.vel.warn);
    return {
      id: `inc_${feed}_${k + 1}`, ...i, drain, usd: i.alerts.reduce((x, a) => x + a.usd, 0), risk: Math.max(...i.alerts.map((a) => a.risk.total)),
      types: [...new Set(i.alerts.map((a) => a.type))], routes: [...new Set(i.alerts.map((a) => a.route))], recipients: new Set(i.alerts.map((a) => a.to)).size,
    };
  });

  const rules = new Map<string, number>();
  for (const v of viol) rules.set(v.rules[0], (rules.get(v.rules[0]) ?? 0) + 1);
  return {
    feed, t, seen, alerts, incidents: inc, rules,
    matched: seen.filter((e) => e.status === 'consistent_under_supplied_evidence').length,
    mismatched: viol.length,
    volumeWarn: seen.filter((e) => e.vel.warn).length,
    signerFlags: seen.filter((e) => e.signer.length > 0).length,
  };
}

let key = '';
let cache: ReturnType<typeof compute>;
export function monitorState() {
  const { feed, t } = monitor.get();
  const k = `${feed}:${Math.floor(t)}`;
  if (k !== key) { key = k; cache = compute(feed, Math.floor(t)); }
  return cache;
}
export const useMonitor = () => useSyncExternalStore(monitor.subscribe, monitorState);
export const useMonitorClock = () => useSyncExternalStore(monitor.subscribe, monitor.get);
export type MonitorState = ReturnType<typeof compute>;
