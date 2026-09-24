// ★BJ335 Generator 定位:dump Generator#310559 全边 + 函数名 + 上游持有者
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('/tmp/bj335-neutral.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const nodes = raw.nodes, edges = raw.edges, strings = raw.strings;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
const idOf = (i) => nodes[i * F + nId];
const rev = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
    }
    ep += cnt;
  }
}
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
const dumpFwd = (idx, max) => { const out = []; for (let k = fwdStart[idx]; k < fwdStart[idx + 1] && out.length < max; k++) { const base = k * EF; const t = edgeTypeNames[edges[base + eType]]; out.push(`${t}:'${t === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName])).slice(0, 36)}' → ${tp(edges[base + eTo] / F)}:${String(nm(edges[base + eTo] / F)).slice(0, 50)}#${edges[base + eTo] / F}`); } return out; };
const G = 310559;
console.log(`Generator#${G} id=${idOf(G)} edges=${nodes[G * F + nEdges]}`);
console.log('forward:');
for (const l of dumpFwd(G, 20)) console.log('   ', l);
console.log('in-edges:');
for (const e of (rev.get(G) ?? [])) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 66)}#${e.src} id=${idOf(e.src)}`);
// 上游 2 层
console.log('\n上游 2 层:');
for (const e of (rev.get(G) ?? [])) {
  for (const e2 of (rev.get(e.src) ?? [])) {
    if (tp(e2.src) === 'synthetic') continue;
    console.log(`   +2 ${e2.eT}:'${String(e2.eN).slice(0, 32)}' ← ${tp(e2.src)}:${String(nm(e2.src)).slice(0, 60)}#${e2.src}`);
  }
}
process.exit(0);
