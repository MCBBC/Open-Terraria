// ★BJ328：SFI start_position 提取（匿名闭包源码定位）。
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync(process.argv[2] ?? '/tmp/bj328-b.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const fwd = new Map();
let ep = 0;
for (let i = 0; i < nodeCount; i++) { fwd.set(i, { start: ep, count: nodes[i * F + nEdges] }); ep += nodes[i * F + nEdges]; }
const out = (i) => {
  const { start, count } = fwd.get(i);
  const a = [];
  for (let k = 0; k < count; k++) {
    const b = (start + k) * EF;
    a.push({ eT: edgeTypeNames[edges[b + eType]], eN: strings[edges[b + eName]] ?? String(edges[b + eName]), to: edges[b + eTo] / F });
  }
  return a;
};
const numVal = (i) => nodes[i * F + nName];
const sfis = (process.argv[3] ?? '352914,352913,352912').split(',').map(Number);
for (const sfi of sfis) {
  let start = -1, end = -1;
  for (const e of out(sfi)) {
    const t = typeNames[nodes[e.to * F + nType]];
    if (e.eN === 'start_position' && t === 'number') start = numVal(e.to);
    if (e.eN === 'end_position' && t === 'number') end = numVal(e.to);
  }
  console.log('sfi#' + sfi, 'start=' + start, 'end=' + end);
}
