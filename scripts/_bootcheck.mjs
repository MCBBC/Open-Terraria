import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERR: ' + String(e).slice(0, 250)));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || t.includes('Error')) errs.push('CONSOLE: ' + t.slice(0, 200)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 30000));
const state = await page.evaluate(() => ({
  hasGame: !!window.__swGame,
  hasPlayer: !!(window.__swGame && window.__swGame.player),
  bodyLen: document.body.innerHTML.length,
})).catch(e => ({ evalFail: String(e).slice(0, 100) }));
console.log(JSON.stringify({ state, errs: errs.slice(0, 6) }, null, 1));
await browser.close();
