import fs from 'node:fs';
const FILE = process.argv[3] ?? '/tmp/bj318-cycle3.heapsnapshot';
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length; const EF = meta.edge_fields.length;
const typeNames = meta.node_types[0]; const edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'); const nName = meta.node_fields.indexOf('name');
const nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'); const eType = meta.edge_fields.indexOf('type'); const eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => { const t = nodes[i * F + nType]; return typeof t === 'number' ? (typeNames[t] ?? String(t)) : String(t); };
const label = (i) => `${tp(i)}:${nm(i)}#${i}`;
// 正向邻接
const startArr = new Uint32Array(nodeCount + 1);
let ep = 0;
for (let i = 0; i < nodeCount; i++) { startArr[i] = ep; ep += nodes[i * F + nEdges]; }
startArr[nodeCount] = ep;
const edgeToArr = new Uint32Array(ep);
const edgeNameArr = new Uint32Array(ep);
const edgeTypeArr = new Uint8Array(ep);
for (let k = 0; k < ep; k++) {
  edgeToArr[k] = edges[k * EF + eTo] / F;
  edgeNameArr[k] = edges[k * EF + eName];
  edgeTypeArr[k] = edges[k * EF + eType];
}
const ALLOW = new Set(['property', 'element', 'context', 'internal', 'hidden', 'shortcut', 'variable']);
// 目标：全部 object:World 实例
const targets = new Set();
for (let i = 0; i < nodeCount; i++) if (nm(i) === process.argv[2] && tp(i) === 'object') targets.add(i);
// 多源正向 BFS（仅语义边）
const parent = new Int32Array(nodeCount).fill(-1);
const viaEdge = new Int32Array(nodeCount).fill(-1);
const q = new Int32Array(nodeCount);
let h = 0, t = 0;
for (let i = 0; i < nodeCount; i++) if (tp(i) === 'synthetic') { parent[i] = -2; q[t++] = i; }
let found = 0;
while (h < t && found < targets.size) {
  const cur = q[h++];
  for (let k = startArr[cur]; k < startArr[cur + 1]; k++) {
    if (!ALLOW.has(edgeTypeNames[edgeTypeArr[k]])) continue;
    const to = edgeToArr[k];
    if (parent[to] !== -1) continue;
    parent[to] = cur; viaEdge[to] = k;
    q[t++] = to;
    if (targets.has(to)) found++;
  }
}
for (const tgt of targets) {
  if (parent[tgt] === -1) { console.log(`${label(tgt)}: 语义边不可达`); continue; }
  const path = [];
  let cur = tgt;
  while (cur !== -2 && cur >= 0) {
    const k = viaEdge[cur];
    const e = k >= 0 ? `--(${edgeTypeNames[edgeTypeArr[k]]}:${strings[edgeNameArr[k]] ?? edgeNameArr[k]})-->` : '(root)';
    path.push(e + ' ' + label(cur));
    cur = parent[cur];
  }
  console.log('\n=== 正向语义路径 ===\n' + path.join('\n  '));
}
console.log('DONE');
