// ★BJ328 v3：干净页面（零插桩），纯 CDP 定位。
//  · metric(JSEventListeners/Nodes) vs 连接树逐节点监听 walk 总量 → 差值=游离/非DOM桶
//  · 按 backendNodeId 对比 M1 vs M2：新增节点 top（监听器数）
//  · LayerTree 全层 dump（原始 JSON 片段直接打，修 v1 大层过滤空的问题）
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const LOGF = '/tmp/bj328-c3.log';
const log = (s) => { try { fs.appendFileSync(LOGF, s + '\n'); } catch {} };
try { fs.unlinkSync(LOGF); } catch {}


const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log(`  [nav] ${f.url()}`); });
page.on('pageerror', (e) => console.log(`  [pageerror] ${String(e).slice(0, 160)}`));
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

/** 手动轮询（rAF WaitTask 与中途 reload 相冲——census3 两次炸在 WaitTask.rerun） */
async function poll(expr, timeoutMs = 300000) {
  const t0 = Date.now();
  for (;;) {
    let v = false;
    try { v = await page.evaluate(expr); } catch { /* 导航窗口内:下轮再试 */ }
    if (v) return true;
    if (Date.now() - t0 > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}
const WORLD_READY = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;

async function enterWorld() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    log(`[enterWorld] attempt=${attempt} ORIGIN=${JSON.stringify(ORIGIN)}`);
    await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
    log(`[enterWorld] goto done url=${await page.url()}`);
    await new Promise((r) => setTimeout(r, 3000));
    await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
    log('[enterWorld] select done, clicking');
    await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
    if (await poll(WORLD_READY)) {
      log(`[enterWorld] world ready url=${await page.url()}`);
      await new Promise((r) => setTimeout(r, 2500));
      const ok = await page.evaluate(() => !!(window).__swFlow);
      log(`[enterWorld] flow=${ok}`);
      if (ok) return;
    } else console.log(`  [enterWorld] poll 超时`);
  }
  throw new Error('enterWorld 3 次均失败');
}
async function quit() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  if (!(await poll(() => !(window).__swGame, 120000))) throw new Error('quit 超时');
  await new Promise((r) => setTimeout(r, 1500));
}
async function reenter() {
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!(await poll(WORLD_READY))) throw new Error('reenter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}

async function metrics() {
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics: ms } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  const g = (n) => Math.round(ms.find((x) => x.name === n)?.value ?? -1);
  return { listeners: g('JSEventListeners'), nodes: g('Nodes') };
}

/** 连接树逐节点监听统计。返回 {total, perNode:[{beid,node,n,byType}]} */
async function treeWalk() {
  const per = [];
  let total = 0;
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const stack = [root];
    let seen = 0;
    while (stack.length && seen < 6000) {
      const n = stack.pop();
      seen++;
      for (const c of (n.children ?? [])) stack.push(c);
      for (const c of (n.shadowRoots ?? [])) stack.push(c);
      for (const c of (n.contentDocument ? [n.contentDocument] : [])) stack.push(c);
      if (!n.nodeName || n.nodeName.startsWith('#')) continue;
      try {
        const l = await cdp.send('DOMDebugger.getEventListeners', { nodeId: n.nodeId });
        if (l.listeners.length) {
          total += l.listeners.length;
          const byType = {};
          for (const li of l.listeners) byType[li.type] = (byType[li.type] ?? 0) + 1;
          const attrs = n.attributes ?? [];
          const id = attrs.includes('id') ? '#' + attrs[attrs.indexOf('id') + 1] : '';
          const cls = attrs.includes('class') ? '.' + attrs[attrs.indexOf('class') + 1].split(' ').slice(0, 2).join('.') : '';
          per.push({ beid: n.backendNodeId, node: `${n.nodeName}${id}${cls}`, n: l.listeners.length, byType });
        }
      } catch { /* node gone */ }
    }
    per.sort((a, b) => b.n - a.n);
  } catch (e) { console.log('  treeWalk err:', String(e).slice(0, 200)); }
  return { total, per };
}

async function layerDump(label) {
  await cdp.send('LayerTree.disable').catch(() => {});
  await cdp.send('LayerTree.enable').catch(() => {});
  const layers = await new Promise((res) => {
    const done = setTimeout(() => res(null), 3000);
    cdp.once('LayerTree.layerTreeDidChange', (e) => { clearTimeout(done); res(e.layers ?? []); });
  });
  try { await cdp.send('LayerTree.disable'); } catch { /* ignore */ }
  console.log(` ${label} layers=${layers ? layers.length : 'TIMEOUT'}`);
  if (layers) {
    for (const L of layers.slice(0, 40)) {
      const b = L.bounds ?? {};
      console.log(`   #${L.layerId} back=${L.backendNodeId ?? 0} ${b.width ?? '?'}x${b.height ?? '?'}@${b.x ?? '?'},${b.y ?? '?'} paint=${L.paintCount ?? '?'}`);
    }
  }
  return layers ? layers.length : -1;
}

async function census(label) {
  await gc();
  const dual = await page.evaluate(() => ({ url: location.href, title: document.title, nodes: document.getElementsByTagName('*').length, flow: !!(window).__swFlow, game: !!(window).__swGame }));
  let cdpView = null;
  try {
    const r = await cdp.send('Runtime.evaluate', { expression: `JSON.stringify({url:location.href, nodes:document.getElementsByTagName('*').length, flow:!!window.__swFlow})`, returnByValue: true });
    cdpView = JSON.parse(r.result.value);
  } catch (e) { cdpView = { err: String(e).slice(0, 120) }; }
  console.log(` [${label}] pageView=${JSON.stringify(dual)} cdpView=${JSON.stringify(cdpView)}`);
  const m = await metrics();
  const tw = await treeWalk();
  console.log(`\n===== ${label} ===== metric.listeners=${m.listeners} metric.nodes=${m.nodes} walkTotal=${tw.total} offTree=${m.listeners - tw.total}`);
  for (const r of tw.per.slice(0, 14)) console.log(`   ×${r.n} ${r.node} beid=${r.beid} ${JSON.stringify(r.byType).slice(0, 150)}`);
  return { m, tw };
}

await enterWorld();
const p0 = await census('P0 fresh world');
await layerDump('P0');
await quit();
const m1 = await census('M1 menu');
await layerDump('M1');
await reenter();
const p1 = await census('P1 world');
await quit();
const m2 = await census('M2 menu');
await layerDump('M2');
await reenter();
await census('P2 world');
await quit();
const m3 = await census('M3 menu');
await layerDump('M3');

// M1 vs M2 节点差分：M2 有而 M1 无的 beid（新节点）按监听器数排序
const m1ids = new Set(m1.tw.per.map((r) => r.beid));
const fresh = m2.tw.per.filter((r) => !m1ids.has(r.beid));
fresh.sort((a, b) => b.n - a.n);
console.log(`\nM2 新增带监听节点 ${fresh.length} 个（M1 无此 beid），top:`);
for (const r of fresh.slice(0, 16)) console.log(`   ×${r.n} ${r.node} beid=${r.beid} ${JSON.stringify(r.byType).slice(0, 120)}`);
console.log(`M2 新增监听合计=${fresh.reduce((s, r) => s + r.n, 0)}`);
await browser.close();
process.exit(0);
