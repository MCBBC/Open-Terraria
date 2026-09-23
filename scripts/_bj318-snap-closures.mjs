// ★BJ318：给定上下文节点,列出共享闭包,并对每个闭包向上 BFS 找「谁从根可达持有它」
import fs from 'node:fs';

const FILE = process.argv[2] ?? '/tmp/bj318-cycle3.heapsnapshot';
const CTXIDX = Number(process.argv[3]);
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
const label = (i) => `${tp(i)}:${nm(i)}`;
const eTname = (t) => edgeTypeNames[t] ?? String(t);
const isRoot = (i) => tp(i) === 'synthetic' || tp(i) === 'native';

const rev = new Map();
let ep = 0;
for (let i = 0; i < nodeCount; i++) {
  const ec = nodes[i * F + nEdges];
  for (let k = 0; k < ec; k++) {
    const base = (ep + k) * EF;
    const to = edges[base + eTo] / F;
    let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
    l.push({ src: i, eT: eTname(edges[base + eType]), eN: strings[edges[base + eName]] ?? edges[base + eName] });
  }
  ep += ec;
}
const el = (e) => (e.eT === 'element' ? `[${e.eN}]` : e.eT === 'internal' ? '' : `(${e.eN})`);

// 上下文的入边 = 共享闭包
const closures = (rev.get(CTXIDX) ?? []).map((e) => e.src);
console.log(`共享闭包 ${closures.length} 个`);
// 对每个闭包:向上 BFS ≤10 层,报最短到根路径
for (const c of closures) {
  const parent = new Map([[c, null]]);
  let frontier = [c];
  let depth = 0;
  let rootPath = null;
  while (frontier.length && depth < 10 && !rootPath) {
    const next = [];
    for (const cur of frontier) {
      for (const e of (rev.get(cur) ?? [])) {
        if (parent.has(e.src)) continue;
        parent.set(e.src, { via: e, from: cur });
        if (isRoot(e.src)) { rootPath = e.src; break; }
        next.push(e.src);
      }
      if (rootPath) break;
    }
    frontier = next;
    depth++;
  }
  if (!rootPath) { console.log(`\n[${label(c)}] (深度10内无根) `); continue; }
  const path = [];
  let cur = rootPath;
  while (cur !== null && cur !== undefined) {
    path.push(label(cur));
    const p = parent.get(cur);
    cur = p === null ? undefined : p.from;
  }
  console.log(`\n[${label(c)}] 根路径: ${path.join(' <- ')}`);
}
console.log('DONE');
