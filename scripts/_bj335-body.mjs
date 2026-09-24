import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('/tmp/bj335-neutral.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const nodes = raw.nodes, edges = raw.edges, strings = raw.strings;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.node_fields.indexOf('to_node');
const eToIdx = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
// body 前向边全 dump
const find = (re) => { for (let i = 0; i < nodeCount; i++) if (tp(i) === 'native' && re.test(String(nm(i)))) return i; return -1; };
const body = find(/^<body>$/); const groot = find(/^<div id="game-root">/); const html = find(/^<html[\s>]/);
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
function dump(idx, label) {
  console.log(`\n#### ${label} node ${idx} ${tp(idx)}:${String(nm(idx)).slice(0, 50)} edges=${nodes[idx * F + nEdges]}`);
  for (let k = fwdStart[idx]; k < fwdStart[idx + 1]; k++) {
    const base = k * EF;
    const t = edgeTypeNames[edges[base + eType]];
    const to = edges[base + eToIdx] / F;
    const eN = t === 'element' ? '[' + edges[base + eName] + ']' : (strings[edges[base + eName]] ?? String(edges[base + eName]));
    console.log(`   ${t}:'${String(eN).slice(0, 30)}' → ${tp(to)}:${String(nm(to)).slice(0, 50)}#${to}`);
  }
}
dump(html, 'html'); dump(body, 'body'); dump(groot, 'game-root');
process.exit(0);
