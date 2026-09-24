// ★BJ335 游离连通分量:<'-native 节点按 element 边做连通分量,排除 html 主树;
//  每分量聚合全成员的 JS in-edges(方向无关,兼容本快照父子边混排)
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
const isDomShape = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
// 邻接(element 边,两端均为 DOM 形 native)
const adj = new Map(); // i → [j]
for (let i = 0; i < nodeCount; i++) {
  if (!isDomShape(i)) continue;
  for (let k = fwdStart[i]; k < fwdStart[i + 1]; k++) {
    const base = k * EF;
    if (edgeTypeNames[edges[base + eType]] !== 'element') continue;
    const to = edges[base + eTo] / F;
    if (isDomShape(to)) { let l = adj.get(i); if (!l) { l = []; adj.set(i, l); } l.push(to); }
  }
}
// 连通分量
const comp = new Map(); let cid = 0;
for (let i = 0; i < nodeCount; i++) {
  if (!isDomShape(i) || comp.has(i)) continue;
  const q = [i]; comp.set(i, cid);
  while (q.length) { const c = q.pop(); for (const j of (adj.get(c) ?? [])) if (!comp.has(j)) { comp.set(j, cid); q.push(j); } }
  cid++;
}
// html 主树分量 = 含 <html> 的
let mainC = -1;
for (let i = 0; i < nodeCount && mainC < 0; i++) if (isDomShape(i) && /^<html[\s>]/.test(String(nm(i)))) mainC = comp.get(i);
console.log('components=', cid, 'main=', mainC);
const compSize = new Map();
const compMembers = new Map();
for (const [i, c] of comp) { compSize.set(c, (compSize.get(c) ?? 0) + 1); let l = compMembers.get(c); if (!l) { l = []; compMembers.set(c, l); } l.push(i); }
const sizes = [...compSize.entries()].sort((a, b) => b[1] - a[1]);
console.log('top components(by member count):');
for (const [c, n] of sizes.slice(0, 12)) console.log(`  comp#${c} ×${n}`);
// rev index for JS in-edges
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
const ident = (i) => { const s = String(nm(i)); const c = s.match(/class="([^"]*)"/); const idm = s.match(/id="([^"]*)"/); const m0 = s.match(/^<(\w+)/); return (m0 ? m0[1] : s.slice(0, 20)) + (idm ? '#' + idm[1] : '') + (c ? '.' + c[1].trim().split(/\s+/).slice(0, 3).join('.') : ''); };
// 每分量:成员 class 直方图 + 全成员 JS 持有者聚合
const isJSSrc = (t) => t !== 'native' && t !== 'synthetic' && t !== 'string' && t !== 'code';
for (const [c, n] of sizes.slice(0, 8)) {
  if (c === mainC) continue;
  const members = compMembers.get(c);
  const hist = new Map();
  for (const m of members) { const key = ident(m); hist.set(key, (hist.get(key) ?? 0) + 1); }
  console.log(`\n#### comp#${c} ×${n}  top-ident: ${[...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k}×${v}`).join(' ')}`);
  const hold = new Map();
  for (const m of members) for (const e of (rev.get(m) ?? [])) {
    if (e.eT !== 'property' && e.eT !== 'context' && e.eT !== 'internal' && e.eT !== 'element') continue;
    const t = tp(e.src); if (!isJSSrc(t)) continue;
    let k2 = hold.get(e.src); if (!k2) { k2 = { n: 0, edges: [] }; hold.set(e.src, k2); }
    k2.n++;
    if (k2.edges.length < 4) k2.edges.push(`${e.eT}:'${String(e.eN).slice(0, 36)}'`);
  }
  const hs = [...hold.entries()].sort((a, b) => b[1].n - a[1].n);
  for (const [h, k2] of hs.slice(0, 10)) console.log(`    holder ×${k2.n} ${tp(h)}:${String(nm(h)).slice(0, 55)}#${h} id=${idOf(h)} via ${k2.edges.join(' | ')}`);
}
process.exit(0);
