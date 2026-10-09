import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { EVIDENCE, evidenceBySha, type EvidenceEntry } from '../../data';
import { Chain, Hash, Plate, Tag, Verdict, short } from '../../design/ui';
import { formatUnits } from '../../lib/format';
import { useVerifier, VerifySteps } from '../../widgets/Verifier';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

// Fields each violation points at, so the exhibit shows *where* the rule broke.
const HOT: Record<string, string[]> = {
  missing_source_authorization: ['authorizations', 'coverage.through_timestamp'],
  recipient_mismatch: ['release.recipient', 'authorizations.0.recipient'],
  authorization_overconsumed: ['release.amount', 'previous_releases', 'authorizations.0.amount'],
  message_replayed: ['previous_releases'],
  amount_mismatch: ['release.amount', 'authorizations.0.amount'],
  source_value_mismatch: ['authorizations.0.value_verification'],
};

function setPath(obj: J, path: string[], value: J) {
  const last = path.at(-1)!;
  const parent = path.slice(0, -1).reduce((o, k) => o[k], obj);
  parent[last] = value;
}

function Leaf({ value, path, tamper, onEdit }: { value: J; path: string[]; tamper: boolean; onEdit: (p: string[], v: J) => void }) {
  const [open, setOpen] = useState(false);
  if (tamper && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
    return (
      <input className="tree-input mono" defaultValue={String(value)} aria-label={path.join('.')}
        onChange={(e) => {
          const v = e.target.value;
          onEdit(path, typeof value === 'number' ? (Number.isFinite(+v) ? +v : v) : typeof value === 'boolean' ? v === 'true' : v);
        }} />
    );
  }
  const text = value === null ? 'null' : typeof value === 'string' ? `"${value}"` : String(value);
  const long = text.length > 72;
  return <button className={`tree-leaf mono t-${value === null ? 'null' : typeof value}`} onClick={() => long && setOpen(!open)}>{long && !open ? `${text.slice(0, 40)}…${text.slice(-14)}` : text}</button>;
}

function Node({ k, value, path, depth, hot, tamper, onEdit }: { k: string; value: J; path: string[]; depth: number; hot: Set<string>; tamper: boolean; onEdit: (p: string[], v: J) => void }) {
  const key = path.join('.');
  const isHot = hot.has(key);
  const container = value !== null && typeof value === 'object';
  const [open, setOpen] = useState(depth < 1 || isHot || [...hot].some((h) => h.startsWith(key + '.')));
  const entries: [string, J][] = container ? (Array.isArray(value) ? value.map((v: J, i: number) => [String(i), v]) : Object.entries(value)) : [];
  return (
    <li className={isHot ? 'is-hot' : ''}>
      <div className="tree-row">
        {container ? (
          <button className="tree-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span className="mono">{open ? '▾' : '▸'} {k}</span>
            <span className="dim mono">{Array.isArray(value) ? `[${value.length}]` : `{${entries.length}}`}</span>
          </button>
        ) : (<><span className="mono tree-key">{k}</span><Leaf value={value} path={path} tamper={tamper} onEdit={onEdit} /></>)}
      </div>
      {container && open && entries.length > 0 && (
        <ul className="tree">{entries.map(([ck, cv]) => <Node key={ck} k={ck} value={cv} path={[...path, ck]} depth={depth + 1} hot={hot} tamper={tamper} onEdit={onEdit} />)}</ul>
      )}
    </li>
  );
}

const title = (e: EvidenceEntry) => {
  const d = e.decision as J;
  return d.violations[0] ?? d.unknown_reasons[0] ?? (d.status === 'consistent_under_supplied_evidence' ? 'backed release' : d.status);
};

function Exhibit({ e }: { e: EvidenceEntry }) {
  const d = e.decision as J;
  const b = e.bundle as J;
  const [tamper, setTamper] = useState(false);
  const [draft, setDraft] = useState<J>(() => structuredClone(b));
  const [edits, setEdits] = useState<Map<string, [J, J]>>(new Map());
  const v = useVerifier();
  const hot = useMemo(() => new Set<string>(d.violations.flatMap((x: string) => HOT[x] ?? [])), [d]);

  const onEdit = (p: string[], val: J) => {
    const next = structuredClone(draft);
    setPath(next, p, val);
    setDraft(next);
    const k = p.join('.');
    const orig = p.reduce((o: J, x) => o?.[x], b);
    setEdits((m) => { const n = new Map(m); if (orig === val) n.delete(k); else n.set(k, [orig, val]); return n; });
  };
  const verify = () => v.run(tamper || edits.size ? draft : b, { sha256: e.sha, status: d.status, violations: d.violations });
  const acc = d.accounting;
  const dec = b.route.destination_decimals;

  return (
    <div className="evidence-main">
      <Plate title={<>Exhibit · <b>{title(e)}</b></>} meta={<Verdict status={d.status} />}
        actions={<><Tag kind={e.live ? 'real' : undefined}>{b.route.provenance}</Tag>{e.proofs > 0 && <Tag kind="real">{e.proofs} proofs</Tag>}</>}>
        <div className="exhibit-head">
          <div className="triple">
            <div><span className="label">Released</span><span className="mono big">{formatUnits(acc.released_common_units, acc.common_decimals)}</span></div>
            <div><span className="label">Authorized</span><span className="mono big">{acc.authorized_common_units === null ? '—' : formatUnits(acc.authorized_common_units, acc.common_decimals)}</span></div>
            <div><span className="label">Excess</span><span className={`mono big ${acc.excess_common_units && acc.excess_common_units !== '0' ? 'c-violation' : ''}`}>{acc.excess_common_units === null ? '—' : formatUnits(acc.excess_common_units, acc.common_decimals)}</span></div>
          </div>
          <div className="kv">
            <span className="label">route</span><span className="mono">{b.route.route_id} · <Chain id={b.route.source_chain_id} /> → <Chain id={b.route.destination_chain_id} /></span>
            <span className="label">message</span><span className="mono">{short(String(b.release.message_id), 12, 8)}</span>
            <span className="label">rule</span><span className="mono">{b.rule_version}</span>
            <span className="label">sha256</span><Hash value={e.sha} kind="raw" head={16} tail={8} />
            <span className="label">source</span><span className="mono dim">{e.source}</span>
            <span className="label">decimals</span><span className="mono dim">{dec}</span>
          </div>
        </div>
      </Plate>
      <div className="evidence-split">
        <Plate title="Bundle" actions={
          <button className="btn btn--line btn--sm" aria-pressed={tamper} onClick={() => { setTamper(!tamper); if (tamper) { setDraft(structuredClone(b)); setEdits(new Map()); } }}>
            {tamper ? 'Exit tamper' : 'Tamper'}
          </button>} bodyClass="plate-body tree-wrap">
          {tamper && <p className="tamper-note">Tamper mode: edit any value (one wei is enough), then verify. Violating fields are outlined in copper.</p>}
          <ul className="tree tree--root" key={String(tamper)}>
            {Object.entries(tamper ? draft : b).map(([k, val]) => <Node key={k} k={k} value={val} path={[k]} depth={0} hot={hot} tamper={tamper} onEdit={onEdit} />)}
          </ul>
        </Plate>
        <Plate title="Verify · in this browser" actions={<button className="btn btn--sm" onClick={verify} disabled={v.running}>{v.steps ? 'Re-verify' : 'Verify'}<span className="arrow">→</span></button>}>
          {edits.size > 0 && (
            <div className="diff">
              <span className="label">Your edits</span>
              {[...edits].map(([k, [a, z]]) => (
                <div key={k} className="diff-row mono"><span>{k}</span><span className="diff-old">{String(a)}</span><span className="diff-new">{String(z)}</span></div>
              ))}
            </div>
          )}
          {v.steps ? <VerifySteps steps={v.steps} trusted={v.trusted} /> : (
            <p className="dim" style={{ fontSize: 13 }}>Runs header re-encoding, Merkle-Patricia receipt and transaction proofs, route binding, evidence ordering, the accounting rule and the canonical SHA-256, entirely client-side. Code: <span className="mono">web/src/verify/</span>.</p>
          )}
        </Plate>
      </div>
    </div>
  );
}

export default function Evidence() {
  const { sha } = useParams();
  const nav = useNavigate();
  const current = (sha && evidenceBySha(sha)) || EVIDENCE.find((e) => e.live && (e.decision as J).status === 'invariant_violation')!;
  return (
    <div className="evidence-page">
      <Plate title={`Evidence library · ${EVIDENCE.length} bundles`} bodyClass="lib">
        <ul className="lib-list">
          {EVIDENCE.map((e) => {
            const d = e.decision as J;
            return (
              <li key={e.sha}>
                <button className={e === current ? 'is-active' : ''} onClick={() => nav(`/console/evidence/${e.sha.slice(0, 12)}`)}>
                  <span className="row" style={{ justifyContent: 'space-between' }}><Verdict status={d.status} /><span className="label">{e.live ? 'live chains' : 'simulation'}</span></span>
                  <span className="lib-title">{title(e)}</span>
                  <span className="mono dim" style={{ fontSize: 10.5 }}>{e.sha.slice(0, 16)}… · {e.source.split(' · ')[1]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="dim" style={{ fontSize: 11.5, padding: '12px 14px' }}>Every bundle the reference engine produced. All {EVIDENCE.length} re-verify in TypeScript with the same verdict and hash as Python (golden test in <span className="mono">build-fixtures.mjs</span>). <Link to="/docs/evidence-spec">Spec →</Link></p>
      </Plate>
      <Exhibit key={current.sha} e={current} />
    </div>
  );
}
