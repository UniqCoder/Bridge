// Minimal Merkle-Patricia trie builder + proof generator, for the in-browser Proof of Non-Deposit demo.
// Verified against the public Ethereum "doe / dog / dogglesworth" test vector (scripts/check-demo.mjs).
// Proofs verify with the same `mptGet` the evidence verifier uses on real chain proofs.
import { RLP } from '@ethereumjs/rlp';
import { keccak } from '../verify/bytes.ts';

type Ref = Uint8Array | unknown[];
type Node =
  | { t: 'leaf'; path: number[]; value: Uint8Array }
  | { t: 'ext'; path: number[]; child: Node }
  | { t: 'branch'; kids: (Node | null)[]; value: Uint8Array };

export const nibbles = (b: Uint8Array) => [...b].flatMap((x) => [x >> 4, x & 15]);
// Hex-prefix encoding: high nibble carries leaf (2) / odd-length (1) flags.
const hp = (path: number[], leaf: boolean) => {
  const odd = path.length % 2;
  const nib = odd ? [(leaf ? 3 : 1), ...path] : [leaf ? 2 : 0, 0, ...path];
  const out = new Uint8Array(nib.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = (nib[2 * i] << 4) | nib[2 * i + 1];
  return out;
};

const structure = (n: Node): unknown[] => {
  if (n.t === 'leaf') return [hp(n.path, true), n.value];
  if (n.t === 'ext') return [hp(n.path, false), ref(n.child)];
  return [...n.kids.map((k) => (k ? ref(k) : new Uint8Array())), n.value];
};
const encode = (n: Node) => RLP.encode(structure(n) as never);
// A node is referenced by hash when its encoding is ≥ 32 bytes, otherwise embedded.
function ref(n: Node): Ref {
  const enc = encode(n);
  return enc.length < 32 ? structure(n) : keccak(enc);
}

function build(entries: { path: number[]; value: Uint8Array }[]): Node {
  if (entries.length === 1) return { t: 'leaf', path: entries[0].path, value: entries[0].value };
  let p = 0;
  const first = entries[0].path;
  while (entries.every((e) => e.path.length > p && e.path[p] === first[p])) p++;
  if (p > 0) return { t: 'ext', path: first.slice(0, p), child: build(entries.map((e) => ({ ...e, path: e.path.slice(p) }))) };
  const kids: (Node | null)[] = Array(16).fill(null);
  let value = new Uint8Array();
  for (let i = 0; i < 16; i++) {
    const group = entries.filter((e) => e.path[0] === i).map((e) => ({ ...e, path: e.path.slice(1) }));
    if (group.length) kids[i] = build(group);
  }
  const here = entries.find((e) => e.path.length === 0);
  if (here) value = here.value;
  return { t: 'branch', kids, value };
}

export type Trie = { root: Uint8Array; prove: (key: Uint8Array) => Uint8Array[]; has: (key: Uint8Array) => boolean };

export function buildTrie(items: [Uint8Array, Uint8Array][]): Trie {
  const empty = keccak(RLP.encode(new Uint8Array()));
  if (!items.length) return { root: empty, prove: () => [], has: () => false };
  const sorted = [...items].sort((a, b) => nibbles(a[0]).join().localeCompare(nibbles(b[0]).join()));
  const rootNode = build(sorted.map(([k, v]) => ({ path: nibbles(k), value: v })));
  const keys = new Set(items.map(([k]) => nibbles(k).join()));
  return {
    root: keccak(encode(rootNode)),
    has: (k) => keys.has(nibbles(k).join()),
    // Nodes visited on the way to `key`: the root plus every hashed node. Ends early for an absent key.
    prove(key) {
      const out: Uint8Array[] = [];
      let node: Node | null = rootNode;
      let path = nibbles(key);
      let isRoot = true;
      while (node) {
        const enc = encode(node);
        if (isRoot || enc.length >= 32) out.push(enc);
        isRoot = false;
        if (node.t === 'leaf') break;
        if (node.t === 'ext') {
          if (!node.path.every((n, i) => path[i] === n)) break;
          path = path.slice(node.path.length);
          node = node.child;
        } else {
          if (path.length === 0) break;
          node = node.kids[path[0]];
          path = path.slice(1);
        }
      }
      return out;
    },
  };
}
