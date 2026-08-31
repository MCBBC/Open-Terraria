import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
page.on('console', m => console.log('CON', m.type(), m.text().slice(0, 160)));
page.on('pageerror', e => console.log('ERR', e.message.slice(0, 200)));
page.on('framenavigated', f => console.log('NAV', f.url()));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
for (let i = 0; i < 40 && !(await page.evaluate(() => !!document.querySelector('[data-act=sp]'))); i++) await sleep(500);
await sleep(2500);
await page.evaluate(() => document.querySelector('[data-act=sp]')?.click());
await page.waitForSelector('.sw-vsel-panel', { timeout: 10000 });
await sleep(800);
await page.evaluate(() => document.querySelector('.sw-vsel-footer [data-act=new]')?.click());
for (let i = 0; i < 10; i++) {
  await sleep(700);
  const s = await page.evaluate(() => ({
    chars: [...document.querySelectorAll('[class*=sw-]')].map(e => e.className.toString()).slice(0, 20),
    url: location.href,
  })).catch(e => ({ evalErr: String(e).slice(0, 120) }));
  console.log(i, JSON.stringify(s).slice(0, 300));
}
await page.screenshot({ path: '/tmp/sw-menu-after-new.png' });
await browser.close();
