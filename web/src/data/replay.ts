import { useSyncExternalStore } from 'react';
import { createStore } from '../store';
import { NOMAD, type AttackRow, type NormalRow } from '.';
import type { Status } from '../design/ui';

// Act 1: a virtual clock over the real Nomad stream (1 Aug 2022). Verdicts per release come from the
// ported backing rule (fixture script); this module adds what time decides: watermarks, unknown,
// pending/overdue, and incident correlation (PRD §6.3, §6.6).
// Preview constants until the backend engine owns them (HANDOFF Step 3):
export const CFG = {
  sourceLag: 4,      // s, Moonbeam observer lag (contract example lag_s)
  destLag: 2,        // s, Ethereum observer lag
  finality: 1800,    // s, Nomad optimistic window
  sla: 1800,         // s, overdue after finality + sla
  copycat: { n: 10, m: 5, w: 900 }, // ≥ n violations from ≥ m beneficiaries within w seconds
  start: 1659387600, // 2022-08-01 21:00:00 UTC
};
export const END = NOMAD.last_ts + 900;

export type Decision = {
  key: string; ts: number; kind: 'attack' | 'normal'; tx: string; id: string; token: string; ben: string;
  amount: string; decimals: number | null; usd: number; status: Status; rules: string[]; reason?: string;
};

const attack = NOMAD.attack as AttackRow[];
const normal = NOMAD.normal as NormalRow[];

// Copycat escalation time: first moment the sliding window holds ≥ n violations from ≥ m beneficiaries.
const copycatAt = (() => {
  const { n, m, w } = CFG.copycat;
  for (let i = 0; i < attack.length; i++) {
    const win = attack.filter((r) => r.ts <= attack[i].ts && r.ts > attack[i].ts - w);
    if (win.length >= n && new Set(win.map((r) => r.ben)).size >= m) return attack[i].ts;
  }
  return Infinity;
})();
const tokenFirst = [...new Map(attack.map((r) => [r.token, r.ts] as const).reverse()).entries()].map(([token, ts]) => ({ token, ts })).sort((a, b) => a.ts - b.ts);
export const ESCALATION = { route: attack[0].ts, verifier: tokenFirst[1]?.ts ?? Infinity, copycat: copycatAt, secondToken: tokenFirst[1]?.token };

export const replay = createStore({ t: CFG.start, playing: false, speed: 60, blindAt: null as number | null });

let raf = 0;
let last = 0;
function loop(now: number) {
  const s = replay.get();
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const t = Math.min(END, s.t + dt * s.speed);
  replay.set({ t, playing: t < END });
  if (t < END) raf = requestAnimationFrame(loop);
}
export const controls = {
  play() { if (replay.get().t >= END) replay.set({ t: CFG.start }); replay.set({ playing: true }); cancelAnimationFrame(raf); last = performance.now(); raf = requestAnimationFrame(loop); },
  pause() { cancelAnimationFrame(raf); replay.set({ playing: false }); },
  toggle() { replay.get().playing ? controls.pause() : controls.play(); },
  seek(t: number) { replay.set({ t: Math.max(CFG.start, Math.min(END, t)) }); },
  speed(speed: number) { replay.set({ speed }); },
  // S3-style fault: the source observer stalls; the destination keeps flowing.
  blind(on: boolean) { replay.set({ blindAt: on ? replay.get().t : null }); },
};

function compute(t: number, blindAt: number | null) {
  const wmSource = (blindAt === null ? t : Math.min(t, blindAt)) - CFG.sourceLag;
  const wmDest = t - CFG.destLag;
  const decisions: Decision[] = [];
  for (const r of attack) {
    if (r.ts > wmDest) break;
    const seen = wmSource >= r.ts;
    decisions.push({
      key: `${r.tx}:${r.ord}`, ts: r.ts, kind: 'attack', tx: r.tx, id: r.id, token: r.token, ben: r.ben, amount: r.amount,
      decimals: r.decimals, usd: r.usd, status: seen ? (r.status as Status) : 'unknown', rules: seen ? r.rules : [],
      reason: seen ? undefined : 'source_history_incomplete',
    });
  }
  let pending = 0, overdue = 0;
  for (const r of normal) {
    if (r.ts <= wmDest) {
      const seen = wmSource >= r.dep_ts;
      decisions.push({
        key: r.tx, ts: r.ts, kind: 'normal', tx: r.tx, id: r.id, token: r.token, ben: r.ben, amount: r.amount, decimals: r.decimals,
        usd: r.usd, status: seen ? 'consistent_under_supplied_evidence' : 'unknown', rules: [], reason: seen ? undefined : 'source_history_incomplete',
      });
    } else if (r.dep_ts <= wmSource) {
      if (t - r.dep_ts > CFG.finality + CFG.sla) overdue++; else pending++;
    }
  }
  decisions.sort((a, b) => b.ts - a.ts);

  const viol = decisions.filter((d) => d.status === 'invariant_violation');
  const exposure = new Map<string, { usd: number; units: bigint; decimals: number | null; count: number }>();
  for (const d of viol) {
    const e = exposure.get(d.token) ?? { usd: 0, units: 0n, decimals: d.decimals, count: 0 };
    e.usd += d.usd; e.units += BigInt(d.amount); e.count++;
    exposure.set(d.token, e);
  }
  const exposureUsd = viol.reduce((a, d) => a + d.usd, 0);
  const copycat = viol.length > 0 && t >= copycatAt;
  // PRD §6.6: clamp(base + min(15, 3·log10(usd)) + campaign(≤5), 0, 100) × completeness
  const base = 80;
  const exposureTerm = exposureUsd > 0 ? Math.min(15, 3 * Math.log10(exposureUsd)) : 0;
  const campaign = copycat ? 5 : 0;
  const completeness = blindAt !== null ? 0.4 : 1;
  const rules = new Map<string, number>();
  for (const d of viol) rules.set(d.rules[0], (rules.get(d.rules[0]) ?? 0) + 1);

  return {
    t, wmSource, wmDest, blinded: blindAt !== null, decisions, pending, overdue,
    unknown: decisions.filter((d) => d.status === 'unknown').length,
    incident: viol.length ? {
      id: 'inc_nomad', count: viol.length, beneficiaries: new Set(viol.map((d) => d.ben)).size,
      firstSeen: viol[viol.length - 1].ts, lastSeen: viol[0].ts, exposure, exposureUsd, copycat,
      scope: (t >= ESCALATION.verifier ? 'verifier' : 'route') as 'route' | 'verifier',
      priority: { base, exposure: exposureTerm, campaign, completeness, total: Math.round(Math.min(100, base + exposureTerm + campaign) * completeness) },
      rules,
    } : null,
  };
}

// Full-incident view regardless of the clock (incident pages, end-of-replay summaries).
export const computeAt = (t: number) => compute(t, null);

// One shared derivation per whole second of replay time.
let cacheKey = '';
let cache: ReturnType<typeof compute>;
export function replayState() {
  const { t, blindAt } = replay.get();
  const key = `${Math.floor(t)}:${blindAt}`;
  if (key !== cacheKey) { cacheKey = key; cache = compute(Math.floor(t), blindAt); }
  return cache;
}
export const useReplay = () => useSyncExternalStore(replay.subscribe, replayState);
export const useClock = () => useSyncExternalStore(replay.subscribe, replay.get);
export type ReplayState = ReturnType<typeof compute>;
