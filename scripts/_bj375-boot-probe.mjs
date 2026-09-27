// BJ375 步进定位探针 v3：抓控制台全量 + 轮询期快照 UI 状态。
import puppeteer from 'puppeteer-core';

const step = (s) => console.log('[step]', s, new Date().toISOString().slice(11, 19));
const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 300)));
page.on('console', (m) => console.log('CON:', m.type(), m.text().slice(0, 220)));
page.on('requestfailed', (r) => console.log('REQFAIL:', r.url().slice(-80), r.failure()?.errorText));
step('goto');
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
step('goto done');
await page.waitForFunction(() => !!window.__swFlow?.newWorld, { timeout: 60000 });
step('api ready');
await page.evaluate(() => { window.__swFlow.newWorld('', 420, 220); });
step('newWorld fired');
const ok = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = [];
  for (let i = 0; i < 150; i++) {
    if (window.__swGame?.world) return { ok: true, i, snap };
    if (i % 10 === 0) {
      const ui = {
        world: !!window.__swGame?.world,
        flowKeys: Object.keys(window.__swFlow ?? {}).length,
        menuVisible: !!document.querySelector('.sw-vsel, [data-act]'),
        bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 160),
      };
      snap.push(ui);
    }
    await wait(200);
  }
  return { ok: false, snap };
});
console.log('[world]', JSON.stringify(ok, null, 1).slice(0, 3000));
step('done');
await browser.close();
