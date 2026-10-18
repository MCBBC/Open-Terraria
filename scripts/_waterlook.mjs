// _waterlook:果冻管线活跃下的水体外貌序列抓拍(玩家搅水涟漪传播中)。
// 连续 8 帧(每 200ms)截图,肉眼+像素检查透出背景的空洞;q3 vs q0 对照。
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1200, height: 800 },
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
const pool = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const sx = w.spawnX, sy = w.spawnY;
  for (let dx = -220; dx <= 220; dx++) {
    const x = sx + dx;
    if (x < 20 || x >= st.w - 20) continue;
    for (let y = Math.max(10, sy - 60); y < Math.min(st.h - 40, sy + 120); y++) {
      const i = st.idx(x, y);
      if (st.liquid[st.idx(x, y - 1)] === 0 && st.liquid[i] > 200 && !st.isSolid(x, y)
        && st.liquid[st.idx(x + 1, y)] > 200 && st.liquid[st.idx(x - 1, y)] > 200
        && st.liquid[st.idx(x, y + 1)] > 200 && st.liquid[st.idx(x, y + 2)] > 200) {
        const pl = g.player;
        pl.x = x * 16 + 2; pl.y = (y + 1) * 16 - 6; pl.vx = 0; pl.vy = 0;
        return { x, y };
      }
    }
  }
  return null;
});
if (!pool) { console.log('FAIL: no pool'); await b.close(); process.exit(1); }
await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.progress = 30;
});
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1000));
// 搅水:反复跳入(入水/出水涟漪)
await p.evaluate(() => {
  window.__kick = setInterval(() => {
    const pl = window.__swGame.player;
    pl.vy = -2.5; pl.vx = 0.6;
  }, 250);
});
await new Promise(r => setTimeout(r, 3000));
// 序列抓拍 8 帧
for (let i = 0; i < 8; i++) {
  await p.screenshot({ path: `${OUT}/waterlook-q3-${i}.png` });
  await new Promise(r => setTimeout(r, 200));
}
// 停踢,等涟漪衰减
await p.evaluate(() => { clearInterval(window.__kick); });
await new Promise(r => setTimeout(r, 1500));
await p.screenshot({ path: `${OUT}/waterlook-q3-calm.png` });
// q0 对照(管线关)
await p.evaluate(async () => {
  const o = await import('/src/core/Options.ts');
  o.options.data.waveQuality = 0;
});
await new Promise(r => setTimeout(r, 1000));
await p.screenshot({ path: `${OUT}/waterlook-q0.png` });
console.log('pageerrors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
