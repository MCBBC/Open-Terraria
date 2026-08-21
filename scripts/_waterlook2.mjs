// _waterlook2:用户视角(相机 37329,4011 = 世界 seed 12345 地表湖)果冻管线外貌序列。
// 玩家搅水,8 帧序列 + q0 对照;检查水线/边缘的透出背景空洞。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';
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
await p.evaluate((cx, cy) => {
  const g = window.__swGame, w = g.world;
  g.world.clock.timeOfDay = 0.5055;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const pl = g.player;
  pl.x = cx - pl.w / 2; pl.y = cy - pl.h / 2; pl.vx = 0; pl.vy = 0;
  g.liquid.updateLiquid = () => {};
}, CX, CY);
await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.progress = 30;
});
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1000));
// 静水帧
await p.screenshot({ path: `${OUT}/look2-calm.png` });
// 搅水(原地跳入跳出;相机钉死防画面平移污染对拍)
await p.evaluate((cx, cy) => {
  const g = window.__swGame;
  const pl = g.player;
  window.__kick = setInterval(() => { pl.vy = -3.2; pl.vx = 0; }, 250);
  window.__pin = setInterval(() => {
    g.camera.x = cx; g.camera.y = cy;
    if (pl.x < cx - 60) { pl.x = cx - 40; pl.vx = 0; }
    if (pl.x > cx + 60) { pl.x = cx + 40; pl.vx = 0; }
  }, 16);
}, CX, CY);
await new Promise(r => setTimeout(r, 3000));
for (let i = 0; i < 8; i++) {
  await p.screenshot({ path: `${OUT}/look2-splash-${i}.png` });
  await new Promise(r => setTimeout(r, 220));
}
await p.evaluate(() => { clearInterval(window.__kick); clearInterval(window.__pin); });
await new Promise(r => setTimeout(r, 1200));
await p.screenshot({ path: `${OUT}/look2-after.png` });
// q0 对照
await p.evaluate(async () => {
  const o = await import('/src/core/Options.ts');
  o.options.data.waveQuality = 0;
});
await new Promise(r => setTimeout(r, 900));
await p.screenshot({ path: `${OUT}/look2-q0.png` });
const warp = await p.evaluate(async () => {
  const liq = await import('/src/render/VanillaLiquidRenderer.ts');
  return liq.liquidDebugState().warp;
});
console.log('warp:', JSON.stringify(warp), 'pageerrors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
