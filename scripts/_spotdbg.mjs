// 落脚点条件逐项计数
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const dX = g.world.dungeonX, dY = g.world.dungeonY || Math.floor(g.world.groundLevel);
  const isDW = (w) => w === 7 || w === 8 || w === 9 || (w >= 94 && w <= 99);
  let nWall = 0, nSolid = 0, nAir3 = 0, nAll = 0;
  const y1 = Math.min(st.h - 10, Math.floor(g.world.rockLevel) + 100);
  const samples = [];
  for (let y = Math.max(10, dY + 40); y < y1; y++) {
    for (let x = Math.max(2, dX - 120); x < Math.min(st.w - 2, dX + 120); x++) {
      const i = st.idx(x, y);
      const wOk = isDW(st.wall[i]);
      const sOk = st.isSolid(x, y);
      const aOk = !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3);
      if (wOk) nWall++;
      if (wOk && sOk) nSolid++;
      if (wOk && sOk && aOk) { nAll++; if (samples.length < 5) samples.push({ x, y, wall: st.wall[i] }); }
    }
  }
  return { dX, dY, rock: g.world.rockLevel, nWall, nSolid, nAll, samples };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
