// ★BJ335 经验二分:退世界后逐类清可疑持有者,CDP Nodes/JSEventListeners 判回应。
//  群A=window 系统句柄; 群B=UI 函数值字段; 群C=UI 对象/数组/Map 字段; 群D=VUI/flow/MenuBg。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('HeapProfiler.enable').catch(() => {});
const gc = async () => {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 500));
};
const poll = async (expr, ms) => { const t0 = Date.now(); for (;;) { let v = false; try { v = await page.evaluate(expr); } catch {} if (v) return true; if (Date.now() - t0 > ms) return false; await new Promise((r) => setTimeout(r, 500)); } };
const WORLD = () => !!(window).__swGame && !!(window).__swGame.world && !!(window).__swGame.liquid;
async function metric(label) {
  await gc();
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics: ms } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  const g = (n) => Math.round(ms.find((x) => x.name === n)?.value ?? -1);
  console.log(`[${label}] listeners=${g('JSEventListeners')} nodes=${g('Nodes')}`);
  return { l: g('JSEventListeners'), n: g('Nodes') };
}

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await new Promise((r) => setTimeout(r, 1200));

const base = await metric('baseline after quit r1');

// UI 字段画像（名字+种类,字符串返回,零滞留）
const profile = await page.evaluate(() => {
  const ui = window.__swUI;
  const kind = (v) => {
    if (v === null) return 'null';
    if (typeof v === 'function') return 'fn';
    if (v instanceof Node) return 'node';
    if (Array.isArray(v)) return 'arr';
    if (v instanceof Map) return 'map';
    if (v instanceof Set) return 'set';
    if (typeof v === 'object') return 'obj';
    return 'prim';
  };
  const out = { fn: [], node: [], arr: [], map: [], set: [], obj: [] };
  for (const k of Object.getOwnPropertyNames(ui)) {
    if (k === 'root') continue;
    try { const t = kind(ui[k]); if (out[t]) out[t].push(k); } catch {}
  }
  return out;
});
console.log('UI 字段画像:', JSON.stringify({ fn: profile.fn.length, node: profile.node.length, arr: profile.arr.length, map: profile.map.length, set: profile.set.length, obj: profile.obj.length }));

// 群B:UI 函数值字段 → undefined
const mB = await page.evaluate(() => {
  const ui = window.__swUI; let n = 0;
  for (const k of Object.getOwnPropertyNames(ui)) {
    if (k === 'root') continue;
    try { if (typeof ui[k] === 'function') { ui[k] = undefined; n++; } } catch {}
  }
  return n;
});
await new Promise((r) => setTimeout(r, 300));
const afterB = await metric(`群B 清 UI 函数值字段(${mB} 个)`);

// 群C:UI 对象/数组/Map/Set 字段 → null/[]/clear
const mC = await page.evaluate(() => {
  const ui = window.__swUI; let n = 0;
  for (const k of Object.getOwnPropertyNames(ui)) {
    if (k === 'root') continue;
    try {
      const v = ui[k];
      if (v instanceof Map) { v.clear(); n++; }
      else if (v instanceof Set) { v.clear(); n++; }
      else if (Array.isArray(v)) { ui[k] = []; n++; }
      else if (v && typeof v === 'object') { ui[k] = null; n++; }
    } catch {}
  }
  return n;
});
await new Promise((r) => setTimeout(r, 300));
const afterC = await metric(`群C 清 UI 对象/数组/Map(${mC} 个)`);

// 群D:window 句柄族
const winObj = await page.evaluate(() => {
  const out = [];
  for (const k of Object.getOwnPropertyNames(window)) {
    try { const v = window[k]; if (v && typeof v === 'object' && k.startsWith('__sw')) out.push(k); } catch {}
  }
  return out;
});
console.log('window.__sw* 对象:', winObj.join(','));
const mD = await page.evaluate(() => {
  let n = 0;
  for (const k of Object.getOwnPropertyNames(window)) {
    if (!k.startsWith('__sw')) continue;
    try { const v = window[k]; if (v && typeof v === 'object' && !(v instanceof Node)) { window[k] = null; n++; } } catch {}
  }
  return n;
});
await new Promise((r) => setTimeout(r, 300));
const afterD = await metric(`群D 清 window.__sw*(${mD} 个)`);

console.log(`\ndeltas: nodes base=${base.n} B=${afterB.n}(${afterB.n - base.n}) C=${afterC.n}(${afterC.n - afterB.n}) D=${afterD.n}(${afterD.n - afterC.n})`);
console.log(`        listeners base=${base.l} B=${afterB.l}(${afterB.l - base.l}) C=${afterC.l}(${afterC.l - afterB.l}) D=${afterD.l}(${afterD.l - afterC.l})`);
await browser.close();
process.exit(0);
