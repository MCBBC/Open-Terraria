import { launchBrowser, openPage, front, sleep } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await launchBrowser({});
const errors = [];
const page = await openPage(browser, { errors, maxErrors: 20 });
await front(page);
await page.goto(`${ORIGIN}/?swperf=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
const { bootstrap } = await import('../tools/probe/lib/boot.mjs');
let stop = false;
(async () => {  // 并行观测器
  for (let i = 0; !stop; i++) {
    const s = await page.evaluate(() => ({
      flow: typeof window.__swFlow, ready: document.readyState, kids: document.body.children.length,
      search: location.search.slice(0, 60),
    })).catch((e) => ({ err: String(e).slice(0, 70) }));
    console.log(Date.now() % 100000, JSON.stringify(s));
    await sleep(4000);
  }
})();
const t0 = Date.now();
const r = await bootstrap(page, ORIGIN, { timeout: 60000 });
stop = true;
console.log('bootstrap:', JSON.stringify(r), 'took', Date.now() - t0, 'ms');
console.log('errors:', errors.slice(0, 6));
await browser.close().catch(() => {});
process.exit(0);
