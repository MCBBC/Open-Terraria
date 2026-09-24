// ★BJ335 closure 岛洪泛 v2:internal(context/previous)+context(槽) 边都在岛内;
//  岛外引用=外部钉;监听宿主标注 连接/游离
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
const idOf = (i) => nodes[i * F + nId];
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
// 主树标记(从 <html> 下行,双向 element 边)
let mainC = new Set();
{ let h = -1; for (let i = 0; i < nodeCount && h < 0; i++) if (isDom(i) && /^<html[\s>]/.test(String(nm(i)))) h = i;
  const q = [h]; mainC.add(h);
  while (q.length) { const c = q.pop();
    for (const e of (rev.get(c) ?? [])) if (e.eT === 'element' && isDom(e.src) && !mainC.has(e.src)) { mainC.add(e.src); q.push(e.src); }
    // 前向也要(element 边双向混排)
    for (let k = 0; k < nodes[c * F + nEdges]; k++) { /* fwd 由 rev 反查不到——用邻接补 */ }
  } }
// 前向邻接补全
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
{ const q = [...mainC];
  while (q.length) { const c = q.pop();
    for (let k = fwdStart[c]; k < fwdStart[c + 1]; k++) {
      const base = k * EF;
      if (edgeTypeNames[edges[base + eType]] !== 'element') continue;
      const to = edges[base + eTo] / F;
      if (isDom(to) && !mainC.has(to)) { mainC.add(to); q.push(to); }
    }
  } }
console.log('main tree size =', mainC.size);
const isIslandType = (i) => { const t = tp(i); return t === 'closure' || (t === 'object' && /Context/.test(String(nm(i)))); };
function island(seeds) {
  const isl = new Set(); const q = [...seeds];
  while (q.length) {
    const c = q.pop();
    if (isl.has(c) || !isIslandType(c)) continue;
    isl.add(c);
    for (const e of (rev.get(c) ?? [])) {
      const ok = (e.eT === 'internal' && (e.eN === 'context' || e.eN === 'previous')) || e.eT === 'context';
      if (ok && isIslandType(e.src) && !isl.has(e.src)) q.push(e.src);
    }
    for (let k = fwdStart[c]; k < fwdStart[c + 1]; k++) {
      const base = k * EF;
      const t = edgeTypeNames[edges[base + eType]];
      const to = edges[base + eTo] / F;
      const ok = (t === 'internal' && (strings[edges[base + eName]] === 'context' || strings[edges[base + eName]] === 'previous')) || t === 'context';
      if (ok && isIslandType(to) && !isl.has(to)) q.push(to);
    }
  }
  return isl;
}
const seeds = [745919, 745652, 745853, 746360, 745905, 750480, 749487, 747107, 746695];
const isl = island(seeds);
console.log('island size =', isl.size);
// 岛外引用
const pins = new Map(); const listenerOwners = new Map();
for (const n of isl) {
  for (const e of (rev.get(n) ?? [])) {
    if (isl.has(e.src)) continue;
    const t = tp(e.src);
    if (t === 'native' && /EventListener$/.test(String(nm(e.src)))) {
      const prev = new Map(); let layer = [e.src]; const seen = new Set([e.src]); let owner = -1;
      for (let d = 0; d < 12 && layer.length && owner < 0; d++) {
        const nxt = [];
        for (const cur of layer) { for (const e2 of (rev.get(cur) ?? [])) { if (tp(e2.src) !== 'native' || seen.has(e2.src)) continue; if (!prev.has(e2.src)) prev.set(e2.src, cur); nxt.push(e2.src); if (isDom(e2.src)) { owner = e2.src; break; } } layer = [...new Set(nxt)]; }
      }
      if (owner >= 0) { const k2 = (mainC.has(owner) ? '[连接树]' : '[游离]') + String(nm(owner)).slice(0, 54) + '#' + owner; listenerOwners.set(k2, (listenerOwners.get(k2) ?? 0) + 1); }
      continue;
    }
    if (t === 'native' || t === 'synthetic') continue;
    const k = `${tp(e.src)}:${String(nm(e.src)).slice(0, 55)}#${e.src} id=${idOf(e.src)} via ${e.eT}:'${String(e.eN).slice(0, 28)}'`;
    pins.set(k, (pins.get(k) ?? 0) + 1);
  }
}
console.log('\n监听宿主(岛内 closure 的注册宿主):');
for (const [k, n] of [...listenerOwners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)) console.log(`   ×${n} ${k}`);
console.log('\n岛外 JS 引用(真·外部钉):');
for (const [k, n] of [...pins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 24)) console.log(`   ×${n} ${k}`);
process.exit(0);
