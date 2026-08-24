import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 120000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(m.type().toUpperCase() + ':', m.text().slice(0, 150)); });
await page.goto('http://localhost:5207/', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.log('page loaded, waiting world...');
try {
  await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 90000 });
  console.log('WORLD READY');
} catch { console.log('WORLD LOAD TIMEOUT'); }
await browser.close();
