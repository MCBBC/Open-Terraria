// ★BJ335 上游链:指定节点向上 BFS 至 JS 级钉死点(全局/单例/property 命名边)
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
const idOf = (i) => nodes[i * F + nId];
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
const TARGETS = [
  ['ctx@1250761 win/panelBg', 745919],
  ['ctx@1251267 slotEls', 745652],
  ['ctx@1250597 root/pageEquip', 745853],
  ['ctx@1104081 card/glyph/tx', 746360],
  ['ctx@1293643 lock/glow', 745905],
  ['ctx@753275 sel', 376472],
  ['ctx@954163 el/label/btn', 476928],
  ['TitleMenu#476528', 476528],
  ['CreditsRollOverlay#459168', 459168],
  ['GLSpriteLayer#622932', 622932],
  ['MenuBackground#381206', 381206],
  ['Map#476418 ×91', 476418],
  ['Map#370075 ×18', 370075],
  ['Array#516688 ×7', 516688],
];
function chain(start, label, maxDepth = 8) {
  console.log(`\n===== ${label} (${tp(start)}:${String(nm(start)).slice(0, 50)}#${start}) =====`);
  const prev = new Map();
  let layer = [start]; const seen = new Set([start]);
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
    // 打印本层全部新节点(去重显示)
    const uniq = [...new Set(nxt)];
    for (const n2 of uniq.slice(0, 16)) console.log(`  +${d + 1} ${prev.get(n2).eT}:'${String(prev.get(n2).eN).slice(0, 36)}' ← ${tp(n2)}:${String(nm(n2)).slice(0, 66)}#${n2} id=${idOf(n2)}`);
    // 判停:到达 Window / PropertyCell / 静态对象(无进一步上游)
    const stop = uniq.filter((n2) => tp(n2) === 'object' && /Window|JSGlobal/.test(String(nm(n2))));
    if (stop.length) { console.log('  ── 到达 Window(全局钉)'); return; }
    layer = uniq.slice(0, 24);
  }
}
for (const [label, idx] of TARGETS) chain(idx, label);
process.exit(0);
