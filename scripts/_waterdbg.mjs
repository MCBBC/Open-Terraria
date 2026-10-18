// _waterdbg:半砖水丢失管道定位——逐中间产物抓拍(bg 离屏水层 / 合成结果 / 主画布)。
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
      for (let ox = 0; ox < 12 && ok; ox++) for (let oy = 0; oy < 10 && ok; oy++) {
        const i = st.idx(x + ox, y + oy);
        if (st.flags[i] || st.liquid[i] > 0) ok = false;
      }
      if (ok) return { x, y };
    }
  }
  return null;
});
const ids = await p.evaluate(async () => {
  const tiles = await import('/src/data/tiles.ts');
  const defs = tiles.TILE_DEFS;
  let vine = 0, grass = 0;
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i];
    if (d && d.vanilla && d.vanilla.sheet === 52) vine = i;
    if (d && d.vanilla && d.vanilla.sheet === 2 && !grass) grass = i;
  }
  return { vine, grass };
});
await p.evaluate((site, ids) => {
  const g = window.__swGame, w = g.world, st = w.store;
  g.world.clock.timeOfDay = 0.5;
  if (w.weather) { w.weather.windSpeedCurrent = 0; w.weather.windSpeedTarget = 0; w.weather.maxRaining = 0; }
  const X = site.x, Y = site.y;
  const setLq = (x, y, v) => { const i = st.idx(x, y); st.liquid[i] = v; st.liquidType[i] = 1; };
  for (let dx = -2; dx <= 14; dx++) for (let dy = -8; dy <= 10; dy++) {
    st.setTile(X + dx, Y + dy, 0); st.wall[st.idx(X + dx, Y + dy)] = 0; setLq(X + dx, Y + dy, 0);
  }
  for (let dx = -2; dx <= 14; dx++) for (let dy = 7; dy <= 9; dy++) {
    st.setTile(X + dx, Y + dy, ids.grass); st.wall[st.idx(X + dx, Y + dy)] = 2;
  }
  for (let dx = 0; dx <= 8; dx++) setLq(X + 2 + dx, Y + 4, 255);
  setLq(X + 2, Y + 5, 255); setLq(X + 3, Y + 5, 255);
  st.setTile(X + 4, Y + 5, ids.vine); setLq(X + 4, Y + 5, 255);
  st.setTile(X + 5, Y + 5, ids.grass); st.setSlope(X + 5, Y + 5, 4);
  st.setTile(X + 6, Y + 5, ids.grass); st.setTile(X + 7, Y + 5, ids.grass);
  st.setTile(X + 3, Y + 6, ids.grass); st.setHalfBrick(X + 3, Y + 6, true);
  for (let dx = 4; dx <= 6; dx++) { st.setTile(X + dx, Y + 6, ids.vine); setLq(X + dx, Y + 6, 255); }
  st.setTile(X + 7, Y + 6, ids.grass); st.setSlope(X + 7, Y + 6, 4);
  st.setTile(X + 5, Y + 7, ids.grass); st.setHalfBrick(X + 5, Y + 7, true);
  for (let dx = 6; dx <= 7; dx++) { st.setTile(X + dx, Y + 7, ids.vine); setLq(X + dx, Y + 7, 255); }
  for (let dx = 7; dx <= 8; dx++) { st.setTile(X + dx, Y + 8, ids.vine); setLq(X + dx, Y + 8, 255); }
  st.setTile(X + 8, Y + 9, ids.grass); st.setHalfBrick(X + 8, Y + 9, true);
  st.setTile(X + 9, Y + 9, ids.vine);
  for (let dx = -2; dx <= 14; dx++) for (let dy = 5; dy <= 9; dy++) {
    if (st.wall[st.idx(X + dx, Y + dy)] === 0) st.wall[st.idx(X + dx, Y + dy)] = 2;
  }
  for (let dy = 0; dy <= 9; dy++) st.setTile(X + 1, Y + dy, ids.grass);
  g.liquid.updateLiquid = () => {};
  const pl = g.player;
  pl.x = (X + 6) * 16 - pl.w / 2; pl.y = (Y + 6) * 16 - pl.h / 2;
  pl.vx = 0; pl.vy = 0;
  window.__pin = setInterval(() => { g.camera.x = (X + 6) * 16 + 8; g.camera.y = (Y + 6) * 16 + 8; }, 16);
  window.__site = { X, Y };
}, site, ids);
await p.evaluate(async () => {
  const m = await import('/src/render/WaterWaves.ts');
  m.waterWaves.progress = 30;
});
await new Promise(r => setTimeout(r, 2500));
await p.bringToFront();
await new Promise(r => setTimeout(r, 800));
// 抓中间产物:合成后的 GL 画布 + 离屏水层(bg/fg)+ lastWaterDrawBounds
const dump = await p.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const ww = r.waterWarp;
  return {
    warpDebug: (function () { return true; })(),
    hasFg: !!(ww && ww.fgCanvas), hasBg: !!(ww && ww.bgCanvas),
    fgSize: ww && ww.fgCanvas ? [ww.fgCanvas.width, ww.fgCanvas.height] : null,
    glCanvas: ww && ww.gl && ww.gl.canvas ? [ww.gl.canvas.width, ww.gl.canvas.height] : null,
    glPath: ww && ww.gl ? { diedAt: ww.gl.diedAt, unavailable: ww.gl.unavailable } : null,
  };
});
console.log('compositor state:', JSON.stringify(dump));
// 截主画布
await p.screenshot({ path: `${OUT}/dbg-main.png` });
// 从合成器抓离屏层(下一帧渲染后通过 hook 抓)——直接读 fgCanvas/bgCanvas 内容转 dataURL 存盘
const layers = await p.evaluate(async () => {
  const g = window.__swGame;
  const r = g.renderer;
  const ww = r.waterWarp;
  const out = {};
  // 等两帧让离屏层重新画好
  await new Promise(rr => setTimeout(rr, 100));
  for (const key of ['bgCanvas', 'fgCanvas']) {
    const c = ww && ww[key];
    if (c) out[key] = c.toDataURL('image/png').length;
  }
  return { keys: Object.keys(out), sizes: out };
});
console.log('layers:', JSON.stringify(layers));
// 导出三层画布内容(经 CDP 太麻烦——用 canvas 拷贝到 DOM 再截图不行;直接 toDataURL 写文件)
const exported = await p.evaluate(async () => {
  const g = window.__swGame;
  const ww = g.renderer.waterWarp;
  const r = g.renderer;
  const results = {};
  // 抓主画布 + 离屏 bg/fg + GL 结果
  const grab = (canvas, name) => {
    if (!canvas) return;
    const data = canvas.toDataURL('image/png');
    results[name] = data.length;
    const a = document.createElement('a');
    a.href = data; a.download = name;
    // 存到 window 供外部读
    window['__dump_' + name] = data;
  };
  grab(ww.bgCanvas, 'bg');
  grab(ww.fgCanvas, 'fg');
  if (ww.gl && ww.gl.canvas) grab(ww.gl.canvas, 'glout');
  grab(r.worldCanvas, 'world');
  return Object.keys(results);
});
console.log('exported:', JSON.stringify(exported));
// 把 dataURL 写回 node 侧
for (const name of ['bg', 'fg', 'glout', 'world']) {
  const ok = await p.evaluate((n) => {
    const d = window['__dump_' + n];
    if (!d) return false;
    window.__lastDump = d;
    return true;
  }, name).catch(() => false);
  if (!ok) { console.log('skip', name); continue; }
  const b64 = await p.evaluate(() => window.__lastDump.split(',', 2)[1]);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`${OUT}/dbg-${name}.png`, Buffer.from(b64, 'base64'));
  console.log('saved dbg-' + name + '.png');
}
console.log('pageerrors:', errs.length);
await b.close();
process.exit(errs.length ? 1 : 0);
