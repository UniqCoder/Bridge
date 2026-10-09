import { RLP } from '@ethereumjs/rlp';
import { data, equalBytes, keccak, quantity, toHex } from './bytes.ts';

type Header = Record<string, string>;
const SUFFIX: [string, boolean][] = [
  ['baseFeePerGas', false], ['withdrawalsRoot', true], ['blobGasUsed', false],
  ['excessBlobGas', false], ['parentBeaconBlockRoot', true], ['requestsHash', true],
];

// Port of proofs.header_bytes: re-encode the execution header and recompute its hash.
export function headerHash(h: Header) {
  const fields: Uint8Array[] = [
    data(h.parentHash, 32), data(h.sha3Uncles, 32), data(h.miner, 20), data(h.stateRoot, 32),
    data(h.transactionsRoot, 32), data(h.receiptsRoot, 32), data(h.logsBloom, 256),
    quantity(h.difficulty), quantity(h.number), quantity(h.gasLimit), quantity(h.gasUsed), quantity(h.timestamp),
    data(h.extraData), data(h.mixHash, 32), data(h.nonce, 8),
  ];
  let absent = false;
  for (const [key, isData] of SUFFIX) {
    if (h[key] == null) { absent = true; continue; }
    if (absent) throw new Error('unsupported execution header field sequence');
    fields.push(isData ? data(h[key], 32) : quantity(h[key]));
  }
  return toHex(keccak(RLP.encode(fields)));
}

const nibbles = (b: Uint8Array) => [...b].flatMap((x) => [x >> 4, x & 15]);

// Merkle-Patricia proof walk: returns the value at `key` under `root`, or null if the proof
// shows the key is absent (exclusion). Throws if a referenced node is missing or forged.
export function mptGet(root: Uint8Array, key: Uint8Array, proof: Uint8Array[]): Uint8Array | null {
  const byHash = new Map(proof.map((n) => [toHex(keccak(n)), n]));
  let path = nibbles(key);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = RLP.decode(lookup(root));
  function lookup(ref: Uint8Array) {
    const raw = byHash.get(toHex(ref));
    if (!raw) throw new Error(`proof node ${toHex(ref).slice(0, 12)}… missing or altered`);
    return raw;
  }
  // A child is either a 32-byte hash reference or an inlined node (< 32 bytes).
  const follow = (child: Uint8Array | Uint8Array[]) => (Array.isArray(child) ? child : RLP.decode(lookup(child)));
  for (;;) {
    if (node.length === 17) {
      if (path.length === 0) return node[16].length ? node[16] : null;
      const child = node[path[0]];
      path = path.slice(1);
      if (!Array.isArray(child) && child.length === 0) return null;
      node = follow(child);
    } else if (node.length === 2) {
      const enc = nibbles(node[0]);
      const leaf = enc[0] >= 2;
      const part = enc.slice(enc[0] % 2 ? 1 : 2);
      const matches = part.every((n, i) => path[i] === n);
      if (leaf) return matches && part.length === path.length ? node[1] : null;
      if (!matches) return null;
      path = path.slice(part.length);
      node = follow(node[1]);
    } else throw new Error('malformed trie node');
  }
}

// Inclusion of the receipt / transaction at `index` under the header's roots.
export function verifyInclusion(root: string, index: number, valueHex: string, nodesHex: string[]) {
  const got = mptGet(data(root, 32), RLP.encode(index), nodesHex.map((n) => data(n)));
  return got !== null && equalBytes(got, data(valueHex));
}
