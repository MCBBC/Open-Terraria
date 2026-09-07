import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', (e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 200)); });
await page.goto('http://localhost:5202/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 12; i++) {
  await new Promise((r) => setTimeout(r, 10000));
  const st = await page.evaluate(() => ({
    swUI: !!window.__swUI, game: !!window.__swGame, world: !!(window.__swGame && window.__swGame.world),
    readyState: document.readyState,
    bodyText: document.body.innerText.slice(0, 120),
  })).catch((e) => ({ evalErr: String(e).slice(0, 120) }));
  console.log(`t+${(i + 1) * 10}s`, JSON.stringify(st));
  if (st.world) break;
}
await browser.close();
