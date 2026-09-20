import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 60000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
const r = await page.evaluate(async () => {
  const ks = await caches.keys();
  let n = 0;
  for (const k of ks) { const c = await caches.open(k); n += (await c.keys()).length; }
  return { caches: ks.length, entries: n };
});
console.log('CACHE:' + JSON.stringify(r));
await browser.close();
