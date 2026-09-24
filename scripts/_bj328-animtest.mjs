// ★BJ328：合成器/动画滞留假说实验——document-start 注入 *{animation/transition:none;
// will-change:auto} 后跑进出循环，对比 JSEventListeners 是否仍 +900/轮。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const MODE = process.env.BJ328_MODE ?? 'noanim';   // noanim | baseline

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();

if (MODE === 'noanim') {
  await page.evaluateOnNewDocument(() => {
    const st = document.createElement('style');
    st.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;will-change:auto !important;}';
    document.addEventListener('DOMContentLoaded', () => document.documentElement.appendChild(st));
  });
}

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
const metric = async () => {
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  return { listeners: Math.round(metrics.find((x) => x.name === 'JSEventListeners')?.value ?? -1) };
};
async function enterWorld() {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
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
  if (!await poll(WORLD, 300000)) throw new Error('reenter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}
async function layerCount() {
  await cdp.send('LayerTree.disable').catch(() => {});
  await cdp.send('LayerTree.enable').catch(() => {});
  const n = await new Promise((res) => {
    const t = setTimeout(() => res(-1), 3000);
    cdp.once('LayerTree.layerTreeDidChange', (e) => { clearTimeout(t); res((e.layers ?? []).length); });
  });
  try { await cdp.send('LayerTree.disable'); } catch { /* */ }
  return n;
}

console.log(`MODE=${MODE}`);
await enterWorld();
await gc();
console.log('P0 listeners=', (await metric()).listeners, 'layers=', await layerCount());
for (let i = 1; i <= 3; i++) {
  await quit();
  await gc();
  console.log(`M${i} listeners=`, (await metric()).listeners, 'layers=', await layerCount());
  if (i < 3) { await reenter(); await gc(); console.log(`P${i} listeners=`, (await metric()).listeners); }
}
await browser.close();
process.exit(0);
