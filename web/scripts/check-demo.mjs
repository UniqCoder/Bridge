// Checks the in-browser demos against known answers. Run: npm run check
import assert from 'node:assert/strict';
import { buildTrie } from '../src/demo/trie.ts';
import { mptGet } from '../src/verify/proofs.ts';
import { toHex, keccak } from '../src/verify/bytes.ts';

const enc = (s) => new TextEncoder().encode(s);

// 1 · Public Ethereum test vector (doe / dog / dogglesworth). Root from the Ethereum wiki.
const t = buildTrie([[enc('doe'), enc('reindeer')], [enc('dog'), enc('puppy')], [enc('dogglesworth'), enc('cat')]]);
assert.equal(toHex(t.root), '0x8aad789dff2f538bca5d8ea56e8abe10f4c7ba3a5dea95fea4cd6e7c3a1168d3', 'trie root matches the Ethereum test vector');

// 2 · Inclusion and exclusion proofs verify with the same walker used on real chain proofs.
for (const [k, v] of [['doe', 'reindeer'], ['dog', 'puppy'], ['dogglesworth', 'cat']]) {
  assert.equal(new TextDecoder().decode(mptGet(t.root, enc(k), t.prove(enc(k)))), v, `inclusion ${k}`);
}
for (const k of ['do', 'dogs', 'cat', 'doge', 'dogglesworths']) assert.equal(mptGet(t.root, enc(k), t.prove(enc(k))), null, `exclusion ${k}`);

// 3 · A larger hashed-key trie (like a contract's storage): every key proves, absent keys exclude, tampering fails.
const items = Array.from({ length: 200 }, (_, i) => [keccak(enc(`slot-${i}`)), keccak(enc(`value-${i}`))]);
const big = buildTrie(items);
for (const [k, v] of items.slice(0, 60)) assert.equal(toHex(mptGet(big.root, k, big.prove(k))), toHex(v));
for (let i = 0; i < 60; i++) { const k = keccak(enc(`absent-${i}`)); assert.equal(mptGet(big.root, k, big.prove(k)), null); }
const [k0] = items[0];
const proof = big.prove(k0).map((n) => n.slice());
proof[1][proof[1].length - 1] ^= 1;
assert.throws(() => mptGet(big.root, k0, proof), /missing or altered/, 'a tampered proof node is rejected');
console.log('demo trie ok: Ethereum vector, 200-slot storage trie, exclusion, tamper');

// 4 · Proof of Non-Deposit demo bridge: backed deposits include, unknown ids exclude, tampering fails.
const { buildChain, checkProof, commitment, matches, DEPOSITS } = await import('../src/demo/proofBridge.ts');
const chain = buildChain();
for (const d of DEPOSITS) {
  const r = checkProof(chain.stateRoot, d.id, chain.getProof(d.id));
  assert.ok(r.ok && matches(r.value, d.t), `${d.id} proves and its commitment matches`);
  assert.ok(!matches(r.value, { ...d.t, amount: d.t.amount + 1n }), 'one wei more does not match the commitment');
  assert.ok(!matches(r.value, { ...d.t, recipient: '0x' + '11'.repeat(20) }), 'another recipient does not match');
}
for (const id of ['msg-9999', 'stolen-key', 'never-deposited']) {
  const r = checkProof(chain.stateRoot, id, chain.getProof(id));
  assert.ok(r.ok && r.value === null, `${id} is provably absent`);
}
{ const p = chain.getProof('msg-0003'); p.storageProof[p.storageProof.length - 1] = p.storageProof.at(-1).map((b, i) => (i === 3 ? b ^ 1 : b));
  assert.equal(checkProof(chain.stateRoot, 'msg-0003', p).ok, false, 'tampered storage proof fails'); }
{ const p = chain.getProof('msg-0003'); const other = buildChain().stateRoot.slice(); other[0] ^= 1;
  assert.equal(checkProof(other, 'msg-0003', p).ok, false, 'proof against a different state root fails'); }
console.log('proof bridge ok: 6 deposits include, 3 absent ids exclude, tamper + wrong root fail');

// 5 · All 12 Gauntlet attacks run in the browser through the real rule and match their expected verdicts.
const { runAttack } = await import('../src/demo/attacks.ts');
const results = Array.from({ length: 12 }, (_, i) => runAttack(i + 1));
for (const r of results) assert.ok(r.pass, `#${r.n} ${r.name}: expected ${r.expected}/${r.expectedRule}, observed ${r.observed.status}/${r.observed.rules}`);
assert.equal(results[1].observed.note, 'first over-limit release is #20');
assert.equal(results[4].observed.excess, '0.000001');
assert.ok(results.filter((r) => r.control).every((r) => r.gate === 'allowed'), 'controls are never held');
assert.deepEqual(results.filter((r) => r.gate === 'held').map((r) => r.n), [1, 2, 3, 4, 5, 9, 10, 12]);
assert.equal(results[11].second.observed.status, 'consistent_under_supplied_evidence');
console.log('attacks ok: 12/12 match expected verdicts; held =', results.filter((r) => r.gate === 'held').map((r) => r.n).join(','));
