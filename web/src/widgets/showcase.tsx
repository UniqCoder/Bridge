import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { GRAPH } from '../three/graphData';
import { NOMAD } from '../data';
import { formatUnits, usd, utc } from '../lib/format';
import { short } from '../design/ui';

// Flat projection of the 3D flow graph: source disk on the left, token clusters on the right.
export function GraphPreview() {
  const { nodes, edges } = GRAPH;
  const P = (n: (typeof nodes)[number]) => [n.pos[0] < 0 ? 140 + n.pos[2] * 20 : 520 + n.pos[2] * 20, 30 + (10 - n.pos[1]) * 22] as const;
  const paths = useMemo(() => edges.map((e) => {
    const [x1, y1] = P(nodes[e.from]);
    const [x2, y2] = P(nodes[e.to]);
    return { d: `M${x1} ${y1} C${(x1 + x2) / 2} ${y1 - 40}, ${(x1 + x2) / 2} ${y2 - 40}, ${x2} ${y2}`, attack: e.attack };
  }), [edges, nodes]);
  return (
    <svg className="graph-preview" viewBox="0 0 680 260" role="img" aria-label="Flow graph preview: releases from source messages to beneficiaries by token">
      {paths.filter((p) => !p.attack).map((p, i) => <path key={`n${i}`} d={p.d} className="gp-edge" />)}
      {paths.filter((p) => p.attack).map((p, i) => <path key={`a${i}`} d={p.d} className="gp-edge gp-edge--attack" />)}
      {nodes.map((n) => {
        const [x, y] = P(n);
        const r = n.kind === 'message' ? 1.5 + Math.sqrt(n.degree) * 0.6 : n.kind === 'void' ? 6 : n.kind === 'token' ? 2.5 : 1.4;
        const cls = n.kind === 'void' ? 'gp-void' : n.kind === 'message' ? 'gp-msg' : n.kind === 'token' ? 'gp-token' : n.attack ? 'gp-drained' : 'gp-ok';
        return <circle key={n.i} cx={x} cy={y} r={r} className={cls} />;
      })}
      <text x="140" y="252" textAnchor="middle" className="d-note" style={{ fill: 'var(--moon)' }}>Moonbeam · messages</text>
      <text x="520" y="252" textAnchor="middle" className="d-note" style={{ fill: 'var(--eth)' }}>Ethereum · beneficiaries by token</text>
    </svg>
  );
}

// Real attack releases scrolling past, as the monitor saw them.
export function Ticker() {
  const rows = NOMAD.attack.slice(0, 40);
  const line = rows.map((r) => (
    <span className="tick" key={`${r.tx}${r.ord}`}>
      <span className="dim">{utc(r.ts).slice(11, 19)}</span>
      <span>{r.decimals !== null ? formatUnits(r.amount, r.decimals).replace(/\.?0+$/, '') : r.amount} {r.token}</span>
      <span className="dim">→ {short(r.ben, 6, 4)}</span>
      <span className="c-violation">{r.rules[0]}</span>
    </span>
  ));
  return (
    <div className="ticker" aria-label="Nomad attack releases, 1 Aug 2022">
      <div className="ticker-track">{line}{line}</div>
    </div>
  );
}

// 382 alerts collapse into one incident. Dots are the real releases, in order.
export function Collapse() {
  const rows = NOMAD.attack;
  return (
    <div className="collapse">
      <div className="collapse-dots" aria-hidden="true">
        {rows.map((r, i) => (
          <motion.span key={i} className={r.rules.includes('missing_source_authorization') ? 'cd cd--void' : 'cd'}
            initial={{ opacity: 1, x: 0, y: 0 }}
            whileInView={{ opacity: [1, 1, 0.15], x: [0, 0, 240 - (i % 24) * 10], y: [0, 0, 60 - Math.floor(i / 24) * 8] }}
            viewport={{ once: true, margin: '-20% 0px' }} transition={{ duration: 2.2, delay: 0.8 + i * 0.002, ease: [0.65, 0, 0.35, 1] }} />
        ))}
      </div>
      <motion.div className="collapse-card plate" initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '-20% 0px' }} transition={{ duration: 0.8, delay: 2.6, ease: [0.22, 1, 0.36, 1] }}>
        <div className="plate-body stack" style={{ gap: 6 }}>
          <span className="label">Incident inc_nomad · copycat swarm</span>
          <span className="readout-value">{usd(NOMAD.usd_total)}</span>
          <span className="mono dim" style={{ fontSize: 11 }}>{rows.length} violations · {NOMAD.beneficiaries} beneficiaries · {NOMAD.tokens.length} tokens</span>
        </div>
      </motion.div>
    </div>
  );
}
