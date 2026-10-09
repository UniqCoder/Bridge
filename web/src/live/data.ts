import { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '../data';

// Shapes written by bridgewitness/pipeline.py (to_replay) — the API serves them as-is.
export type Signals = {
  midas: number; cluster: string | null; cluster_size: number; hawkes_n: number; id_reused: boolean;
  id_jump: number; id_jump_pos: number; auth: number | null; signers: string[] | null;
};
export type Reason = { feature: string; value: number; push: number };
export type Ev = {
  id: string; ts: number; kind: 'deposit' | 'withdrawal'; tx: string; symbol: string; amount: string; decimals: number;
  usd: number | null; msg_id: string; recipient: string; truth: 'normal' | 'attack' | 'control'; scenario: string | null;
  status?: 'consistent' | 'violation'; rule?: string | null; matched?: string | null; delay?: number | null;
  window?: [number, number]; signals?: Signals; p?: Record<string, number | null>; p_comb?: number | null;
  ecusum?: number | null; alarm?: boolean; risk?: number; level?: 'exploit' | 'suspicious' | 'none';
  type?: string | null; type_text?: string | null; type_prob?: number | null; precedent?: string | null; reasons?: Reason[] | null;
};
export type Tick = { t: number; backed_usd: number; unbacked_usd: number; midas: number; cluster_max: number; hawkes_n: number; ecusum: number; releases: number };
export type ScoreRow = { method: string; attack_flagged: string; first_alert_after_s: number | null; usd_before_first_alert: number | null; false_alerts: number; false_alerts_per_day: number };
export type FeedMetrics = {
  withdrawals: number; attack_releases: number; attack_flagged_exploit: number; normal_false_exploit: number;
  heldout_normal: number; heldout_days: number; heldout_false_alarms: number; heldout_false_alarm_rate: number | null;
  types_on_attack: Record<string, number>; stat_alarms_on_attack: number; stat_first_alarm_after_s: number | null; max_cluster: number; max_hawkes_n: number; scorecard: ScoreRow[];
  counterfactual: { attack_usd: number; first_exploit_alert: number; lanes: { latency_s: number; kept_usd: number; kept_pct: number; legit_held: number }[]; assumptions: string[] } | null;
  auth_attack_p?: number[]; auth_heldout_median_p?: number;
};
export type Replay = { feed: string; label: string; window: [number, number]; route: string; src: string; dst: string; events: Ev[]; ticks: Tick[]; metrics: FeedMetrics };

export const FEEDS = [
  { id: 'nomad', label: 'Nomad 2022', note: 'real · copycat swarm' },
  { id: 'ronin', label: 'Ronin 2022', note: 'real · stolen validator keys' },
  { id: 'simulated', label: 'Simulated', note: 'seeded attacks + controls' },
  { id: 'live', label: 'Live', note: 'Across bridge, now' },
] as const;
export type FeedId = (typeof FEEDS)[number]['id'];

// API first (Render); static copy shipped with the site as fallback so the demo never breaks.
async function getJSON<T>(path: string, fallback?: string): Promise<T> {
  if (API) {
    try {
      const r = await fetch(`${API}${path}`);
      if (r.ok) return r.json();
    } catch { /* fall through to the static copy */ }
  }
  if (!fallback) throw new Error(`no API for ${path}`);
  const r = await fetch(fallback);
  if (!r.ok) throw new Error(`${fallback}: ${r.status}`);
  return r.json();
}

export function useReplayData(feed: string) {
  const [data, setData] = useState<Replay | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (feed === 'live') return;
    let on = true;
    setData(null); setErr(null);
    getJSON<Replay>(`/replay/${feed}`, `/data/replay_${feed}.json`).then((d) => on && setData(d)).catch((e) => on && setErr(String(e)));
    return () => { on = false; };
  }, [feed]);
  return { data, err };
}

// Replay clock in event time. speed = replay seconds per wall second.
export function useClock(window: [number, number] | undefined, speed: number, playing: boolean) {
  const [t, setT] = useState(window?.[0] ?? 0);
  const last = useRef<number | null>(null);
  useEffect(() => { if (window) setT(window[0]); }, [window?.[0]]);
  useEffect(() => {
    if (!playing || !window) { last.current = null; return; }
    let raf = 0;
    const step = (now: number) => {
      if (last.current != null) setT((x) => Math.min(window[1], x + ((now - last.current!) / 1000) * speed));
      last.current = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Hidden tabs pause rAF; a coarse interval keeps the clock honest there.
    const iv = setInterval(() => { if (document.visibilityState === 'hidden') step(performance.now()); }, 500);
    return () => { cancelAnimationFrame(raf); clearInterval(iv); last.current = null; };
  }, [playing, speed, window?.[0], window?.[1]]);
  return [t, setT] as const;
}

/** Everything visible at clock t, computed once per frame. */
export function useView(data: Replay | null, t: number) {
  return useMemo(() => {
    if (!data) return null;
    let n = 0;
    while (n < data.events.length && data.events[n].ts <= t) n++;
    const seen = data.events.slice(0, n);
    const w = seen.filter((e) => e.kind === 'withdrawal');
    const alerts = w.filter((e) => e.level && e.level !== 'none');
    const tick = data.ticks.filter((k) => k.t <= t);
    return {
      seen, n, withdrawals: w, alerts,
      exploits: alerts.filter((e) => e.level === 'exploit'),
      backed: w.filter((e) => e.status === 'consistent').reduce((s, e) => s + (e.usd ?? 0), 0),
      unbacked: w.filter((e) => e.status === 'violation').reduce((s, e) => s + (e.usd ?? 0), 0),
      ticks: tick, last: tick[tick.length - 1],
    };
  }, [data, Math.floor(t)]);
}

export type LiveRow = { id: string; deposit_tx: string | null; fill_tx: string | null; src: number; dst: number; symbol: string | null; status: string; deposit_ts: number | null; fill_ts: number | null; in_usd: number | null; out_usd: number | null; verdict: 'consistent' | 'pending' | 'overdue' | 'unknown' | 'violation'; reason: string | null; ml: string; delay_s?: number };
export type Live = { source: string; polled_at: number; error: string | null; counts: Record<string, number>; rows: LiveRow[] };

export function useLive(active: boolean) {
  const [live, setLive] = useState<Live | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    let on = true;
    const pull = () => getJSON<Live>('/live').then((d) => { if (on) { setLive(d); setErr(null); } })
      .catch(() => on && setErr(API ? 'Backend unreachable (Render may be waking up, retrying…)' : 'Live tail needs the backend: set VITE_BW_API.'));
    pull();
    const iv = setInterval(pull, 15000);
    return () => { on = false; clearInterval(iv); };
  }, [active]);
  return { live, err };
}

export const TYPE_SHORT: Record<string, string> = {
  unbacked_release: 'Unbacked release', message_replay: 'Message replay', copycat_swarm: 'Copycat swarm',
  key_compromise: 'Key compromise', amount_mismatch: 'Amount mismatch', recipient_mismatch: 'Recipient mismatch',
  benign_whale: 'Benign whale', benign_burst: 'Benign burst',
};
export const FEATURE_TEXT: Record<string, string> = {
  unbacked: 'no deposit backs this release', amount_mismatch: 'amount differs from its deposit',
  recipient_mismatch: 'paid to a different recipient than deposited', id_reused: 'message id was already used',
  id_jump_log: 'withdrawal id far beyond any issued', cluster_log: 'part of a large copy-paste cluster',
  hawkes_n: 'releases are triggering more releases', midas: 'sudden burst on this message/token',
  log_usd: 'very large value', value_vs_route: 'large compared with a normal day on this route', signed: 'carried valid validator signatures',
};
export const RULE_TEXT: Record<string, string> = {
  missing_source_deposit: 'No matching deposit on the source chain',
  amount_mismatch: 'Amount does not match the deposit',
  recipient_mismatch: 'Recipient does not match the deposit',
  outside_usual_delay: 'Backed, but arrived outside the usual delay window',
};
