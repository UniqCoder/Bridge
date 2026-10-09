import { NOMAD, type AttackRow, type NormalRow } from '../data';

// Cross-chain flow graph of 1–2 Aug 2022: source message commitments (Moonbeam) → releases to
// beneficiaries (Ethereum), grouped by token route. Attack releases with no deposit on their route hang
// off the VOID node; replayed ids hang off the real message they reused.
export type GNode = {
  i: number; kind: 'message' | 'void' | 'beneficiary' | 'token'; key: string; label: string;
  pos: [number, number, number]; degree: number; usd: number; attack: number; token?: string; firstTs: number;
};
export type GEdge = { from: number; to: number; ts: number; attack: boolean; usd: number; tx: string; rule?: string };

const PLANE = 7;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

function build() {
  const attack = NOMAD.attack as AttackRow[];
  const normal = NOMAD.normal as NormalRow[];
  const nodes: GNode[] = [];
  const index = new Map<string, number>();
  const node = (key: string, make: () => Omit<GNode, 'i' | 'degree' | 'usd' | 'attack' | 'pos'>) => {
    let i = index.get(key);
    if (i === undefined) {
      i = nodes.length;
      nodes.push({ ...make(), i, degree: 0, usd: 0, attack: 0, pos: [0, 0, 0] });
      index.set(key, i);
    }
    return nodes[i];
  };

  type Rel = { ts: number; id: string; token: string; ben: string; usd: number; attack: boolean; tx: string; rule?: string; noDeposit: boolean };
  const rels: Rel[] = [
    ...normal.map((r) => ({ ts: r.ts, id: r.id, token: r.token, ben: r.ben, usd: r.usd, attack: false, tx: r.tx, noDeposit: false })),
    ...attack.map((r) => ({ ts: r.ts, id: r.id, token: r.token, ben: r.ben, usd: r.usd, attack: true, tx: r.tx, rule: r.rules[0], noDeposit: r.rules.includes('missing_source_authorization') })),
  ].sort((a, b) => a.ts - b.ts);

  const edges: GEdge[] = [];
  for (const r of rels) {
    const src = r.noDeposit
      ? node('void', () => ({ kind: 'void', key: 'void', label: '∅ no deposit on route', firstTs: r.ts }))
      : node(`m:${r.id}`, () => ({ kind: 'message', key: r.id, label: `message ${r.id}`, firstTs: r.ts }));
    const dst = node(`b:${r.token}:${r.ben}`, () => ({ kind: 'beneficiary', key: r.ben, label: r.ben, token: r.token, firstTs: r.ts }));
    for (const n of [src, dst]) { n.degree++; n.usd += r.usd; if (r.attack) n.attack++; }
    edges.push({ from: src.i, to: dst.i, ts: r.ts, attack: r.attack, usd: r.usd, tx: r.tx, rule: r.rule });
  }

  // Source plane: golden-angle disk, biggest hubs at the centre; VOID sits below the disk.
  const sources = nodes.filter((n) => n.kind === 'message').sort((a, b) => b.degree - a.degree);
  sources.forEach((n, k) => {
    const r = 0.32 * Math.sqrt(k) + (k ? 0.5 : 0);
    n.pos = [-PLANE, 5 + Math.sin(k * GOLDEN) * r, Math.cos(k * GOLDEN) * r];
  });
  const v = nodes.find((n) => n.kind === 'void');
  if (v) v.pos = [-PLANE, 0.4, 0];

  // Destination plane: one cluster per token route, ringed around the centre.
  const tokens = [...new Set(nodes.filter((n) => n.kind === 'beneficiary').map((n) => n.token!))]
    .map((t) => ({ t, n: nodes.filter((x) => x.token === t).length })).sort((a, b) => b.n - a.n);
  tokens.forEach(({ t }, k) => {
    const ang = (k / tokens.length) * Math.PI * 2 - Math.PI / 2;
    const rr = k === 0 ? 0 : 3.6;
    const c: [number, number, number] = [PLANE, 5 + Math.sin(ang) * rr, Math.cos(ang) * rr];
    const hub = node(`t:${t}`, () => ({ kind: 'token', key: t, label: t, token: t, firstTs: 0 }));
    hub.pos = c;
    nodes.filter((x) => x.kind === 'beneficiary' && x.token === t).sort((a, b) => a.firstTs - b.firstTs).forEach((b, j) => {
      const r = 0.16 * Math.sqrt(j + 1);
      b.pos = [PLANE, c[1] + Math.sin(j * GOLDEN) * r, c[2] + Math.cos(j * GOLDEN) * r];
      hub.degree++; hub.usd += b.usd; hub.attack += b.attack;
    });
  });

  return { nodes, edges, tokens: tokens.map((t) => t.t) };
}

export const GRAPH = build();
export const PLANE_X = PLANE;
