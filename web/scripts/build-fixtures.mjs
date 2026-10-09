// Builds web/src/data/fixtures/*.json from the real reference data in D:\OM\bridgewitness.
// Every number the UI shows comes from here or from the backend, never from copy.
// Doubles as the self-check: exits non-zero if derived facts drift from HANDOFF §5 / Step 4,
// or if the TypeScript verifier disagrees with any Python decision (golden test).
// Run: npm run fixtures   (Node >= 23.6, which strips TS types on import)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { lanes } from '../src/lib/counterfactual.ts';
import { assess } from '../src/verify/accounting.ts';
import { verifyBundle } from '../src/verify/verifyBundle.ts';
import { analyzeFeed } from '../src/detect/analyze.ts';
import { simulate, SIM } from '../src/detect/simulate.ts';
import { riskScore } from '../src/detect/classify.ts';

const REF = process.env.BW_REF ?? 'D:/OM/bridgewitness';
const OUT = path.join(import.meta.dirname, '../src/data/fixtures');
const sources = [];

function read(rel) {
  const buf = fs.readFileSync(path.join(REF, rel));
  sources.push({ path: rel, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
  return buf.toString('utf8');
}
function csv(rel) {
  const [head, ...lines] = read(rel).trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v])));
}
const json = (rel) => JSON.parse(read(rel));

// Well-known mainnet token metadata; unknown tokens fall back to their address.
const TOKENS = {
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': ['USDC', 6],
  '0x6b175474e89094c44da98b954eedeac495271d0f': ['DAI', 18],
  '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2': ['WETH', 18],
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': ['WBTC', 8],
  '0xdac17f958d2ee523a2206206994597c13d831ec7': ['USDT', 6],
  '0x853d955acef822db058eb8505911ed77f175b99e': ['FRAX', 18],
  '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b': ['AXS', 18],
  '0xcc8fa225d80b9c7d42f96e9570156c65d6caaa25': ['SLP', 0],
};
const sym = (a) => TOKENS[a]?.[0] ?? `${a.slice(0, 6)}…${a.slice(-4)}`;
const dec = (a) => TOKENS[a]?.[1] ?? null;
const usdSum = (rows) => rows.reduce((a, r) => a + Number(r.value_usd), 0);
const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());

// ── Nomad ────────────────────────────────────────────────────────────────
const attackRaw = csv('data/raw/nomad_attack.csv');
const normal = csv('data/raw/nomad_normal.csv');

// Event identity is (dst tx, ordinal within tx): attackers batched up to 10 releases per tx and reused ids.
const ordinals = new Map();
const attack = attackRaw.map((r) => {
  const ord = ordinals.get(r.dst_transaction_hash) ?? 0;
  ordinals.set(r.dst_transaction_hash, ord + 1);
  return { ...r, ts: +r.dst_timestamp, ord };
}).sort((a, b) => a.ts - b.ts || a.dst_transaction_hash.localeCompare(b.dst_transaction_hash) || a.ord - b.ord);

// Engine preview: run the ported backing rule over every release in time order.
// Route = destination token; message = withdrawal_id; Nomad routes are exact lock/mint (no partial).
const authBy = new Map(normal.map((r) => [`${r.dst_token}:${r.withdrawal_id}`, r]));
const releases = [
  ...normal.map((r) => ({ kind: 'normal', ts: +r.dst_timestamp, tx: r.dst_tx_hash, ord: 0, token: r.dst_token, id: r.withdrawal_id, ben: r.beneficiary, amount: r.amount, row: r })),
  ...attack.map((r) => ({ kind: 'attack', ts: r.ts, tx: r.dst_transaction_hash, ord: r.ord, token: r.dst_token, id: r.withdrawal_id, ben: r.beneficiary, amount: r.amount, row: r })),
].sort((a, b) => a.ts - b.ts || a.tx.localeCompare(b.tx) || a.ord - b.ord);
const seen = new Map();
for (const e of releases) {
  const key = `${e.token}:${e.id}`;
  const d = dec(e.token) ?? 18;
  const auth = authBy.get(key);
  const prev = seen.get(key) ?? [];
  const verdict = assess({
    route: { source_decimals: d, destination_decimals: d, source_fee_bps: 0, allow_partial: false, validator_addresses: [], quorum: 0 },
    release: { amount: e.amount, recipient: e.ben, timestamp: e.ts, finalized: true },
    authorizations: auth ? [{ amount: auth.amount, recipient: auth.beneficiary, timestamp: +auth.orig_timestamp, finalized: true, value_verification: 'adapter_verified' }] : [],
    previous_releases: prev,
    coverage: { healthy: true, complete_from_bridge_deployment: true, through_timestamp: e.ts },
  });
  e.verdict = verdict;
  seen.set(key, [...prev, { amount: e.amount, recipient: e.ben, timestamp: e.ts, finalized: true }]);
}

const AUG1 = Date.UTC(2022, 7, 1) / 1000, AUG3 = Date.UTC(2022, 7, 3) / 1000;
const atkEvents = releases.filter((e) => e.kind === 'attack');
const window = releases.filter((e) => e.kind === 'normal' && e.ts >= AUG1 && e.ts < AUG3);
const ruleCount = count(atkEvents.map((e) => e.verdict.violations[0]));
const t0 = attack[0].ts;
const ids = count(attack.map((r) => r.withdrawal_id));
const [topId, topCount] = [...ids].sort((a, b) => b[1] - a[1])[0];
const normalIds = new Set(normal.map((r) => r.withdrawal_id));
const tokenFirst = new Map();
for (const r of attack) if (!tokenFirst.has(r.dst_token)) tokenFirst.set(r.dst_token, r.ts);
const routes = [...tokenFirst.keys()];

const nomad = {
  chains: { source: 1650811245, destination: 6648936, source_name: 'Moonbeam', destination_name: 'Ethereum' },
  attack_releases: attack.length,
  attack_txs: new Set(attack.map((r) => r.dst_transaction_hash)).size,
  distinct_message_ids: ids.size,
  top_message_id: { id: topId, count: topCount },
  ids_colliding_with_normal: [...ids.keys()].filter((i) => normalIds.has(i)).length,
  tokens: routes.map(sym),
  beneficiaries: new Set(attack.map((r) => r.beneficiary)).size,
  usd_total: Math.round(usdSum(attack)),
  first_ts: t0,
  last_ts: attack.at(-1).ts,
  second_token_offset_s: [...tokenFirst.values()][1] - t0,
  normal_pairs: normal.length,
  normal_aug_1_2: window.length,
  normal_min_delay_s: Math.min(...normal.map((r) => +r.time_difference)),
  rule_breakdown: Object.fromEntries(ruleCount),
  engine: 'preview · TS port of assess_accounting (exact-lock-mint-v1), coverage assumed complete',
  attack: atkEvents.map((e) => ({
    ts: e.ts, tx: e.tx, ord: e.ord, id: e.id, token: sym(e.token), ben: e.ben, amount: e.amount, decimals: dec(e.token),
    usd: Number(e.row.value_usd), route: routes.indexOf(e.token), status: e.verdict.status, rules: e.verdict.violations,
    authorized: e.verdict.authorized?.toString() ?? null, excess: e.verdict.excess?.toString() ?? null,
  })),
  normal: window.map((e) => ({
    ts: e.ts, tx: e.tx, dep_ts: +e.row.orig_timestamp, dep_tx: e.row.orig_tx_hash, id: e.id, token: sym(e.token),
    sender: e.row.sender, ben: e.ben, amount: e.amount, decimals: dec(e.token), usd: Number(e.row.value_usd), status: e.verdict.status,
  })),
};

assert.equal(nomad.attack_releases, 382);
assert.equal(nomad.attack_txs, 167);
assert.equal(nomad.distinct_message_ids, 14);
assert.deepEqual(nomad.top_message_id, { id: '4922', count: 279 });
assert.equal(nomad.ids_colliding_with_normal, 9);
assert.equal(nomad.tokens.length, 9);
assert.equal(nomad.beneficiaries, 279);
assert.equal(nomad.usd_total, 159577598);
assert.equal(new Date(t0 * 1000).toISOString(), '2022-08-01T21:32:31.000Z');
assert.equal(nomad.second_token_offset_s, 2986);
assert.equal(nomad.normal_pairs, 4482);
assert.equal(nomad.normal_aug_1_2, 193);
assert.equal(nomad.normal_min_delay_s, 1860);
// HANDOFF Step 1 done-test, previewed with the ported rule: 382 violations, 0 among the 193 normal.
assert.equal(atkEvents.filter((e) => e.verdict.status === 'invariant_violation').length, 382);
assert.equal(window.filter((e) => e.verdict.status === 'consistent_under_supplied_evidence').length, 193);

for (const [L, pause, hold, adaptive] of [[0, 5.8, 13.2, 7.0], [60, 10.1, 17.7, 11.5], [900, 10.4, 65.8, 33.8]]) {
  const got = Object.fromEntries(lanes(nomad.attack, L).map((l) => [l.policy, +l.lost_pct.toFixed(1)]));
  assert.deepEqual([got.pause_all, got.hold_routes, got.adaptive], [pause, hold, adaptive], `counterfactual @${L}s`);
}

// ── Ronin ────────────────────────────────────────────────────────────────
const roninRows = csv('data/raw/ronin_attack.csv').map((r) => ({ ...r, ts: +r.dst_timestamp })).sort((a, b) => a.ts - b.ts);
const roninTokens = [...new Set(roninRows.map((r) => r.dst_token))];
const ronin = {
  releases: roninRows.map((r) => ({ ts: r.ts, tx: r.dst_transaction_hash, token: sym(r.dst_token), amount: r.amount, decimals: dec(r.dst_token), usd: Number(r.value_usd), route: roninTokens.indexOf(r.dst_token) })),
  gap_s: roninRows[1].ts - roninRows[0].ts,
  usd_total_dataset: Math.round(usdSum(roninRows)),
  // PRD §2.1 public approximate figure (173,600 ETH + 25.5M USDC at the time). Not from the dataset.
  public_estimate_usd: 624000000,
};
assert.equal(ronin.gap_s, 115);
const roninPost = lanes(ronin.releases, 0).find((l) => l.policy === 'pause_all');
assert.ok(+(100 - roninPost.lost_pct).toFixed(1) <= 4.5, 'Ronin post-execution recovery ≤ 4.5% (HANDOFF states it to 1 dp)');

// ── Evidence library: every bundle the reference produced, re-verified in TS ──
const demo = json('artifacts/demo_report.json');
const live = json('artifacts/live_demo_report.json');
const decisions = [
  ...demo.cases.map((d, i) => [`demo_report.json · cases[${i}]`, d]),
  ['demo_report.json · after_source_reorg', demo.after_source_reorg],
  ['live_demo_report.json · attack_request', live.attack_request],
  ['live_demo_report.json · healthy_request', live.healthy_request],
  ['live_demo_report.json · healthy_release', live.healthy_release],
];
const evidence = [];
for (const [source, d] of decisions) {
  const { bundle, ...ev } = d.evidence;
  const res = await verifyBundle(bundle, { sha256: ev.bundle_sha256, status: d.status, violations: d.violations });
  const failed = res.steps.filter((s) => s.status === 'fail');
  assert.equal(failed.length, 0, `${source}: ${failed.map((s) => `${s.id}: ${s.detail}`).join('; ')}`);
  evidence.push({
    sha: ev.bundle_sha256, source, live: source.startsWith('live'),
    decision: { ...d, evidence: ev },
    proofs: res.steps.filter((s) => ['header', 'receipt', 'tx'].includes(s.id) && s.status === 'pass').length,
    bundle,
  });
}

const liveSummary = {
  scope: live.scope,
  hold_tx: live.hold_transaction,
  attack_execution_blocked: live.attack_execution_blocked,
  attempted_unbacked_base_units: live.attempted_unbacked_base_units,
  healthy_settled_base_units: live.recipient_balance_base_units,
  public_chain_transactions_sent: live.public_chain_transactions_sent,
  contracts_audited: live.contracts_audited,
  ml_used_for_containment: live.ML_used_for_containment,
  attack_sha: live.attack_request.evidence.bundle_sha256,
  scans: live.persistent_scans,
};

// ── Model card + engine benchmark ────────────────────────────────────────
const ev = json('artifacts/evaluation.json');
const model = {
  model_version: ev.model_version,
  splits: ev.splits,
  reliability_contract: ev.reliability_contract,
  heldout: ev.heldout,
  validation: ev.validation,
  statistical_baseline_heldout: ev.statistical_baseline_heldout,
  velocity_baseline: { features: ev.velocity_baseline.features, threshold_selection: ev.velocity_baseline.threshold_selection, heldout: ev.velocity_baseline.heldout ?? null },
  benchmark: json('artifacts/benchmark.json'),
};
assert.equal(model.heldout.tp, 9);
assert.equal(+(model.heldout.recall * 100).toFixed(2), 2.34);

// ── Detection feeds: the problem statement's three signals over any feed ─────
const bm = json('artifacts/behavior_model.json');
const vi = bm.velocity_features.map((f) => bm.feature_names.indexOf(f));
const VP = { median: vi.map((i) => bm.baseline_median[i]), scale: vi.map((i) => bm.baseline_scale[i]), threshold: bm.velocity_threshold, minHistory: bm.minimum_history };
const roninNormal = csv('data/raw/ronin_normal.csv');
const feedEv = (r, kind, auth) => ({ ts: +r.dst_timestamp, tx: r.dst_tx_hash ?? r.dst_transaction_hash, ord: r.ord ?? 0, id: r.withdrawal_id, route: sym(r.dst_token), decimals: dec(r.dst_token),
  amount: r.amount, usd: Number(r.value_usd), recipient: r.beneficiary, signers: null, auth, truth: kind });
const authOf = (r) => r ? { ts: +r.orig_timestamp, tx: r.orig_tx_hash, amount: r.amount, recipient: r.beneficiary, value_verification: 'adapter_verified' } : null;
const noSig = { validators: [], quorum: 0, allowPartial: false };
const compact = (a) => ({ ts: a.ts, tx: a.tx, ord: a.ord, id: a.id, route: a.route, dec: a.decimals, amount: a.amount, usd: +a.usd.toFixed(2), to: a.recipient,
  signers: a.signers, dep: a.auth ? { ts: a.auth.ts, tx: a.auth.tx } : null, truth: a.truth, scenario: a.scenario, status: a.status, rules: a.rules, exploit: a.exploit,
  excess: a.excess, vel: a.velocity, signer: a.signer });

const nomadAll = analyzeFeed([
  ...normal.map((r) => feedEv(r, "normal", authOf(r))),
  ...attack.map((r) => feedEv(r, "attack", authOf(authBy.get(`${r.dst_token}:${r.withdrawal_id}`)))),
], noSig, VP);
const nomadWin = nomadAll.filter((e) => e.ts >= AUG1 && e.ts < AUG3);
const roninAll = analyzeFeed([...roninNormal.map((r) => feedEv(r, "normal", authOf(r))), ...roninRows.map((r) => feedEv(r, "attack", null))], noSig, VP);
const roninT0 = roninRows[0].ts;
const roninWin = roninAll.filter((e) => Math.abs(e.ts - roninT0) < 6 * 3600);
const samples = roninNormal.filter((r) => ['WETH', 'USDC', 'AXS'].includes(sym(r.dst_token)) && +r.time_difference < 1800 && +r.value_usd > 0)
  .map((r) => ({ route: sym(r.dst_token), decimals: dec(r.dst_token), amount: r.amount, usd: Number(r.value_usd), delay: +r.time_difference }));
const sim = simulate(samples);
const simA = analyzeFeed(sim.events, { validators: sim.validators, quorum: sim.quorum, allowPartial: false }, VP);

// Simulated replay: every scheduled attack must produce its exploit type; controls and background must not.
const by = (sc) => simA.filter((e) => e.scenario === sc);
const expect = { 'Fake deposit': 'fake_deposit', 'Signature forgery': 'signature_forgery', Replay: 'replay', 'Key compromise + drain': 'validator_key_compromise',
  'Mismatched pair · recipient': 'mismatched_pair', 'Mismatched pair · +1 wei': 'mismatched_pair' };
for (const [sc, t] of Object.entries(expect)) assert.ok(by(sc).length && by(sc).every((e) => e.exploit === t && e.status === 'invariant_violation'), `sim ${sc} → ${t}: got ${by(sc).map((e) => e.exploit + '/' + e.rules)}`);
assert.ok(by('Key compromise + drain').some((e) => e.velocity.warn), 'drain burst raises a volume spike');
assert.ok(by('Key compromise + drain').some((e) => e.signer.some((x) => x.startsWith('lockstep'))), 'drain burst shows lockstep signing');
for (const sc of ['Whale (control)', 'Traffic burst (control)']) assert.ok(by(sc).every((e) => e.status === 'consistent_under_supplied_evidence'), `${sc} never violates`);
assert.ok(by('Traffic burst (control)').some((e) => e.exploit === 'volume_anomaly'), 'burst control shows volume is advisory only');
const bg = simA.filter((e) => e.truth === 'normal');
assert.ok(bg.every((e) => e.status === 'consistent_under_supplied_evidence'), 'background never violates');

const firstWarn = (xs) => xs.find((e) => e.velocity.warn);
const nAtk = nomadAll.filter((e) => e.truth === 'attack');
const rAtk = roninAll.filter((e) => e.truth === 'attack');
const detection = {
  velocity_params: { threshold: VP.threshold, min_history: VP.minHistory, source: 'artifacts/behavior_model.json (threshold chosen on pre-attack validation data)' },
  nomad: {
    attack_releases: nAtk.length,
    rule_flags: nAtk.filter((e) => e.status === 'invariant_violation').length,
    volume_flags_on_attack: nAtk.filter((e) => e.velocity.warn).length,
    first_volume_flag_offset_s: firstWarn(nAtk) ? firstWarn(nAtk).ts - t0 : null,
    normal_window: nomadWin.filter((e) => e.truth === 'normal').length,
    volume_flags_on_normal_window: nomadWin.filter((e) => e.truth === 'normal' && e.velocity.warn).length,
    volume_flags_on_all_normal: nomadAll.filter((e) => e.truth === 'normal' && e.velocity.warn).length,
    rule_flags_on_all_normal: nomadAll.filter((e) => e.truth === 'normal' && e.status === 'invariant_violation').length,
    all_normal: nomadAll.filter((e) => e.truth === 'normal').length,
    exploit_types: Object.fromEntries(count(nAtk.map((e) => e.exploit))),
  },
  ronin: {
    attack_releases: rAtk.length,
    rule_flags: rAtk.filter((e) => e.status === 'invariant_violation').length,
    volume_flags_on_attack: rAtk.filter((e) => e.velocity.warn).length,
    attack_velocity_dev: rAtk.map((e) => +e.velocity.dev.toFixed(2)),
    whale_over_1m: rAtk.filter((e) => e.usd > 1e6).length,
    normal_window: roninWin.filter((e) => e.truth === 'normal').length,
    volume_flags_on_all_normal: roninAll.filter((e) => e.truth === 'normal' && e.velocity.warn).length,
    rule_flags_on_all_normal: roninAll.filter((e) => e.truth === 'normal' && e.status === 'invariant_violation').length,
    all_normal: roninAll.filter((e) => e.truth === 'normal').length,
  },
  sim: {
    seed: SIM.seed, events: simA.length, background: bg.length,
    background_volume_false_alarms: bg.filter((e) => e.velocity.warn).length,
    scenarios: Object.fromEntries([...new Set(simA.filter((e) => e.scenario).map((e) => e.scenario))].map((sc) => [sc, {
      releases: by(sc).length, exploit: [...new Set(by(sc).map((e) => e.exploit))], volume_flags: by(sc).filter((e) => e.velocity.warn).length,
      first_volume_flag_index: by(sc).findIndex((e) => e.velocity.warn), signer: [...new Set(by(sc).flatMap((e) => e.signer))] }])),
  },
};
// One real alert from the simulated replay, for the landing page's "anatomy of an alert".
{
  const drain = by('Key compromise + drain');
  const e = drain.find((x) => x.velocity.warn && x.signer.includes('lockstep_signer_set'));
  const campaign = drain.filter((x) => x.ts <= e.ts && x.ts > e.ts - 900).length >= 5;
  detection.example_alert = { scenario: e.scenario, offset_s: e.ts - SIM.t0, route: e.route, amount: e.amount, decimals: e.decimals, usd: e.usd,
    exploit: e.exploit, rules: e.rules, volume_dev: +e.velocity.dev.toFixed(2), signer: e.signer, risk: riskScore(e.exploit, e.usd, campaign),
    signers: e.signers.map((x) => sim.validators.indexOf(x) + 1), tx: e.tx };
}
assert.equal(detection.nomad.rule_flags, 382);
assert.equal(detection.ronin.rule_flags, 2);
const feedsOut = {
  sim: { name: 'Simulated attack replay', provenance: 'synthetic', seed: SIM.seed, t0: SIM.t0, chains: [31337, 31338], validators: sim.validators, quorum: sim.quorum,
    note: 'Seeded. Background amounts and deposit→release delays resampled from real Ronin transfers; attacks scheduled; controls must not alarm.', events: simA.map(compact) },
  nomad: { name: 'Nomad · 1 Aug 2022', provenance: 'real', t0: AUG1, chains: [1650811245, 6648936], validators: [], quorum: 0,
    note: 'XChainWatcher dataset, 1–2 Aug 2022. The dataset has no signer data.', events: nomadWin.map(compact) },
  ronin: { name: 'Ronin · 23 Mar 2022', provenance: 'real', t0: roninT0 - 6 * 3600, chains: [2020, 1], validators: [], quorum: 0,
    note: 'XChainWatcher dataset, ±6 h around the attack. The dataset has no signer data (public reports: 5 of 9 validator keys were stolen).', events: roninWin.map(compact) },
};

fs.mkdirSync(OUT, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(OUT, name), JSON.stringify({ provenance: 'fixture', generated_by: 'scripts/build-fixtures.mjs', sources: [...new Set(sources.map((s) => s.path))].map((p) => sources.find((s) => s.path === p)), ...data }) + '\n');
write('history.json', { nomad, ronin });
write('evidence.json', { bundles: evidence, live: liveSummary });
write('model.json', { model });
write('feeds.json', { feeds: feedsOut });
write('detection.json', { detection });
console.log(JSON.stringify(detection, null, 1));
console.log(`fixtures ok · rules ${JSON.stringify(nomad.rule_breakdown)} · ${evidence.length} bundles re-verified in TS · all HANDOFF checks passed`);
