// ★BJ328：快照→活对象桥——找到游离 sw-slot 的持有 closure 后取 [[FunctionLocation]]。
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');
await cdp.send('Debugger.enable').catch(() => {});

const gc = async () => {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
};
const poll = async (expr, ms) => {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await page.evaluate(expr); } catch { /* 导航窗 */ }
    if (v) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
};
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await new Promise((r) => setTimeout(r, 1500));
await gc();
// 第二轮（snapshot B 形态=2 轮后菜单）
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('reenter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit2 超时');
await new Promise((r) => setTimeout(r, 1500));
await gc();

// ---- 快照 ----
const chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
const raw = JSON.parse(chunks.join(''));
console.log('snapshot nodes=', raw.snapshot.node_count);

const meta = raw.snapshot.meta;
const { nodes, edges, strings } = raw;
const F = meta.node_fields.length, EF = meta.edge_fields.length;
const typeNames = meta.node_types[0], edgeTypeNames = meta.edge_types[0];
const nType = meta.node_fields.indexOf('type'), nName = meta.node_fields.indexOf('name'), nId = meta.node_fields.indexOf('id'), nEdges = meta.node_fields.indexOf('edge_count');
const eName = meta.edge_fields.indexOf('name_or_index'), eType = meta.edge_fields.indexOf('type'), eTo = meta.edge_fields.indexOf('to_node');
const nodeCount = raw.snapshot.node_count;
const nm = (i) => strings[nodes[i * F + nName]];
const tp = (i) => typeNames[nodes[i * F + nType]];
const rev = new Map();
let ep = 0;
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
// 找游离 dye slot → context 's' → 4 closure（同 BJ328-b 分析）
await cdp.send('Performance.enable').catch(() => {});
const { metrics } = await cdp.send('Performance.getMetrics');
await cdp.send('Performance.disable').catch(() => {});
console.log('M1 listeners=', Math.round(metrics.find((x) => x.name === 'JSEventListeners')?.value ?? -1));
let slotNode = -1, ctxNode = -1;
let swSlotNative = 0, dataWhere = 0;
for (let i = 0; i < nodeCount; i++) {
  const n = nm(i);
  if (typeof n !== 'string' || tp(i) !== 'native') continue;
  if (n.includes('sw-slot')) swSlotNative++;
  if (n.includes('data-where')) { dataWhere++; if (slotNode < 0) slotNode = i; }
}
console.log('native sw-slot 节点=', swSlotNative, 'data-where 节点=', dataWhere, '首个=', slotNode < 0 ? '-' : String(nm(slotNode)).slice(0, 70));
if (slotNode < 0) {
  fs.writeFileSync('/tmp/bj328-loc.heapsnapshot', chunks.join(''));
  console.log('snapshot 已存 /tmp/bj328-loc.heapsnapshot');
  throw new Error('未找到游离 slot');
}
if (slotNode < 0) throw new Error('未找到游离 dye slot');
for (const e of (rev.get(slotNode) ?? [])) {
  if (e.eT === 'context' && e.eN === 's') { ctxNode = e.src; break; }
}
console.log('slotNode=', slotNode, 'ctxNode=', ctxNode);
// ★BJ328 后置：直接 dump 该元素的全部 in-edges（谁在持它）
for (const e of (rev.get(slotNode) ?? [])) {
  console.log('   in', e.eT + ':' + String(e.eN).slice(0, 40), 'from', tp(e.src) + ':' + String(nm(e.src)).slice(0, 80) + '#' + e.src);
}
const closures = (rev.get(ctxNode) ?? []).filter((e) => e.eT === 'internal' && e.eN === 'context').map((e) => e.src);
// ★BJ328 后置：按任意 context 边找持有者 context（不限于 slot 名 's'）
if (ctxNode < 0) {
  const ce = (rev.get(slotNode) ?? []).find((e) => e.eT === 'context');
  if (ce) {
    ctxNode = ce.src;
    console.log(`持有者 context#${ctxNode}（槽名 ${ce.eN}）的槽表:`);
    const fwdT = new Map();
    let ep2 = 0;
    for (let i = 0; i < nodeCount; i++) { fwdT.set(i, { start: ep2, count: nodes[i * F + nEdges] }); ep2 += nodes[i * F + nEdges]; }
    const { start: s0, count: c0 } = fwdT.get(ctxNode);
    for (let k = 0; k < c0; k++) {
      const b2 = (s0 + k) * EF;
      const eN = strings[edges[b2 + eName]] ?? String(edges[b2 + eName]);
      const to = edges[b2 + eTo] / F;
      console.log(`   slot ${eN} → ${tp(to)}:${String(nm(to)).slice(0, 60)}`);
    }
    closures.length = 0;
    for (const e of (rev.get(ctxNode) ?? [])) {
      if (e.eT === 'internal' && e.eN === 'context') closures.push(e.src);
    }
  }
}
console.log('closures=', JSON.stringify(closures));
const ids = closures.map((c) => nodes[c * F + nId]);
console.log('closure heapObjectIds=', JSON.stringify(ids));
// ctx 的 heapObjectId 也取（备用）
if (ctxNode >= 0) {
  console.log('ctxId=', nodes[ctxNode * F + nId]);
  // ★活桥：取 context 的 fn 槽闭包 → [[FunctionLocation]] → 源码行
  try {
    const { result: ctxObj } = await cdp.send('HeapProfiler.getObjectByHeapObjectId', { objectId: String(nodes[ctxNode * F + nId]) });
    if (ctxObj.objectId) {
      const props = await cdp.send('Runtime.getProperties', { objectId: ctxObj.objectId });
      for (const v of props.properties ?? []) {
        console.log(`   ctx.${v.name} = [${v.value?.type ?? '?'}${v.value?.className ? ' ' + v.value.className : ''}]`);
        if (v.value?.type === 'function' && v.value.objectId) {
          const fp = await cdp.send('Runtime.getProperties', { objectId: v.value.objectId, internalProperties: true });
          const loc = fp.internalProperties?.find((p2) => p2.name === '[[FunctionLocation]]');
          if (loc?.value?.value) {
            const { scriptId, lineNumber, columnNumber } = loc.value.value;
            const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
            const line = scriptSource ? (scriptSource.split('\n')[lineNumber] ?? '').trim().slice(0, 130) : '(no source)';
            console.log(`      → served:${lineNumber + 1}:${columnNumber + 1} → ${line}`);
          }
        }
      }
    }
  } catch (e) { console.log('live bridge err:', String(e).slice(0, 120)); }
}

// ---- 活对象桥 ----
for (const id of ids) {
  try {
    const { result } = await cdp.send('HeapProfiler.getObjectByHeapObjectId', { objectId: String(id) });
    if (!result.objectId) { console.log('id', id, '→ 已死/不可取'); continue; }
    const props = await cdp.send('Runtime.getProperties', { objectId: result.objectId, internalProperties: true });
    const loc = props.internalProperties?.find((p) => p.name === '[[FunctionLocation]]');
    const scope = props.internalProperties?.find((p) => p.name === '[[Scopes]]');
    console.log(`closure id=${id} → location=`, JSON.stringify(loc?.value?.value ?? null));
    if (loc?.value?.value) {
      const { scriptId, lineNumber, columnNumber } = loc.value.value;
      const { scriptSource } = await cdp.send('Debugger.getScriptSource', { scriptId }).catch(() => ({ scriptSource: null }));
      if (scriptSource) {
        const line = scriptSource.split('\n')[lineNumber] ?? '';
        console.log(`  served:${lineNumber + 1}:${columnNumber + 1} → ${line.trim().slice(0, 140)}`);
      } else console.log('  (scriptSource 不可得)');
    }
  } catch (e) { console.log('id', id, 'err', String(e).slice(0, 100)); }
}
await browser.close();
process.exit(0);
