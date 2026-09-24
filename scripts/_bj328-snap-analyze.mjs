// ★BJ328：堆快照分析——类名 census（A→B 差分）+ 可选正向语义链（root→target）。
// 用法: node _bj328-snap-analyze.mjs census /tmp/bj328-a.heapsnapshot /tmp/bj328-b.heapsnapshot
//       node _bj328-snap-analyze.mjs chain /tmp/bj328-b.heapsnapshot HTMLDivElement 5
import fs from 'node:fs';

function parse(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const meta = raw.snapshot.meta;
  const { nodes, edges, strings } = raw;
  const F = meta.node_fields.length; const EF = meta.edge_fields.length;
  const typeNames = meta.node_types[0]; const edgeTypeNames = meta.edge_types[0];
  const nType = meta.node_fields.indexOf('type'); const nName = meta.node_fields.indexOf('name');
  const nEdges = meta.node_fields.indexOf('edge_count');
  const eName = meta.edge_fields.indexOf('name_or_index'); const eType = meta.edge_fields.indexOf('type'); const eTo = meta.edge_fields.indexOf('to_node');
  const nodeCount = raw.snapshot.node_count;
  return { raw, nodes, edges, strings, F, EF, typeNames, edgeTypeNames, nType, nName, nEdges, eName, eType, eTo, nodeCount };
}
const nmOf = (s, i) => s.strings[s.nodes[i * s.F + s.nName]];
const tpOf = (s, i) => { const t = s.nodes[i * s.F + s.nType]; return typeof t === 'number' ? (s.typeNames[t] ?? String(t)) : String(t); };

const mode = process.argv[2] ?? 'census';

if (mode === 'census') {
  const files = process.argv.slice(3);
  const censuses = [];
  for (const f of files) {
    const s = parse(f);
    const c = new Map();
    for (let i = 0; i < s.nodeCount; i++) {
      const tp = tpOf(s, i); const nm = nmOf(s, i);
      if (tp !== 'object') continue;
      if (/^(HTML|SVG|CSS|Text$|Node$|Event|Message|Worker|WebSocket|Audio|Abort|Media|Perf|Canvas|WebGL|Screen|Visual|Performance)/.test(nm)) {
        c.set(nm, (c.get(nm) ?? 0) + 1);
      }
    }
    censuses.push({ f, c });
    console.log(`${f}: ${s.nodeCount} nodes`);
  }
  const [a, b] = censuses;
  const keys = new Set([...a.c.keys(), ...b.c.keys()]);
  const rows = [];
  for (const k of keys) rows.push({ k, a: a.c.get(k) ?? 0, b: b.c.get(k) ?? 0 });
  rows.sort((x, y) => (y.b - y.a) - (x.b - x.a));
  console.log('class                       A(1轮菜单)  B(2轮菜单)  Δ');
  for (const r of rows.slice(0, 45)) console.log(`${r.k.padEnd(26)} ${String(r.a).padStart(8)} ${String(r.b).padStart(10)} ${String(r.b - r.a).padStart(4)}`);
} else if (mode === 'chain') {
  const file = process.argv[3]; const wantName = process.argv[4]; const wantIdx = Number(process.argv[5] ?? 0);
  const s = parse(file);
  const { nodes, edges, strings, F, EF, typeNames, edgeTypeNames, nodeCount, eName, eType, eTo, nEdges } = s;
  const label = (i) => `${tpOf(s, i)}:${nmOf(s, i)}#${i}`;
  // 正向邻接
  const startArr = new Uint32Array(nodeCount + 1);
  let ep = 0;
  for (let i = 0; i < nodeCount; i++) { startArr[i] = ep; ep += nodes[i * F + nEdges]; }
  startArr[nodeCount] = ep;
  const edgeToArr = new Uint32Array(ep);
  const edgeNameArr = new Uint32Array(ep);
  const edgeTypeArr = new Uint8Array(ep);
  for (let k = 0; k < ep; k++) {
    edgeToArr[k] = edges[k * EF + eTo] / F;
    edgeNameArr[k] = edges[k * EF + eName];
    edgeTypeArr[k] = edges[k * EF + eType];
  }
  const targets = [];
  for (let i = 0; i < nodeCount; i++) if (nmOf(s, i) === wantName && tpOf(s, i) === 'object') targets.push(i);
  console.log(`${wantName} 实例共 ${targets.length} 个；追踪下标 ${wantIdx}（第 ${wantIdx + 1} 个）`);
  const tgt = targets[wantIdx];
  if (tgt === undefined) { console.log('无此下标'); process.exit(1); }
  const ALLOW = new Set(['property', 'element', 'context', 'internal', 'hidden', 'shortcut', 'variable']);
  const parent = new Int32Array(nodeCount).fill(-1);
  const viaEdge = new Int32Array(nodeCount).fill(-1);
  const q = new Int32Array(nodeCount);
  let h = 0, t = 0;
  for (let i = 0; i < nodeCount; i++) if (tpOf(s, i) === 'synthetic') { parent[i] = -2; q[t++] = i; }
  let found = false;
  while (h < t && !found) {
    const cur = q[h++];
    for (let k = startArr[cur]; k < startArr[cur + 1]; k++) {
      if (!ALLOW.has(edgeTypeNames[edgeTypeArr[k]])) continue;
      const to = edgeToArr[k];
      if (parent[to] !== -1) continue;
      parent[to] = cur; viaEdge[to] = k; q[t++] = to;
      if (to === tgt) { found = true; break; }
    }
  }
  if (!found) { console.log('语义边不可达'); process.exit(0); }
  const path = [];
  let cur = tgt;
  let steps = 0;
  while (cur !== -2 && cur >= 0 && steps < 40) {
    const k = viaEdge[cur];
    const e = k >= 0 ? `--(${edgeTypeNames[edgeTypeArr[k]]}:${strings[edgeNameArr[k]] ?? edgeNameArr[k]})-->` : '(root)';
    path.push(e + ' ' + label(cur));
    cur = parent[cur]; steps++;
  }
  console.log('正向语义路径(root→target):\n  ' + path.join('\n  '));
}
console.log('DONE');
