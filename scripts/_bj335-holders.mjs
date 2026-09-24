// ★BJ335 全量持有者聚合:游离 DOM 的全部 JS 持有者(按源对象聚合)
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
console.log('rev built');
const isDomShape = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
const detached = [];
for (let i = 0; i < nodeCount; i++) if (isDomShape(i)) detached.push(i);
console.log('DOM-shaped native nodes =', detached.length);
// JS 持有者聚合
const holders = new Map(); // key = srcIdx → count, eN 样本
for (const d of detached) {
  for (const e of (rev.get(d) ?? [])) {
    const t = tp(e.src);
    if (t === 'native' || t === 'synthetic' || t === 'string' || t === 'code') continue;
    holders.set(e.src, (holders.get(e.src) ?? 0) + 1);
  }
}
const sorted = [...holders.entries()].sort((a, b) => b[1] - a[1]);
console.log('\n==== 游离 DOM 的 JS 持有者(按持有数) ====');
for (const [h, n] of sorted.slice(0, 40)) console.log(`  ×${n} ${tp(h)}:${String(nm(h)).slice(0, 60)}#${h} id=${idOf(h)}`);
// 对 top 持有者,再问一层:谁持有它
console.log('\n==== top 持有者的上游 in-edges ====');
for (const [h, n] of sorted.slice(0, 14)) {
  console.log(`\n holder ×${n} ${tp(h)}:${String(nm(h)).slice(0, 50)}#${h}`);
  for (const e of (rev.get(h) ?? []).slice(0, 12)) {
    const t2 = tp(e.src);
    if (t2 === 'synthetic') continue;
    console.log(`   ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${t2}:${String(nm(e.src)).slice(0, 60)}#${e.src}`);
  }
}
process.exit(0);
