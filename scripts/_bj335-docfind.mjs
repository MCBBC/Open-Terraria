import fs from 'node:fs';
const raw = JSON.parse(fs.readFileSync('/tmp/bj335-neutral.heapsnapshot', 'utf8'));
const meta = raw.snapshot.meta;
const nodes = raw.nodes, strings = raw.strings;
const F = meta.node_fields.length;
const typeNames = meta.node_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
let n = 0;
for (let i = 0; i < nodeCount && n < 30; i++) {
  const s = String(nm(i));
  if (/document/i.test(s) && s.length < 40) { console.log(`${tp(i)}:'${s}'#${i} id=${nodes[i * F + nId]} edges=${nodes[i * F + nEdges]}`); n++; }
}
console.log('---- game-root / body / html ----');
n = 0;
for (let i = 0; i < nodeCount && n < 20; i++) {
  const s = String(nm(i));
  if (/^(<html|<body|<div id="game-root")/.test(s)) { console.log(`${tp(i)}:'${s.slice(0, 60)}'#${i} edges=${nodes[i * F + nEdges]}`); n++; }
}
process.exit(0);
