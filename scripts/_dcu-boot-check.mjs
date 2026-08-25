import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, protocolTimeout: 900000, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR:', e.message.slice(0, 300)));
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, m);
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
log('loaded');
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 600000, polling: 1000 }).then(() => log('splash gone')).catch(() => log('splash TIMEOUT'));
const sel = await page.evaluate(() => { const s = document.querySelector('select'); return s ? { n: s.options.length, val: s.value, visible: !!s.offsetParent } : null; });
log('select=' + JSON.stringify(sel));
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
log('clicked');
for (let i = 0; i < 100; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const s = await page.evaluate(() => ({ game: !!window.__swGame, world: !!window.__swGame?.world, player: !!window.__swGame?.player, gen: window.__swGame?.worldGenProgress ?? null, body: document.body.className.slice(0, 40) }));
  if (i % 5 === 0 || s.player) log(JSON.stringify(s));
  if (s.player) break;
}
await browser.close();
