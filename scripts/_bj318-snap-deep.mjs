// ★BJ318 快照深度分析 v2：穷举目标实例的全部【近根】retainer 路径。
// 策略：对每个目标实例,上溯两层收窄「谁直接引用它」+「引用者被谁引用」,
// 只保留能到达 synthetic 根（Global handles/Window 等）的分支,去重打印。
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
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

// 反向索引
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
const isRoot = (i) => tp(i) === 'synthetic';
const label = (i) => `${tp(i)}:${nm(i)}`;
const edgeLabel = (e) => `${eTname(e.eT) === 'element' ? `[${strings[e.eN] ?? e.eN}]` : eTname(e.eT) === 'internal' ? '' : strings[e.eN] ?? ''}`;

// 目标实例
const want = process.argv[3] ?? 'World';
const inst = [];
for (let i = 0; i < nodeCount; i++) if (nm(i) === want) inst.push(i);
console.log(`${want}: ${inst.length} 实例`);

// 对每个实例:两层上溯,按 (root, hop1, hop2) 去重
for (const idx of inst) {
  console.log(`\n-- ${label(idx)} id=${idx} self=${(nodes[idx * F + nSelf] / 1e6).toFixed(2)}MB`);
  const inc1 = (rev.get(idx) ?? []).slice(0, 300);
  const seen = new Set();
  let shown = 0;
  for (const e1 of inc1) {
    if (shown >= 12) break;
    if (isRoot(e1.src)) { const k = `ROOT←${label(e1.src)}`; if (!seen.has(k)) { seen.add(k); console.log(`   ${k} --(${edgeLabel(e1)})--> ${want}`); shown++; } continue; }
    const inc2 = (rev.get(e1.src) ?? []).slice(0, 120);
    for (const e2 of inc2) {
      if (shown >= 12) break;
      if (!isRoot(e2.src)) continue;
      const k = `${label(e2.src)}←${label(e1.src)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(`   ${k} --(${edgeLabel(e2)})--> ${label(e1.src)} --(${edgeLabel(e1)})--> ${want}`);
      shown++;
    }
  }
  if (shown === 0) console.log('   (两层内无根可达路径)');
}
console.log('DONE');
