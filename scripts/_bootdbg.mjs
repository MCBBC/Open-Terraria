import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error') console.log('CERR:', m.text().slice(0, 200)); });
await p.goto('http://localhost:5201/?play=small', { waitUntil: 'domcontentloaded' });
try {
  await p.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 100000 });
  console.log('BOOT OK');
} catch { console.log('BOOT TIMEOUT'); }
await b.close();
