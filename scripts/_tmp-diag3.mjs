// 卡点二分:每步 console.log 立即输出(run-diag 透传 stdout)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
await page.goto(`${ORIGIN}/remaster.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__remasterBridge?.curEntry(), { timeout: 30000 });
console.log('STEP-A page+bridge ready', new Date().toISOString());
await page.evaluate(async () => {
  const b = window.__remasterBridge;
  const e = b.catalog.byKey.get('tile:1');
  b.selectEntry(e);
  await new Promise((r) => setTimeout(r, 800));
});
console.log('STEP-B selected', new Date().toISOString());
await page.evaluate(() => window.__remasterBridge.remaster());
console.log('STEP-C enqueued', new Date().toISOString());
await page.waitForFunction(() => {
  const b = window.__remasterBridge;
  return b.state.frame(b.curEntry(), b.curFrameIdx()).status === 'pending';
}, { timeout: 15000 }).then(() => console.log('STEP-D pending', new Date().toISOString()))
  .catch(() => console.log('STEP-D pending TIMEOUT', new Date().toISOString()));
const r = await page.evaluate(async () => {
  const t0 = Date.now();
  const out = await Promise.race([
    window.__remasterBridge.exportPack(),
    new Promise((res) => setTimeout(() => res('EXPORT-TIMEOUT-15s'), 15000)),
  ]);
  return { out, ms: Date.now() - t0 };
});
console.log('STEP-E export:', JSON.stringify(r), new Date().toISOString());
await browser.close();
process.exit(0);
