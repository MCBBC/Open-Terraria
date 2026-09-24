// ★BJ328：1200×850 小世界生成挂死复现——__swFlow.newWorld，全程抓 console（含
//  worldGen 30s 静默看门狗点名），60/120/180s 三档观察。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 590000, defaultViewport: { width: 1280, height: 800 }, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
page.on('dialog', (d) => { void d.accept(); });
page.on('console', (m) => { const t = m.text(); console.log(`[console.${m.type()}] ${t.slice(0, 200)}`); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 220)));

await page.evaluateOnNewDocument(() => {
  (window).__swI91Cap = (_st, _g, _ch, name) => console.log('[pass-start]', name);
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForSelector('select', { timeout: 60000 }).catch(() => {});
const t0 = Date.now();
await page.evaluate(() => (window).__swFlow.newWorld('bj328tiny', 1200, 850));
console.log('newWorld() 已发起');
// 逐 10s 报告进度页状态
for (let i = 0; i < 24; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const st = await page.evaluate(() => ({
    prog: document.querySelector('.sw-progress')?.textContent?.slice(0, 60) ?? null,
    hasGame: !!(window).__swGame,
    bar: (() => { const b = document.querySelector('.sw-progress-fill, [class*=progress]'); return b ? (b.style?.width ?? b.className) : null; })(),
  })).catch(() => ({ dead: true }));
  console.log(`t+${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(st));
  if (st.hasGame) { console.log('世界已就绪'); break; }
}
await browser.close();
process.exit(0);
