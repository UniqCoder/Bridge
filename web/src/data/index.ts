import history from './fixtures/history.json';
import evidence from './fixtures/evidence.json';
import model from './fixtures/model.json';
import detection from './fixtures/detection.json';

// Fixture mode until the backend endpoints land (HANDOFF §4). Set VITE_BW_API to switch.
export const API = import.meta.env.VITE_BW_API as string | undefined;
export const MODE: 'fixture' | 'live' = API ? 'live' : 'fixture';

export const NOMAD = history.nomad;
export const RONIN = history.ronin;
export const SOURCES = history.sources;
export const EVIDENCE = evidence.bundles;
export const LIVE = evidence.live;
export const MODEL = model.model;

export type AttackRow = (typeof NOMAD.attack)[number];
export type NormalRow = (typeof NOMAD.normal)[number];
export type EvidenceEntry = (typeof EVIDENCE)[number];
export const evidenceBySha = (sha: string) => EVIDENCE.find((e) => e.sha.startsWith(sha));

// Problem-statement detection summary (computed and asserted by build-fixtures.mjs).
const d = detection.detection;
const simAttacks = Object.keys(d.sim.scenarios).filter((k) => !k.includes('(control)'));
export const DET = {
  ...d,
  sim_attacks: simAttacks.length,
  sim_correct: simAttacks.length, // the fixture build fails unless every attack scenario gets its expected type
  nomad_loss_before_volume: history.nomad.attack.filter((r) => r.ts < history.nomad.first_ts + (d.nomad.first_volume_flag_offset_s ?? 0)).reduce((a, r) => a + r.usd, 0),
};
