import { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '../data';
import { formatUnits } from '../lib/format';

// Shapes written by bridgewitness/pipeline.py (to_replay) — the API serves them as-is.
export type Signals = {
  midas: number; cluster: string | null; cluster_size: number; hawkes_n: number; id_reused: boolean;
  id_jump: number; id_jump_pos: number; auth: number | null; signers: string[] | null;
};
export type Reason = { feature: string; value: number; push: number };
export type Ev = {
  id: string; ts: number; kind: 'deposit' | 'withdrawal'; tx: string; symbol: string; amount: string; decimals: number;
  usd: number | null; msg_id: string; recipient: string; truth: 'normal' | 'attack' | 'control'; scenario: string | null;
  status?: 'consistent' | 'violation' | 'unknown' | 'pending'; rule?: string | null; matched?: string | null; delay?: number | null;
  window?: [number, number]; signals?: Signals; p?: Record<string, number | null>; p_comb?: number | null;
  e_comb?: number | null; ecusum?: number | null; alarm?: boolean; risk?: number; level?: 'exploit' | 'suspicious' | 'none';
  type?: string | null; type_text?: string | null; type_prob?: number | null; precedent?: string | null; reasons?: Reason[] | null;
  deposit?: { tx: string; ts: number; amount: string; recipient: string; msg_id: string } | null;
  search?: { deposits_checked: number; since: number | null; same_amount_and_recipient: number; same_amount_other_recipient: number; same_recipient_other_amount: number; same_message_id: number };
  risk_breakdown?: { base: number; exposure: number; campaign: number; behavior: number; total: number };
  evidence?: { bundle: EvidenceBundle; sha256: string };
};
export type EvidenceFact = { event_id: string; route: string; token: string; msg_id: string; amount: string; recipient: string; ts: number; matched?: string; status?: string };
export type EvidenceBundle = { rule_version: string; release: EvidenceFact; authorizations: EvidenceFact[]; previous_releases: EvidenceFact[]; coverage: { source_complete: boolean; mode: string } };
export type Tick = { t: number; backed_usd: number; unbacked_usd: number; midas: number; cluster_max: number; hawkes_n: number; ecusum: number; releases: number };
export type ScoreRow = { method: string; attack_flagged: string; first_alert_after_s: number | null; usd_before_first_alert: number | null; false_alerts: number; false_alerts_per_day: number };
export type FeedMetrics = {
  withdrawals: number; attack_releases: number; attack_flagged_exploit: number; normal_false_exploit: number;
  heldout_normal: number; heldout_days: number; heldout_false_alarms: number; heldout_false_alarm_rate: number | null;
  types_on_attack: Record<string, number>; stat_alarms_on_attack: number; stat_first_alarm_after_s: number | null; max_cluster: number; max_hawkes_n: number; scorecard: ScoreRow[];
  counterfactual: { attack_usd: number; first_exploit_alert: number; lanes: { latency_s: number; kept_usd: number; kept_pct: number; legit_held: number }[]; assumptions: string[] } | null;
  auth_attack_p?: number[]; auth_heldout_median_p?: number; rules: Record<string, number>;
  scenarios?: Record<string, { truth: string; levels: Record<string, number>; types: Record<string, number> }>;
};
export type SignerDna = {
  normal_sampled: number; validators: { addr: string; participation: number; signed_attack: boolean }[];
  attack_quorum_seen_in_normal: number; attack_quorum_share: number; distinct_quorums: number; quorum_size: Record<string, number>;
  normal_id_min: number; normal_id_max: number; attack_ids: number[];
};
export type Metrics = {
  generated_at: number; seed: number; ecusum_threshold: number; signer_dna: SignerDna;
  ml1_delay_cqr: { miscoverage_target: number; n_train: number; n_calib: number; n_test: number; test_coverage: number; test_coverage_by_feed: Record<string, number>; median_window_s: Record<string, [number, number]> };
  ml3_exploit_typer: { synthetic_holdout_accuracy: number; note: string };
  feeds: Record<'nomad' | 'ronin' | 'simulated', FeedMetrics>;
};
export type Replay = { feed: string; label: string; window: [number, number]; route: string; src: string; dst: string; events: Ev[]; ticks: Tick[]; metrics: FeedMetrics };

export const FEEDS = [
  { id: 'nomad', label: 'Nomad hack, 2022', note: 'real · hundreds of copycats' },
  { id: 'ronin', label: 'Ronin hack, 2022', note: 'real · stolen validator keys' },
  { id: 'simulated', label: 'Practice attacks', note: 'made-up attacks, fixed seed' },
  { id: 'live', label: 'Live bridge', note: 'a real bridge, right now' },
] as const;
export type FeedId = (typeof FEEDS)[number]['id'];

// API first (Render); static copy shipped with the site as fallback so the demo never breaks.
async function getJSON<T>(path: string, fallback?: string): Promise<T> {
  if (API) {
    try {
      const r = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) return await r.json();
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
    // Commit to React state ~12 times a second, not every frame: the whole console re-renders on each commit.
    const advance = (now: number) => {
      if (last.current == null) { last.current = now; return; }
      const dt = now - last.current;
      if (dt < 80) return;
      setT((x) => Math.min(window[1], x + (dt / 1000) * speed));
      last.current = now;
    };
    const step = (now: number) => {
      advance(now);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Hidden tabs pause rAF; a coarse interval keeps the clock honest there.
    const iv = setInterval(() => { if (document.visibilityState === 'hidden') advance(performance.now()); }, 500);
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
    const tick = data.ticks.filter((k) => k.t + 60 <= t);
    return {
      seen, n, withdrawals: w, alerts,
      exploits: alerts.filter((e) => e.level === 'exploit'),
      backed: w.filter((e) => e.status === 'consistent').reduce((s, e) => s + (e.usd ?? 0), 0),
      unbacked: w.filter((e) => e.status === 'violation').reduce((s, e) => s + (e.usd ?? 0), 0),
      ticks: tick, last: tick[tick.length - 1],
    };
  }, [data, Math.floor(t)]);
}

export type LiveRow = { id: string; deposit_tx: string | null; fill_tx: string | null; src: number; dst: number; symbol: string | null; status: string; deposit_ts: number | null; fill_ts: number | null; in_usd: number | null; out_usd: number | null; verdict: 'reported_filled' | 'refunded' | 'pending' | 'overdue' | 'unknown'; reason: string | null; ml: string; delay_s?: number };
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
  unbacked_release: 'Money released with no deposit', message_replay: 'Old message used again', copycat_swarm: 'Copycat swarm',
  key_compromise: 'Suspected validator key compromise', amount_mismatch: 'Wrong amount paid out', recipient_mismatch: 'Paid to the wrong person',
  benign_whale: 'Large but backed', benign_burst: 'Busy but backed',
};
export const FEATURE_TEXT: Record<string, string> = {
  unbacked: 'no deposit backs this release', amount_mismatch: 'amount differs from its deposit',
  recipient_mismatch: 'paid to someone other than the depositor’s recipient', id_reused: 'the same message ID was used before',
  id_jump_log: 'withdrawal ID is far beyond the observed source IDs', cluster_log: 'one of many near-identical releases',
  hawkes_n: 'cluster timing fits a spreading pattern', midas: 'the same message is repeating fast',
  log_usd: 'very large amount', value_vs_route: 'large compared with a normal day on this route', signed: 'carried real validator signatures',
};
export const RULE_TEXT: Record<string, string> = {
  missing_source_deposit: 'No matching authorization in the supplied dataset history',
  message_replayed: 'This deposit authorization was already used',
  amount_mismatch: 'The amount paid out differs from the deposit',
  recipient_mismatch: 'Paid to someone other than the deposit’s recipient',
  outside_usual_delay: 'Backed, but it arrived later than normal',
};

export function useMetrics() {
  const [m, setM] = useState<Metrics | null>(null);
  useEffect(() => { let on = true; getJSON<Metrics>('/metrics', '/data/metrics.json').then((d) => on && setM(d)).catch(() => {}); return () => { on = false; }; }, []);
  return m;
}

// Plain names for every signal (same wording on the console, the demos and the landing page).
export const SIGNAL_NAME: Record<string, string> = {
  burst: 'Sudden volume spike', midas: 'Same message repeating', cluster_log: 'Copy-paste cluster',
  hawkes_n: 'Attack spreading', value_vs_route: 'Unusually large amount', id_jump_pos: 'Withdrawal ID out of range',
  auth: 'Signer and ID check (model)',
};

export const human = (amount: string, decimals: number, max = 4) => {
  const s = formatUnits(amount, decimals);
  const [i, f = ''] = s.split('.');
  const frac = f.slice(0, max).replace(/0+$/, '');
  return frac ? `${i}.${frac}` : i;
};

/** Block-explorer link for a release (destination chain) or a deposit (source chain). Simulated rows have none. */
export function txUrl(feed: string, kind: 'deposit' | 'withdrawal', tx: string, simulated = false) {
  if (simulated) return null;
  if (kind === 'withdrawal') return `https://etherscan.io/tx/${tx}`;
  return feed === 'nomad' ? `https://moonscan.io/tx/${tx}` : `https://app.roninchain.com/tx/${tx}`;
}
export const SOURCE_CHAIN: Record<string, string> = { nomad: 'Moonbeam', ronin: 'Ronin', simulated: 'Ronin' };
