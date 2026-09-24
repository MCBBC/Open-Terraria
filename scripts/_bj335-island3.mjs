// ★BJ335 岛扫描 v3:监听宿主含 window/document(JS 对象型 target);外部钉全列
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
const isWinDoc = (i) => tp(i) === 'object' && (/Window/.test(String(nm(i))) || /Document$/.test(String(nm(i))) || /HTMLDocument/.test(String(nm(i))));
let mainC = new Set();
{ let h = -1; for (let i = 0; i < nodeCount && h < 0; i++) if (isDom(i) && /^<html[\s>]/.test(String(nm(i)))) h = i;
  const q = [h]; mainC.add(h);
  while (q.length) { const c = q.pop();
    for (const e of (rev.get(c) ?? [])) if (e.eT === 'element' && isDom(e.src) && !mainC.has(e.src)) { mainC.add(e.src); q.push(e.src); } } }
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
{ const q = [...mainC];
  while (q.length) { const c = q.pop();
    for (let k = fwdStart[c]; k < fwdStart[c + 1]; k++) { const base = k * EF;
      if (edgeTypeNames[edges[base + eType]] !== 'element') continue;
      const to = edges[base + eTo] / F;
      if (isDom(to) && !mainC.has(to)) { mainC.add(to); q.push(to); } } } }
console.log('main tree =', mainC.size);
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
      const base = k * EF; const t = edgeTypeNames[edges[base + eType]]; const to = edges[base + eTo] / F;
      const eN = t === 'element' ? null : (strings[edges[base + eName]] ?? String(edges[base + eName]));
      const ok = (t === 'internal' && (eN === 'context' || eN === 'previous')) || t === 'context';
      if (ok && isIslandType(to) && !isl.has(to)) q.push(to);
    }
  }
  return isl;
}
function ownerOf(startIdx) {
  const prev = new Map(); let layer = [startIdx]; const seen = new Set([startIdx]);
  for (let d = 0; d < 14 && layer.length; d++) {
    const nxt = [];
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        const t = tp(e.src);
        if (seen.has(e.src)) continue;
        if (t === 'native' && !/EventListener|EventTargetData/.test(String(nm(e.src)))) {
          if (!prev.has(e.src)) prev.set(e.src, cur);
          nxt.push(e.src);
          if (isDom(e.src)) return { kind: 'dom', node: e.src };
          continue;
        }
        if (isWinDoc(e.src)) return { kind: 'windoc', node: e.src };
      }
    }
    layer = [...new Set(nxt)];
  }
  return null;
}
const seeds = [745919, 745652, 745853, 746360, 745905, 750480, 749487];
const isl = island(seeds);
console.log('island =', isl.size);
const pins = new Map(); const owners = new Map(); let unowned = 0;
for (const n of isl) {
  for (const e of (rev.get(n) ?? [])) {
    if (isl.has(e.src)) continue;
    const t = tp(e.src);
    if (t === 'native' && /EventListener$/.test(String(nm(e.src)))) {
      const r = ownerOf(e.src);
      if (r) { const k2 = (r.kind === 'windoc' ? '[window/doc]' : (mainC.has(r.node) ? '[连接树]' : '[游离]')) + String(nm(r.node)).slice(0, 50); owners.set(k2, (owners.get(k2) ?? 0) + 1); }
      else unowned++;
      continue;
    }
    if (t === 'native' || t === 'synthetic') continue;
    if (t === 'code') continue;   // weak 反馈向量
    const k = `${tp(e.src)}:${String(nm(e.src)).slice(0, 55)}#${e.src} via ${e.eT}:'${String(e.eN).slice(0, 28)}'`;
    pins.set(k, (pins.get(k) ?? 0) + 1);
  }
}
console.log('unowned listeners =', unowned);
console.log('\n监听宿主分布:');
for (const [k, n] of [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`   ×${n} ${k}`);
console.log('\n岛外强引用:');
for (const [k, n] of [...pins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`   ×${n} ${k}`);
process.exit(0);
