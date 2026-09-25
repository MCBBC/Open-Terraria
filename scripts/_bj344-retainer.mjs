// BJ344 件3：堆快照 retainer 分析——Detached canvas 节点 × 保留链上行。
// 目标：+3/轮滞留合成层的 DOM 主（脱离 canvas/GLPipeline+GLWorldLight 画布）被谁持有。
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('/tmp/bj344.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const nodes = raw.nodes, edges = raw.edges, strings = raw.strings;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
console.log('nodes=', nodeCount, 'types=', typeNames.join(','));

// 反向边索引（谁指向我）
const rev = new Map(); // to → [{from, edgeName, edgeType}]
{
  let p = 0;
  for (let i = 0; i < nodeCount; i++) {
    const ec = nodes[i * F + nEdges];
    for (let k = 0; k < ec; k++) {
      const base = (p + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to);
      if (!l) { l = []; rev.set(to, l); }
      l.push({ from: i, en: edgeTypeNames[edges[base + eType]] === 'element' ? '#' + (edges[base + eName] + 1) : strings[edges[base + eName]] });
    }
    p += ec;
  }
}

// 找 Detached canvas / Detached WebGL 场景相关 native 节点
const detached = [];
for (let i = 0; i < nodeCount; i++) {
  const n = nm(i);
  if (tp(i) === 'native' && /Detached/i.test(String(n))) detached.push(i);
}
console.log('detached native 节点数=', detached.length);
const byName = new Map();
for (const i of detached) {
  const k = String(nm(i)).replace(/\d+/g, '#');
  byName.set(k, (byName.get(k) ?? 0) + 1);
}
for (const [k, c] of [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`  ×${c} ${k}`);

// 保留链上行（BFS 限深,优先 element/property 边,输出首条到 JS 可读 holder 的链）
function chainUp(i, depth = 8) {
  const seen = new Set([i]);
  const paths = [[{ i, via: '(self)', t: tp(i) + ':' + String(nm(i)).slice(0, 40) }]];
  const out = [];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const path of paths) {
      const cur = path[path.length - 1].i;
      const ins = (rev.get(cur) ?? []).filter((e) => !seen.has(e.from));
      if (!ins.length) { if (path.length > 1) out.push(path); continue; }
      for (const e of ins.slice(0, 6)) {
        seen.add(e.from);
        next.push([...path, { i: e.from, via: e.en, t: tp(e.from) + ':' + String(nm(e.from)).slice(0, 44) }]);
      }
    }
    if (!next.length) break;
    paths.length = 0;
    paths.push(...next.slice(0, 24));
    // 已到 JS 可达根（global/window/构造器名）
    for (const p2 of paths) {
      const t = p2[p2.length - 1].t;
      if (/^object:Window|^object:global|^constructor|^closure/.test(t)) out.push(p2);
    }
    if (out.length >= 4) break;
  }
  out.push(...paths.slice(0, 2));
  return out.slice(0, 5);
}

const show = detached.filter((i) => /canvas|Canvas/i.test(String(nm(i)))).slice(0, 8);
console.log('\nDetached canvas 保留链（每节点最多 3 条）:');
for (const i of show) {
  console.log(`\n★ ${tp(i)}:${nm(i)} (id=${nodes[i * F + nId]})`);
  for (const p of chainUp(i).slice(0, 3)) {
    console.log('  ' + p.map((s) => `${s.via}→${s.t.split(':').pop()}`).join(' → '));
  }
}
