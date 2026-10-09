// TS mirror of the PRD §6.5 response model. scripts/build-fixtures.mjs asserts it against the
// HANDOFF Step 4 table, so the landing slider and the backend agree on the same numbers.
// Detection fires on the first unbacked release; a release at or before (trigger + latency) is lost.

export type Release = { ts: number; route: number; usd: number };
export type Policy = 'no_monitor' | 'alert_human' | 'pause_all' | 'hold_routes' | 'adaptive';

export const POLICIES: { id: Policy; label: string }[] = [
  { id: 'no_monitor', label: 'No monitor' },
  { id: 'alert_human', label: 'Alert + human' },
  { id: 'pause_all', label: 'Pause everything' },
  { id: 'hold_routes', label: 'Hold routes' },
  { id: 'adaptive', label: 'Adaptive' },
];

export function lostPredicate(rows: Release[], policy: Policy, latency: number) {
  const t0 = Math.min(...rows.map((r) => r.ts));
  const first = new Map<number, number>();
  for (const r of rows) first.set(r.route, Math.min(first.get(r.route) ?? Infinity, r.ts));
  // Adaptive escalates to the shared verifier when a second route is hit.
  const escalateAt = [...first.values()].sort((a, b) => a - b)[1] ?? Infinity;
  return (r: Release) => {
    switch (policy) {
      case 'no_monitor': return true;
      // Same loss as pause: the operator pauses after L. The lanes differ in disruption, not loss.
      case 'alert_human':
      case 'pause_all': return r.ts <= t0 + latency;
      case 'hold_routes': return r.ts <= first.get(r.route)! + latency;
      case 'adaptive': return r.ts <= Math.min(first.get(r.route)!, escalateAt) + latency;
    }
  };
}

export function lanes(rows: Release[], latency: number) {
  const total = rows.reduce((a, r) => a + r.usd, 0);
  return POLICIES.map(({ id, label }) => {
    const lost = rows.filter(lostPredicate(rows, id, latency)).reduce((a, r) => a + r.usd, 0);
    return { policy: id, label, lost_usd: lost, lost_pct: (100 * lost) / total };
  });
}
