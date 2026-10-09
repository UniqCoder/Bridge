// Proof of Non-Deposit demo: a simulated SourceBridge whose deposits live in contract storage,
// laid out like Ethereum's (storage trie → account → state root). The same code builds the proofs
// the server would fetch with eth_getProof, and checks them the way the browser verifier does.
// Synthetic by design: the chain and the deposits are made up; the trie and proof mechanics are real.
import { RLP } from '@ethereumjs/rlp';
import { buildTrie } from './trie.ts';
import { data, equalBytes, keccak, toHex } from '../verify/bytes.ts';
import { mptGet } from '../verify/proofs.ts';

const utf8 = (s: string) => new TextEncoder().encode(s);
const word = (b: Uint8Array) => { const o = new Uint8Array(32); o.set(b, 32 - b.length); return o; };
const cat = (...xs: Uint8Array[]) => { const o = new Uint8Array(xs.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of xs) { o.set(x, i); i += x.length; } return o; };
const uint = (v: bigint) => { const o = new Uint8Array(32); for (let i = 31; v > 0n; i--, v >>= 8n) o[i] = Number(v & 0xffn); return o; };

export type Transfer = { token: string; amount: bigint; recipient: string; chainId: number };
export const BRIDGE_ADDR = '0x02997644f9bf91bad6623a6db45740dfc759cc08';
const TOKEN = '0x8f5d8c1cea7b1be57b58f6b301e99444078d277e';

// deposits[id] = keccak256(abi.encode(token, amount, recipient, destinationChainId))
export const commitment = (t: Transfer) => keccak(cat(word(data(t.token)), uint(t.amount), word(data(t.recipient)), uint(BigInt(t.chainId))));
export const slotOf = (id: string) => keccak(cat(keccak(utf8(id)), new Uint8Array(32))); // keccak(abi.encode(key, 0))

export const DEPOSITS: { id: string; t: Transfer }[] = [
  ['msg-0001', 25_000_000n, '0x9cbbcd3db186ee773d59544398fea980b0df5a45'],
  ['msg-0002', 100_000_000n, '0x098b716b8aaf21512996dc57eb0615e2383e2f96'],
  ['msg-0003', 4_200_000n, '0x5b8388b78153a47bda54560eedbbfedb09054e67'],
  ['msg-0004', 61_000_000n, '0xf57113d8f6ff35747737f026fe0b37d4d7f42777'],
  ['msg-0005', 7_500_000n, '0xa8c83b1b30291a3a1a118058b5445cc83041cd9d'],
  ['msg-0006', 310_000_000n, '0x431c8c53266b2e241497b59942ff3ad0395838b8'],
].map(([id, amount, recipient]) => ({ id: id as string, t: { token: TOKEN, amount: amount as bigint, recipient: recipient as string, chainId: 31338 } }));

export type Chain = ReturnType<typeof buildChain>;

// Storage always holds every deposit. A faulty indexer's view of events is modelled separately in the demo.
export function buildChain() {
  const storage = buildTrie(DEPOSITS.map((d) => [keccak(slotOf(d.id)), RLP.encode(commitment(d.t))] as [Uint8Array, Uint8Array]));
  const emptyCode = keccak(new Uint8Array());
  const account = RLP.encode([new Uint8Array([1]), new Uint8Array(), storage.root, emptyCode]);
  const emptyRoot = keccak(RLP.encode(new Uint8Array()));
  // A few unrelated accounts so the state trie has real branches above the bridge.
  const filler = [1, 2, 3].map((i) => [keccak(utf8(`eoa-${i}`)), RLP.encode([new Uint8Array(), new Uint8Array([i]), emptyRoot, emptyCode])] as [Uint8Array, Uint8Array]);
  const state = buildTrie([[keccak(data(BRIDGE_ADDR)), account], ...filler]);
  return {
    stateRoot: state.root,
    storageRoot: storage.root,
    // What the adapter would fetch: eth_getProof(bridge, [slot], finalized block).
    getProof(id: string) {
      const slot = slotOf(id);
      return { accountProof: state.prove(keccak(data(BRIDGE_ADDR))), storageProof: storage.prove(keccak(slot)), slot };
    },
  };
}

export type ProofStep = { label: string; ok: boolean; detail: string };
export type Proof = ReturnType<Chain['getProof']>;

// Browser-side check against a state root we trust (the block header's). Returns the slot's value, or null if provably empty.
export function checkProof(stateRoot: Uint8Array, id: string, p: Proof) {
  const steps: ProofStep[] = [];
  let storageRoot: Uint8Array | null = null;
  try {
    const acct = mptGet(stateRoot, keccak(data(BRIDGE_ADDR)), p.accountProof);
    if (!acct) throw new Error('bridge account not found in this state');
    storageRoot = (RLP.decode(acct) as Uint8Array[])[2];
    steps.push({ label: 'Account proof', ok: true, detail: `bridge contract exists in state ${toHex(stateRoot).slice(0, 12)}…; its storage root is ${toHex(storageRoot).slice(0, 12)}…` });
  } catch (e) {
    steps.push({ label: 'Account proof', ok: false, detail: (e as Error).message });
    return { steps, ok: false, value: undefined as Uint8Array | null | undefined };
  }
  try {
    const raw = mptGet(storageRoot, keccak(p.slot), p.storageProof);
    const value = raw ? (RLP.decode(raw) as Uint8Array) : null;
    steps.push({
      label: value ? 'Storage proof: slot is set' : 'Storage proof: slot is empty',
      ok: true,
      detail: value ? `deposits[${id}] = ${toHex(value).slice(0, 14)}…` : `the proof path for deposits[${id}] ends at nothing: no deposit exists`,
    });
    return { steps, ok: true, value };
  } catch (e) {
    steps.push({ label: 'Storage proof', ok: false, detail: (e as Error).message });
    return { steps, ok: false, value: undefined };
  }
}

export const matches = (value: Uint8Array | null, t: Transfer) => !!value && equalBytes(value, commitment(t));
