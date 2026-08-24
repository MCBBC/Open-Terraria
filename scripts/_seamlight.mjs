// 缝列光照量化:竖井火把行横向采样 lightAt,对照缝列/带层/实心格
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

const loc = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const cx = 341;
  const cy = Math.round((g.world.groundLevel + g.world.rockLevel) / 2 + 40);
  for (let y = cy - 14; y <= cy + 12; y++)
    for (let x = cx - 3; x <= cx + 3; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.liquid[st.idx(x, y)] = 0; }
  const TORCH = window.__swTileByKey?.('torch') ?? 4;
  for (const y of [cy - 12, cy - 6, cy, cy + 5, cy + 10]) st.setTileSilent(cx + 3, y, TORCH);
  const pl = g.player;
  window.__pin = () => { pl.x = cx * 16 + 8 - pl.w / 2; pl.y = cy * 16 + 8 - pl.h / 2; pl.vx = 0; pl.vy = 0; };
  window.__pin();
  return { cy };
});
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 500));
  await page.evaluate(() => window.__pin());
}
const out = await page.evaluate((cy) => {
  const g = window.__swGame, st = g.world.store, L = g.lighting;
  const torchRow = cy + 5;   // 有火把的行
  const rows = [torchRow, cy, cy - 6];
  const res = {};
  for (const ty of rows) {
    const line = [];
    for (let tx = 334; tx <= 354; tx++) {
      const [r, gg, b] = L.lightAt(tx, ty);
      const i = st.idx(tx, ty);
      line.push({ tx, tile: st.type[i], wall: st.wall[i], light: [r, gg, b] });
    }
    res['row' + ty] = line;
  }
  // 竖井内对照列(338,空气)与缝列(345)
  return res;
}, loc.cy);
for (const [k, line] of Object.entries(out)) {
  console.log(k);
  for (const c of line) console.log(`  tx=${c.tx} tile=${c.tile} wall=${c.wall} light=${c.light.join(',')}`);
}
await browser.close();
