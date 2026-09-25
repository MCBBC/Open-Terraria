import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const msgs = [];
page.on('console', (m) => msgs.push(m.type() + ':' + m.text().slice(0, 100)));
page.on('pageerror', (e) => msgs.push('PAGEERR:' + e.message.slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 5000));
const before = await page.evaluate(() => document.body.children.length);
await page.mouse.click(680, 339);
await new Promise(r => setTimeout(r, 8000));
const after = await page.evaluate(async () => ({
  n: document.body.children.length,
  roots: [...document.body.children].map(c => String(c.className).slice(0, 40)),
  hasSp: !!document.querySelector('[data-act=sp]'),
  raf: await new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); }),
}));
console.log(JSON.stringify({ before, ...after, msgs: msgs.slice(0, 12) }, null, 1));
await browser.close();
