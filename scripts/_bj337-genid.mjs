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
const fwdAdj = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
      let f = fwdAdj.get(i); if (!f) { f = []; fwdAdj.set(i, f); }
      f.push({ to, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
    }
    ep += cnt;
  }
}
// closure → SFI → 函数名(SFI 的 in-edge 'name' 或 forward 'name_or_index'?)
function sfiName(closure) {
  for (const f of (fwdAdj.get(closure) ?? [])) {
    if (tp(f.to) === 'object' && /SharedFunctionInfo/.test(String(nm(f.to)))) {
      const sfi = f.to;
      for (const f2 of (fwdAdj.get(sfi) ?? [])) if (tp(f2.to) === 'string' && String(nm(f2.to)).length > 0 && String(nm(f2.to)) !== 'undefined') return String(nm(f2.to));
      return `(sfi#${sfi})`;
    }
  }
  return '(no sfi edge)';
}
console.log('closure#376572 name =', sfiName(376572));
for (const g of [201070, 383054, 310559, 383374, 263972]) {
  console.log(`\nGenerator#${g}:`);
  for (const e of (rev.get(g) ?? []).slice(0, 6)) console.log(`   in ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 60)}#${e.src}`);
  for (const f of (fwdAdj.get(g) ?? [])) if (f.eT === 'internal' && f.eN === 'function') console.log(`   fn ${sfiName(f.to)} closure#${f.to}`);
}
process.exit(0);
