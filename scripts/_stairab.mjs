// _stairab:用户报告3 标注构型(湖岸阶梯+水线+藤蔓)1:1 复刻,warp on/off 逐格对拍。
// 构型取自 debug-report3 tiles dump(2342-2360 × 254-265)。
import { HOME, DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = process.env.SW_OUT || join(HOME, '.claude/jobs/8405c930/tmp');

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
// 找空地
const site = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  const sx = w.spawnX, sy = w.spawnY;
  for (let dx = -200; dx <= 200; dx += 4) {
    const x = sx + dx;
    if (x < 60 || x >= st.w - 60) continue;
    for (let dy = -40; dy <= 40; dy += 2) {
      const y = sy + dy;
      if (y < 40 || y >= st.h - 60) continue;
      let ok = true;
      for (let ox = 0; ox < 22 && ok; ox++) for (let oy = 0; oy < 16 && ok; oy++) {
        const i = st.idx(x + ox, y + oy);
        if (st.flags[i] || st.liquid[i] > 0) ok = false;
      }
      if (ok) return { x, y };
    }
  }
  return null;
});
if (!site) { console.log('FAIL: no site'); await b.close(); process.exit(1); }
const ids = await p.evaluate(async () => {
  const tiles = await import('/src/data/tiles.ts');
  const defs = tiles.TILE_DEFS;
  const id = {};
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (!d || !d.vanilla) continue;
    if (d.vanilla.sheet === 52) id.vine = i;
    if (d.vanilla.sheet === 2 && id.grass === undefined) id.grass = i;
    if (d.vanilla.sheet === 1 && id.dirt === undefined) id.dirt = i;
  }
  return id;
});
console.log('site:', JSON.stringify(site), 'ids:', JSON.stringify(ids));

// 用户构型表(RLE 解码自报告 dump;每格 [sheet, wall, liquid, half, slope] — sheet: -1=air, 2=grass, 52=vine, 0=空无墙)
const CONFIG = await (async () => {
  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync(needInput(join(DOWNLOADS, 'debug-report-浮夸的羡慕顶峰-2026-08-21T04-50-22-095Z.json')), 'utf8'));
  const a = raw.tiles.areaCamera;
  const X0 = a.x0, Y0 = a.y0;
  const grid = [];
  for (const row of a.rows) {
    const toks = [];
    for (const part of row.split(';')) {
      if (part.includes('*')) {
        const [val, cnt] = part.split('*');
        for (let i = 0; i < +cnt; i++) toks.push(val);
      } else toks.push(part);
    }
    grid.push(toks);
  }
  const cells = {};
  for (let ry = 0; ry < a.h; ry++) {
    for (let rx = 0; rx < a.w; rx++) {
      const t = grid[ry][rx];
      const f = t.split(':');
      cells[`${X0 + rx},${Y0 + ry}`] = t === '0' ? null : {
        sheet: +f[0], wall: +f[3], liquid: +f[4], half: +(f[5] || 0), slope: +(f[6] || 0),
      };
    }
  }
  return cells;
})();

const built = await p.evaluate((site, ids, CONFIG) => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const X = site.x, Y = site.y;
  // 基准映射:配置坐标 (2342..2360, 254..265) → 世界 (X..X+18, Y..Y+11)
  const BX = 2342, BY = 254;
  // 清区
  for (let dx = -2; dx <= 22; dx++) for (let dy = -4; dy <= 16; dy++) {
    st.setTile(X + dx, Y + dy, 0);
    st.wall[st.idx(X + dx, Y + dy)] = 0;
    st.liquid[st.idx(X + dx, Y + dy)] = 0;
  }
  // 逐格复刻
  for (const [k, c] of Object.entries(CONFIG)) {
    const [cx, cy] = k.split(',').map(Number);
    const tx = X + (cx - BX), ty = Y + (cy - BY);
    if (tx < 2 || ty < 2 || tx >= st.w - 2 || ty >= st.h - 2) continue;
    const i = st.idx(tx, ty);
    if (!c) continue;
    st.wall[i] = c.wall;
    if (c.liquid > 0) { st.liquid[i] = c.liquid; st.liquidType[i] = 1; }
    if (c.sheet === 2) st.setTile(tx, ty, ids.grass);
    else if (c.sheet === 1) st.setTile(tx, ty, ids.dirt);
    else if (c.sheet === 52) st.setTile(tx, ty, ids.vine);
    if (c.half) st.setHalfBrick(tx, ty, true);
    if (c.slope) st.setSlope(tx, ty, c.slope);
  }
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X + 9) * 16 - pl.w / 2; pl.y = (Y + 6) * 16 - pl.h / 2;
  pl.vx = 0; pl.vy = 0;
  window.__pin = setInterval(() => { g.camera.x = (X + 9) * 16 + 8; g.camera.y = (Y + 6) * 16 + 8; }, 16);
  return 'ok';
}, site, ids, CONFIG);
console.log('built:', built);
await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.progress = 30;
});
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 800));
await p.screenshot({ path: `${OUT}/stair-warp-on.png` });
const warpState = await p.evaluate(async () => {
  const liq = await import('/src/render/VanillaLiquidRenderer.ts');
  return liq.liquidDebugState().warp;
});
// q0 对照
await p.evaluate(async () => {
  const o = await import('/src/core/Options.ts');
  o.options.data.waveQuality = 0;
});
await new Promise(r => setTimeout(r, 900));
await p.screenshot({ path: `${OUT}/stair-warp-off.png` });
console.log('warp:', JSON.stringify(warpState), 'errors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
