// _waterpath:定谳"水体透出背景"空洞路径——GL / 强制2D / 关闭 三态同位对拍。
// 用户视角(种子世界地表湖),抓 warp path + 截图,绿色矩形空洞 = 背景透出。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || '/Users/vinlic/.claude/jobs/8405c930/tmp';
const CX = 37329, CY = 4011;

async function runPage(query, tag) {
  const errs = [];
  const b = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', defaultViewport: { width: 1512, height: 862 },
  });
  const p = await b.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await p.goto(`${ORIGIN}/?play=small${query}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
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
  // 入水涟漪活跃期抓 4 帧 + path
  const shots = [];
  for (let i = 0; i < 4; i++) {
    await p.screenshot({ path: `${OUT}/path-${tag}-${i}.png` });
    const st = await p.evaluate(async () => {
      const liq = await import('/src/render/VanillaLiquidRenderer.ts');
      const w = liq.liquidDebugState().warp;
      const ww = (await import('/src/render/WaterWaves.ts')).waterWaves;
      const out = [0, 0];
      ww.sampleDisplace(37400, 4160, out);
      return { path: w.path, active: w.active, disp: [out[0].toFixed(2), out[1].toFixed(2)] };
    });
    shots.push(st);
    await new Promise(r => setTimeout(r, 250));
  }
  console.log(tag, JSON.stringify(shots), 'errors:', errs.length);
  await b.close();
  return errs.length;
}
const e1 = await runPage('', 'gl');
const e2 = await runPage('&wwarp=2d', '2d');
const e3 = await runPage('&wwarp=0', 'off');
process.exit(e1 || e2 || e3 ? 1 : 0);
