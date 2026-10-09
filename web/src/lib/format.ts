// Amounts are decimal strings in base units: BigInt only, never Number.
export function formatUnits(base: string, decimals: number) {
  const v = BigInt(base);
  const s = 10n ** BigInt(decimals);
  const frac = (v % s).toString().padStart(decimals, '0');
  return `${(v / s).toLocaleString('en-US')}${decimals ? '.' + frac : ''}`;
}

export const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const short = (h: string, a = 6, b = 4) => `${h.slice(0, a)}…${h.slice(-b)}`;
export const utc = (ts: number) => new Date(ts * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const span = (p: number, a: number, b: number) => clamp01((p - a) / (b - a));

export function duration(s: number) {
  if (s < 60) return `${Math.round(s)} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(s < 36000 ? 1 : 0)} h`;
  return `${(s / 86400).toFixed(1)} days`;
}

// Thousands separators on a decimal string without going through Number.
export const group = (dec: string) => {
  const [i, f] = dec.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
};
