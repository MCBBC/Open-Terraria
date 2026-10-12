import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('PE: ' + String(e?.stack ?? e).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 3000));
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player)).catch(() => false)) break;
}
const r = await page.evaluate(() => ({
  hasGame: !!window.__swGame,
  hasPlayer: !!(window.__swGame && window.__swGame.player),
  hasWorld: !!(window.__swGame && window.__swGame.world),
  modsLoaded: window.__swModsLoaded === true,
})).catch(e => ({ fail: String(e).slice(0, 100) }));
console.log(JSON.stringify({ r, errs: errs.slice(0, 3) }));
await browser.close();
