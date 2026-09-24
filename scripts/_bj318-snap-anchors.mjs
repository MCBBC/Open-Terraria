// ★BJ318 迭代锚枚举：反复 forward-BFS（语义边集），每轮禁用上一轮路径中
// 「Window → 挂载对象」那条边（黑名单按 Window 的出边目标），直到无可达路径
// 或轮数上限——枚举全部根侧锚族。
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle2.heapsnapshot';
const TARGET_NAME = process.argv[3] ?? 'World';
const ROUNDS = Number(process.argv[4] ?? 8);

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
const ALLOW = new Set(['property', 'element', 'context', 'internal', 'hidden', 'variable']);
const targets = new Set();
for (let i = 0; i < nodeCount; i++) if (nm(i) === TARGET_NAME && tp(i) === 'object') targets.add(i);
console.log(`目标 ${TARGET_NAME}: ${targets.size} 实例`);

let winIdx = -1;
for (let i = 0; i < nodeCount; i++) if (nm(i).includes('JSGlobalObject')) { winIdx = i; break; }
const bannedFromWin = new Set();

for (let round = 0; round < ROUNDS; round++) {
  const parent = new Int32Array(nodeCount).fill(-1);
  const viaK = new Int32Array(nodeCount).fill(-1);
  const q = new Int32Array(nodeCount);
  let h = 0, t = 0;
  for (let i = 0; i < nodeCount; i++) if (tp(i) === 'synthetic') { parent[i] = -2; q[t++] = i; }
  let found = null;
  while (h < t && !found) {
    const cur = q[h++];
    for (let k = startArr[cur]; k < startArr[cur + 1]; k++) {
      if (!ALLOW.has(edgeTypeNames[edgeTypeArr[k]])) continue;
      const to = edgeToArr[k];
      if (cur === winIdx && bannedFromWin.has(to)) continue;
      if (parent[to] !== -1) continue;
      parent[to] = cur; viaK[to] = k;
      q[t++] = to;
      if (targets.has(to)) { found = to; break; }
    }
  }
  if (!found) { console.log(`round ${round}: 无更多可达路径`); break; }
  // 重建路径
  const path = [];
  let cur = found;
  while (cur !== -2 && cur >= 0) {
    const k = viaK[cur];
    const e = k >= 0 ? `--(${edgeTypeNames[edgeTypeArr[k]]}:${strings[edgeNameArr[k]] ?? edgeNameArr[k]})-->` : '(root)';
    path.push(e + ' ' + label(cur));
    cur = parent[cur];
  }
  console.log(`\n== round ${round} ==\n  ` + path.join('\n  '));
  // 禁用 Window→挂载对象 边（路径中 JSGlobalObject 的下一节点）
  for (let i = path.length - 1; i > 0; i--) {
    if (path[i].includes('JSGlobalObject')) {
      // path[i-1] 是挂载对象（更靠近 target 一侧）
      const m = path[i - 1].match(/#(\d+)$/);
      if (m) bannedFromWin.add(Number(m[1]));
      break;
    }
  }
}
console.log('DONE');
