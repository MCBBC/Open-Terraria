// ★BJ335 closure 岛洪泛:从 comp 游离树的 JS 持有 context/closure 出发,
//  沿 internal:context/previous 双向 + closure↔context 洪泛,岛外引用=外部钉
import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('/tmp/bj335-neutral.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const nodes = raw.nodes, edges = raw.edges, strings = raw.strings;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
const rev = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
    }
    ep += cnt;
  }
}
const isDom = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
// 岛洪泛:closure/context 节点集
function island(seeds) {
  const isl = new Set();
  const q = [...seeds];
  while (q.length) {
    const c = q.pop();
    if (isl.has(c)) continue;
    isl.add(c);
    // 岛边:closure/context 之间的 internal 边(双向)
    for (const e of (rev.get(c) ?? [])) {
      if (e.eT !== 'internal') continue;
      if (!(e.eN === 'context' || e.eN === 'previous')) continue;
      const t = tp(e.src);
      if (t === 'closure' || (t === 'object' && /Context/.test(String(nm(e.src))))) if (!isl.has(e.src)) q.push(e.src);
    }
    // 前向:context 的槽→closure(只 closure;context 槽→其他对象不算岛)
    // rev 反向没有前向——需要 fwd:此处借用 rev 的反查不完整,改用简化:closure 指向 context 已含。
  }
  return isl;
}
// 岛节点的外部引用(非岛、非 native、非 synthetic)
function externalPins(isl) {
  const pins = new Map();
  const listenerOwners = new Map();
  for (const n of isl) {
    for (const e of (rev.get(n) ?? [])) {
      if (isl.has(e.src)) continue;
      const t = tp(e.src);
      if (t === 'native' && /EventListener$/.test(String(nm(e.src)))) {
        // 监听注册链:上行找宿主元素
        const prev = new Map(); let layer = [e.src]; const seen = new Set([e.src]);
        let owner = -1;
        for (let d = 0; d < 12 && layer.length && owner < 0; d++) {
          const nxt = [];
          for (const cur of layer) {
            for (const e2 of (rev.get(cur) ?? [])) {
              if (tp(e2.src) !== 'native' || seen.has(e2.src)) continue;
              if (!prev.has(e2.src)) prev.set(e2.src, cur);
              nxt.push(e2.src);
              if (isDom(e2.src)) { owner = e2.src; break; }
            }
            layer = [...new Set(nxt)];
          }
        }
        if (owner >= 0) listenerOwners.set(String(nm(owner)).slice(0, 60) + '#' + owner, (listenerOwners.get(String(nm(owner)).slice(0, 60) + '#' + owner) ?? 0) + 1);
        continue;
      }
      if (t === 'native' || t === 'synthetic') continue;
      const k = `${tp(e.src)}:${String(nm(e.src)).slice(0, 60)}#${e.src} via ${e.eT}:'${String(e.eN).slice(0, 30)}'`;
      pins.set(k, (pins.get(k) ?? 0) + 1);
    }
  }
  return { pins, listenerOwners };
}
// comp165 的 JS 持有者种子
const seeds = [745919, 745652, 745853, 746360, 745905, 750480, 749487].filter((i) => i >= 0);
const isl = island(seeds);
console.log('island size =', isl.size);
const { pins, listenerOwners } = externalPins(isl);
console.log('\n监听宿主(分离=环内;连接=外部钉):');
for (const [k, n] of [...listenerOwners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ×${n} ${k}`);
console.log('\n岛外 JS 引用(外部钉候选):');
for (const [k, n] of [...pins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`   ×${n} ${k}`);
process.exit(0);
