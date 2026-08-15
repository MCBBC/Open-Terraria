import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', protocolTimeout: 120_000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('CON: ' + m.text().slice(0, 200)); });
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (const wait of [5000, 15000, 30000, 60000]) {
  await new Promise(r => setTimeout(r, wait === 5000 ? 5000 : wait - (wait === 15000 ? 5000 : wait === 30000 ? 15000 : 30000)));
  const s = await page.evaluate(() => ({
    flow: !!window.__swFlow, game: !!window.__swGame, world: !!window.__swGame?.world,
    player: !!window.__swGame?.player, bodyClass: document.body.className.slice(0, 60),
    progress: document.querySelector('.sw-progress,.progress,canvas') ? 'has-canvas-or-progress' : 'none',
  }));
  console.log(`t+${wait / 1000}s`, JSON.stringify(s), 'errs:', errs.length);
  if (s.player && s.world) break;
}
console.log('errors:', errs.slice(0, 5));
await browser.close();
