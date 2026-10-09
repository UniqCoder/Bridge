import { useState, type ElementType, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

export type Status = 'invariant_violation' | 'consistent_under_supplied_evidence' | 'unknown' | 'pending' | 'overdue' | 'orphaned';
export const VERDICT_LABEL: Record<Status, string> = {
  invariant_violation: 'violation',
  consistent_under_supplied_evidence: 'consistent',
  unknown: 'unknown',
  pending: 'pending',
  overdue: 'overdue',
  orphaned: 'orphaned',
};
export const VERDICT_MEANING: Record<Status, string> = {
  invariant_violation: 'Finalized facts break a backing rule.',
  consistent_under_supplied_evidence: 'All checks pass on the evidence supplied.',
  unknown: 'Not observable yet. Never an alarm, never “fine”.',
  pending: 'Destination not finalized yet.',
  overdue: 'Deposit past finality + SLA with no release. Liveness, not theft.',
  orphaned: 'Invalidated by a reorg and re-evaluated.',
};

export const Verdict = ({ status, label }: { status: Status | string; label?: string }) => (
  <span className={`v v--${status}`}>{label ?? VERDICT_LABEL[status as Status] ?? status}</span>
);

const CHAIN: Record<string, { name: string; c: string; explorer?: string }> = {
  '6648936': { name: 'Ethereum', c: 'var(--eth)', explorer: 'https://etherscan.io' },
  '1': { name: 'Ethereum', c: 'var(--eth)', explorer: 'https://etherscan.io' },
  '1650811245': { name: 'Moonbeam', c: 'var(--moon)', explorer: 'https://moonscan.io' },
  '2020': { name: 'Ronin', c: 'var(--local)' },
  '31337': { name: 'Local A', c: 'var(--local)' },
  '31338': { name: 'Local B', c: 'var(--local)' },
};
export const chainName = (id: number | string) => CHAIN[String(id)]?.name ?? `chain ${id}`;
export const Chain = ({ id, showId = true }: { id: number | string; showId?: boolean }) => {
  const c = CHAIN[String(id)];
  return (
    <span className="chain" style={{ ['--c' as string]: c?.c }}>
      {c?.name ?? 'chain'}{showId && <span className="dim">{id}</span>}
    </span>
  );
};

export const short = (h: string, a = 6, b = 4) => (h.length > a + b + 1 ? `${h.slice(0, a)}…${h.slice(-b)}` : h);

// Mono hash: click copies; tx/address on a public chain link to its explorer.
export function Hash({ value, chain, kind = 'tx', head = 8, tail = 6 }: { value: string; chain?: number | string; kind?: 'tx' | 'address' | 'raw'; head?: number; tail?: number }) {
  const [copied, setCopied] = useState(false);
  const base = chain !== undefined ? CHAIN[String(chain)]?.explorer : undefined;
  const text = short(value, head, tail);
  if (base && kind !== 'raw') {
    return <a className="hash" href={`${base}/${kind}/${value}`} target="_blank" rel="noreferrer" title={value}>{text}</a>;
  }
  return (
    <button className="hash" style={{ background: 'none', border: 0, padding: 0, cursor: 'copy' }} title={`${value} · click to copy`}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}>
      {copied ? 'copied' : text}
    </button>
  );
}

export const Tag = ({ kind, children }: { kind?: 'pending' | 'real' | 'live'; children: ReactNode }) => (
  <span className={`tag ${kind ? `tag--${kind}` : ''}`}>{children}</span>
);
export const Pending = ({ what = 'pending backend' }: { what?: string }) => <Tag kind="pending">{what}</Tag>;

export function Plate({ title, meta, actions, children, className = '', flat, bodyClass = 'plate-body', as: Tag = 'section' }: {
  title?: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flat?: boolean; bodyClass?: string; as?: ElementType;
}) {
  return (
    <Tag className={`plate ${flat ? 'plate--flat' : ''} ${className}`}>
      {(title || actions) && (
        <header className="plate-head">
          <div className="row" style={{ minWidth: 0, gap: 10 }}>
            {title && <span className="label">{title}</span>}
            {meta}
          </div>
          {actions && <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </Tag>
  );
}

export const Readout = ({ label, value, unit, sub, className }: { label: ReactNode; value: ReactNode; unit?: string; sub?: ReactNode; className?: string }) => (
  <div className={`readout ${className ?? ''}`}>
    <span className="label">{label}</span>
    <span className="readout-value">{value}{unit && <small>{unit}</small>}</span>
    {sub && <span className="label" style={{ letterSpacing: '0.06em', textTransform: 'none' }}>{sub}</span>}
  </div>
);

// Mono odometer: digits roll; columns keyed from the right so they persist as the value grows.
export function Odometer({ value, className }: { value: string; className?: string }) {
  const chars = [...value];
  return (
    <span className={`odo mono ${className ?? ''}`} role="img" aria-label={value}>
      {chars.map((c, i) => {
        const key = chars.length - i;
        return /\d/.test(c) ? (
          <span className="odo-col" key={key} aria-hidden="true">
            <span style={{ transform: `translateY(-${+c * 10}%)` }}>
              {'0123456789'.split('').map((d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        ) : <span key={key} aria-hidden="true">{c}</span>;
      })}
    </span>
  );
}

export const Reveal = ({ children, delay = 0, className, as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' | 'li' }) => {
  const M = motion[as];
  return (
    <M className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-8% 0px' }} transition={{ duration: 0.9, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </M>
  );
};

export const ButtonLink = ({ to, children, variant, size }: { to: string; children: ReactNode; variant?: 'line'; size?: 'sm' }) => (
  <Link to={to} className={`btn ${variant ? `btn--${variant}` : ''} ${size ? `btn--${size}` : ''}`}>
    {children}<span className="arrow" aria-hidden="true">→</span>
  </Link>
);

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="row" style={{ gap: 10 }}>
      <Mark />
      {!compact && <span style={{ font: '500 13px var(--display)', letterSpacing: '0.12em' }}>BRIDGEWITNESS</span>}
    </span>
  );
}

// Two chains (pillars) and the witnessed thread between them, with the witness seal at its low point.
export const Mark = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M3 2v20M21 2v20" stroke="var(--text)" strokeWidth="1.6" />
    <path d="M3 7c4 8 14 8 18 0" stroke="var(--verified)" strokeWidth="1.6" />
    <path d="M12 10.6l2.2 2.2-2.2 2.2-2.2-2.2z" fill="var(--text)" />
  </svg>
);
