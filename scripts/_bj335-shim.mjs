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
for (const idx of [376472, 476928, 310357, 316927]) {
  console.log(`\n##### ${tp(idx)}:${String(nm(idx)).slice(0, 60)}#${idx}`);
  for (const e of (rev.get(idx) ?? []).slice(0, 16)) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 64)}#${e.src}`);
}
process.exit(0);
