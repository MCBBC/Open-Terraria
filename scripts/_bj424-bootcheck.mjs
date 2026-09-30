import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5630';
const browser = await puppeteer.launch({ protocolTimeout: 120000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1000, height: 700 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR ' + String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 200)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 8000));
const state = await page.evaluate(() => ({
  flow: !!window.__swFlow, game: !!window.__swGame, title: document.title,
  menuBtn: !!document.querySelector('[data-act=sp]'),
}));
console.log('[boot] state:', JSON.stringify(state));
console.log('[boot] errors:', errs.length ? errs.slice(0, 5) : 'none');
await browser.close();
