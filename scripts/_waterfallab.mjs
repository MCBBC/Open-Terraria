// _waterfallab:同页同世界 A/B——waveQuality 3(果冻管线开) vs 0(关) 切换对拍。
// 排除两页两世界的液体沉降差异(瀑布存在与否高度依赖液态)。
// 上一版两页对拍发现"warp 构建瀑布消失"——本探针定谳是否为构建差异。
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
  g.liquid.updateLiquid = () => {};   // 冻结液体:两态世界完全一致
}, CX, CY);
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1200));

const setQ = async (q) => {
  await p.evaluate(async (qq) => {
    const o = await import('/src/core/Options.ts');
    o.options.data.waveQuality = qq;
  }, q);
  await new Promise(r => setTimeout(r, 1200));
};
// A: q3 管线开
await setQ(3);
await p.screenshot({ path: `${OUT}/ab-q3.png` });
const warpOn = await p.evaluate(async () => {
  const liq = await import('/src/render/VanillaLiquidRenderer.ts');
  return liq.liquidDebugState().warp;
});
// B: q0 管线关
await setQ(0);
await p.screenshot({ path: `${OUT}/ab-q0.png` });
const warpOff = await p.evaluate(async () => {
  const liq = await import('/src/render/VanillaLiquidRenderer.ts');
  return liq.liquidDebugState().warp;
});
console.log('warp on:', JSON.stringify(warpOn), ' off:', JSON.stringify(warpOff));
console.log('pageerrors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
