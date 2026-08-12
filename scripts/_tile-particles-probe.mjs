import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small&tp=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16) + 6, py = Math.floor(g.player.cy / 16);
  // 放置样本 tile（点燃帧/成熟帧）：熔炉 3x2 (18,18 锚)、水蜡烛、和平蜡烛、篝火 fy=0、水滴石、蘑菇植物
  const TBK = g.tileByKey;
  const put = (x, y, id, fx, fy) => { st.setTile(x, y, id, fx, fy); };
  put(px, py, TBK['furnace'], 18, 18); put(px + 1, py, TBK['furnace'], 36, 18); put(px + 2, py, TBK['furnace'], 54, 18);
  put(px, py + 1, TBK['furnace'], 18, 36); put(px + 1, py + 1, TBK['furnace'], 36, 36); put(px + 2, py + 1, TBK['furnace'], 54, 36);
  put(px + 4, py, TBK['water_candle'], 0, 0);
  put(px + 5, py, TBK['v_372_peacecandle'], 0, 0);
  put(px + 7, py, TBK['v_373_water_drip'], 0, 0);
  put(px + 8, py, TBK['v_71_mushroom_plant'], 0, 0);
  // 玩家站旁边保证视口覆盖
  g.camera.x = (px + 4) * 16; g.camera.y = py * 16;
  return { px, py };
});
// 采样 6 秒粒子计数
let maxP = 0, samples = [];
for (let s = 0; s < 12; s++) {
  await new Promise((r) => setTimeout(r, 500));
  const n = await page.evaluate(() => window.__swGame.particles.length).catch(() => -1);
  samples.push(n);
  maxP = Math.max(maxP, n);
}
console.log(JSON.stringify({ samples, maxP, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
