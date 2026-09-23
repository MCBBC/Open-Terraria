// ★BJ318 终局分析：R=从 synthetic 根沿非弱边的正向可达集（GC 活对象）,
// G=补集（快照时刻的死对象=待回收垃圾,含被钉死的 Game 岛）。
// 锚=R 中节点且存在非弱边指向 G——即「把死对象钉住」的活引用者。
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length; const EF = meta.edge_fields.length;
const typeNames = meta.node_types[0]; const edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'); const nName = meta.node_fields.indexOf('name');
const nSelf = meta.node_fields.indexOf('self_size');
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
const isWeak = (k) => edgeTypeNames[edgeTypeArr[k]] === 'weak';

// R = 从 synthetic 根正向可达（非弱边）
const R = new Uint8Array(nodeCount);
{
  const q = new Int32Array(nodeCount);
  let h = 0, t = 0;
  for (let i = 0; i < nodeCount; i++) if (tp(i) === 'synthetic') { R[i] = 1; q[t++] = i; }
  while (h < t) {
    const cur = q[h++];
    for (let k = startArr[cur]; k < startArr[cur + 1]; k++) {
      if (isWeak(k)) continue;
      const to = edgeToArr[k];
      if (!R[to]) { R[to] = 1; q[t++] = to; }
    }
  }
}
let live = 0;
for (let i = 0; i < nodeCount; i++) live += R[i];
console.log(`活集 R=${live} / 死集 G=${nodeCount - live} / 总=${nodeCount}`);

// 锚 = R 节点（限 object/closure/array）有非弱边指向 G
const anchors = new Map();
for (let i = 0; i < nodeCount; i++) {
  if (!R[i]) continue;
  const tpi = tp(i);
  if (tpi !== 'object' && tpi !== 'closure' && tpi !== 'array') continue;
  for (let k = startArr[i]; k < startArr[i + 1]; k++) {
    if (isWeak(k)) continue;
    const to = edgeToArr[k];
    if (R[to]) continue;
    let rec = anchors.get(i);
    if (!rec) { rec = { count: 0, samples: [], bytes: 0 }; anchors.set(i, rec); }
    rec.count++;
    if (rec.samples.length < 3) rec.samples.push(`${edgeTypeNames[edgeTypeArr[k]]}:${strings[edgeNameArr[k]] ?? edgeNameArr[k]} -> ${label(to)}`);
  }
}
// 按锚钉住的 G 节点数排序
const sorted = [...anchors.entries()].sort((a, b) => b[1].count - a[1].count);
console.log(`锚候选: ${anchors.size} 个, 前 30:`);
for (const [src, rec] of sorted.slice(0, 30)) {
  console.log(`  [${label(src)}] ->G×${rec.count} ${rec.samples.join(' ; ')}`);
}
console.log('DONE');
