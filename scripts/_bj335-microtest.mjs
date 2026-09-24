// ★BJ335 终判:①页内微测=游离树+监听环是否可回收(环内闭包不捕树 vs 捕树);
//  ②活桥锁根钉 closure(sel shim 族,window/doc 宿主)的 [[FunctionLocation]]。
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
const gc = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await new Promise((r) => setTimeout(r, 400)); await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); await new Promise((r) => setTimeout(r, 500)); };
const poll = async (expr, ms) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await page.evaluate(expr); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 500)); } };
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

// ---- ①微测(页面加载后立即做,零污染) ----
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await cdp.send('Performance.enable').catch(() => {});
const m0 = (await cdp.send('Performance.getMetrics')).metrics;
// 微测A:游离树,监听闭包【不】捕树(纯函数)
// 微测B:游离树,监听闭包【捕】树(环)
// 微测C:游离树,监听闭包捕树+树上有子节点+closure 捕获大缓冲
await page.evaluate(() => {
  window.__mt = {};
  const mk = (name, capture) => {
    const root = document.createElement('div');
    for (let i = 0; i < 50; i++) { const c = document.createElement('button'); c.className = 'mt-' + name; root.appendChild(c); }
    document.body.appendChild(root);
    if (capture === 'none') {
      root.addEventListener('mousedown', () => { /* 不捕树 */ });
      for (const c of root.children) c.addEventListener('mousedown', () => { /* 不捕 */ });
    } else {
      const buf = capture === 'buf' ? new Uint8Array(4 * 1024 * 1024) : null;
      root.addEventListener('mousedown', () => { root.dataset.x = '1'; if (buf) buf[0] = 1; });
      for (const c of root.children) c.addEventListener('mousedown', (e) => { root.dataset.y = String(e.clientX); if (buf) buf[1] = 2; });
    }
    root.remove();
    window.__mt[name] = root;
    delete window.__mt[name];   // 立刻失根(只留环)
  };
  mk('a', 'none'); mk('b', 'tree'); mk('c', 'buf');
});
await gc();
const m1 = (await cdp.send('Performance.getMetrics')).metrics;
const g = (ms, n) => Math.round(ms.find((x) => x.name === n)?.value ?? -1);
console.log(`微测: listeners ${g(m0, 'JSEventListeners')} → ${g(m1, 'JSEventListeners')} (Δ${g(m1, 'JSEventListeners') - g(m0, 'JSEventListeners')}), nodes ${g(m0, 'Nodes')} → ${g(m1, 'Nodes')} (Δ${g(m1, 'Nodes') - g(m0, 'Nodes')})`);
console.log('  预期: 若环可回收 Δ≈0;若环滞留 Δ≈+153 listeners/+153 nodes(三棵树)');

// ---- ②进/退一轮 → 快照 → 锁 window/doc 宿主 closure 的源码行 ----
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await new Promise((r) => setTimeout(r, 1500));
await gc();

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
const fwdAdj = new Map();
{ let ep = 0;
  for (let i = 0; i < nodeCount; i++) {
    const cnt = nodes[i * F + nEdges];
    for (let k = 0; k < cnt; k++) {
      const base = (ep + k) * EF;
      const to = edges[base + eTo] / F;
      const eT = edgeTypeNames[edges[base + eType]];
      const eN = eT === 'element' ? String(edges[base + eName]) : (strings[edges[base + eName]] ?? String(edges[base + eName]));
      let l = rev.get(to); if (!l) { l = []; rev.set(to, l); }
      l.push({ src: i, eT, eN });
      let f = fwdAdj.get(i); if (!f) { f = []; fwdAdj.set(i, f); }
      f.push({ to, eT, eN });
    }
    ep += cnt;
  }
}
const isDom = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
let mainN = new Set();
{ let h = -1; for (let i = 0; i < nodeCount && h < 0; i++) if (isDom(i) && /^<html[\s>]/.test(String(nm(i)))) h = i;
  const q = [h]; mainN.add(h);
  while (q.length) { const c = q.pop();
    for (const e of (rev.get(c) ?? [])) if (e.eT === 'element' && isDom(e.src) && !mainN.has(e.src)) { mainN.add(e.src); q.push(e.src); } } }
{ const q = [...mainN];
  while (q.length) { const c = q.pop();
    for (const f of (fwdAdj.get(c) ?? [])) if (f.eT === 'element' && isDom(f.to) && !mainN.has(f.to)) { mainN.add(f.to); q.push(f.to); } } }
// 主树游离 DOM 的 JS 持有者(直接 in-edge)
const detached = [];
for (let i = 0; i < nodeCount; i++) if (isDom(i) && !mainN.has(i)) detached.push(i);
console.log('main tree =', mainN.size, 'detached =', detached.length);
const holders = new Map();
for (const d of detached) {
  for (const e of (rev.get(d) ?? [])) {
    const t = tp(e.src);
    if (t === 'native' || t === 'synthetic' || t === 'string' || t === 'code') continue;
    holders.set(e.src, (holders.get(e.src) ?? 0) + 1);
  }
}
const top = [...holders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('游离树直接 JS 持有者 top:');
for (const [h, n] of top) console.log(`   ×${n} ${tp(h)}:${String(nm(h)).slice(0, 60)}#${h} id=${idOf(h)}`);

// 根钉 closure 解析:游离子树的 context 持有者 → 其 closure → 注册宿主=window/doc 的
async function fnSrc(heapId) {
  const { result } = await cdp.send('HeapProfiler.getObjectByHeapObjectId', { objectId: String(heapId) });
  if (!result?.objectId) return '(取回失败)';
  const pr = await cdp.send('Runtime.getProperties', { objectId: result.objectId, internalProperties: true });
  const loc = (pr.internalProperties ?? []).find((p) => p.name === '[[FunctionLocation]]');
  if (!loc?.value?.value) return '(无 location)';
  const { scriptId, lineNumber } = loc.value.value;
  const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
  const line = scriptSource ? (scriptSource.split('\n')[lineNumber] ?? '').trim().slice(0, 150) : '(no source)';
  return `served:${lineNumber + 1} → ${line}`;
}
// 全 closure:注册宿主=window/doc 的(岛无关——全局查:所有 V8EventListener 上行到 window/doc,
// 记 closure id;再过滤【其 context 链含游离树持有者】的)
// 简化:对 top 持有者 context 的 closure 做注册宿主判定(允许 windoc)
function owner(start) {
  const prev = new Map(); let layer = [start]; const seen = new Set([start]);
  for (let d = 0; d < 16 && layer.length; d++) {
    const nxt = [];
    for (const cur of layer) {
      for (const e of (rev.get(cur) ?? [])) {
        const t = tp(e.src);
        if (seen.has(e.src) || t === 'synthetic' || t === 'string' || t === 'code') continue;
        if (!prev.has(e.src)) prev.set(e.src, cur);
        nxt.push(e.src);
        if (isDom(e.src)) return { kind: mainN.has(e.src) ? 'conn' : 'det', node: e.src };
        if (t === 'object' && /Window|JSGlobal|HTMLDocument/.test(String(nm(e.src)))) return { kind: 'windoc', node: e.src };
      }
    }
    layer = [...new Set(nxt)].slice(0, 200);
  }
  return null;
}
console.log('\n==== window/doc 宿主的 closure(游离树直接持有者族) ====');
const seenClosure = new Set();
for (const [h] of top) {
  if (tp(h) !== 'object' || !/Context/.test(String(nm(h)))) continue;
  const closures = (rev.get(h) ?? []).filter((e) => e.eT === 'internal' && e.eN === 'context' && tp(e.src) === 'closure').map((e) => e.src);
  for (const c of closures) {
    if (seenClosure.has(c)) continue;
    seenClosure.add(c);
    for (const e of (rev.get(c) ?? [])) {
      if (!(tp(e.src) === 'native' && /EventListener$/.test(String(nm(e.src))))) continue;
      const r = owner(e.src);
      if (r && r.kind !== 'det') {
        console.log(`closure#${c} id=${idOf(c)} 宿主[${r.kind}] ${String(nm(r.node)).slice(0, 40)}`);
        console.log('   ' + await fnSrc(idOf(c)));
      }
    }
  }
}
await browser.close();
process.exit(0);
