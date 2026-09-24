// ★BJ335:generator 函数名 + 模块 context→comp ctx 的岛内路径
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
const fwdAdj = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
      if (edgeTypeNames[edges[base + eType]] === 'internal' || edgeTypeNames[edges[base + eType]] === 'context') {
        let f = fwdAdj.get(i); if (!f) { f = []; fwdAdj.set(i, f); }
        f.push({ to, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
      }
    }
    ep += cnt;
  }
}
// closure#456050 → SharedFunctionInfo → 函数名
function fnName(closure) {
  for (const e of (rev.get(closure) ?? [])) {
    if (e.eT === 'property' && e.eN === '__proto__') continue;
    if (tp(e.src) === 'object' && /SharedFunctionInfo/.test(String(nm(e.src)))) {
      const sfi = e.src;
      const nmEdges = (rev.get(sfi) ?? []).filter((x) => x.eT === 'internal' && x.eN === 'name_or_index');
      // SFI 的名字边:找 string 名
      for (const e2 of (rev.get(sfi) ?? [])) if (tp(e2.src) === 'string' && String(nm(e2.src)).length > 0) return String(nm(e2.src)) + ` (sfi#${sfi})`;
      return `sfi#${sfi}`;
    }
  }
  return null;
}
console.log('closure#456050 name =', fnName(456050));
// 岛内路径:Generator context #316927 → comp ctx #745919 (双向 internal/context 边 BFS)
const isIslType = (i) => { const t = tp(i); return t === 'closure' || (t === 'object' && /Context/.test(String(nm(i)))); };
function pathBFS(a, b, maxD = 12) {
  const prev = new Map(); const q = [a]; const seen = new Set([a]);
  while (q.length) {
    const c = q.shift();
    if (c === b) { const path = []; let cur = b; while (cur !== a) { const p = prev.get(cur); path.push(`${p.eT}:'${String(p.eN).slice(0, 30)}' ← ${tp(cur)}:${String(nm(cur)).slice(0, 44)}#${cur}`); cur = p.from; } return path; }
    if ((prev.get(c)?.d ?? 0) > maxD) continue;
    const d = (prev.get(c)?.d ?? 0) + 1;
    for (const f of (fwdAdj.get(c) ?? [])) { if (isIslType(f.to) && !seen.has(f.to)) { seen.add(f.to); prev.set(f.to, { from: c, eT: f.eT, eN: f.eN, d }); q.push(f.to); } }
    for (const e of (rev.get(c) ?? [])) { const ok = (e.eT === 'internal' && (e.eN === 'context' || e.eN === 'previous')) || e.eT === 'context'; if (ok && isIslType(e.src) && !seen.has(e.src)) { seen.add(e.src); prev.set(e.src, { from: c, eT: e.eT, eN: e.eN, d }); q.push(e.src); } }
  }
  return null;
}
const p = pathBFS(316927, 745919);
if (p) { console.log(`\n路径 context#316927 → ctx#745919 (${p.length} 跳):`); for (const l of p) console.log('  ', l); }
else console.log('\n无路径');
// context#316927 前向槽
console.log('\ncontext#316927 前向槽(internal/context):');
for (const f of (fwdAdj.get(316927) ?? []).slice(0, 30)) console.log(`   ${f.eT}:'${String(f.eN).slice(0, 30)}' → ${tp(f.to)}:${String(nm(f.to)).slice(0, 60)}#${f.to}`);
// scope @634085 的 context 有几个、各被谁持有
console.log('\ncontext#316927 in-edges:');
for (const e of (rev.get(316927) ?? [])) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 34)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 60)}#${e.src} id=${nodes[e.src * F + nId]}`);
process.exit(0);
