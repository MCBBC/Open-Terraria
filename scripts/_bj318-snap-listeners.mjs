// ★BJ318：解剖死 World → store → listeners 数组 → 闭包函数名（订阅者身份即泄主）。
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length; const EF = meta.edge_fields.length;
const typeNames = meta.node_types[0]; const edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'); const nName = meta.node_fields.indexOf('name');
const nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'); const eType = meta.edge_fields.indexOf('type'); const eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => { const t = nodes[i * F + nType]; return typeof t === 'number' ? (typeNames[t] ?? String(t)) : String(t); };
const label = (i) => `${tp(i)}:${nm(i)}#${i}`;

// 正向边索引
const fwd = new Map();
let ep = 0;
for (let i = 0; i < nodeCount; i++) {
  fwd.set(i, { start: ep, count: nodes[i * F + nEdges] });
  ep += nodes[i * F + nEdges];
}
function outEdges(i) {
  const { start, count } = fwd.get(i);
  const out = [];
  for (let k = 0; k < count; k++) {
    const base = (start + k) * EF;
    out.push({ eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]), to: edges[base + eTo] / F });
  }
  return out;
}
// 反向边索引
const rev = new Map();
ep = 0;
for (let i = 0; i < nodeCount; i++) {
  const count = nodes[i * F + nEdges];
  for (let k = 0; k < count; k++) {
    const base = (ep + k) * EF;
    const to = edges[base + eTo] / F;
    let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
    l.push({ src: i, eT: edgeTypeNames[edges[base + eType]], eN: strings[edges[base + eName]] ?? String(edges[base + eName]) });
  }
  ep += count;
}

// 1) 找 object:World 实例
const worlds = [];
for (let i = 0; i < nodeCount; i++) if (nm(i) === 'World' && tp(i) === 'object') worlds.push(i);
console.log('World object 实例:', worlds.map((w) => `#${w}`).join(', '));

for (const w of worlds) {
  console.log(`\n==== World#${w} ====`);
  const props = outEdges(w).filter((e) => e.eT === 'property' || e.eT === 'context');
  const stEdge = props.find((e) => e.eN === 'store');
  if (!stEdge) { console.log('  无 store 属性边'); continue; }
  const st = stEdge.to;
  console.log(`  store=${label(st)}`);
  // store 的 listeners/liquidListeners 数组
  for (const arrName of ['listeners', 'liquidListeners']) {
    const arrEdge = outEdges(st).find((e) => e.eN === arrName);
    if (!arrEdge) { console.log(`  ${arrName}: 无`); continue; }
    const arr = arrEdge.to;
    const elems = outEdges(arr).filter((e) => e.eT === 'element');
    console.log(`  ${arrName}: ${elems.length} 个订阅者闭包:`);
    const nameCount = new Map();
    for (const el of elems) {
      const c = el.to;
      // 闭包的共享上下文 → 上下文的 this/其它槽;闭包自身名字
      const ctxEdges = outEdges(c).filter((e) => e.eT === 'internal' || e.eT === 'context');
      // 上下文节点的出边(this 槽)最说明问题
      let desc = nm(c) || '(匿名)';
      // 找上下文
      for (const ce of outEdges(c)) {
        if (ce.eT === 'internal' && tp(ce.to) === 'object' && nm(ce.to).includes('Context / scope')) {
          const slots = outEdges(ce.to).filter((e) => e.eT === 'context');
          desc += ` ctx{${slots.map((s) => `${s.eN}:${label(s.to).split(':')[0]}${nm(s.to) ? ':' + nm(s.to) : ''}`).slice(0, 4).join(',')}}`;
        }
      }
      nameCount.set(desc, (nameCount.get(desc) ?? 0) + 1);
    }
    for (const [d, n] of [...nameCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`    ×${n} ${d}`);
  }
}
console.log('DONE');
