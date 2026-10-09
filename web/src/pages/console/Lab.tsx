import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { NOMAD } from '../../data';
import { Plate, Tag } from '../../design/ui';
import { usd } from '../../lib/format';
import { Counterfactual } from '../../widgets/Counterfactual';
import { EvidenceMini } from '../../widgets/EvidenceMini';
import { GateDemo, ProofDemo, SelfTest, WatermarkDemo } from '../../widgets/demos';
import { Collapse } from '../../widgets/showcase';

type Maturity = 'demo' | 'real' | 'planned';
const TAG: Record<Maturity, string> = { demo: 'demo · simulated data', real: 'works on real data', planned: 'planned' };

const USPS: { n: string; id: string; title: string; line: string; how: string; real: string; maturity: Maturity; body: ReactNode; link?: [string, string] }[] = [
  { n: '01', id: 'usp-1', title: 'Proof that a deposit does not exist', maturity: 'demo',
    line: 'Not "our indexer saw nothing". The source chain\'s own storage proves the deposit is absent.',
    how: 'Pick a release. See how a log-reading monitor and a proof-reading monitor answer. Make the indexer lie. Corrupt the proof.',
    real: 'Real: the Merkle-Patricia mechanics, checked in your browser. Demo: the bridge and its deposits are made up. Not built yet: fetching proofs from a real chain.', body: <ProofDemo /> },
  { n: '02', id: 'usp-2', title: 'Evidence anyone can re-run', maturity: 'real',
    line: 'Every alert is a file. Your browser re-checks it; change one wei and it fails.',
    how: 'Press the button. Then open Evidence, switch on Tamper and edit a value.',
    real: 'Real: this is the actual bundle from the reference run on two local chains; all 12 reference bundles reproduce Python\'s hash and verdict.', body: <EvidenceMini />, link: ['/console/evidence', 'Open Evidence and tamper'] },
  { n: '03', id: 'usp-3', title: '"Unknown" instead of crying wolf', maturity: 'demo',
    line: 'When we cannot see the source chain yet, we say so. We never accuse an honest release.',
    how: 'Slide the source observer back. Watch a naive monitor raise false alerts while we say "unknown".',
    real: 'Real: the decision rule. Demo: the ten releases are simulated. Also try "Blind the source RPC" on the Nomad page, which does this on real data.', body: <WatermarkDemo />, link: ['/console/replay', 'Try it on the Nomad replay'] },
  { n: '04', id: 'usp-4', title: 'Hold before the money moves', maturity: 'demo',
    line: 'A release waits in a short window. A broken rule holds it first, as narrowly as the evidence allows.',
    how: 'Request a stolen release, then an honest one on another route, then a stolen one on a second route.',
    real: 'Real: the rule that decides. A route hold was also proven on two real local chains. Demo: the gate and window here are simulated. Not built yet: the optimistic window and verifier-wide hold on-chain.', body: <GateDemo /> },
  { n: '05', id: 'usp-5', title: 'What if we had responded faster?', maturity: 'real',
    line: 'Replay a real hack under five response policies and read the loss for each.',
    how: 'Drag the latency slider. Switch between Nomad and Ronin.',
    real: 'Real: computed from the actual Nomad and Ronin data in your browser. Estimates under a stated model, not funds saved.', body: <Counterfactual />, link: ['/console/theatre', 'Open the full what-if page'] },
  { n: '06', id: 'usp-6', title: `One incident, not ${NOMAD.attack_releases} alerts`, maturity: 'real',
    line: `The real Nomad hack raised ${NOMAD.attack_releases} violations. We group them into one incident with live exposure.`,
    how: `Watch the ${NOMAD.attack_releases} dots collapse into one card. Then replay it in the Monitor.`,
    real: `Real: the Nomad data (${usd(NOMAD.usd_total)} dataset USD). Preview: the grouping window and copycat thresholds are our placeholder settings.`, body: <Collapse />, link: ['/console/incidents/inc_nomad', 'Open the Nomad incident'] },
  { n: '07', id: 'usp-7', title: 'We attack ourselves', maturity: 'demo',
    line: 'Twelve attacks, including safe cases that must not alarm, run through the real rule.',
    how: 'Press the button and read which verdicts match what we expected.',
    real: 'Real: the rule. Demo: the bridge. Still to build: injected faults on the Nomad stream and the full baseline comparison.', body: <SelfTest />, link: ['/console/gauntlet', 'Run attacks one at a time'] },
];

export default function Lab() {
  return (
    <div className="lab">
      <aside className="lab-index">
        <span className="label">Our 7 USPs</span>
        {USPS.map((u) => <a key={u.id} href={`#${u.id}`}><span className="mono">{u.n}</span>{u.title}</a>)}
      </aside>
      <div className="lab-main">
        <Plate title="USP demos" bodyClass="plate-body">
          <p className="t-body">Each section below is one thing that sets BridgeWitness apart, as something you can try. The tag on each says what is real and what is simulated. Nothing here is a screenshot.</p>
        </Plate>
        {USPS.map((u) => (
          <section key={u.id} id={u.id} className="lab-sec">
            <header className="lab-head">
              <span className="mono lab-n">{u.n}</span>
              <div className="stack" style={{ gap: 6 }}>
                <div className="row-wrap"><h2 className="t-h3" style={{ fontSize: 20 }}>{u.title}</h2><Tag kind={u.maturity === 'demo' ? undefined : 'real'}>{TAG[u.maturity]}</Tag></div>
                <p className="muted">{u.line}</p>
                <p className="dim" style={{ fontSize: 13 }}><b>Try:</b> {u.how}</p>
              </div>
            </header>
            <div className="plate plate--flat"><div className="plate-body">{u.body}</div></div>
            <p className="dim lab-real"><b>What is real:</b> {u.real} {u.link && <Link to={u.link[0]} className="cap-link">{u.link[1]} →</Link>}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
