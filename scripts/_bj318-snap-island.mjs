// ★BJ318 岛边界分析器：以死 World 为种子求向下闭包（岛），再扫全部边找
// 「岛外 → 岛内」引用者（=外锚）。外锚通常是模块级 let 的 Context/scope 节点、
// 定时器回调、或 DOM listener——label+入边直接给身份。
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
const SEEDNAME = process.argv[3] ?? 'World';
const PICK = Number(process.argv[4] ?? 0);

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

// 正向邻接（数组式,避免每边对象）
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

// 1) 种子
const seeds = [];
for (let i = 0; i < nodeCount; i++) if (nm(i) === SEEDNAME && tp(i) === 'object') seeds.push(i);
const seed = seeds[PICK];
console.log(`种子 ${label(seed)}（共 ${seeds.length} 个实例）`);

// 2) 向下闭包（岛）
const island = new Uint8Array(nodeCount);
const queue = new Int32Array(nodeCount);
let qh = 0, qt = 0;
island[seed] = 1; queue[qt++] = seed;
while (qh < qt) {
  const cur = queue[qh++];
  for (let k = startArr[cur]; k < startArr[cur + 1]; k++) {
    const t = edgeToArr[k];
    // ★跳过原型链边与 shortcut——防岛吞全局 builtin（860k 节点污染的根因）
    const etn = edgeTypeNames[edgeTypeArr[k]];
    const enn = strings[edgeNameArr[k]];
    if (etn === 'shortcut') continue;
    if (etn === 'internal' && enn === 'prototype') continue;   // 闭包/对象的 internal 原型边
    if (etn === 'property' && (enn === '__proto__' || enn === 'prototype' || enn === 'constructor')) continue;
    if (enn === 'previous') continue;   // ★上下文外层链——防岛沿 scope 链吞模块上下文
    if (tp(t) === 'synthetic') continue;
    if (!island[t]) { island[t] = 1; queue[qt++] = t; }
  }
}
console.log(`岛规模: ${qt} 节点`);

// 3) 岛外 → 岛内 引用者
const ext = new Map();   // src → {count, samples:[dstLabel+edge]}
const KEEP_SRC = new Set(['object', 'closure', 'array']);
for (let i = 0; i < nodeCount; i++) {
  if (island[i]) continue;
  if (!KEEP_SRC.has(tp(i))) continue;   // ★过滤:synthetic/string/shape/native/code 等非语义引用者
  for (let k = startArr[i]; k < startArr[i + 1]; k++) {
    const t = edgeToArr[k];
    if (!island[t]) continue;
    if (edgeTypeNames[edgeTypeArr[k]] === 'weak') continue;   // ★弱边不构成强引用
    let rec = ext.get(i);
    if (!rec) { rec = { count: 0, samples: [] }; ext.set(i, rec); }
    rec.count++;
    if (rec.samples.length < 3) rec.samples.push(`${edgeTypeNames[edgeTypeArr[k]]}:${strings[edgeNameArr[k]] ?? edgeNameArr[k]} -> ${label(t)}`);
  }
}
console.log(`岛外引用者: ${ext.size} 个`);
// 4b) ★真锚过滤:从 synthetic 根做正向可达（避开岛,弱边不计）——可达集中指向岛内者才是真锚
const reach = new Uint8Array(nodeCount);
{
  const rq = new Int32Array(nodeCount);
  let rh = 0, rt = 0;
  for (let i = 0; i < nodeCount; i++) if (tp(i) === 'synthetic' && !island[i]) { reach[i] = 1; rq[rt++] = i; }
  while (rh < rt) {
    const cur = rq[rh++];
    for (let k = startArr[cur]; k < startArr[cur + 1]; k++) {
      const t = edgeToArr[k];
      if (island[t] || reach[t]) continue;
      if (edgeTypeNames[edgeTypeArr[k]] === 'weak') continue;
      reach[t] = 1; rq[rt++] = t;
    }
  }
}
const trueAnchors = [...ext.entries()].filter(([src]) => reach[src]);
console.log(`★真锚（根可达∧指向岛内）: ${trueAnchors.length} 个`);
const sorted = trueAnchors.sort((a, b) => b[1].count - a[1].count);
for (const [src, rec] of sorted.slice(0, 40)) {
  console.log(`  [${label(src)}] ×${rec.count} ${rec.samples.join(' ; ')}`);
}
// 4) 每个外锚再上溯一层（谁引用它）
console.log('\n---- 外锚的上游（1 层） ----');
for (const [src] of sorted.slice(0, 12)) {
  const ups = [];
  ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const count = nodes[i * F + nEdges];
    if (!island[i] && i !== src) { ep += count; continue; }
    for (let k = 0; k < count; k++) {
      const base = (ep + k) * EF;
      if (edges[base + eTo] / F === src) ups.push(`${tp(i)}:${nm(i)}#${i}(${edgeTypeNames[edges[base + eType]]})`);
    }
    ep += count;
  }
  console.log(`  ${label(src)} <- ${ups.slice(0, 6).join(', ')}`);
}
console.log('DONE');
