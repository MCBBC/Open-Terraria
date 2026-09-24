// ★BJ335 上游分析：对已保存快照(/tmp/bj335-m3.heapsnapshot)
//  ①枚举所有「直接持有 ≥N 个 detached DOM 元素」的容器（Array/JSObject/BackingStore）
//  ②从每个容器向上 BFS（跳过 GC roots/DevTools console 自身句柄），锁 JS 级持有者
//   （closure→[[FunctionLocation]] 源码行 / 命名 property 边 / Context 槽表）
import fs from 'node:fs';

const raw = JSON.parse(fs.readFileSync('/tmp/bj335-m3.heapsnapshot', 'utf8'));
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

// 前向边迭代器
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
function fwd(i) {
  const out = [];
  for (let k = fwdStart[i]; k < fwdStart[i + 1]; k++) {
    const base = k * EF;
    const t = edgeTypeNames[edges[base + eType]];
    const eN = t === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName]));
    out.push({ eT: t, eN, to: edges[base + eTo] / F });
  }
  return out;
}
// 反向索引
console.log('building rev index…');
const rev = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      const t = edgeTypeNames[edges[base + eType]];
      l.push({ src: i, eT: t, eN: t === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName])) });
    }
    ep += cnt;
  }
}
console.log('rev built');
const isDOMName = (s) => typeof s === 'string' && /^<(\w+|canvas width)[\s>]/.test(s);
// detached DOM 元素 = native 节点且 DOM 形名字（快照里 document 树内的元素有 parent 链,但单看节点无法区分;
// 用「in-edge 无 DOM parent element 边」粗判——更稳:凡被 JS 容器持有即统计,document 树元素被容器持有属异常本身）
const domEls = [];
for (let i = 0; i < nodeCount; i++) {
  if (tp(i) === 'native' && isDOMName(String(nm(i)))) domEls.push(i);
}
console.log('native DOM-shaped nodes =', domEls.length);

// ①容器枚举:forward BFS 找「直接 element/internal 边指向 DOM 元素」的 JS 容器
const holder = new Map(); // domNodeIdx → Map(containerIdx → [edgeNames])
for (const d of domEls) {
  for (const e of (rev.get(d) ?? [])) {
    if (e.eT !== 'element' && e.eT !== 'internal') continue;
    const s = e.src;
    const stp = tp(s), snm = String(nm(s));
    // 容器=数组/对象/缓冲（排除另一个 DOM 元素的子边/CanvasRenderingContext2D 等 native）
    if (stp === 'native') continue;
    if (stp === 'synthetic') continue;
    if (stp === 'object' && /^\//.test(snm)) continue;   // system/* 前缀略
    let m = holder.get(d); if (!m) { m = new Map(); holder.set(d, m); }
    let l = m.get(s); if (!l) { l = []; m.set(s, l); }
    l.push(e.eT + ':' + e.eN);
  }
}
// 容器按「持有 DOM 数」聚合
const contCount = new Map();
for (const [, m] of holder) for (const c of m.keys()) contCount.set(c, (contCount.get(c) ?? 0) + 1);
const conts = [...contCount.entries()].sort((a, b) => b[1] - a[1]);
console.log('\n==== 容器直方图(直接持有 detached DOM 元素数) ====');
for (const [c, n] of conts.slice(0, 30)) console.log(`  ×${n} ${tp(c)}:${String(nm(c)).slice(0, 60)}#${c} id=${idOf(c)}`);

// ②上游 BFS:从容器向上找 JS 持有者
const SYS_SRC = (e) => {
  const s = e.src;
  if (tp(s) === 'synthetic') return true;                    // GC roots/Global handles
  if (tp(s) === 'native' && /^<canvas width/.test(String(nm(s)))) return false; // canvas 父链合法
  return false;
};
function upstream(start, label, maxDepth = 10) {
  console.log(`\n===== upstream ${label}: ${tp(start)}:${String(nm(start)).slice(0, 70)}#${start} =====`);
  const prev = new Map(); // node → {from, eT, eN}
  let layer = [start];
  const seen = new Set(layer);
  for (let d = 0; d < maxDepth && layer.length; d++) {
    const nextLayer = [];
    const printed = new Set();
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        if (SYS_SRC(e)) continue;
        if (e.eT === 'element' && tp(e.src) === 'native') continue;   // DOM 子→父边(向下无益,但父 DOM 仍可向上)——不跳
        if (seen.has(e.src)) continue;
        if (!prev.has(e.src)) prev.set(e.src, { from: cur, eT: e.eT, eN: e.eN });
        nextLayer.push(e.src);
        const key = tp(e.src) + ':' + String(nm(e.src)).slice(0, 60);
        if (printed.size < 14 && !printed.has(key)) { printed.add(key); console.log(`  +${d + 1} ${e.eT}:'${String(e.eN).slice(0, 36)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 70)}#${e.src}`); }
      }
    }
    // 判停:本层出现 closure 或 带命名 property 边的 object
    const hits = nextLayer.filter((n) => tp(n) === 'closure' || (tp(n) === 'object' && (rev.get(n) ?? []).some((e) => e.eT === 'property' && !/^\[\d+\]$/.test(String(e.eN)))));
    if (hits.length) {
      for (const h of hits.slice(0, 4)) {
        // 回溯路径
        const path = [];
        let cur = h;
        while (cur !== start) { const p = prev.get(cur); if (!p) break; path.push(`${p.eT}:'${String(p.eN).slice(0, 30)}'←${tp(cur)}:${String(nm(cur)).slice(0, 40)}`); cur = p.from; }
        console.log(`  ★JS 级持有者: ${tp(h)}:${String(nm(h)).slice(0, 70)}#${h} id=${idOf(h)}`);
        console.log(`     path(向上): ${path.join(' ← ')}`);
        for (const e of (rev.get(h) ?? []).filter((e) => e.eT === 'property').slice(0, 8)) console.log(`     prop in-edge: ${e.eT}:'${String(e.eN).slice(0, 40)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 60)}#${e.src}`);
      }
      return hits;
    }
    layer = [...new Set(nextLayer)].slice(0, 40);
  }
  console.log('  (未达 JS 级持有者/深度上限)');
  return [];
}
// 只对持有数最多的前 8 个容器做上游 BFS
for (const [c, n] of conts.slice(0, 8)) upstream(c, `container×${n}`);
process.exit(0);
