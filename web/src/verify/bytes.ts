import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

export const strip0x = (h: string) => (h.startsWith('0x') ? h.slice(2) : h);
export const toHex = (b: Uint8Array) => '0x' + bytesToHex(b);
export const keccak = (b: Uint8Array) => keccak_256(b);

// Python proofs.data(): fixed-size byte string from hex.
export function data(h: string, size?: number) {
  const s = strip0x(h);
  const b = hexToBytes(s.length % 2 ? '0' + s : s);
  if (size !== undefined && b.length !== size) throw new Error(`expected ${size} bytes, got ${b.length}`);
  return b;
}

// Python proofs.quantity(): integer → minimal big-endian bytes (0 → empty), as RLP expects.
export function quantity(h: string | number) {
  let v = BigInt(h);
  const out: number[] = [];
  while (v > 0n) { out.unshift(Number(v & 0xffn)); v >>= 8n; }
  return Uint8Array.from(out);
}

export const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
