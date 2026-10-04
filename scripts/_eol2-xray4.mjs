// EoL2 xray4: node-id 跨流碰撞检验 + (若碰撞)按流命名空间重建归因
// run: node --max-old-space-size=8192 scripts/_eol2-xray4.mjs [trace.json]
import fs from 'node:fs';
const PATH = process.argv[2] || '/Users/vinlic/Downloads/Trace-20261005T020627.json';
const t = JSON.parse(fs.readFileSync(PATH, 'utf8'));
const evs = t.traceEvents || [];

// 每流独立收集 nodes(id 保持原始)
const profTid = new Map();
for (const e of evs) if (e.name === 'Profile') profTid.set(e.id, e.tid);
const perStream = new Map(); // id -> Map(nodeId -> cf)
for (const c of evs.filter(e => e.name === 'ProfileChunk')) {
  const d = c.args?.data; if (!d) continue;
  const pid = c.id;
  if (!perStream.has(pid)) perStream.set(pid, new Map());
  const nm = perStream.get(pid);
  for (const n of d.cpuProfile?.nodes || []) if (!nm.has(n.id)) nm.set(n.id, n.callFrame || {});
}
console.log('== 碰撞检验: 同一 node.id 在不同流里 callFrame 不同? ==');
const ids = new Map(); // nodeId -> Map(streamId -> fnName)
for (const [sid, nm] of perStream) for (const [nid, cf] of nm) {
  const fn = (cf.functionName || '') + '@' + (cf.lineNumber ?? '');
  if (!ids.has(nid)) ids.set(nid, new Map());
  const m = ids.get(nid);
  if (!m.has(sid)) m.set(sid, fn);
  else if (m.get(sid) !== fn && !m.has(sid + '#')) { /* 同流重定义不管 */ }
}
let coll = 0; const examples = [];
for (const [nid, m] of ids) {
  const fns = new Set(m.values());
  if (fns.size > 1) {
    coll++;
    if (examples.length < 8) examples.push({ nid, map: [...m.entries()] });
  }
}
console.log('跨流 node-id 碰撞数:', coll, '/ 总 id 数:', ids.size);
for (const ex of examples) {
  console.log('  id=' + ex.nid + ':');
  for (const [sid, fn] of ex.map) console.log('    ' + sid + ' → ' + fn);
}
console.log('\n流清单:', [...perStream.keys()].join(','), ' tid 映射:', [...profTid.entries()].map(([i, tid]) => i + '→' + tid).join(' '));
