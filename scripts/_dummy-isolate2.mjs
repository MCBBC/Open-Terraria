import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const d = Enemy.fromVanilla(488, pl.x + 100, pl.y);
  const r = { vanillaId: d?.vanillaId, iframes: d?.iframes, dont: d?.dontTakeDamage, hp: d?.hp, dead: d?.dead };
  if (d) {
    const ret = d.hurt(7, 1, 0, g);
    r.hurtRet = ret; r.shake = d.dummyShake; r.iframesAfter = d.iframes; r.hpAfter = d.hp;
  }
  return r;
});
console.log(JSON.stringify(out));
await browser.close();
