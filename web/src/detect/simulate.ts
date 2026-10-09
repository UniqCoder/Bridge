// Simulated attack replay (the problem statement accepts one): a seeded bridge with a 5-of-9 validator
// set. Background transfers resample real Ronin amounts and deposit→release delays; scheduled attacks
// cover the problem statement's exploit types; controls must NOT raise an exploit alert.
import type { FeedEvent } from './analyze.ts';

export type Sample = { route: string; decimals: number; amount: string; usd: number; delay: number };

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hex = (r: () => number, n: number) => Array.from({ length: n }, () => Math.floor(r() * 16).toString(16)).join('');

export const SIM = { seed: 2410, t0: 1767225600, minutes: 180, quorum: 5, perRouteMeanS: 300 };

export function simulate(samples: Sample[]) {
  const r = rng(SIM.seed);
  const addr = () => '0x' + hex(r, 40);
  const tx = () => '0x' + hex(r, 64);
  const validators = Array.from({ length: 9 }, addr);
  const weight = [0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55];
  const pickSigners = () => {
    const k = 5 + Math.floor(r() * 3);
    return validators.map((v, i) => ({ v, s: r() / weight[i] })).sort((a, b) => a.s - b.s).slice(0, k).map((x) => x.v);
  };
  const routes = [...new Set(samples.map((s) => s.route))];
  const byRoute = (route: string) => samples.filter((s) => s.route === route);
  const events: FeedEvent[] = [];
  let n = 0;
  const T = (min: number) => SIM.t0 + Math.round(min * 60);

  // Background: Poisson arrivals per route at a rate similar to the real datasets.
  for (const route of routes) {
    const pool = byRoute(route);
    let t = SIM.t0 + Math.floor(r() * 120);
    while (t < T(SIM.minutes)) {
      const s = pool[Math.floor(r() * pool.length)];
      const id = `sim-${++n}`;
      const to = addr();
      events.push({ ts: t, tx: tx(), ord: 0, id, route, decimals: s.decimals, amount: s.amount, usd: s.usd, recipient: to, signers: pickSigners(),
        auth: { ts: t - s.delay, tx: tx(), amount: s.amount, recipient: to, value_verification: 'adapter_verified' }, truth: 'normal' });
      t += Math.max(20, Math.round(-Math.log(1 - r()) * SIM.perRouteMeanS));
    }
  }
  const price = (route: string) => { const p = byRoute(route); return p.reduce((a, s) => a + s.usd, 0) / p.reduce((a, s) => a + Number(s.amount) / 10 ** s.decimals, 0); };
  const units = (route: string, whole: number) => (BigInt(Math.round(whole * 1e6)) * 10n ** BigInt(samples.find((s) => s.route === route)!.decimals - 6)).toString();
  const dec = (route: string) => samples.find((s) => s.route === route)!.decimals;
  const attack = (e: Partial<FeedEvent> & { route: string; whole: number; ts: number; scenario: string }, truth: 'attack' | 'control' = 'attack'): FeedEvent => {
    const { whole, ...rest } = e;
    return { tx: tx(), ord: 0, id: `sim-${++n}`, decimals: dec(e.route), amount: units(e.route, whole), usd: Math.round(whole * price(e.route)),
      recipient: addr(), signers: pickSigners(), auth: null, truth, ...rest } as FeedEvent;
  };
  const [stable, eth, alt] = ['USDC', 'WETH', 'AXS'];

  // 1 · Fake deposit: the deposit event fires but no tokens moved into the bridge.
  { const to = addr(); const a = units(stable, 250000);
    events.push(attack({ route: stable, whole: 250000, ts: T(60), scenario: 'Fake deposit', recipient: to,
      auth: { ts: T(58), tx: tx(), amount: a, recipient: to, value_verification: 'adapter_mismatch' } })); }
  // 2 · Signature forgery: 3 real validators + 2 unknown keys, no deposit.
  events.push(attack({ route: eth, whole: 480, ts: T(75), scenario: 'Signature forgery', signers: [validators[1], validators[6], validators[8], addr(), addr()] }));
  // 3 · Replay: an already-released background message is released again.
  { const old = events.filter((e) => e.truth === 'normal' && e.route === stable && e.ts < T(85)).at(-1)!;
    events.push({ ...old, ts: T(90), tx: tx(), truth: 'attack', scenario: 'Replay', signers: pickSigners() }); }
  // 4 · Validator key compromise → liquidity drain: 5 stolen keys sign 14 unbacked releases in ~200 s.
  { const thieves = [addr(), addr(), addr()];
    for (let i = 0; i < 14; i++) events.push(attack({ route: eth, whole: 300 + Math.round(r() * 600), ts: T(105) + i * 15, scenario: 'Key compromise + drain', recipient: thieves[i % 3], signers: validators.slice(0, 5) })); }
  // 5 · Control: a large but fully backed transfer.
  { const to = addr(); const a = units(stable, 3000000);
    events.push(attack({ route: stable, whole: 3000000, ts: T(125), scenario: 'Whale (control)', recipient: to, auth: { ts: T(120), tx: tx(), amount: a, recipient: to, value_verification: 'adapter_verified' } }, 'control')); }
  // 6 · Control: a burst of legitimate, fully backed transfers (an airdrop claim rush).
  for (let i = 0; i < 9; i++) { const to = addr(); const a = units(alt, 40 + i * 7);
    events.push(attack({ route: alt, whole: 40 + i * 7, ts: T(135) + i * 16, scenario: 'Traffic burst (control)', recipient: to, auth: { ts: T(131), tx: tx(), amount: a, recipient: to, value_verification: 'adapter_verified' } }, 'control')); }
  // 7 · Mismatched pair: the release goes to a different recipient than the deposit named.
  { const a = units(stable, 12500);
    events.push(attack({ route: stable, whole: 12500, ts: T(150), scenario: 'Mismatched pair · recipient', auth: { ts: T(146), tx: tx(), amount: a, recipient: addr(), value_verification: 'adapter_verified' } })); }
  // 8 · Mismatched pair: one wei more than deposited.
  { const to = addr(); const a = units(stable, 9000);
    events.push(attack({ route: stable, whole: 9000, ts: T(162), scenario: 'Mismatched pair · +1 wei', recipient: to, amount: (BigInt(a) + 1n).toString(), auth: { ts: T(158), tx: tx(), amount: a, recipient: to, value_verification: 'adapter_verified' } })); }

  return { events, validators, quorum: SIM.quorum, routes };
}
