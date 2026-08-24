import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const browser = await puppeteer.launch({ protocolTimeout: 300000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await new Promise(r => setTimeout(r, 1500));
const state = await page.evaluate(() => ({
  panel: !!document.querySelector('.sw-list-panel'),
  title: document.querySelector('.sw-list-title')?.textContent ?? null,
  menuVisible: !!document.querySelector('.sw-title-menu'),
  overlayTop: (() => { const el = document.elementFromPoint(80, 430); return el ? el.className.toString().slice(0, 60) + '/' + el.tagName : 'none'; })(),
}));
console.log(JSON.stringify(state), 'errs:', errs.slice(0, 3));
await page.screenshot({ path: '/tmp/menu-debug2.png' });
await browser.close();
