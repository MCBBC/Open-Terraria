// ★BJ335 游离树根定位:sw-slot 等游离元素沿 native 父链上行 → 树根 → JS 持有者
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
const isDomShape = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
const ident = (i) => { const s = String(nm(i)); const c = s.match(/class="([^"]*)"/); const idm = s.match(/id="([^"]*)"/); const m0 = s.match(/^<(\w+)/); return (m0 ? m0[1] : s.slice(0, 20)) + (idm ? '#' + idm[1] : '') + (c ? '.' + c[1].trim().split(/\s+/).slice(0, 2).join('.') : ''); };
// 家族采样:sw-slot / vinv-btn / vshop-cell / sw-vinv / sw-tooltip
const fams = ['sw-slot', 'vinv-btn', 'vshop-cell', 'sw-vinv', 'sw-tooltip', 'vinv-txt'];
for (const fam of fams) {
  const members = [];
  for (let i = 0; i < nodeCount; i++) if (isDomShape(i) && String(nm(i)).includes(fam)) members.push(i);
  console.log(`\n#### ${fam}: ${members.length} 个`);
  const rootsAgg = new Map();
  for (const m of members.slice(0, 400)) {
    // 上行:native-DOM in-edge 候选中,排除同名自环
    let cur = m; const seen = new Set([m]); let root = m;
    for (let hop = 0; hop < 24; hop++) {
      const ups = (rev.get(cur) ?? []).filter((e) => e.eT === 'element' && isDomShape(e.src) && !seen.has(e.src) && e.src !== cur);
      if (!ups.length) break;
      cur = ups[0].src; seen.add(cur); root = cur;
    }
    let k = rootsAgg.get(root); if (!k) { k = { n: 0, js: [] }; rootsAgg.set(root, k); }
    k.n++;
  }
  const rs = [...rootsAgg.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5);
  for (const [root, k] of rs) {
    console.log(`  root ${ident(root)}#${root} ← ${k.n} 成员`);
    const jsIns = (rev.get(root) ?? []).filter((e) => { const t = tp(e.src); return t !== 'native' && t !== 'synthetic' && t !== 'string' && t !== 'code'; });
    for (const e of jsIns.slice(0, 8)) console.log(`    ${e.eT}:'${String(e.eN).slice(0, 44)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 66)}#${e.src} id=${idOf(e.src)}`);
    if (!jsIns.length) console.log('    (无 JS in-edge)');
  }
}
process.exit(0);
