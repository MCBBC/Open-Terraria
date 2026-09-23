// ★BJ318 快照 retainer BFS v3：对单个目标实例做向上 BFS（最短 retainer 路径,
// DevTools Retainers 面板同口径）,打印到 synthetic 根的前 K 条路径。
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
const WANT = process.argv[3] ?? 'World';
const PICK = Number(process.argv[4] ?? 0);   // 第几个实例（object: 类）
const K = Number(process.argv[5] ?? 6);

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length;
const EF = meta.edge_fields.length;
const nodeCount = raw.snapshot.node_count;
const typeNames = meta.node_types[0];
const edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type');
const nName = meta.node_fields.indexOf('name');
const nSelf = meta.node_fields.indexOf('self_size');
const nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index');
const eType = meta.edge_fields.indexOf('type');
const eTo = meta.edge_fields.indexOf('to_node');

const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => { const t = nodes[i * F + nType]; return typeof t === 'number' ? (typeNames[t] ?? String(t)) : String(t); };

const rev = new Map();
let ep = 0;
for (let i = 0; i < nodeCount; i++) {
  const ec = nodes[i * F + nEdges];
  for (let k = 0; k < ec; k++) {
    const base = (ep + k) * EF;
    const to = edges[base + eTo] / F;
    let l = rev.get(to);
    if (!l) { l = []; rev.set(to, l); }
    l.push({ src: i, eT: edges[base + eType], eN: edges[base + eName] });
  }
  ep += ec;
}
const eTname = (t) => edgeTypeNames[t] ?? String(t);
// ★BJ318 v2：根=synthetic（Global handles/GC roots 等）；native 节点（Window/
// NativeContext/PropertyArray/AccessorPair）一律【穿透】不视为根——岛内 native
// 节点（PropertyArray/AccessorPair 属岛内对象所有）会造成假根误判。
const isRoot = (i) => tp(i) === 'synthetic';
const label = (i) => `${tp(i)}:${nm(i)}`;
const edgeLabel = (e) => { const t = eTname(e.eT); return t === 'element' ? `[${strings[e.eN] ?? e.eN}]` : (strings[e.eN] ?? t); };

const inst = [];
for (let i = 0; i < nodeCount; i++) if (nm(i) === WANT && tp(i) === 'object') inst.push(i);
const target = inst[PICK];
console.log(`${WANT} object 实例 ${inst.length} 个,分析 id#${inst[PICK]} self=${(nodes[target * F + nSelf] / 1e6).toFixed(2)}MB`);

// BFS 向上
const parent = new Map();   // nodeIdx → {via: edge, from: nodeIdx}
let frontier = [target];
parent.set(target, null);
let depth = 0;
const roots = [];
const MAXVISIT = 2_500_000;
let visited = 1;
while (frontier.length && roots.length < K && depth < 40 && visited < MAXVISIT) {
  const next = [];
  for (const cur of frontier) {
    const inc = rev.get(cur) ?? [];
    for (const e of inc) {
      const s = e.src;
      if (parent.has(s)) continue;
      parent.set(s, { via: e, from: cur });
      visited++;
      if (isRoot(s)) roots.push(s);
      else next.push(s);
      if (roots.length >= K) break;
    }
    if (roots.length >= K) break;
  }
  frontier = next;
  depth++;
}
console.log(`BFS 深度=${depth} 访问=${visited} 根路径=${roots.length}`);
const pathOf = (r) => {
  const out = [];
  let cur = r;
  while (cur !== undefined && cur !== null) {
    const p = parent.get(cur);
    out.push(label(cur));
    if (p === null) break;
    cur = p.from;
  }
  return out.join(' ← ');
};
for (const r of roots) console.log(`  ROOT: ${pathOf(r)}`);
if (!roots.length) console.log('  (BFS 上限内未达根——扩大 MAXVISIT/深度)');
console.log('DONE');
