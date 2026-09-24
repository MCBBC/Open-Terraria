// ★BJ335 v2:监听宿主全解析——从 context 家族 closures 上行注册链至【任意】宿主
//  (native DOM / Window / Document / 对象),不再只认 '<'元素
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
const isWinDoc = (i) => tp(i) === 'object' && /Window|JSGlobal|HTMLDocument|Document#/.test(String(nm(i)));
// 主树
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
// 宿主解析:从 V8EventListener 上行,允许 native + 任意 object,停在 DOM/Window/其他命名对象
function owner(start) {
  const prev = new Map(); let layer = [start]; const seen = new Set([start]);
  for (let d = 0; d < 16 && layer.length; d++) {
    const nxt = [];
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        const t = tp(e.src);
        if (seen.has(e.src) || t === 'synthetic' || t === 'string' || t === 'code') continue;
        if (!prev.has(e.src)) prev.set(e.src, cur);
        nxt.push(e.src);
        if (isDom(e.src) || isWinDoc(e.src)) return { kind: isWinDoc(e.src) ? 'windoc' : (mainC.has(e.src) ? 'conn' : 'det'), node: e.src };
        if (t === 'native') continue;
        // 非 native 非 windoc 的对象:继续上行（可能是中间 wrapper）
      }
    }
    layer = [...new Set(nxt)].slice(0, 200);
  }
  return null;
}
// 对指定 context:持有它的 closures 的监听宿主
function ctxOwners(ctxIdx, label) {
  console.log(`\n===== ctx#${ctxIdx} (${label}) =====`);
  const closures = (rev.get(ctxIdx) ?? []).filter((e) => e.eT === 'internal' && e.eN === 'context' && tp(e.src) === 'closure').map((e) => e.src);
  const owners = new Map(); let none = 0;
  for (const c of closures) {
    for (const e of (rev.get(c) ?? [])) {
      if (tp(e.src) === 'native' && /EventListener$/.test(String(nm(e.src)))) {
        const r = owner(e.src);
        if (r) { const k = `[${r.kind}] ${String(nm(r.node)).slice(0, 56)}#${r.node}`; owners.set(k, (owners.get(k) ?? 0) + 1); }
        else none++;
      }
    }
  }
  console.log(' closures:', closures.length, ' unresolved:', none);
  for (const [k, n] of [...owners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ×${n} ${k}`);
}
ctxOwners(626594, 'win/panelBg/panelBorder/sepEl');
ctxOwners(626582, 'pageEquip/root/settingsBtn');
ctxOwners(288194, 'card/glyph/tx');
ctxOwners(630084, 'lock/glow');
process.exit(0);
