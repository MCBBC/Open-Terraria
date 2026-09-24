// ★BJ328 v4：连接面 vs 离树面切分。
//  · 新基线：未进世界的标题菜单（首测）
//  · walk 修用 DOM.resolveNode→objectId→DOMDebugger.getEventListeners（nodeId 直查恒空）
//  · offTree = metric − connectedTotal（=游离树/非DOM桶）
//  · M1 vs M2 连接树差分（beid）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('DOM.enable');
await cdp.send('Runtime.enable');

const gc = async () => {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
};
async function poll(expr, timeoutMs = 300000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await page.evaluate(expr); } catch { /* 导航窗 */ }
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}
const WORLD_READY = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD_READY)) throw new Error('enter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}
async function quit() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
  await new Promise((r) => setTimeout(r, 1500));
}
async function reenter() {
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD_READY)) throw new Error('reenter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}

async function metrics() {
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics: ms } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  const g = (n) => Math.round(ms.find((x) => x.name === n)?.value ?? -1);
  return { listeners: g('JSEventListeners'), nodes: g('Nodes'), jsHeap: g('JSHeapUsedSize') };
}

/** 连接树逐节点监听（resolveNode objectId 法） */
async function treeWalk() {
  const per = [];
  let total = 0, errs = 0;
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack = [root];
    let seen = 0;
    while (stack.length && seen < 5000) {
      const n = stack.pop();
      seen++;
      for (const c of (n.children ?? [])) stack.push(c);
      for (const c of (n.shadowRoots ?? [])) stack.push(c);
      if (!n.nodeName || n.nodeName.startsWith('#') || !n.backendNodeId) continue;
      try {
        const { object } = await cdp.send('DOM.resolveNode', { backendNodeId: n.backendNodeId });
        const l = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.objectId });
        if (l.listeners.length) {
          total += l.listeners.length;
          const byType = {};
          for (const li of l.listeners) byType[li.type] = (byType[li.type] ?? 0) + 1;
          const attrs = n.attributes ?? [];
          const id = attrs.includes('id') ? '#' + attrs[attrs.indexOf('id') + 1] : '';
          const cls = attrs.includes('class') ? '.' + attrs[attrs.indexOf('class') + 1].split(' ').slice(0, 2).join('.') : '';
          per.push({ beid: n.backendNodeId, node: `${n.nodeName}${id}${cls}`, n: l.listeners.length, byType });
        }
      } catch { errs++; }
    }
    per.sort((a, b) => b.n - a.n);
  } catch (e) { console.log('  treeWalk err:', String(e).slice(0, 160)); }
  if (errs > 20) console.log(`  treeWalk resolve errs=${errs}`);
  return { total, per };
}

async function census(label) {
  await gc();
  const m = await metrics();
  const tw = await treeWalk();
  console.log(`\n===== ${label} ===== metric.listeners=${m.listeners} metric.nodes=${m.nodes} connectedListeners=${tw.total} offTree=${m.listeners - tw.total}`);
  for (const r of tw.per.slice(0, 10)) console.log(`   ×${r.n} ${r.node} beid=${r.beid} ${JSON.stringify(r.byType).slice(0, 140)}`);
  return { m, tw };
}

// 基线：标题菜单（从未进世界）
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 5000));
const base = await census('M0 title menu (fresh)');

await enterWorld();
const p0 = await census('P0 world');
await quit();
const m1 = await census('M1 menu');
await reenter();
const p1 = await census('P1 world');
await quit();
const m2 = await census('M2 menu');
await reenter();
const p2 = await census('P2 world');
await quit();
const m3 = await census('M3 menu');

// M1 vs M2 连接面差分
const m1ids = new Set(m1.tw.per.map((r) => r.beid));
const fresh = m2.tw.per.filter((r) => !m1ids.has(r.beid));
fresh.sort((a, b) => b.n - a.n);
console.log(`\nM1→M2 连接面新增带监听节点 ${fresh.length} 个, 合计监听 ${fresh.reduce((s, r) => s + r.n, 0)}`);
for (const r of fresh.slice(0, 12)) console.log(`   ×${r.n} ${r.node} beid=${r.beid} ${JSON.stringify(r.byType).slice(0, 120)}`);
console.log(`\noffTree 轨迹: M0=${base.m.listeners - base.tw.total} P0=${p0.m.listeners - p0.tw.total} M1=${m1.m.listeners - m1.tw.total} P1=${p1.m.listeners - p1.tw.total} M2=${m2.m.listeners - m2.tw.total} P2=${p2.m.listeners - p2.tw.total} M3=${m3.m.listeners - m3.tw.total}`);
await browser.close();
process.exit(0);
