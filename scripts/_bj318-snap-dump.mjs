import fs from 'node:fs';
const FILE = process.argv[2];
const IDS = process.argv.slice(3).map(Number);
const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length;
const typeNames = meta.node_types[0]; const edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'); const nName = meta.node_fields.indexOf('name');
const nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'); const eType = meta.edge_fields.indexOf('type'); const eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const EF = meta.edge_fields.length;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => { const t = nodes[i * F + nType]; return typeof t === 'number' ? (typeNames[t] ?? String(t)) : String(t); };
const label = (i) => `${tp(i)}:${nm(i)}`;
const eTname = (t) => edgeTypeNames[t] ?? String(t);
for (const id of IDS) {
  console.log(`\n==== node #${id} ${label(id)} ====`);
  {
    let ep = 0; let found = null;
    for (let i = 0; i < nodeCount; i++) {
      const ec = nodes[i * F + nEdges];
      if (i === id) { found = { start: ep, count: ec }; break; }
      ep += ec;
    }
    console.log(`-- 出边 ${found.count} 条:`);
    const out = {};
    for (let k = 0; k < found.count; k++) {
      const base = (found.start + k) * EF;
      const t = edges[base + eTo] / F;
      const key = `${eTname(edges[base + eType])}:${strings[edges[base + eName]] ?? edges[base + eName]}`;
      (out[key] ??= []).push(`${label(t)}#${t}`);
    }
    for (const [k, v] of Object.entries(out)) {
      if (!/^(context|property|variable|element)/.test(k)) continue;
      console.log(`   ${k} -> ${v.slice(0, 10).join(', ')}${v.length > 10 ? ` (+${v.length - 10})` : ''}`);
    }
  }
  {
    console.log('-- 入边（谁引用）:');
    const inc = {};
    let ep2 = 0;
    for (let i = 0; i < nodeCount; i++) {
      const ec = nodes[i * F + nEdges];
      for (let k = 0; k < ec; k++) {
        const base = (ep2 + k) * EF;
        if (edges[base + eTo] / F === id) {
          const key = `${eTname(edges[base + eType])}:${strings[edges[base + eName]] ?? edges[base + eName]}`;
          (inc[key] ??= []).push(`${label(i)}#${i}`);
        }
      }
      ep2 += ec;
    }
    for (const [k, v] of Object.entries(inc)) console.log(`   ${k} <- ${v.slice(0, 8).join(', ')}${v.length > 8 ? ` (+${v.length - 8})` : ''}`);
  }
}
console.log('DONE');
