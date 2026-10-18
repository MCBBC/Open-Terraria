// _userconfig:复刻用户世界的"半砖+藤蔓+液体"对角构型(报告 dump 2350-2357 × 263-268),
// 逐 tile 1:1 搭建后高倍抓拍——半砖浸润(水体画不上半砖)定谳。
// 用户构型(来自 debug-report tiles.areaCamera):
//   ty=264: 2350/2351=空气+液255(墙0) 2352=藤蔓+液255(墙0) 2353-2355=草坡/草(墙2)
//   ty=265: 2351=草半砖(液0,墙2) 2352/2353/2354=藤蔓+液255(墙2) 2355=草坡4
//   ty=266: 2353=草半砖(液0,墙2) 2354/2355=藤蔓+液255(墙2)
//   ty=267: 2355/2356=藤蔓+液255(墙2) 2357=草坡4
//   ty=268: 2356=草半砖(液0,墙2) 2357=藤蔓(液0)
// 上方(263-):大面积水(空气+液255)。
import { HOME, join } from './_pathlib.mjs';
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
// 找地表空地(非沙漠判定避免琥珀水干扰判定色彩——其实结构判定与色无关,任意地表皆可)
const site = await p.evaluate(() => {
  const g = window.__swGame, w = g.world, st = w.store;
  const sx = w.spawnX, sy = w.spawnY;
  // 找一片 12×12 的地表空气区(上方无遮挡)
  for (let dx = -200; dx <= 200; dx += 4) {
    const x = sx + dx;
    if (x < 60 || x >= st.w - 60) continue;
    for (let dy = -40; dy <= 40; dy += 2) {
      const y = sy + dy;
      if (y < 40 || y >= st.h - 60) continue;
      let ok = true;
      for (let ox = 0; ox < 12 && ok; ox++) {
        for (let oy = 0; oy < 10 && ok; oy++) {
          const i = st.idx(x + ox, y + oy);
          if (st.flags[i] || st.liquid[i] > 0) ok = false;
        }
      }
      if (ok) return { x, y };
    }
  }
  return null;
});
if (!site) { console.log('FAIL: no site'); await b.close(); process.exit(1); }
console.log('site:', JSON.stringify(site));

const cam = await p.evaluate((site) => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5055;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const X = site.x, Y = site.y;
  const GRASS = st.type[st.idx(w.spawnX, w.groundLevel - 20)] || 2;
  // 找藤蔓 type(v_52)——扫现存藤蔓格
  let VINE = 0;
  outer: for (let y = w.groundLevel; y < w.groundLevel + 60 && !VINE; y++) {
    for (let x = 100; x < st.w - 100; x++) {
      const i = st.idx(x, y);
      const d = window.__TILE_DEFS ? null : null;
      if (st.flags[i] && st.type[i] > 100 && st.liquid[i] === 0) { VINE = st.type[i]; break outer; }
    }
  }
  // 直接查 TILE_DEFS(经模块导入在 evaluate 里拿不到——改用 v_52 的 id:搜 defs 键)
  // 简化:用 setTile 放置后读回 type——先放一个已知 solid 做基座,藤蔓用任意 decor type
  // 最稳:导入 data/tiles 的 def 注册表查 key v_52_vines
  return { GRASS, VINE };
}, site);
// 拿藤蔓 type id(导入模块)
const vineId = await p.evaluate(async () => {
  const tiles = await import('/src/data/tiles.ts');
  const defs = tiles.TILE_DEFS;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d && d.vanilla && d.vanilla.sheet === 52) return i;
  }
  return 0;
});
const grassId = await p.evaluate(async () => {
  const tiles = await import('/src/data/tiles.ts');
  const defs = tiles.TILE_DEFS;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d && d.vanilla && d.vanilla.sheet === 2) return i;
  }
  return 0;
});
console.log('vineId:', vineId, 'grassId:', grassId);

const built = await p.evaluate((site, vineId, grassId) => {
  const g = window.__swGame, w = g.world, st = w.store;
  const X = site.x, Y = site.y;
  const setLq = (x, y, v) => { const i = st.idx(x, y); st.liquid[i] = v; st.liquidType[i] = 1; };
  // 清区 + 建地基
  for (let dx = -2; dx <= 14; dx++) {
    for (let dy = -8; dy <= 10; dy++) {
      st.setTile(X + dx, Y + dy, 0);
      st.wall[st.idx(X + dx, Y + dy)] = 0;
      setLq(X + dx, Y + dy, 0);
    }
  }
  // 底盘(269 行起,实心草,墙2)
  for (let dx = -2; dx <= 14; dx++) {
    for (let dy = 7; dy <= 9; dy++) {
      st.setTile(X + dx, Y + dy, grassId);
      st.wall[st.idx(X + dx, Y + dy)] = 2;
    }
  }
  // 用户构型映射:基地 (X+2..X+11) ↔ dump 2350..2359;基行 Y+5 ↔ dump 264
  // ty=263(=Y+4): 大面积水
  for (let dx = 0; dx <= 8; dx++) setLq(X + 2 + dx, Y + 4, 255);
  // ty=264: 2350,2351=air+L; 2352=vine+L; 2353=slope4草; 2354,2355=草
  setLq(X + 2, Y + 5, 255); setLq(X + 3, Y + 5, 255);
  st.setTile(X + 4, Y + 5, vineId); setLq(X + 4, Y + 5, 255);
  st.setTile(X + 5, Y + 5, grassId); st.setSlope(X + 5, Y + 5, 4);
  st.setTile(X + 6, Y + 5, grassId); st.setTile(X + 7, Y + 5, grassId);
  // ty=265: 2351=半砖; 2352-2354=vine+L; 2355=slope4
  st.setTile(X + 3, Y + 6, grassId); st.setHalfBrick(X + 3, Y + 6, true);
  for (let dx = 4; dx <= 6; dx++) { st.setTile(X + dx, Y + 6, vineId); setLq(X + dx, Y + 6, 255); }
  st.setTile(X + 7, Y + 6, grassId); st.setSlope(X + 7, Y + 6, 4);
  // ty=266: 2353=半砖; 2354,2355=vine+L
  st.setTile(X + 5, Y + 7, grassId); st.setHalfBrick(X + 5, Y + 7, true);
  for (let dx = 6; dx <= 7; dx++) { st.setTile(X + dx, Y + 7, vineId); setLq(X + dx, Y + 7, 255); }
  // ty=267: 2355,2356=vine+L
  for (let dx = 7; dx <= 8; dx++) { st.setTile(X + dx, Y + 8, vineId); setLq(X + dx, Y + 8, 255); }
  // ty=268: 2356=半砖; 2357=vine(no lq)
  st.setTile(X + 8, Y + 9, grassId); st.setHalfBrick(X + 8, Y + 9, true);
  st.setTile(X + 9, Y + 9, vineId);
  // 墙2 铺满底部区(265 行以下)
  for (let dx = -2; dx <= 14; dx++) {
    for (let dy = 5; dy <= 9; dy++) {
      if (st.wall[st.idx(X + dx, Y + dy)] === 0) st.wall[st.idx(X + dx, Y + dy)] = 2;
    }
  }
  // 左右实心墙围住水
  for (let dy = 0; dy <= 9; dy++) {
    st.setTile(X + 1, Y + dy, grassId);
    if (dy >= 5) st.wall[st.idx(X + 1, Y + dy)] = 2;
  }
  g.liquid.updateLiquid = () => {};
  // 相机对准构型中心
  const pl = g.player;
  pl.x = (X + 6) * 16 - pl.w / 2; pl.y = (Y + 6) * 16 - pl.h / 2;
  pl.vx = 0; pl.vy = 0;
  window.__pin = setInterval(() => {
    g.camera.x = (X + 6) * 16 + 8; g.camera.y = (Y + 6) * 16 + 8;
  }, 16);
  return 'ok';
}, site, vineId, grassId);
console.log('built:', built);
await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.progress = 30;
});
await new Promise(r => setTimeout(r, 2000));
await p.bringToFront();
await new Promise(r => setTimeout(r, 1000));
await p.screenshot({ path: `${OUT}/userconfig-normal.png` });
const warp1 = await p.evaluate(async () => {
  const liq = await import('/src/render/VanillaLiquidRenderer.ts');
  return liq.liquidDebugState().warp;
});
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 500));
await p.screenshot({ path: `${OUT}/userconfig-bright.png` });
await p.evaluate(() => { window.__swGame.renderer.fullbright = false; });
// q0 对照
await p.evaluate(async () => {
  const o = await import('/src/core/Options.ts');
  o.options.data.waveQuality = 0;
});
await new Promise(r => setTimeout(r, 900));
await p.screenshot({ path: `${OUT}/userconfig-q0.png` });
await p.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise(r => setTimeout(r, 500));
await p.screenshot({ path: `${OUT}/userconfig-q0-bright.png` });
console.log('warp during shot:', JSON.stringify(warp1), 'errors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
