// PropertyCell/Object#637801/Array#489108 溯源(post-fix 快照)
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
const fwdAdj = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      const eT = edgeTypeNames[edges[base + eType]];
      const eN = eT === 'element' ? String(edges[base + eName]) : (strings[edges[base + eName]] ?? String(edges[base + eName]));
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT, eN });
      let f = fwdAdj.get(i); if (!f) { f = []; fwdAdj.set(i, f); }
      f.push({ to, eT, eN });
    }
    ep += cnt;
  }
}
const dump = (idx, label) => {
  console.log(`\n##### ${label}: ${tp(idx)}:${String(nm(idx)).slice(0, 60)}#${idx} id=${idOf(idx)}`);
  console.log(' in-edges:');
  for (const e of (rev.get(idx) ?? []).slice(0, 10)) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 62)}#${e.src}`);
  console.log(' forward:');
  for (const f of (fwdAdj.get(idx) ?? []).slice(0, 10)) console.log(`   ${f.eT}:'${String(f.eN).slice(0, 40)}' → ${tp(f.to)}:${String(nm(f.to)).slice(0, 62)}#${f.to}`);
};
dump(391272, 'PropertyCell(全局属性槽)');
dump(637801, 'Object rebuildInventoryPanel');
dump(489108, 'Array#489108');
process.exit(0);
