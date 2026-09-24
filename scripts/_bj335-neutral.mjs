// ★BJ335 中立探针（插桩中立性自证版）：全程【零 queryObjects/零 evaluate 返回对象】,
//  census 只用 Performance.getMetrics（JSEventListeners/Nodes/JSHeapUsedSize——原生指标,
//  不经 JS 枚举,无 DevTools console 全局句柄自捕）。M2 后单张快照落盘,游离树分析离线做。
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('HeapProfiler.enable').catch(() => {});

const gc = async () => {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 400));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 600));
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

async function enter() {
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  if (!await poll(WORLD, 300000)) throw new Error('enter 超时');
  await new Promise((r) => setTimeout(r, 2500));
}
async function quitToMenu() {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  if (!await poll(() => !(window).__swGame, 120000)) throw new Error('quit 超时');
  await new Promise((r) => setTimeout(r, 1500));
}
async function metrics(label) {
  await gc();
  await cdp.send('Performance.enable').catch(() => {});
  const { metrics: ms } = await cdp.send('Performance.getMetrics');
  await cdp.send('Performance.disable').catch(() => {});
  const g = (n) => Math.round(ms.find((x) => x.name === n)?.value ?? -1);
  const row = ` listeners=${g('JSEventListeners')} nodes=${g('Nodes')} heap=${(g('JSHeapUsedSize') / 1e6).toFixed(0)}MB`;
  console.log(`[${label}]${row}`);
  return { listeners: g('JSEventListeners'), nodes: g('Nodes') };
}

await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
const m0 = await metrics('M0 title fresh');
await enter();
const p0 = await metrics('P0 world');
await quitToMenu();
const m1 = await metrics('M1 menu r1');
await enter();
const p1 = await metrics('P1 world');
await quitToMenu();
const m2 = await metrics('M2 menu r2');
await enter();
const p2 = await metrics('P2 world');
await quitToMenu();
const m3 = await metrics('M3 menu r3');

console.log('\n==== takeHeapSnapshot (M3) ====');
const chunks = [];
cdp.on('HeapProfiler.addHeapSnapshotChunk', (e) => chunks.push(e.chunk));
await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
fs.writeFileSync('/tmp/bj335-neutral.heapsnapshot', chunks.join(''));
console.log('saved /tmp/bj335-neutral.heapsnapshot bytes=', chunks.join('').length);
console.log(`\ndeltas: M0→M1 ${m1.listeners - m0.listeners} | M1→M2 ${m2.listeners - m1.listeners} | M2→M3 ${m3.listeners - m2.listeners} (listeners)`);
console.log(`        P0→P1 ${p1.listeners - p0.listeners} | P1→P2 ${p2.listeners - p1.listeners} (world listeners)`);
console.log(`nodes:  M0=${m0.nodes} M1=${m1.nodes} M2=${m2.nodes} M3=${m3.nodes}`);
await browser.close();
process.exit(0);
