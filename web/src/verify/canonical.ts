// Python parity: json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
// then sha256 hex. Used by the browser verifier and by scripts/build-fixtures.mjs.
// ponytail: floats follow JS formatting (Python differs on e.g. 1e16 vs 1e+16); bundles carry
// amounts as strings and only small ints, so this holds until a bundle grows real floats.

const ascii = (s: string) => s.replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => ascii(JSON.stringify(k)) + ':' + canonicalJson(o[k])).join(',') + '}';
  }
  if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN/Infinity not allowed (allow_nan=False)');
  return ascii(JSON.stringify(v));
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const bundleSha256 = (bundle: unknown) => sha256Hex(canonicalJson(bundle));
