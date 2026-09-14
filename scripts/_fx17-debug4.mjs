import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', (e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 200)); });
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
try {
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 200000, polling: 1000 });
  console.log('game ready');
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 60000, polling: 500 });
  console.log('vinv ready');
} catch { console.log('TIMEOUT'); 
  const st = await page.evaluate(() => ({ game: !!window.__swGame, world: !!window.__swGame?.world, ui: !!window.__swUI, vinv: !!document.querySelector('.sw-vinv'), panel: !!window.__swUI?.invPanel })).catch(() => null);
  console.log('state:', JSON.stringify(st));
}
await browser.close();
