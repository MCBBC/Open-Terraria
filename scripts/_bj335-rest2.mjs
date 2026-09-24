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
function upstream(start, label, maxDepth = 7) {
  console.log(`\n===== ${label}: ${tp(start)}:${String(nm(start)).slice(0, 50)}#${start} =====`);
  const prev = new Map(); let layer = [start]; const seen = new Set([start]);
  for (let d = 0; d < maxDepth && layer.length; d++) {
    const nxt = [];
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        if (tp(e.src) === 'synthetic') continue;
        if (seen.has(e.src)) continue;
        if (!prev.has(e.src)) prev.set(e.src, { from: cur, eT: e.eT, eN: e.eN });
        nxt.push(e.src);
      }
    }
    const shown = new Map();
    for (const n2 of nxt) { const k = `${prev.get(n2).eT}:'${String(prev.get(n2).eN).slice(0, 30)}' ← ${tp(n2)}:${String(nm(n2)).slice(0, 56)}#${n2}`; shown.set(k, (shown.get(k) ?? 0) + 1); }
    for (const [k, n] of [...shown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  +${d + 1} ×${n} ${k}`);
    const stop = nxt.filter((n2) => tp(n2) === 'object' && /Window|JSGlobal/.test(String(nm(n2))));
    if (stop.length) { console.log('  ── 到达 Window'); return; }
    layer = [...new Set(nxt)].slice(0, 40);
  }
}
upstream(476528, 'TitleMenu#476528');
upstream(622932, 'GLSpriteLayer#622932');
upstream(459168, 'CreditsRollOverlay#459168');
upstream(381206, 'MenuBackground#381206');
upstream(376472, 'ctx@753275 sel');
upstream(476928, 'ctx@954163');
process.exit(0);
