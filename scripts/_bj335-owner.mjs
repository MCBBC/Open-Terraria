// ★BJ335 监听宿主定位:从 RegisteredEventListener/V8EventListener 上行找【注册监听的宿主元素】
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
const isDom = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
function ownerOf(listenerIdx) {
  // BFS 上行只经 native 节点,直到 '<' DOM 元素
  const prev = new Map(); let layer = [listenerIdx]; const seen = new Set([listenerIdx]);
  for (let d = 0; d < 12 && layer.length; d++) {
    const nxt = [];
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        if (tp(e.src) !== 'native' || seen.has(e.src)) continue;
        if (!prev.has(e.src)) prev.set(e.src, cur);
        nxt.push(e.src);
        if (isDom(e.src)) { const path = []; let c = e.src; while (c !== listenerIdx) { path.push(String(nm(c)).slice(0, 46)); c = prev.get(c); } return { owner: e.src, depth: d, path }; }
      }
    }
    layer = [...new Set(nxt)];
  }
  return null;
}
// 样本1:ctx@1250761 链上的 V8EventListener#793979 / RegisteredEventListener#793980
for (const idx of [793979, 793980, 794186, 794185, 794177]) {
  const r = ownerOf(idx);
  if (r) console.log(`listener#${idx} → 宿主 ${String(nm(r.owner)).slice(0, 70)}#${r.owner} (depth=${r.depth}) path=${r.path.slice(0, 4).join(' ← ')}`);
  else console.log(`listener#${idx} → 未找到 DOM 宿主`);
}
// EventTargetData#799618 的 in-edges(宿主元素指向它)
console.log('\nEventTargetData#799618 in-edges:');
for (const e of (rev.get(799618) ?? [])) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 30)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 70)}#${e.src}`);
// ctx@1250761 的 closure → 监听宿主:closure#749487 的上游在快照里只能到 V8EventListener;
// 反向:V8EventListener#793979 的 in-edges(谁引它)
console.log('\nV8EventListener#793979 in-edges:');
for (const e of (rev.get(793979) ?? [])) console.log(`   ${e.eT}:'${String(e.eN).slice(0, 30)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 70)}#${e.src}`);
process.exit(0);
