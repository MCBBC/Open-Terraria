// ★BJ335 游离树定位（对 /tmp/bj335-neutral.heapsnapshot 离线分析,零插桩污染）:
//  ①#document BFS 下行(element 边 native→native)=连接树 → 游离=native DOM 不在连接集
//  ②游离子树根=无 native-DOM parent in-edge 的游离节点
//  ③每根:子树规模+分类直方图 + JS 持有者 in-edges + 上游链(closure→[[FunctionLocation]] 离线给 id,行号在线补)
import fs from 'node:fs';

const SNAP = process.env.SW_SNAP ?? '/tmp/bj335-neutral.heapsnapshot';
const raw = JSON.parse(fs.readFileSync(SNAP, 'utf8'));
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

const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
function fwd(i) {
  const out = [];
  for (let k = fwdStart[i]; k < fwdStart[i + 1]; k++) {
    const base = k * EF;
    out.push({ eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]), to: edges[base + eTo] / F });
  }
  return out;
}
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
console.log('indexes built; nodes=', nodeCount);

const isDomShape = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));

// ①连接树:<html> 下行（本 Chromium 快照无 '#document' 节点,html 为根锚）
let doc = -1;
for (let i = 0; i < nodeCount && doc < 0; i++) { if (tp(i) === 'native' && /^<html[\s>]/.test(String(nm(i)))) doc = i; }
console.log('html root node =', doc, tp(doc), String(nm(doc)).slice(0, 50));
const connected = new Set([doc]);
{ const q = [doc];
  while (q.length) {
    const c = q.pop();
    for (const e of fwd(c)) if (e.eT === 'element' && isDomShape(e.to) && !connected.has(e.to)) { connected.add(e.to); q.push(e.to); }
  } }
console.log('connected DOM nodes =', connected.size);

// 游离 DOM
const detached = [];
for (let i = 0; i < nodeCount; i++) if (isDomShape(i) && !connected.has(i)) detached.push(i);
console.log('detached DOM nodes =', detached.length);

// ②父边 = element 边 src=native-DOM(名字以 '<' 起) → dst。游离根 = 无 DOM 父
const hasDomParent = new Set();
for (const d of detached) for (const e of (rev.get(d) ?? [])) if (e.eT === 'element' && /^</.test(String(nm(e.src))) && isDomShape(e.src)) { hasDomParent.add(d); break; }
const roots = detached.filter((d) => !hasDomParent.has(d));
console.log('detached subtree roots =', roots.length);

// 子树规模/直方图
function subtree(root) {
  const seen = new Set([root]);
  const q = [root]; let nodesN = 0;
  const hist = new Map();
  while (q.length) {
    const c = q.pop(); nodesN++;
    const m0 = String(nm(c)).match(/^<(\w+)/);
    const key = m0 ? m0[1] : String(nm(c)).slice(0, 20);
    hist.set(key, (hist.get(key) ?? 0) + 1);
    for (const e of fwd(c)) if (e.eT === 'element' && isDomShape(e.to) && !seen.has(e.to)) { seen.add(e.to); q.push(e.to); }
  }
  return { size: nodesN, hist };
}
function ident(i) {
  const s = String(nm(i));
  const clsM = s.match(/class="([^"]*)"/);
  const idM = s.match(/id="([^"]*)"/);
  const m0 = s.match(/^<(\w+)/);
  return (m0 ? m0[1] : s.slice(0, 24)) + (idM ? '#' + idM[1] : '') + (clsM ? '.' + clsM[1].trim().split(/\s+/).slice(0, 3).join('.') : '');
}
const SYS = /^(Global handles|GC roots|Builtins|Bootstrapper|Eternal handles|External strings|Extensions|Internalized strings|Object shapes|User objects|Code flusher|Compilation cache|Array buffer extensions|Detached)/;
const scored = roots.map((r) => ({ r, st: subtree(r) })).sort((a, b) => b.st.size - a.st.size);
console.log('\n==== 游离子树(按规模) ====');
for (const { r, st } of scored.slice(0, 22)) {
  console.log(`\n  root ${ident(r)} 子树=${st.size} {${[...st.hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + '×' + n).join(' ')}}`);
  // JS 持有者 in-edges:src 为 JS 对象域（非 native/synthetic）
  const isJSSrc = (e) => { const t = tp(e.src); return t !== 'native' && t !== 'synthetic' && t !== 'string' && t !== 'code'; };
  const ins = (rev.get(r) ?? []).filter(isJSSrc);
  for (const e of ins.slice(0, 10)) console.log(`    in ${e.eT}:'${String(e.eN).slice(0, 44)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 60)}#${e.src} id=${idOf(e.src)}`);
}
// 合计游离子树规模 top20 之外的总量
const rest = scored.slice(22).reduce((s, x) => s + x.st.size, 0);
console.log(`\n(其余 ${scored.length - 22} 根合计 ${rest} 节点)`);
process.exit(0);
