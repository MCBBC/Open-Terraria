// ★BJ328：native 节点类型 A→B 差分（retainer 增长面）。
import fs from 'node:fs';
function census(f) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const meta = raw.snapshot.meta;
  const { nodes, strings } = raw;
  const F = meta.node_fields.length;
  const typeNames = meta.node_types[0];
  const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name');
  const c = new Map();
  for (let i = 0; i < raw.snapshot.node_count; i++) {
    const t = typeNames[nodes[i * F + nType]];
    if (t !== 'native') continue;
    const n = strings[nodes[i * F + nName]];
    if (typeof n !== 'string') continue;
    const key = n.slice(0, 90);
    c.set(key, (c.get(key) ?? 0) + 1);
  }
  return c;
}
const a = census(process.argv[2] ?? '/tmp/bj328-a.heapsnapshot');
const b = census(process.argv[3] ?? '/tmp/bj328-b.heapsnapshot');
const keys = new Set([...a.keys(), ...b.keys()]);
const rows = [];
for (const k of keys) {
  const x = a.get(k) ?? 0, y = b.get(k) ?? 0;
  if (y - x > 15) rows.push({ k, x, y, d: y - x });
}
rows.sort((p, q) => q.d - p.d);
console.log('Δ      A→B      name');
for (const r of rows.slice(0, 34)) console.log(String(r.d).padStart(6), `${r.x}→${r.y}`.padEnd(12), r.k);
