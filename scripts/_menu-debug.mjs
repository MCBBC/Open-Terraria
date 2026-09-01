import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1200));
const ev = (act) => document.querySelector(act)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const res = {};
res.charPanel = await page.evaluate(() => {
  document.querySelector('[data-act=sp]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return true;
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => document.querySelector('.sw-vsel-footer [data-act=new]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
await new Promise((r) => setTimeout(r, 1200));
res.afterNew = await page.evaluate(() => ({
  html: document.querySelector('.sw-vsel')?.outerHTML.slice(0, 2500),
}));
console.log(JSON.stringify(res, null, 2));
await browser.close();
