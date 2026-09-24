// ★BJ335 根路径:panel ctx 上行【全部】强边路径(非 synthetic/string/code;native 仅
//  EventListener 注册链),到根(无强 in-edge 或 window/doc)为止。穷举不剪枝。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
await cdp.send('Debugger.enable').catch(() => {});
await cdp.send('HeapProfiler.enable').catch(() => {});
const poll = async (expr, ms) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await page.evaluate(expr); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 500)); } };
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await new Promise((r) => setTimeout(r, 1500));
await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
await new Promise((r) => setTimeout(r, 600));
await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
await new Promise((r) => setTimeout(r, 600));
const chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
const raw = JSON.parse(chunks.join(''));
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
const isDom = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
const isCtx = (i) => tp(i) === 'object' && /Context/.test(String(nm(i)));
const isWinDoc = (i) => tp(i) === 'object' && /Window|JSGlobal|HTMLDocument/.test(String(nm(i)));
// 种子:panelBg+sepEl ctx
let seed = -1;
for (let i = 0; i < nodeCount && seed < 0; i++) {
  if (!isCtx(i)) continue;
  const cnt = nodes[i * F + nEdges]; let hasA = false, hasB = false, ep2 = 0;
  // 用 rev 反查太贵;改用 fwd 扫描
}
// 简化:建 fwd 槽扫描(轻量,只扫 object 节点的 context 边)
const fwdStart = new Int32Array(nodeCount + 1);
{ let acc = 0; for (let i = 0; i < nodeCount; i++) { fwdStart[i] = acc; acc += nodes[i * F + nEdges]; } fwdStart[nodeCount] = acc; }
for (let i = 0; i < nodeCount && seed < 0; i++) {
  if (!isCtx(i)) continue;
  let hasA = false, hasB = false;
  for (let k = fwdStart[i]; k < fwdStart[i + 1]; k++) {
    const base = k * EF;
    if (edgeTypeNames[edges[base + eType]] !== 'context') continue;
    const eN = strings[edges[base + eName]];
    if (eN === 'panelBg') hasA = true;
    if (eN === 'sepEl') hasB = true;
  }
  if (hasA && hasB) seed = i;
}
console.log('panel seed ctx =', seed, seed >= 0 ? String(nm(seed)).slice(0, 50) : '');
// 根路径穷举(DFS,深度≤10,同节点每层限宽)
const SKIP_SRC_TYPE = new Set(['synthetic', 'string', 'code']);
function isRoot(i) { return isDom(i) || isWinDoc(i); }
function dfs(cur, path, depth, seen) {
  if (depth > 16) return;
  const ins = (rev.get(cur) ?? []).filter((e) => {
    const t = tp(e.src);
    if (SKIP_SRC_TYPE.has(t)) return false;
    if (t === 'native' && !isDom(e.src) && !/EventListener|EventTargetData|HeapVectorBacking|BasicHeapVector|RegisteredEventListener|Member</.test(String(nm(e.src)))) return false;
    return true;
  });
  if (!ins.length) { console.log(`DEADEND: ${path.join(' ← ')}`); return; }
  for (const e of ins.slice(0, 10)) {
    if (seen.has(e.src)) { console.log(`CYCLE-STOP: ${path.join(' ← ')} ← ${e.eT}:'${String(e.eN).slice(0, 24)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 50)}#${e.src}(已访)`); continue; }
    const nseen = new Set(seen); nseen.add(e.src);
    const hop = `${e.eT}:'${String(e.eN).slice(0, 26)}' ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 54)}#${e.src}`;
    if (isRoot(e.src)) { console.log(`ROOT: ${path.join(' ← ')} ← ${hop}`); continue; }
    dfs(e.src, [...path, hop], depth + 1, nseen);
  }
}
if (seed >= 0) { console.log('seed in-edges:'); dfs(seed, [`${tp(seed)}:${String(nm(seed)).slice(0, 50)}#${seed} id=${idOf(seed)}`], 0, new Set([seed])); }
await browser.close();
process.exit(0);
