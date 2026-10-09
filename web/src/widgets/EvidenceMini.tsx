import { EVIDENCE, LIVE } from '../data';
import { Hash } from '../design/ui';
import { useVerifier, VerifySteps } from './Verifier';

const bundle = EVIDENCE.find((e) => e.sha === LIVE.attack_sha)!;

// Verify the real attack bundle in the browser. Used on the landing page and the USP Lab.
export function EvidenceMini() {
  const v = useVerifier();
  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="spread">
        <span className="mono" style={{ fontSize: 12 }}>Evidence file for the held attack <Hash value={bundle.sha} kind="raw" /></span>
        <button className="btn btn--sm" disabled={v.running} onClick={() => v.run(bundle.bundle, { sha256: bundle.sha, status: bundle.decision.status, violations: bundle.decision.violations })}>
          {v.steps ? 'Check again' : 'Check it in my browser'}<span className="arrow">→</span>
        </button>
      </div>
      {v.steps ? <VerifySteps steps={v.steps} trusted={v.trusted} /> : <p className="dim" style={{ fontSize: 13 }}>Your browser re-computes the file's fingerprint, re-checks the block header and the Merkle proofs, and re-runs the rule. Nothing leaves your machine. Want to break it? Open Evidence and change one wei.</p>}
    </div>
  );
}
