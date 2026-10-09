import { useMemo } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { TYPE_SHORT, human, useReplayData, type Ev, type Replay } from './data';
import { usd, utc } from '../lib/format';

/**
 * Investigate = one case file. The same payout is carried through every check (URL: ?feed=&case=),
 * and each step shows its answer for that payout, so the four pages read as one investigation.
 */
export const STEPS = [
  { to: 'pairing', n: 1, name: 'Deposit check', q: 'Was a coin locked in for this coin paid out?' },
  { to: 'signers', n: 2, name: 'Signers', q: 'Who approved it, and is that normal?' },
  { to: 'contagion', n: 3, name: 'Spread', q: 'One payout, or a copycat swarm?' },
  { to: 'budget', n: 4, name: 'Verdict & false alarms', q: 'How sure are we, and how often are we wrong?' },
  { to: 'evidence', n: 5, name: 'Verify it yourself', q: 'Can anyone re-check the proof?' },
] as const;

type Mark = 'bad' | 'warn' | 'ok' | 'na';
const ICON: Record<Mark, string> = { bad: '✗', warn: '!', ok: '✓', na: '–' };
const FEEDS = ['nomad', 'ronin', 'simulated'];

/** Ready-made cases so a judge can switch without hunting: the first exploit, a copycat, and an honest large payout. */
function presets(d: Replay) {
  const w = d.events.filter((e) => e.kind === 'withdrawal');
  const first = w.find((e) => e.level === 'exploit');
  const copy = w.find((e) => e.level === 'exploit' && (e.signals?.cluster_size ?? 0) > 20);
  const honest = [...w.filter((e) => e.truth === 'normal' && e.status === 'consistent' && e.usd != null)].sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0))[0];
  return [first && ['First exploit payout', first], copy && copy !== first && ['A copycat in the swarm', copy], honest && ['Largest honest payout', honest]]
    .filter(Boolean) as [string, Ev][];
}

export function useCase() {
  const [qs] = useSearchParams();
  const feed = FEEDS.includes(qs.get('feed') ?? '') ? qs.get('feed')! : 'nomad';
  const { data } = useReplayData(feed);
  const e = useMemo(() => {
    if (!data) return null;
    const id = qs.get('case');
    return (id && data.events.find((x) => x.id === id)) || presets(data)[0]?.[1] || null;
  }, [data, qs]);
  return { feed, data, e };
}

export const caseQuery = (feed: string, e: Ev | null) => `?feed=${feed}${e ? `&case=${encodeURIComponent(e.id)}` : ''}`;

/** Each step's answer for this one payout. */
export function answers(e: Ev): [Mark, string][] {
  const s = e.signals;
  return [
    e.status === 'violation' ? ['bad', 'No matching deposit'] : ['ok', 'Deposit found'],
    s?.signers ? ['ok', `${s.signers.length} real signers, normal group`] : ['na', 'No signer data on this bridge'],
    s && s.cluster_size > 1 ? [s.hawkes_n >= 0.9 ? 'bad' : 'warn', `${s.cluster_size} copies · spread ${s.hawkes_n.toFixed(2)}`] : ['ok', 'Single payout'],
    e.level === 'exploit' ? ['bad', `Exploit · priority ${e.risk}`] : e.level === 'suspicious' ? ['warn', `Suspicious · priority ${e.risk}`] : ['ok', 'No alert'],
    ['na', 'Open the evidence'],
  ];
}

export function CaseBar() {
  const { pathname } = useLocation();
  const [, setQs] = useSearchParams();
  const { feed, data, e } = useCase();
  const q = caseQuery(feed, e);
  const a = e ? answers(e) : null;
  return (
    <section className="case" aria-label="Case being investigated">
      <div className="case-top">
        <div className="case-id">
          <span className="case-k">Investigating one payout through five checks</span>
          {e ? <b>{e.level === 'exploit' ? '✗ ' : e.level === 'suspicious' ? '! ' : '✓ '}{e.symbol} {human(e.amount, e.decimals)}{e.usd != null ? ` (${usd(e.usd)})` : ''} · {data?.label.split(' · ')[0]} · {utc(e.ts).slice(5, 16)} UTC
            {e.type && e.level !== 'none' ? <em> · {TYPE_SHORT[e.type] ?? e.type}</em> : null}</b> : <b>Loading…</b>}
        </div>
        <div className="case-pick">
          <select aria-label="Bridge" value={feed} onChange={(ev) => setQs({ feed: ev.target.value }, { replace: true })}>
            <option value="nomad">Nomad hack</option><option value="ronin">Ronin hack</option><option value="simulated">Attack Lab</option>
          </select>
          {data && <select aria-label="Payout" value={e?.id ?? ''} onChange={(ev) => setQs({ feed, case: ev.target.value }, { replace: true })}>
            {presets(data).map(([l, x]) => <option key={x.id} value={x.id}>{l}</option>)}
            {e && !presets(data).some(([, x]) => x.id === e.id) && <option value={e.id}>Alert from the monitor</option>}
          </select>}
          <Link className="small" to={`/console/live?feed=${feed}`}>← Back to monitor</Link>
        </div>
      </div>
      <ol className="case-steps">
        {STEPS.map((s, i) => (
          <li key={s.to}><NavLink to={`/console/${s.to}${q}`} className={() => (pathname.endsWith(`/${s.to}`) ? 'is-on' : '')}>
            <span className="case-n">{s.n}</span>
            <span className="case-name">{s.name}</span>
            {a && <span className={`case-a vd--${a[i][0]}`}><i aria-hidden>{ICON[a[i][0]]}</i> {a[i][1]}</span>}
          </NavLink></li>))}
      </ol>
    </section>
  );
}

/** Bottom of each step: one clear way forward. */
export function NextStep({ from }: { from: string }) {
  const { feed, e } = useCase();
  const i = STEPS.findIndex((s) => s.to === from);
  const next = STEPS[i + 1];
  const q = caseQuery(feed, e);
  return (
    <nav className="next-step">
      {i > 0 && <Link className="btn btn--line btn--sm" to={`/console/${STEPS[i - 1].to}${q}`}>← {STEPS[i - 1].n} · {STEPS[i - 1].name}</Link>}
      {next ? <Link className="btn btn--sm" to={`/console/${next.to}${q}`}>Next: {next.n} · {next.name} →</Link>
        : <Link className="btn btn--sm" to="/console/results">See the measured results →</Link>}
    </nav>
  );
}
