// _waterblob:涟漪活跃期(玩家刚入水)逐帧抓拍 + 位移场采样,定谳"平绿矩形"空洞。
// 抓 12 帧 ×120ms,每帧记录 blob 区域(屏 930-980/1100-1145, y 605-620)像素 + 位移。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');
const CX = 37329, CY = 4011;

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1512, height: 862 },
});
const errs = [];
const p = await b.newPage();
p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 90; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => !!window.__swGame).catch(() => false)) break;
}
await p.evaluate(async () => { await window.__swGame.newWorld('12345', 4200, 1200, () => {}); });
for (let i = 0; i < 240; i++) {
  await new Promise(r => setTimeout(r, 1000));
  if (await p.evaluate(() => window.__swGame?.world?.store?.liquid?.length > 0
    && window.__swGame?.world?.spawnX > 0).catch(() => false)) break;
}
await new Promise(r => setTimeout(r, 2000));
// 玩家空中钉位(入水瞬间开始抓)
await p.evaluate((cx, cy) => {
  const g = window.__swGame, w = g.world;
  g.world.clock.timeOfDay = 0.5055;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const pl = g.player;
  pl.x = cx - pl.w / 2; pl.y = cy - 200; pl.vx = 0; pl.vy = 0;   // 湖面上方 200px 落下
  g.liquid.updateLiquid = () => {};
  window.__pin = setInterval(() => { g.camera.x = cx; g.camera.y = cy; }, 16);
}, CX, CY);
await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.progress = 30;
});
await new Promise(r => setTimeout(r, 1500));
await p.bringToFront();
for (let i = 0; i < 14; i++) {
  await p.screenshot({ path: `${OUT}/blob-${i}.png` });
  const st = await p.evaluate(() => {
    const g = window.__swGame;
    const pl = g.player;
    return { py: Math.round(pl.y), wet: pl.inWater, wc: pl.wetCount };
  });
  process.stdout.write(`[${i}] py=${st.py} wet=${st.wet} wc=${st.wc}  `);
  await new Promise(r => setTimeout(r, 120));
}
console.log();
console.log('pageerrors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
