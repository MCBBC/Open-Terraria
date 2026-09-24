// ★BJ335 岛外引用 v4:native 持有者细分类——PropertyCell(全局属性槽)/Global handles/
//  SourceTextModule/ScriptState 等【系统根】算外部钉;纯 blink DOM 结构才算环内
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
const fwdAdj = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      const eT = edgeTypeNames[edges[base + eType]];
      const eN = eT === 'element' ? String(edges[base + eName]) : (strings[edges[base + eName]] ?? String(edges[base + eName]));
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT, eN });
      let f = fwdAdj.get(i); if (!f) { f = []; fwdAdj.set(i, f); }
      f.push({ to, eT, eN });
    }
    ep += cnt;
  }
}
const isCtx = (i) => tp(i) === 'object' && /Context/.test(String(nm(i)));
const isIslType = (i) => tp(i) === 'closure' || isCtx(i);
// 种子:panelBg+sepEl
const seeds = [];
for (let i = 0; i < nodeCount; i++) {
  if (!isCtx(i)) continue;
  const slots = (fwdAdj.get(i) ?? []).filter((f) => f.eT === 'context').map((f) => f.eN);
  if (slots.includes('panelBg') && slots.includes('sepEl')) seeds.push(i);
}
console.log('seeds=', seeds.length);
const isl = new Set(); const q = [...seeds];
while (q.length) {
  const c = q.pop();
  if (isl.has(c) || !isIslType(c)) continue;
  isl.add(c);
  for (const e of (rev.get(c) ?? [])) {
    const ok = (e.eT === 'internal' && (e.eN === 'context' || e.eN === 'previous')) || e.eT === 'context';
    if (ok && isIslType(e.src) && !isl.has(e.src)) q.push(e.src);
  }
  for (const f of (fwdAdj.get(c) ?? [])) {
    const ok = (f.eT === 'internal' && (f.eN === 'context' || f.eN === 'previous')) || f.eT === 'context';
    if (ok && isIslType(f.to) && !isl.has(f.to)) q.push(f.to);
  }
}
console.log('island=', isl.size);
// 岛外引用:分类
const SYSROOT = /PropertyCell|Global handles|SourceTextModule|ScriptState|Eternal|Client heap|Debugger|Strong roots/;
const pins = new Map(); const listenerOwners = new Map();
const isDom = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
for (const n of isl) {
  for (const e of (rev.get(n) ?? [])) {
    if (isl.has(e.src)) continue;
    const t = tp(e.src); const s = String(nm(e.src));
    if (t === 'synthetic' || t === 'string' || (t === 'code' && e.eT === 'weak')) continue;
    if (t === 'native' && /EventListener$/.test(s)) {
      // 注册链上行找宿主
      const prev = new Map(); let layer = [e.src]; const seen = new Set([e.src]); let owner = -1; let kind = '';
      for (let d = 0; d < 16 && layer.length && owner < 0; d++) {
        const nxt = [];
        for (const cur of layer) {
          for (const e2 of (rev.get(cur) ?? [])) {
            const t2 = tp(e2.src); const s2 = String(nm(e2.src));
            if (t2 === 'synthetic' || seen.has(e2.src)) continue;
            if (!prev.has(e2.src)) prev.set(e2.src, cur);
            nxt.push(e2.src);
            if (isDom(e2.src)) { owner = e2.src; kind = 'dom'; break; }
            if (t2 === 'object' && /Window|JSGlobal|HTMLDocument/.test(s2)) { owner = e2.src; kind = 'windoc'; break; }
          }
          layer = [...new Set(nxt)];
        }
      }
      if (owner >= 0) { const k = `[${kind}]${String(nm(owner)).slice(0, 48)}#${owner}`; listenerOwners.set(k, (listenerOwners.get(k) ?? 0) + 1); }
      continue;
    }
    if (t === 'native') {
      if (SYSROOT.test(s)) { const k = `[SYSNATIVE] ${s.slice(0, 46)}#${e.src} via ${e.eT}:'${String(e.eN).slice(0, 26)}'`; pins.set(k, (pins.get(k) ?? 0) + 1); }
      continue;
    }
    const k = `${t}:${s.slice(0, 52)}#${e.src} id=${idOf(e.src)} via ${e.eT}:'${String(e.eN).slice(0, 26)}'`;
    pins.set(k, (pins.get(k) ?? 0) + 1);
  }
}
console.log('\n监听宿主:');
for (const [k, n] of [...listenerOwners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(`   ×${n} ${k}`);
console.log('\n外部钉(含系统根):');
for (const [k, n] of [...pins.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26)) console.log(`   ×${n} ${k}`);
process.exit(0);
