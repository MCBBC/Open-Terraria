import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
await page.goto(`${ORIGIN}/remaster.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__remasterBridge?.curEntry(), { timeout: 30000 });
console.log('P1 page ready');
const s1 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  const e = b.catalog.byKey.get('tile:1');
  b.selectEntry(e);
  await new Promise((r) => setTimeout(r, 800));
  return 'selected';
});
console.log('P2', s1);
const s2 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  await b.remaster();
  return 'enqueued';
});
console.log('P3', s2);
await page.waitForFunction(() => {
  const b = window.__remasterBridge;
  const rec = b.state.frame(b.curEntry(), b.curFrameIdx());
  return rec.status === 'pending';
}, { timeout: 20000 }).catch(() => console.log('P4 TIMEOUT waiting pending'));
console.log('P4 pending reached');
const s3 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  await b.accept();
  return 'accepted';
});
console.log('P5', s3);
const s4 = await page.evaluate(async () => {
  const b = window.__remasterBridge;
  const t0 = Date.now();
  const r = await Promise.race([b.exportPack(), new Promise((res) => setTimeout(() => res({ timeout: true }), 15000))]);
  return { r, ms: Date.now() - t0 };
});
console.log('P6', JSON.stringify(s4));
await browser.close();
process.exit(0);
