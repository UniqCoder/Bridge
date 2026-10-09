// One table for every place a verdict is drawn: 3D thread uniforms, CSS chips, labels.
// Meanings follow PRD §6.3.
export type Verdict =
  | 'invariant_violation'
  | 'consistent_under_supplied_evidence'
  | 'unknown'
  | 'pending'
  | 'overdue'
  | 'orphaned';

export type ThreadLook = {
  label: string;
  meaning: string;
  color: string;
  glow: number;      // >1 pushes past the bloom threshold; only the violation gets it
  opacity: number;
  radius: number;
  dash: number;      // dashes along the thread, 0 = solid
  fray: number;      // 0..1 unravel at the free (source) end
  fade: number;      // 0..1 fade toward the source, into fog
  pulse: number;     // 0..1 slow opacity pulse
  drawing: boolean;  // progress loops 0→1
  strike: boolean;
  slack: number;     // extra sag
};

export const VERDICTS: Record<Verdict, ThreadLook> = {
  consistent_under_supplied_evidence: {
    label: 'consistent', meaning: 'All checks pass on the available evidence.',
    color: '#2FD4B5', glow: 1, opacity: 0.6, radius: 0.012, dash: 0, fray: 0, fade: 0, pulse: 0,
    drawing: false, strike: false, slack: 0.25,
  },
  invariant_violation: {
    label: 'violation', meaning: 'Finalized facts break a rule. Tied to nothing.',
    color: '#FF6A3D', glow: 2.6, opacity: 1, radius: 0.016, dash: 0, fray: 1, fade: 0, pulse: 0,
    drawing: false, strike: false, slack: 1.6,
  },
  unknown: {
    label: 'unknown', meaning: 'Source not observed far enough yet. Not an alarm.',
    color: '#A4ABB6', glow: 1, opacity: 0.55, radius: 0.01, dash: 34, fray: 0, fade: 1, pulse: 0,
    drawing: false, strike: false, slack: 0.4,
  },
  pending: {
    label: 'pending', meaning: 'Destination not finalized yet.',
    color: '#E3B04B', glow: 1, opacity: 0.85, radius: 0.012, dash: 0, fray: 0, fade: 0, pulse: 0,
    drawing: true, strike: false, slack: 0.3,
  },
  overdue: {
    label: 'overdue', meaning: 'Deposit past finality + SLA, no release. Liveness, never red.',
    color: '#E3B04B', glow: 1, opacity: 0.8, radius: 0.005, dash: 0, fray: 0, fade: 0, pulse: 1,
    drawing: false, strike: false, slack: 0.3,
  },
  orphaned: {
    label: 'orphaned', meaning: 'Invalidated by a reorg.',
    color: '#6B727D', glow: 1, opacity: 0.45, radius: 0.005, dash: 0, fray: 0, fade: 0, pulse: 0,
    drawing: false, strike: true, slack: 0.3,
  },
};

export const VERDICT_ORDER = Object.keys(VERDICTS) as Verdict[];

// Neutral paper thread for moments before any verdict exists (hero, the traced release).
export const WITNESS_LOOK: ThreadLook = {
  label: '', meaning: '', color: '#E9ECEF', glow: 1, opacity: 0.9, radius: 0.018, dash: 0, fray: 0,
  fade: 0, pulse: 0, drawing: false, strike: false, slack: 0.3,
};

export const lookOf = (v: Verdict | 'witness') => (v === 'witness' ? WITNESS_LOOK : VERDICTS[v]);
