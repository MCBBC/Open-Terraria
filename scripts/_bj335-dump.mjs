// dump 指定节点的全部 in-edges(含 synthetic) + 前向样本
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('/tmp/bj335-m3.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const nodes = raw.nodes, edges = raw.edges, strings = raw.strings;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
const rev = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: edgeTypeNames[edges[base + eType]] === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName])) });
    }
    ep += cnt;
  }
}
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
function fwd(i, max) {
  const out = [];
  for (let k = fwdStart[i]; k < fwdStart[i + 1] && out.length < max; k++) {
    const base = k * EF;
    const t = edgeTypeNames[edges[base + eType]];
    out.push({ eT: t, eN: t === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName])), to: edges[base + eTo] / F });
  }
  return out;
}
for (const idx of [3943, 3966, 3965, 3924, 693830, 575070, 649279]) {
  console.log(`\n#### node ${idx} ${tp(idx)}:${String(nm(idx)).slice(0, 60)} id=${nodes[idx * F + nId]} edgeCount=${nodes[idx * F + nEdges]}`);
  console.log('  in-edges(all):');
  for (const e of (rev.get(idx) ?? [])) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 44)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 60)}#${e.src}`);
  console.log('  forward sample(12):');
  for (const e of fwd(idx, 12)) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 30)}' → ${tp(e.to)}:${String(nm(e.to)).slice(0, 60)}#${e.to}`);
}
process.exit(0);
