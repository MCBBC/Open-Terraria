import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5219';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 1500));
await page.click('[data-act=sp]');
await new Promise(r => setTimeout(r, 2500));
console.log(JSON.stringify(await page.evaluate(() => ({
  vsel: !!document.querySelector('.sw-vsel'),
  menu: !!document.querySelector('.sw-title-menu'),
  top: (document.elementFromPoint(494, 430)?.className || '').toString().slice(0, 60),
}))));
console.log('errs:', errs.slice(0, 3));
await page.screenshot({ path: '/tmp/menu-dbg2.png' });
await browser.close();
