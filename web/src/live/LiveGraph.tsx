import { useEffect, useRef } from 'react';
import Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import Sigma from 'sigma';
import type { Ev, Replay } from './data';

// Sigma draws in WebGL, so colours are literal values mirroring the Oxide Vault tokens.
const C = {
  ok: '#2fd4b5', okDim: 'rgba(47,212,181,0.35)', bad: '#ff6a3d', warn: '#e3b04b', ink: '#e9ecef', mute: '#6b727d',
  dep: 'rgba(140,158,255,0.45)', chain: '#8c9eff', src: '#c9a7ff', bridge: '#e9ecef', token: '#a4abb6', cluster: '#ff6a3d', bg: '#08090b',
};
const FA2 = { gravity: 1.2, scalingRatio: 6, slowDown: 6, barnesHutOptimize: true, strongGravityMode: false, adjustSizes: false };

type Props = { data: Replay; n: number; selected: string | null; onSelect: (id: string) => void };

export function LiveGraph({ data, n, selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const st = useRef<{ g: Graph; s: Sigma; added: number; byNode: Map<string, string> } | null>(null);
  const sel = useRef(onSelect);
  sel.current = onSelect;

  // (Re)build the scene when the feed changes.
  useEffect(() => {
    // multi: one recipient can receive several releases of the same token (copycats batch them).
    const g = new Graph({ multi: true, type: 'directed' });
    g.addNode('src', { label: `${data.src} (source)`, x: -12, y: 0, size: 14, color: C.src, fixed: true });
    g.addNode('bridge', { label: 'Bridge vault', x: 0, y: 0, size: 16, color: C.bridge, fixed: true });
    g.addEdge('src', 'bridge', { size: 2, color: C.dep });
    const s = new Sigma(g, box.current!, {
      renderLabels: true, labelColor: { color: C.ink }, labelSize: 11, labelFont: 'Geist Mono Variable, monospace',
      labelRenderedSizeThreshold: 9, defaultEdgeType: 'arrow', allowInvalidContainer: true, zIndex: true,
    });
    s.on('clickNode', ({ node }) => { const id = st.current?.byNode.get(node); if (id) sel.current(id); });
    st.current = { g, s, added: 0, byNode: new Map() };
    return () => { s.kill(); st.current = null; };
  }, [data]);

  // Add newly visible events; seeking backwards rebuilds from scratch.
  useEffect(() => {
    const cur = st.current;
    if (!cur) return;
    const { g } = cur;
    if (n < cur.added) {
      g.forEachNode((k) => { if (!['src', 'bridge'].includes(k)) g.dropNode(k); });
      cur.added = 0; cur.byNode.clear();
    }
    for (let i = cur.added; i < n; i++) addEvent(g, data.events[i], cur.byNode);
    if (n !== cur.added) {
      cur.added = n;
      forceAtlas2.assign(g, { iterations: n < 50 ? 30 : 6, settings: FA2 });
      g.setNodeAttribute('src', 'x', -12); g.setNodeAttribute('src', 'y', 0);
      g.setNodeAttribute('bridge', 'x', 0); g.setNodeAttribute('bridge', 'y', 0);
    }
    cur.s.refresh();
  }, [n, data]);

  // Highlight the selected release.
  useEffect(() => {
    const cur = st.current;
    if (!cur) return;
    cur.g.forEachNode((k, a) => cur.g.setNodeAttribute(k, 'highlighted', !!selected && cur.byNode.get(k) === selected));
    cur.s.refresh();
  }, [selected, n]);

  return <div ref={box} className="lg-canvas" role="img" aria-label={`Flow graph of ${data.label}: source chain, bridge vault, tokens and recipients; copper edges are releases with no backing deposit.`} />;
}

const r = (k = 4) => (Math.random() - 0.5) * k;

function addEvent(g: Graph, e: Ev, byNode: Map<string, string>) {
  const tok = `tok:${e.symbol}`;
  if (!g.hasNode(tok)) g.addNode(tok, { label: e.symbol, x: 4 + r(), y: r(10), size: 9, color: C.token });
  if (e.kind === 'deposit') {
    // Deposits feed the vault: thicken the source → token lane.
    const k = `d:${tok}`;
    if (g.hasEdge(k)) g.updateEdgeAttribute(k, 'size', (v: number) => Math.min(6, v + 0.15));
    else g.addEdgeWithKey(k, 'src', tok, { size: 1, color: C.dep });
    return;
  }
  const bad = e.status === 'violation';
  const sus = e.level === 'suspicious';
  const rc = `r:${e.recipient}`;
  const size = 3 + Math.min(9, Math.log10(Math.max(e.usd ?? 1, 1)) * 1.2);
  const tx = g.getNodeAttributes(tok);
  if (!g.hasNode(rc)) g.addNode(rc, { label: bad ? `${e.recipient.slice(0, 8)}…` : '', x: tx.x + 3 + r(3), y: tx.y + r(3), size, color: bad ? C.bad : sus ? C.warn : C.okDim });
  else if (bad) g.mergeNodeAttributes(rc, { color: C.bad, label: `${e.recipient.slice(0, 8)}…` });
  byNode.set(rc, e.id);
  const k = `w:${e.id}`;
  if (!g.hasEdge(k)) g.addEdgeWithKey(k, tok, rc, { size: bad ? 1.6 : 0.6, color: bad ? C.bad : sus ? C.warn : C.okDim });
  if (!g.hasEdge(`b:${tok}`)) g.addEdgeWithKey(`b:${tok}`, 'bridge', tok, { size: 1.5, color: C.mute });
  // Copycat cluster hub: recipients of the same copy-paste fingerprint orbit one node.
  const s = e.signals;
  if (s && s.cluster && s.cluster_size >= 8) {
    const cl = `cl:${s.cluster}`;
    if (!g.hasNode(cl)) g.addNode(cl, { label: 'copycat cluster', x: tx.x + 6, y: tx.y + r(4), size: 10, color: C.cluster, type: 'circle' });
    g.mergeNodeAttributes(cl, { label: `copycat cluster · ${s.cluster_size}`, size: Math.min(26, 8 + Math.log2(s.cluster_size) * 2.4) });
    if (!g.hasEdge(`c:${e.id}`)) g.addEdgeWithKey(`c:${e.id}`, rc, cl, { size: 0.4, color: 'rgba(255,106,61,0.35)' });
  }
}
