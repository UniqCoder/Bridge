import { useEffect, useRef } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import type { Ev, Replay } from './data';

// Sigma draws in WebGL, so colours are literal values mirroring the Oxide Vault tokens.
const C = {
  ok: '#2fd4b5', okDim: 'rgba(47,212,181,0.35)', bad: '#ff6a3d', warn: '#e3b04b', ink: '#e9ecef', mute: '#6b727d',
  dep: 'rgba(140,158,255,0.45)', chain: '#8c9eff', src: '#c9a7ff', bridge: '#e9ecef', token: '#a4abb6', cluster: '#ff6a3d', bg: '#08090b',
};

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
    // Fixed columns, left to right: source chain, bridge vault, tokens, recipients, copycat hubs.
    g.addNode('src', { label: `SOURCE · ${data.src}`, x: -40, y: -16, size: 20, color: C.src, forceLabel: true });
    g.addNode('bridge', { label: 'BRIDGE VAULT', x: -22, y: 8, size: 30, color: C.bridge, forceLabel: true, zIndex: 2 });
    g.addEdge('src', 'bridge', { size: 4, color: C.dep });
    const s = new Sigma(g, box.current!, {
      renderLabels: true, labelColor: { color: C.ink }, labelSize: 12, labelWeight: '600', labelFont: 'Geist Mono Variable, monospace',
      labelRenderedSizeThreshold: 8, defaultEdgeType: 'arrow', allowInvalidContainer: true, zIndex: true,
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

// Stable pseudo-random in [-0.5, 0.5) from a string, so the layout never jumps between frames.
const h = (str: string, salt: number) => { let x = salt; for (let i = 0; i < str.length; i++) x = Math.imul(x ^ str.charCodeAt(i), 16777619); return ((x >>> 0) % 10000) / 10000 - 0.5; };

function addEvent(g: Graph, e: Ev, byNode: Map<string, string>) {
  const tok = `tok:${e.symbol}`;
  if (!g.hasNode(tok)) {
    const k = g.getAttribute('toks') ?? 0, row = Math.ceil(k / 2) * (k % 2 ? 1 : -1); g.setAttribute('toks', k + 1);
    g.addNode(tok, { label: `TOKEN ${e.symbol}`, x: 0, y: row * 14, size: 11, color: C.token, forceLabel: true });
  }
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
  const size = 2.2 + Math.min(5, Math.log10(Math.max(e.usd ?? 1, 1)) * 0.6);
  const tx = g.getNodeAttributes(tok);
  if (!g.hasNode(rc)) g.addNode(rc, { label: bad ? `${e.recipient.slice(0, 8)}…` : '', x: tx.x + 6 + (h(rc, 7) + 0.5) * 22, y: tx.y + h(rc, 13) * 11, size, color: bad ? C.bad : sus ? C.warn : C.okDim });
  else if (bad) g.mergeNodeAttributes(rc, { color: C.bad, label: `${e.recipient.slice(0, 8)}…` });
  byNode.set(rc, e.id);
  const k = `w:${e.id}`;
  if (!g.hasEdge(k)) g.addEdgeWithKey(k, tok, rc, { size: bad ? 1.6 : 0.6, color: bad ? C.bad : sus ? C.warn : C.okDim });
  if (!g.hasEdge(`b:${tok}`)) g.addEdgeWithKey(`b:${tok}`, 'bridge', tok, { size: 1.5, color: C.mute });
  // Copycat cluster hub: recipients of the same copy-paste fingerprint orbit one node.
  const s = e.signals;
  if (s && s.cluster && s.cluster_size >= 8) {
    const cl = `cl:${s.cluster}`;
    if (!g.hasNode(cl)) g.addNode(cl, { label: 'COPYCAT CLUSTER', x: tx.x + 36, y: tx.y + h(cl, 3) * 4, size: 12, color: C.cluster, forceLabel: true });
    g.mergeNodeAttributes(cl, { label: `COPYCAT CLUSTER · ${s.cluster_size} near-identical payouts`, size: Math.min(24, 8 + Math.log2(s.cluster_size) * 2) });
    if (!g.hasEdge(`c:${e.id}`)) g.addEdgeWithKey(`c:${e.id}`, rc, cl, { size: 0.4, color: 'rgba(255,106,61,0.35)' });
  }
}
