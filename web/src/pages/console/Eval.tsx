import { DET, MODEL } from '../../data';
import { Pending, Plate, Readout, Tag } from '../../design/ui';
import { utc } from '../../lib/format';

const pct = (x: number | null | undefined, d = 2) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const SCENARIOS = [
  ['S0', 'Normal day', '0 critical; pending deposits resolve'],
  ['S1', 'The real exploit', '1 critical incident at the first unbacked release'],
  ['S2', 'Congestion ×3', '0 critical; pending → overdue only'],
  ['S3', 'RPC gap', 'unknown + DEGRADED; 0 false violations'],
  ['S4', 'Lying observer', 'false violations (documented limit of watermark mode)'],
  ['S5', 'Replay', 'message_replayed'],
  ['S6', 'Fake deposit', 'fake_deposit'],
  ['S7', 'Amount mismatch', 'amount_mismatch'],
];

export default function Eval() {
  const h = MODEL.heldout, sb = MODEL.statistical_baseline_heldout, b = MODEL.benchmark;
  const splits = Object.entries(MODEL.splits) as [string, { rows: number; attack_rows: number; start_timestamp: number; end_timestamp: number }][];
  const t0 = splits[0][1].start_timestamp, t1 = splits.at(-1)![1].end_timestamp;
  return (
    <div className="page-grid report">
      <Plate className="span-all" title="Evaluation report" meta={<Tag>generated from artifacts/evaluation.json · benchmark.json</Tag>}>
        <p className="t-body">Every number on this page comes from a script. Baselines, ablation and scenario outcomes arrive from <span className="mono">eval/results.json</span> when backend Step 4 lands; until then they are marked pending, never filled in.</p>
      </Plate>

      <Plate className="span-all" title="The three CSB-01 signals on the replayed datasets · measured" bodyClass="">
        <table className="table">
          <thead><tr><th>signal</th><th>role</th><th className="num">Nomad attack</th><th className="num">Nomad normal flagged</th><th className="num">Ronin attack</th><th className="num">Ronin normal flagged</th></tr></thead>
          <tbody>
            <tr><td>Mismatched pairs (backing rule)</td><td>decides</td><td className="num">{DET.nomad.rule_flags}/{DET.nomad.attack_releases} · from +0 s</td><td className="num">{DET.nomad.rule_flags_on_all_normal}/{DET.nomad.all_normal}</td><td className="num">{DET.ronin.rule_flags}/{DET.ronin.attack_releases}</td><td className="num">{DET.ronin.rule_flags_on_all_normal}/{DET.ronin.all_normal}</td></tr>
            <tr><td>Volume spikes (velocity)</td><td>advises</td><td className="num">{DET.nomad.volume_flags_on_attack}/{DET.nomad.attack_releases} · first at +{DET.nomad.first_volume_flag_offset_s} s</td><td className="num">{DET.nomad.volume_flags_on_all_normal}/{DET.nomad.all_normal}</td><td className="num">{DET.ronin.volume_flags_on_attack}/{DET.ronin.attack_releases}</td><td className="num">{DET.ronin.volume_flags_on_all_normal}/{DET.ronin.all_normal}</td></tr>
            <tr><td>Signer behaviour</td><td>rules decide</td><td className="num dim" colSpan={4}>not applicable: the public datasets carry no signer data (see the simulated replay)</td></tr>
          </tbody>
        </table>
        <p className="dim" style={{ fontSize: 12, padding: '10px 10px 14px' }}>Normal rows are XChainWatcher's matched pairs, so 0 rule flags on them is a consistency check, not independent evidence. The velocity threshold ({DET.velocity_params.threshold.toFixed(2)}) was chosen on pre-attack validation data only.</p>
      </Plate>
      <Plate className="span-all" title={`Simulated attack replay · seed ${DET.sim.seed} · ${DET.sim.events} releases`} bodyClass="">
        <table className="table">
          <thead><tr><th>scenario</th><th className="num">releases</th><th>typed as</th><th className="num">volume spikes</th><th>signer reasons</th></tr></thead>
          <tbody>{Object.entries(DET.sim.scenarios).map(([k, v]) => (
            <tr key={k}><td>{k}</td><td className="num">{v.releases}</td><td className="mono">{v.exploit.join(', ')}</td><td className="num">{v.volume_flags}</td><td className="mono dim" style={{ fontSize: 11 }}>{v.signer.join(', ') || '—'}</td></tr>
          ))}
            <tr><td className="dim">background (real Ronin amounts)</td><td className="num">{DET.sim.background}</td><td className="mono">none</td><td className="num">{DET.sim.background_volume_false_alarms} advisory</td><td className="dim">—</td></tr>
          </tbody>
        </table>
      </Plate>

      <Plate className="span-2" title="Scenarios S0–S7 · expected vs observed" bodyClass="">
        <table className="table">
          <thead><tr><th>#</th><th>scenario</th><th>correct result</th><th>observed</th></tr></thead>
          <tbody>{SCENARIOS.map(([id, name, exp]) => (
            <tr key={id}><td className="mono">{id}</td><td>{name}</td><td className="mono" style={{ fontSize: 11 }}>{exp}</td>
              <td>{id === 'S1' ? <Tag kind="real">382/382 · engine preview</Tag> : <Pending />}</td></tr>
          ))}</tbody>
        </table>
      </Plate>
      <Plate title="Engine latency · local">
        <div className="readouts readouts--col">
          <Readout label="p50 · deposit + release pair" value={b.pair_p50_ms.toFixed(2)} unit="ms" />
          <Readout label="p99" value={b.pair_p99_ms.toFixed(2)} unit="ms" />
          <Readout label="pairs measured" value={b.pairs} sub="SQLite FULL commit, not HTTP/RPC" />
        </div>
      </Plate>

      <Plate className="span-2" title="Ours vs baselines" bodyClass="">
        <table className="table">
          <thead><tr><th>detector</th><th className="num">precision</th><th className="num">recall</th><th className="num">FP S2</th><th className="num">FP S3</th><th className="num">alerts / incident</th><th className="num">latency</th></tr></thead>
          <tbody>
            {['Ours (backing invariant)', 'B1 · whale alert > $1M', 'B2 · 10-min z-score', 'B3 · isolation forest'].map((n) => (
              <tr key={n}><td>{n}</td>{Array.from({ length: 6 }, (_, i) => <td key={i} className="num"><Pending what="pending" /></td>)}</tr>
            ))}
          </tbody>
        </table>
      </Plate>
      <Plate title="Ablation staircase">
        <ol className="stairs">
          {['rule only', '+ watermark', '+ incidents', '+ soft signals'].map((s, i) => (
            <li key={s} style={{ marginLeft: i * 14 }}><span className="mono">{i + 1}</span><span>{s}</span><Pending what="FP / alerts" /></li>
          ))}
        </ol>
      </Plate>

      <Plate className="span-all" title="Model card · bridgewitness-isolation-v1 · advisory">
        <div className="model">
          <div className="stack" style={{ gap: 18 }}>
            <p className="model-line">Advisory only — never triggers containment.</p>
            <div className="confusion" role="table" aria-label="Held-out confusion matrix">
              <span />
              <span className="label">actual attack</span><span className="label">actual normal</span>
              <span className="label">flagged</span><span className="cm cm--tp mono">{h.tp}</span><span className="cm mono">{h.fp}</span>
              <span className="label">not flagged</span><span className="cm mono">{h.fn}</span><span className="cm mono">{h.tn}</span>
            </div>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <div className="readouts">
              <Readout label="warning recall" value={pct(h.recall)} sub={`${h.tp}/${h.positives}`} />
              <Readout label="false-positive rate" value={pct(h.false_positive_rate_all_negatives)} />
              <Readout label="ROC AUC · raw score" value={h.raw_score_roc_auc.toFixed(3)} sub="not accuracy" />
              <Readout label="avg precision · raw" value={h.raw_score_average_precision.toFixed(3)} />
            </div>
            <p className="dim" style={{ fontSize: 13 }}>The statistical baseline has higher average precision ({sb.raw_score_average_precision.toFixed(3)} vs {h.raw_score_average_precision.toFixed(3)}) at lower recall ({pct(sb.recall)}). We report it because it beats us. Scoring coverage {pct(h.scoring_coverage, 1)}: the model abstains on cold start and out-of-support inputs.</p>
            <div className="splits">
              {splits.map(([name, s]) => (
                <div key={name} style={{ flex: s.end_timestamp - s.start_timestamp }} className={s.attack_rows ? 'has-attack' : ''}>
                  <span className="label">{name}</span><span className="mono">{s.rows.toLocaleString('en-US')}{s.attack_rows ? ` · ${s.attack_rows} atk` : ''}</span>
                </div>
              ))}
            </div>
            <span className="label">{utc(t0).slice(0, 10)} → {utc(t1).slice(0, 10)} · time-ordered splits, train has 0 attacks</span>
          </div>
        </div>
      </Plate>
      <Plate className="span-all" title="Label circularity, stated openly">
        <p className="t-body">Nomad labels come from XChainWatcher's own matching rules, so reproducing them proves our implementation is correct, not that detection is independently powerful. Mitigations: a clean-room matcher diffed against <span className="mono">SC_WithdrawalsWithoutMatch.csv</span>, the injected scenarios above, the XScope incident catalog (6 incidents, 83 tx references), and the 5 pre-exploit unmatched releases reported separately.</p>
      </Plate>
    </div>
  );
}
