// ★BJ318 堆快照 retainer 分析器：定位退世界后仍被钉死的实例与钉死路径。
// 用法: node --max-old-space-size=8192 tools/../scripts/_bj318-snap-analyze.mjs <snapshot文件>
// 输出:
//   ① 目标 constructor 实例计数+自身大小（Game/World/TileStore/AssetBundle/EntityManager…）
//   ② 每个目标实例的反向 retainer 链（BFS 上溯到 GC 根，深度≤12）
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const { meta, nodes, edges, strings } = raw.snapshot ? { ...raw.snapshot, ...raw } : raw;
const nodeFields = meta.node_fields;
const edgeFields = meta.edge_fields;
const F = nodeFields.length;
const EF = edgeFields.length;
const nodeCount = raw.snapshot.node_count;
const typeNames = meta.node_types[0];      // node type → string idx? types[0] 是 type 名表
const edgeTypeNames = meta.edge_types[0];

const nodeNameIdx = nodeFields.indexOf('name');
const nodeTypeIdx = nodeFields.indexOf('type');
const nodeIdIdx = nodeFields.indexOf('id');
const nodeSelfIdx = nodeFields.indexOf('self_size');
const nodeEdgeCountIdx = nodeFields.indexOf('edge_count');
const edgeNameIdx = edgeFields.indexOf('name_or_index');
const edgeTypeIdx = edgeFields.indexOf('type');
const edgeToIdx = edgeFields.indexOf('to_node');

console.log(`nodes=${nodeCount} edges=${edges.length / EF} fields/node=${F}`);

// 节点枚举
function nodeName(i) { return strings[nodes[i * F + nodeNameIdx]]; }
function nodeType(i) { const t = nodes[i * F + nodeTypeIdx]; return typeof t === 'number' ? (typeNames[t] ?? String(t)) : String(t); }

const TARGETS = new Set(['Game', 'World', 'TileStore', 'AssetBundle', 'EntityManager', 'BehaviorRecorder',
  'WaterWaveSystem', 'AudioRecorder', 'SpriteAtlas', 'ChunkCache', 'Renderer', 'Player', 'WorldEvolution',
  'Sfx', 'WorldPacket', 'Input', 'Bestiary', 'Research']);
const found = new Map();   // name → array of node indexes
for (let i = 0; i < nodeCount; i++) {
  const nm = nodeName(i);
  if (TARGETS.has(nm)) {
    if (!found.has(nm)) found.set(nm, []);
    found.get(nm).push(i);
  }
}
const byName = [];
for (const [nm, arr] of found) {
  const self = arr.reduce((a, i) => a + nodes[i * F + nodeSelfIdx], 0);
  byName.push(`${nm}: ${arr.length} 个, self=${(self / 1e6).toFixed(1)}MB`);
}
byName.sort().forEach((l) => console.log('  ' + l));

// 反向边索引: targetNodeIdx → [{src, eType, eName}]
const rev = new Map();
let ep = 0;
for (let i = 0; i < nodeCount; i++) {
  const ec = nodes[i * F + nodeEdgeCountIdx];
  for (let k = 0; k < ec; k++) {
    const base = (ep + k) * EF;
    const to = edges[base + edgeToIdx] / F;
    let lst = rev.get(to);
    if (!lst) { lst = []; rev.set(to, lst); }
    if (lst.length < 200) lst.push({ src: i, eType: edgeTypeNames[edges[base + edgeTypeIdx]], eName: strings[edges[base + edgeNameIdx]] });
  }
  ep += ec;
}

// GC 根判定：synthetic 类型节点（GC roots / Global handles 等无入边归属）
function isRoot(i) { return nodeType(i) === 'synthetic' || i === 0; }

function retainers(idx, maxDepth = 12, maxBreadth = 24) {
  const paths = [];
  const visit = (cur, path, depth) => {
    if (paths.length >= 3 || depth > maxDepth) return;
    const inc = rev.get(cur) ?? [];
    // 优先 property/context/variable 命名边
    inc.sort((a, b) => (a.eType === 'property' ? -1 : 0) - (b.eType === 'property' ? -1 : 0));
    for (const e of inc.slice(0, maxBreadth)) {
      const p = [...path, `${e.eType === 'element' ? `[${e.eName}]` : e.eName}` + `@${nodeType(e.src)}:${nodeName(e.src)}`];
      if (isRoot(e.src)) { paths.push(p); if (paths.length >= 3) return; continue; }
      if (path.some((x) => x.endsWith(`@${nodeType(e.src)}:${nodeName(e.src)}`))) continue; // 环剪枝
      visit(e.src, p, depth + 1);
      if (paths.length >= 3) return;
    }
  };
  visit(idx, [`<target>${nodeType(idx)}:${nodeName(idx)}`], 0);
  return paths;
}

for (const nm of ['Game', 'World', 'TileStore', 'AssetBundle', 'EntityManager']) {
  const arr = found.get(nm);
  if (!arr?.length) continue;
  console.log(`\n==== retainer paths: ${nm} (${arr.length} 实例,展示前 2 个) ====`);
  for (const idx of arr.slice(0, 2)) {
    const paths = retainers(idx);
    console.log(`-- 实例 id=${nodes[idx * F + nodeIdIdx]} self=${(nodes[idx * F + nodeSelfIdx] / 1e6).toFixed(2)}MB`);
    if (!paths.length) console.log('   (无到根的路径——可能仅弱可达)');
    for (const p of paths.slice(0, 2)) console.log('   ' + p.join(' ← '));
  }
}
// 附加：JSArrayBuffer 总量（typed array 后备）
let abCount = 0, abSize = 0;
for (let i = 0; i < nodeCount; i++) {
  if (nodeName(i) === 'ArrayBuffer' || nodeName(i) === 'JSArrayBuffer') { abCount++; abSize += nodes[i * F + nodeSelfIdx]; }
}
console.log(`\nArrayBuffer/JSArrayBuffer: ${abCount} 个, shallow 合计 ${(abSize / 1e6).toFixed(1)}MB`);
console.log('DONE');
