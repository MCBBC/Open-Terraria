// ★BJ335 外部钉定位:对指定 context 的全部持有 closure,枚举其 V8EventListener 注册宿主
//  (分离=环;连接=外部钉) + closure 的非环 in-edges
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
function ownerOfViaNative(startIdx) {
  const prev = new Map(); let layer = [startIdx]; const seen = new Set([startIdx]);
  for (let d = 0; d < 12 && layer.length; d++) {
    const nxt = [];
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        if (tp(e.src) !== 'native' || seen.has(e.src)) continue;
        if (!prev.has(e.src)) prev.set(e.src, cur);
        nxt.push(e.src);
        if (isDom(e.src)) return { owner: e.src };
      }
    }
    layer = [...new Set(nxt)];
  }
  return null;
}
// 对一个 context:收集持有它的 closures(internal:'context'),再对每个 closure 找注册宿主
function analyzeCtx(ctxIdx, label) {
  console.log(`\n===== ${label} ctx#${ctxIdx} =====`);
  const closures = (rev.get(ctxIdx) ?? []).filter((e) => e.eT === 'internal' && e.eN === 'context' && tp(e.src) === 'closure').map((e) => e.src);
  console.log('closures:', closures.length);
  const ownerAgg = new Map();
  const otherIns = new Map();
  for (const c of closures) {
    // closure 的上游:V8EventListener(注册) / 其他 context / property
    const ups = (rev.get(c) ?? []);
    for (const e of ups) {
      if (e.eT === 'internal' && (e.eN === 'context' || e.eN === 'previous')) continue; // 环内
      if (tp(e.src) === 'native' && /EventListener/.test(String(nm(e.src)))) {
        const r = ownerOfViaNative(e.src);
        if (r) { const k = String(nm(r.owner)).slice(0, 60); ownerAgg.set(k, (ownerAgg.get(k) ?? 0) + 1); }
        continue;
      }
      if (tp(e.src) === 'native') continue;
      const k = `${e.eT}:'${String(e.eN).slice(0, 30)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 50)}`;
      otherIns.set(k, (otherIns.get(k) ?? 0) + 1);
    }
  }
  console.log('监听宿主分布:');
  for (const [k, n] of [...ownerAgg.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ×${n} ${k}`);
  console.log('非环 in-edges:');
  for (const [k, n] of [...otherIns.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`   ×${n} ${k}`);
}
analyzeCtx(745919, 'comp165 ctx@1250761(win/panelBg)');
analyzeCtx(745652, 'comp165 ctx@1251267(slotEls)');
analyzeCtx(745853, 'comp165 ctx@1250597(root/pageEquip)');
analyzeCtx(746360, 'comp165 ctx@1104081(card/glyph/tx)');
analyzeCtx(745905, 'comp165 ctx@1293643(lock/glow)');
process.exit(0);
