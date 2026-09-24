// ★BJ318：BJ319 residue 口径 + 强制 GC 对拍——listeners 增长是「待回收」还是「真留存」。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 590000,
  userDataDir: '/tmp/bj319gc-' + (Date.now() % 100000),
  args: ['--no-sandbox', '--no-proxy-server'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable').catch(() => {});
const ls = async () => {
  const m = await cdp.send('Performance.getMetrics');
  return Math.round(m.metrics.find((x) => x.name === 'JSEventListeners')?.value ?? -1);
};
const gc = async () => {
  await cdp.send('HeapProfiler.enable').catch(() => {});
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
};

const enterWorld = async () => {
  await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise((r) => setTimeout(r, 3000));
  await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
};

await enterWorld();
console.log('P0 fresh        listeners(GC前)=', await ls());
await gc();
console.log('P0 fresh        listeners(GC后)=', await ls());

for (let i = 1; i <= 2; i++) {
  await page.evaluate(() => window.__swFlow.quitToMenu());
  await page.waitForFunction(() => !window.__swGame, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1000));
  const beforeGc = await ls();
  await gc();
  const afterGc = await ls();
  console.log(`P2 quit#${i}          listeners(GC前)=${beforeGc}  (GC后)=${afterGc}`);
  // 重进
  await page.evaluate(() => { const _s = document.querySelector('select'); if (_s) { _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); } });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.liquid, { timeout: 300000 });
  await new Promise((r) => setTimeout(r, 2500));
  const inGc = await ls();
  await gc();
  console.log(`P2 reenter#${i}       listeners(入后GC后)=`, inGc, '→', await ls());
}
await browser.close();
process.exit(0);
