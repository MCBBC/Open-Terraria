// ★BJ328 终局定位：queryObjects 拿【活的】游离 slot → heapObjectId → 快照按 id 找节点 → 逐级 in-edges。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Runtime.enable');

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
    try { v = await page.evaluate(expr); } catch { /* nav */ }
    if (v) return true;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
};
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

// 1轮进出 → 菜单
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await gc();

// 活的游离元素句柄×3（含 safe 包装,防 Illegal invocation）
const proto = await cdp.send('Runtime.evaluate', { expression: 'HTMLElement.prototype' });
const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
const samples = await cdp.send('Runtime.callFunctionOn', {
  objectId: objects.objectId,
  functionDeclaration: `function () {
    const out = [];
    const arr = Array.from(this);
    for (const e of arr) {
      try {
        if (e && e.nodeType === 1 && e.isConnected === false && e.classList && e.classList.contains('sw-slot')) {
          out.push({ tag: e.tagName, cls: String(e.className), idx: e.dataset ? e.dataset.idx : undefined, where: e.dataset ? e.dataset.where : undefined });
        }
      } catch (err) { out.push({ err: String(err).slice(0, 60) }); }
      if (out.length >= 6) break;
    }
    return out;
  }`,
    returnByValue: true,
});
console.log('游离 slot 样本:', JSON.stringify(samples.result.value));

// 取第一个「干净」样本的 RemoteObject（重跑一次拿 objectId 而非 value）
const one = await cdp.send('Runtime.callFunctionOn', {
  objectId: objects.objectId,
  functionDeclaration: `function () {
    for (const e of Array.from(this)) {
      try {
        if (e && e.nodeType === 1 && e.isConnected === false && e.classList && e.classList.contains('sw-slot') && e.dataset && e.dataset.where) return e;
      } catch (err) { /* foreign */ }
    }
    return null;
  }`,
  returnByValue: false,
});
const liveObjId = one.result.objectId;
if (!liveObjId) { console.log('无可取句柄'); await browser.close(); process.exit(1); }
const { heapObjectId } = await cdp.send('HeapProfiler.getHeapObjectId', { objectId: liveObjId });
console.log('live heapObjectId=', heapObjectId);

// 快照
const chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
fsWrite(chunks.join(''));
function fsWrite(s) { import('node:fs').then((fs) => fs.writeFileSync('/tmp/bj328-live.heapsnapshot', s)); }

// 解析
const raw = JSON.parse(chunks.join(''));
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
// 按 id 找节点（id 字段是数字）
const wantId = Number(heapObjectId);
let target = -1;
for (let i = 0; i < nodeCount; i++) {
  if (nodes[i * F + nId] === wantId) { target = i; break; }
}
console.log('snapshot 节点=', target < 0 ? '未找到(可能未活)' : target);
let cur = target;
for (let depth = 0; depth < 6 && cur >= 0; depth++) {
  console.log(`--- 深度${depth}:`, tp(cur) + ':' + String(nm(cur)).slice(0, 80) + '#' + cur);
  const ins = (rev.get(cur) ?? []).filter((e) => !(e.eT === 'element' && /^(Bootstrapper|Builtins|Compilation cache|Code flusher|Debugger|Eternal handles|External strings|Extensions|GC roots)$/.test(e.eN)));
  if (!ins.length) { console.log('   (无语义 in-edge)'); break; }
  // 优先 JS 语义边
  ins.sort((a, b2) => (a.eT === 'context' || a.eT === 'property' || a.eT === 'internal' ? 0 : 1) - (b2.eT === 'context' || b2.eT === 'property' || b2.eT === 'internal' ? 0 : 1));
  for (const e of ins.slice(0, 6)) console.log(`   in ${e.eT}:${String(e.eN).slice(0, 30)} ← ${tp(e.src)}:${String(nm(e.src)).slice(0, 70)}#${e.src}`);
  cur = ins[0].src;
}
await browser.close();
process.exit(0);
