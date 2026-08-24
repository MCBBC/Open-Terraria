// 复刻原版 EnoughTilesForJungle 计数,对照 scene.zoneJungle
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player, st = g.world.store;
  pl.x = 341 * 16; pl.y = 422 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1200));
  const tx = Math.floor(pl.cx / 16), ty = Math.floor(pl.cy / 16);
  // 原版窗口:169×124 居中
  const W = 169, H = 124;
  const SET = new Set([60, 61, 62, 74, 226, 225]);
  let jungle = 0, mud = 0, total = 0;
  const perTile = {};
  for (let y = ty - (H >> 1); y < ty + (H >> 1); y++) {
    for (let x = tx - (W >> 1); x < tx + (W >> 1); x++) {
      if (!st.inBounds(x, y)) continue;
      const t = st.type[st.idx(x, y)];
      if (t !== 0) total++;
      if (SET.has(t)) jungle++;
      if (t === 59) mud++;
    }
  }
  const sc = g.scene;
  return { tx, ty, jungle, mud, total, threshold: 140, zoneJungle: sc.zoneJungle, zoneBeach: sc.zoneBeach };
});
console.log(JSON.stringify(out));
await browser.close();
