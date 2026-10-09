import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FEED_IDS, FEEDS, RANGE, mon, useMonitor, useMonitorClock, type Alert, type FeedId, type MonitorState } from '../../data/monitor';
import { EXPLOIT_LABEL } from '../../detect/classify';
import { Chain, Hash, Plate, Tag, Verdict, short } from '../../design/ui';
import { Glyph } from '../../design/glyphs';
import { formatUnits, usd, utc } from '../../lib/format';

const SPEEDS = [1, 10, 30, 60, 300];
const amt = (e: { amount: string; dec: number | null; route: string }) =>
  `${e.dec !== null ? formatUnits(e.amount, e.dec).replace(/\.?0+$/, '') : e.amount} ${e.route}`;
const hms = (s: number) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
const clock = (feed: FeedId, ts: number) => (feed === 'sim' ? `T+${hms(Math.max(0, Math.floor(ts - FEEDS.sim.t0)))}` : utc(ts).slice(11, 19));
const VELOCITY_THRESHOLD = 10.99;

function FeedPicker() {
  const { feed } = useMonitorClock();
  return (
    <div className="feeds" role="tablist" aria-label="Transaction feed">
      {FEED_IDS.map((id) => (
        <button key={id} role="tab" aria-selected={feed === id} className={`feed ${feed === id ? 'is-active' : ''}`} onClick={() => mon.feed(id)}>
          <span className="row" style={{ justifyContent: 'space-between' }}>
            <span className="t-h3">{FEEDS[id].name}</span>
            <Tag kind={FEEDS[id].provenance === 'real' ? 'real' : undefined}>{FEEDS[id].provenance === 'real' ? 'real dataset' : `synthetic · seed ${FEEDS[id].seed}`}</Tag>
          </span>
          <span className="dim" style={{ fontSize: 12 }}>{FEEDS[id].note}</span>
        </button>
      ))}
    </div>
  );
}

function Transport({ s }: { s: MonitorState }) {
  const { playing, speed, feed } = useMonitorClock();
  const [a, b] = RANGE[feed];
  const events = FEEDS[feed].events;
  const bins = useMemo(() => {
    const N = 140, n = new Array(N).fill(0), x = new Array(N).fill(0);
    for (const e of events) { const i = Math.floor(((e.ts - a) / (b - a)) * N); if (i < 0 || i >= N) continue; if (e.exploit === 'none') n[i]++; else x[i]++; }
    const m = Math.max(1, ...n, ...x);
    return { n: n.map((v) => v / m), x: x.map((v) => v / m), N };
  }, [events, a, b]);
  const marks = useMemo(() => {
    const seen = new Set<string>();
    return events.filter((e) => e.ts >= a && e.ts <= b && (e.scenario ? !seen.has(e.scenario) && seen.add(e.scenario) : e.truth === 'attack' && !seen.has('atk') && seen.add('atk')))
      .map((e) => ({ ts: e.ts, label: e.scenario ?? 'first attack release', control: e.truth === 'control' }));
  }, [events, a, b]);
  const X = (ts: number) => ((ts - a) / (b - a)) * 100;
  return (
    <div className="mon-transport">
      <div className="row-wrap">
        <button className="btn btn--sm" onClick={mon.toggle}>{playing ? Glyph.pause : Glyph.play}{playing ? 'Pause' : 'Play'}</button>
        <div className="row speeds" role="group" aria-label="Speed">
          {SPEEDS.map((v) => <button key={v} className="btn btn--line btn--sm" aria-pressed={speed === v} onClick={() => mon.speed(v)}>{v}×</button>)}
        </div>
        <span className="mono" style={{ fontSize: 13 }}>{clock(feed, s.t)} <span className="dim">{feed === 'sim' ? 'simulated clock' : utc(s.t).slice(0, 10)}</span></span>
      </div>
      <div className="scrubber scrubber--marks">
        <svg viewBox={`0 0 ${bins.N} 40`} preserveAspectRatio="none" aria-hidden="true">
          {bins.n.map((h, i) => h > 0 && <rect key={`n${i}`} x={i} y={40 - h * 36} width={0.7} height={h * 36} className="sb-normal" />)}
          {bins.x.map((h, i) => h > 0 && <rect key={`x${i}`} x={i} y={40 - Math.max(3, h * 36)} width={0.7} height={Math.max(3, h * 36)} className="sb-attack" />)}
        </svg>
        {marks.map((m, i) => (
          <span key={m.label} className={`sb-mark ${m.control ? 'sb-mark--b' : ''}`} style={{ left: `${X(m.ts)}%` }} title={m.label}>
            <span className="sb-pin">{i + 1}</span>
          </span>
        ))}
        <span className="sb-head" style={{ left: `${X(s.t)}%` }} />
        <input type="range" min={a} max={b} value={Math.floor(s.t)} onChange={(e) => mon.seek(+e.target.value)} aria-label="Seek feed" />
        <div className="sb-axis label"><span>{clock(feed, a)}</span><span>{clock(feed, b)}</span></div>
      </div>
      <ol className="sb-legend" aria-label="Events on the timeline">
        {marks.map((m, i) => <li key={m.label} className={m.control ? 'is-control' : ''}><span className="sb-pin sb-pin--static">{i + 1}</span>{m.label}{m.control ? ' (safe case)' : ''}</li>)}
      </ol>
    </div>
  );
}

function PairsPanel({ s }: { s: MonitorState }) {
  const last = [...s.seen].reverse().find((e) => e.status === 'invariant_violation');
  const total = s.matched + s.mismatched;
  return (
    <Plate title="Signal 1 · Deposits and withdrawals that don't match" meta={<Tag kind="real">decides</Tag>}>
      <div className="stack" style={{ gap: 14 }}>
        <div className="pairs">
          <div><span className="label">matched to a deposit</span><span className="readout-value c-verified">{s.matched}</span></div>
          <div><span className="label">mismatched</span><span className="readout-value c-violation">{s.mismatched}</span></div>
        </div>
        <div className="pair-bar" aria-hidden="true"><i style={{ flex: s.matched || 0.0001 }} className="ok" /><i style={{ flex: s.mismatched }} className="bad" /></div>
        <div className="stack" style={{ gap: 4 }}>
          {[...s.rules].sort((x, y) => y[1] - x[1]).map(([r, n]) => <div key={r} className="spread mono" style={{ fontSize: 11 }}><span className="c-violation">{r}</span><span>{n}</span></div>)}
          {s.rules.size === 0 && <span className="dim" style={{ fontSize: 12 }}>{total} release{total === 1 ? '' : 's'} so far, every one backed by a deposit.</span>}
        </div>
        {last && <p className="dim" style={{ fontSize: 12 }}>Last: {amt(last)} → {short(last.to)} · {last.rules.join(', ')}</p>}
      </div>
    </Plate>
  );
}

function VolumePanel({ s }: { s: MonitorState }) {
  const { feed } = useMonitorClock();
  const [a, b] = RANGE[feed];
  const pts = s.seen.filter((e) => e.ts >= a && !e.vel.abstained);
  const max = Math.max(VELOCITY_THRESHOLD * 1.5, ...pts.map((e) => e.vel.dev));
  const X = (ts: number) => ((ts - a) / (b - a)) * 600, Y = (v: number) => 130 - (v / max) * 120;
  return (
    <Plate title="Signal 2 · Sudden bursts" meta={<Tag>advises</Tag>}>
      <div className="stack" style={{ gap: 10 }}>
        <svg className="vol-chart" viewBox="0 0 600 140" preserveAspectRatio="none" role="img" aria-label="Velocity deviation per release with threshold">
          <line x1="0" x2="600" y1={Y(VELOCITY_THRESHOLD)} y2={Y(VELOCITY_THRESHOLD)} className="vol-th" />
          {pts.map((e) => (
            <circle key={`${e.tx}${e.ord}`} cx={X(e.ts)} cy={Y(e.vel.dev)} r={e.vel.warn ? 3.6 : 2}
              className={e.status === 'invariant_violation' ? 'vol-pt vol-pt--bad' : e.vel.warn ? 'vol-pt vol-pt--warn' : 'vol-pt'} />
          ))}
        </svg>
        <div className="spread"><span className="label">alarm line at 11, fixed before any attack data</span><span className="mono">{s.volumeWarn} burst{s.volumeWarn === 1 ? '' : 's'}</span></div>
        <p className="dim" style={{ fontSize: 12 }}>Each dot is a release; higher means faster than that route's normal pace. Above the dashed line is a burst. Hollow: a burst on an honest release (advice only). Copper: the release also broke a rule.</p>
      </div>
    </Plate>
  );
}

function SignerPanel({ s }: { s: MonitorState }) {
  const { feed } = useMonitorClock();
  const f = FEEDS[feed];
  const [a, b] = RANGE[feed];
  const N = 18;
  const grid = useMemo(() => {
    if (!f.validators.length) return null;
    const rows = [...f.validators.map(() => new Array(N).fill(0)), new Array(N).fill(0)];
    const hot = rows.map(() => new Array(N).fill(false));
    const lock = new Array(N).fill(false);
    for (const e of s.seen) {
      if (!e.signers) continue;
      const c = Math.min(N - 1, Math.max(0, Math.floor(((e.ts - a) / (b - a)) * N)));
      for (const sg of e.signers) {
        const r = f.validators.indexOf(sg);
        const row = r < 0 ? f.validators.length : r;
        rows[row][c]++;
        if (e.status === 'invariant_violation') hot[row][c] = true;
      }
      if (e.signer.includes('lockstep_signer_set')) lock[c] = true;
    }
    return { rows, hot, lock, max: Math.max(1, ...rows.flat()) };
  }, [s.seen, f, a, b]);
  return (
    <Plate title="Signal 3 · Unusual signer behaviour" meta={grid ? <Tag>{f.quorum}-of-{f.validators.length} validators</Tag> : <Tag>no signer data</Tag>}>
      {grid ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="heat" style={{ gridTemplateColumns: `34px repeat(${N}, 1fr)` }}>
            {grid.rows.map((row, r) => (
              <div key={r} className="heat-row" style={{ display: 'contents' }}>
                <span className="label heat-label">{r < f.validators.length ? `V${r + 1}` : 'unk'}</span>
                {row.map((v, c) => (
                  <i key={c} className={`heat-cell ${grid.hot[r][c] ? 'is-hot' : ''} ${r === f.validators.length && v ? 'is-unknown' : ''}`}
                    style={{ opacity: v ? 0.25 + 0.75 * (v / grid.max) : 0.07 }} title={`${r < f.validators.length ? `V${r + 1}` : 'unknown keys'} · ${v} signature(s)`} />
                ))}
              </div>
            ))}
            <span />
            {grid.lock.map((l, c) => <span key={c} className={`heat-lock ${l ? 'is-on' : ''}`} />)}
          </div>
          <div className="spread"><span className="label">Rows are validators (unk = unknown key), columns are time. Copper outline: signed a release that broke a rule. White bar: the same group signed together in a burst.</span><span className="mono">{s.signerFlags} flagged</span></div>
        </div>
      ) : (
        <p className="dim" style={{ fontSize: 13 }}>The public {f.name.split(' ·')[0]} dataset has no signer data, so this signal can't run here. Switch to the simulated replay, or see the live chains in the Gauntlet.{feed === 'ronin' && ' Public reports say 5 of 9 Ronin validator keys were stolen: valid signatures, which is why the backing rule matters.'}</p>
      )}
    </Plate>
  );
}

function AlertCard({ a, feed }: { a: Alert; feed: FeedId }) {
  const [open, setOpen] = useState(false);
  const r = a.risk;
  const chain = feed === 'sim' ? undefined : FEEDS[feed].chains[1];
  return (
    <li className={`alert ${a.contains ? 'alert--rule' : 'alert--advisory'}`}>
      <button className="alert-main" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="alert-risk mono" aria-label={`risk ${r.total}`}>{r.total}</span>
        <span className="stack" style={{ gap: 4, minWidth: 0 }}>
          <span className="row-wrap"><span className="alert-type">{EXPLOIT_LABEL[a.type]}</span>{a.scenario && feed === 'sim' && <span className="tag">{a.scenario}</span>}</span>
          <span className="mono dim" style={{ fontSize: 11 }}>{clock(feed, a.ts)} · {amt(a)} · {usd(a.usd)} · to {short(a.to)}</span>
          <span className="row-wrap" style={{ gap: 4 }}>
            {a.rules.map((x) => <span key={x} className="reason reason--rule">{x}</span>)}
            {a.vel.warn && <span className="reason">burst score {a.vel.dev.toFixed(1)} (alarm at 11)</span>}
            {a.signer.filter((x) => !a.rules.includes(x)).map((x) => <span key={x} className="reason">{x}</span>)}
          </span>
        </span>
        <span className="alert-side">{a.contains ? <Verdict status="invariant_violation" label="can be held" /> : <Tag>advice only</Tag>}</span>
      </button>
      {open && (
        <div className="alert-detail">
          <div className="prio-bar" aria-label="Risk breakdown">
            <span style={{ flex: r.base }} className="prio-base">base {r.base}</span>
            {r.exposure > 0 && <span style={{ flex: r.exposure }} className="prio-exp">+{r.exposure.toFixed(1)}</span>}
            {r.campaign > 0 && <span style={{ flex: r.campaign }} className="prio-camp">+{r.campaign}</span>}
            <span style={{ flex: Math.max(0, 100 - r.base - r.exposure - r.campaign) }} />
          </div>
          <div className="kv">
            <span className="label">score</span><span className="mono">base({a.type}) {r.base} + exposure {r.exposure.toFixed(1)} + campaign {r.campaign} × completeness {r.completeness} = {r.total}</span>
            <span className="label">release tx</span><Hash value={a.tx} chain={chain} />
            <span className="label">deposit</span>{a.dep ? <Hash value={a.dep.tx} chain={feed === 'nomad' ? 1650811245 : undefined} kind={feed === 'nomad' ? 'tx' : 'raw'} /> : <span className="mono c-violation">none on this route</span>}
            {a.signers && <><span className="label">signers</span><span className="mono" style={{ fontSize: 11 }}>{a.signers.map((x) => { const i = FEEDS[feed].validators.indexOf(x); return i < 0 ? `?${x.slice(2, 6)}` : `V${i + 1}`; }).join(' · ')}</span></>}
            {a.excess && <><span className="label">excess</span><span className="mono c-violation">{a.dec !== null ? formatUnits(a.excess, a.dec) : a.excess} {a.route}</span></>}
          </div>
          <p className="dim" style={{ fontSize: 12 }}>{a.contains ? 'A deposit or signer rule broke: this alert can trigger a hold before the release executes.' : 'No rule broke: this signal only ranks and explains. It can never hold funds.'}</p>
        </div>
      )}
    </li>
  );
}

function Alerts({ s }: { s: MonitorState }) {
  const { feed } = useMonitorClock();
  const [sort, setSort] = useState<'risk' | 'time'>('time');
  const list = [...s.alerts].sort((x, y) => (sort === 'risk' ? y.risk.total - x.risk.total || y.ts - x.ts : y.ts - x.ts)).slice(0, 40);
  return (
    <Plate title={`Alerts · ${s.alerts.length}`} actions={
      <div className="row" style={{ gap: 4 }}>{(['time', 'risk'] as const).map((k) => <button key={k} className="btn btn--line btn--sm" aria-pressed={sort === k} onClick={() => setSort(k)}>by {k}</button>)}</div>} bodyClass="alerts-body">
      {list.length ? <ul className="alerts">{list.map((a) => <AlertCard key={`${a.tx}${a.ord}`} a={a} feed={feed} />)}</ul>
        : <p className="dim" style={{ padding: 16, fontSize: 13 }}>No alerts yet. Press play: alerts appear the moment an offending release is observed.</p>}
    </Plate>
  );
}

function Summary({ s }: { s: MonitorState }) {
  const { feed } = useMonitorClock();
  const types = new Map<string, number>();
  s.alerts.forEach((a) => types.set(a.type, (types.get(a.type) ?? 0) + 1));
  return (
    <Plate title="Incidents · alerts close together">
      <div className="stack" style={{ gap: 14 }}>
        {s.incidents.length === 0 && <p className="dim" style={{ fontSize: 13 }}>None open.</p>}
        {s.incidents.slice(-4).reverse().map((i) => (
          <div key={i.id} className="inc-mini">
            <div className="spread"><span className="mono">{i.id}</span><span className="mono alert-risk alert-risk--sm">{i.risk}</span></div>
            <div className="row-wrap">{i.drain && <Verdict status="invariant_violation" label="liquidity drain" />}{i.types.map((t) => <span key={t} className="tag">{EXPLOIT_LABEL[t]}</span>)}</div>
            <span className="mono dim" style={{ fontSize: 11 }}>{i.alerts.length} alert{i.alerts.length > 1 ? 's' : ''} · {usd(i.usd)} · {i.recipients} recipient{i.recipients > 1 ? 's' : ''} · {clock(feed, i.first)}–{clock(feed, i.last)}</span>
          </div>
        ))}
        <div className="hr" />
        <span className="label">Alerts by suspected attack</span>
        {[...types].sort((x, y) => y[1] - x[1]).map(([t, n]) => <div key={t} className="spread" style={{ fontSize: 13 }}><span>{EXPLOIT_LABEL[t as keyof typeof EXPLOIT_LABEL]}</span><span className="mono">{n}</span></div>)}
        {feed === 'nomad' && <Link to="/console/incidents/inc_nomad" className="cap-link">Nomad case study →</Link>}
      </div>
    </Plate>
  );
}

function Stream({ s }: { s: MonitorState }) {
  const { feed } = useMonitorClock();
  const rows = [...s.seen].reverse().slice(0, 50);
  const chain = feed === 'sim' ? undefined : FEEDS[feed].chains[1];
  return (
    <Plate title="Transaction stream · releases" actions={<span className="label">{s.seen.length} observed</span>} bodyClass="feed">
      <table className="table">
        <thead><tr><th>time</th><th>verdict</th><th>suspected attack</th><th className="num">amount</th><th className="hide-md">burst score</th><th className="hide-md">signers</th><th className="hide-md">tx</th></tr></thead>
        <tbody>{rows.map((e) => (
          <tr key={`${e.tx}${e.ord}`}>
            <td className="mono">{clock(feed, e.ts)}</td>
            <td><Verdict status={e.status} /></td>
            <td className={e.exploit === 'none' ? 'dim' : ''}>{EXPLOIT_LABEL[e.exploit as keyof typeof EXPLOIT_LABEL]}</td>
            <td className="num mono">{amt(e)}</td>
            <td className={`mono hide-md ${e.vel.warn ? '' : 'dim'}`}>{e.vel.abstained ? '—' : e.vel.dev.toFixed(1)}</td>
            <td className="mono hide-md dim">{e.signers ? e.signers.length : '—'}</td>
            <td className="hide-md"><Hash value={e.tx} chain={chain} head={6} tail={4} /></td>
          </tr>
        ))}</tbody>
      </table>
    </Plate>
  );
}

export default function Monitor() {
  const s = useMonitor();
  const [params] = useSearchParams();
  useEffect(() => {
    const want = params.get('feed') as FeedId | null;
    if (want && FEED_IDS.includes(want) && want !== s.feed) mon.feed(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  const f = FEEDS[s.feed];
  return (
    <div className="page-grid">
      <Plate className="span-all" title="Monitor · watch a bridge feed for attacks" meta={<span className="row" style={{ gap: 6 }}><Chain id={f.chains[0]} /> <span className="dim">→</span> <Chain id={f.chains[1]} /></span>}>
        <div className="stack" style={{ gap: 18 }}>
          <FeedPicker />
          <Transport s={s} />
        </div>
      </Plate>
      <PairsPanel s={s} />
      <VolumePanel s={s} />
      <SignerPanel s={s} />
      <div className="span-2"><Alerts s={s} /></div>
      <Summary s={s} />
      <div className="span-all"><Stream s={s} /></div>
    </div>
  );
}
