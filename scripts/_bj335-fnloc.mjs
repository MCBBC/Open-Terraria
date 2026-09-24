// ★BJ335 fnloc:1 轮进出→快照→找「钉住游离 vinn 岛」的 closure/Generator→
//  活桥 getObjectByHeapObjectId → [[FunctionLocation]] → 源码行。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
await cdp.send('Debugger.enable').catch(() => {});
await cdp.send('HeapProfiler.enable').catch(() => {});
const poll = async (expr, ms) => {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await page.evaluate(expr); } catch { /* nav */ }
    if (v) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
};
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

// ---- 快照 ----
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
console.log('snapshot parsed; nodes=', nodeCount);
const isDom = (i) => tp(i) === 'native' && /^<(\w+)[\s>]/.test(String(nm(i)));
const isCtx = (i) => tp(i) === 'object' && /Context/.test(String(nm(i)));
// 主树
let mainC = new Set();
{ let h = -1; for (let i = 0; i < nodeCount && h < 0; i++) if (isDom(i) && /^<html[\s>]/.test(String(nm(i)))) h = i;
  const q = [h]; mainC.add(h);
  while (q.length) { const c = q.pop();
    for (const e of (rev.get(c) ?? [])) if (e.eT === 'element' && isDom(e.src) && !mainC.has(e.src)) { mainC.add(e.src); q.push(e.src); } } }
{ const q = [...mainC];
  while (q.length) { const c = q.pop();
    for (const f of (fwdAdj.get(c) ?? [])) if (f.eT === 'element' && isDom(f.to) && !mainC.has(f.to)) { mainC.add(f.to); q.push(f.to); } } }
console.log('main tree =', mainC.size);
// 岛洪泛(context/closure;internal context/previous + context 槽边,双向)
const isIslType = (i) => tp(i) === 'closure' || isCtx(i);
function island(seeds) {
  const isl = new Set(); const q = [...seeds];
  while (q.length) {
    const c = q.pop();
    if (isl.has(c) || !isIslType(c)) continue;
    isl.add(c);
    for (const e of (rev.get(c) ?? [])) {
      const ok = (e.eT === 'internal' && (e.eN === 'context' || e.eN === 'previous')) || e.eT === 'context';
      if (ok && isIslType(e.src) && !isl.has(e.src)) q.push(e.src);
    }
    for (const f of (fwdAdj.get(c) ?? [])) {
      const ok = (f.eT === 'internal' && (f.eN === 'context' || f.eN === 'previous')) || f.eT === 'context';
      if (ok && isIslType(f.to) && !isl.has(f.to)) q.push(f.to);
    }
  }
  return isl;
}
// 种子:同时含 'panelBg' 与 'sepEl' 槽的 context(win/panelBg 家)
const seeds = [];
for (let i = 0; i < nodeCount; i++) {
  if (!isCtx(i)) continue;
  const slots = (fwdAdj.get(i) ?? []).filter((f) => f.eT === 'context').map((f) => f.eN);
  if (slots.includes('panelBg') && slots.includes('sepEl')) seeds.push(i);
}
console.log('panelBg+sepEl ctx seeds =', seeds.length);
const isl = island(seeds);
console.log('island =', isl.size);

// 岛内 closure 的监听宿主(全类型宿主)
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
        if (isDom(e.src)) return { kind: mainC.has(e.src) ? 'conn' : 'det', node: e.src };
        if (t === 'object' && /Window|JSGlobal/.test(String(nm(e.src)))) return { kind: 'windoc', node: e.src };
        if (t === 'native' && /HTMLDocument/.test(String(nm(e.src)))) return { kind: 'windoc', node: e.src };
      }
    }
    layer = [...new Set(nxt)].slice(0, 200);
  }
  return null;
}
const pinClosures = new Map();   // closureIdx → {kind, owner}
for (const n of isl) {
  if (tp(n) !== 'closure') continue;
  for (const e of (rev.get(n) ?? [])) {
    if (!(tp(e.src) === 'native' && /EventListener$/.test(String(nm(e.src))))) continue;
    const r = owner(e.src);
    if (r && r.kind !== 'det') pinClosures.set(n, r);
  }
}
console.log('根钉 closure(conn/windoc 宿主) =', pinClosures.size);
// 岛内 Generator
const gens = [];
for (let i = 0; i < nodeCount; i++) if (tp(i) === 'object' && String(nm(i)) === 'Generator') {
  for (const f of (fwdAdj.get(i) ?? [])) if (f.eT === 'internal' && f.eN === 'context' && isl.has(f.to)) { gens.push(i); break; }
}
console.log('岛 context 的 Generator =', gens.length);
// 活桥解析 [[FunctionLocation]]
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
console.log('\n==== 根钉 closures(宿主=连接树/window) ====');
for (const [c, r] of [...pinClosures.entries()].slice(0, 14)) {
  console.log(`closure#${c} id=${idOf(c)} 宿主[${r.kind}] ${String(nm(r.node)).slice(0, 40)}#${r.node}`);
  console.log('   ' + await fnSrc(idOf(c)));
}
console.log('\n==== 岛 Generators ====');
for (const g of gens.slice(0, 14)) {
  const fnEdge = (fwdAdj.get(g) ?? []).find((f) => f.eT === 'internal' && f.eN === 'function');
  const holder = (rev.get(g) ?? []).filter((e) => tp(e.src) !== 'synthetic').slice(0, 2).map((e) => `${e.eT}:'${String(e.eN).slice(0, 24)}'←${tp(e.src)}:${String(nm(e.src)).slice(0, 44)}`).join(' | ');
  console.log(`Generator#${g} id=${idOf(g)} 持有: ${holder}`);
  if (fnEdge) console.log('   ' + await fnSrc(idOf(fnEdge.to)));
}
await browser.close();
process.exit(0);
