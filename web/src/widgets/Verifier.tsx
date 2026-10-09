import { useState } from 'react';
import { verifyBundle, type Step } from '../verify/verifyBundle';
import { Hash } from '../design/ui';

const ICON: Record<Step['status'], string> = { pass: '✓', fail: '✗', pending: '◌', skip: '–' };

// Runs every check client-side and reveals them one by one, like an instrument settling.
export function useVerifier() {
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [trusted, setTrusted] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function run(bundle: any, expected: { sha256?: string; status?: string; violations?: string[] }) {
    setRunning(true);
    setSteps([]);
    const res = await verifyBundle(bundle, expected);
    setTrusted(res.trusted);
    for (let i = 1; i <= res.steps.length; i++) {
      setSteps(res.steps.slice(0, i));
      await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 160));
    }
    setRunning(false);
    return res;
  }
  return { steps, trusted, running, run };
}

export function VerifySteps({ steps, trusted, chain }: { steps: Step[] | null; trusted: string[]; chain?: number }) {
  if (!steps) return null;
  const failed = steps.find((s) => s.status === 'fail');
  const done = steps.length > 0;
  return (
    <div className="verify" aria-live="polite">
      <ol className="verify-steps">
        {steps.map((s) => (
          <li key={s.id} className={`is-${s.status}`}>
            <span className="verify-icon mono" aria-hidden="true">{ICON[s.status]}</span>
            <span className="verify-label">{s.label}</span>
            <span className="verify-detail mono">{s.detail}</span>
          </li>
        ))}
      </ol>
      {done && (
        <p className={`verify-sum ${failed ? 'c-violation' : ''}`}>
          {failed ? `Failed at “${failed.label}”. The exhibit does not reproduce.` : 'Recomputed locally: identical verdict, identical hash.'}
        </p>
      )}
      {trusted.length > 0 && (
        <p className="verify-trust">
          You trusted: {trusted.length} block header{trusted.length > 1 ? 's' : ''} ({trusted.map((h) => <Hash key={h} value={h} kind="raw" chain={chain} />)}).
          On local chains it cannot be cross-checked externally; on a public chain compare it with any explorer.
        </p>
      )}
    </div>
  );
}
