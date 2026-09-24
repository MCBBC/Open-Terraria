// ★BJ328：queryObjects 活性判定——菜单态游离 sw-slot 是否 JS 活对象。
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

async function qoCount(label) {
  const proto = await cdp.send('Runtime.evaluate', { expression: 'HTMLElement.prototype' });
  const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: proto.result.objectId });
  const props = await cdp.send('Runtime.getProperties', { objectId: objects.objectId, ownProperties: true });
  // elements 数组在内部槽里——用 callFunctionOn 取 length 与抽样
  const stat = await cdp.send('Runtime.callFunctionOn', {
    objectId: objects.objectId,
    functionDeclaration: `function () {
      try {
        const arr = Array.from(this);
        let slots = 0, det = 0, btn = 0, detBtn = 0;
        for (const e of arr) {
          const cl = e.classList;
          if (!cl) continue;
          if (cl.contains('sw-slot')) { slots++; if (!e.isConnected) det++; }
          else if (cl.contains('vinv-btn')) { btn++; if (!e.isConnected) detBtn++; }
        }
        return { total: arr.length, slots, slotsDetached: det, vbtn: btn, vbtnDetached: detBtn };
      } catch (err) {
        return { err: String(err).slice(0, 120), len: this.length };
      }
    }`,
    returnByValue: true,
  });
  if (stat.exceptionDetails) console.log(label, 'EXC:', stat.exceptionDetails.exception?.description?.slice(0, 140));
  console.log(label, JSON.stringify(stat.result.value));
}

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 4000));
await gc();
await qoCount('M0(title):');
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
await gc();
await qoCount('M1(menu,1轮):');
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
if (!await poll(WORLD, 300000)) throw new Error('reenter 超时');
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate(() => window.__swFlow.quitToMenu());
if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit2 超时');
await gc();
await qoCount('M2(menu,2轮):');
const m = await cdp.send('Performance.enable').then(() => cdp.send('Performance.getMetrics'));
console.log('M2 metric.listeners=', Math.round(m.metrics.find((x) => x.name === 'JSEventListeners')?.value ?? -1));
await browser.close();
process.exit(0);
