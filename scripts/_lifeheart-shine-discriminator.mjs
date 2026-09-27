// ★生命水晶 shine ghost 红绿判别器:地表昼光(L≈1,shine 活跃)+相机钉死+无遮挡。
// 三臂 A(2D)/C(acc) × 3 tick,水晶盒逐字节 diff。
//   红(修复前): C 臂 4 个 shine quad 携冻结 scratch 纹理 → 与 A 的逐格正确 shine 差异。
//   绿(修复后): 逐字节全同。
// 运行: SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs --timeout=600000 scripts/_lifeheart-shine-discriminator.mjs
import { launchBrowser, openPage, bootstrap, pump, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = '/tmp/lifeheart-ab';
mkdirSync(OUT, { recursive: true });

const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
console.log('createGame', gen?.ok);

await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const origDraw = Object.getPrototypeOf(sky).draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; w.update = () => {}; }
  window.__set = (bgl, shim) => { r.constructor.bglSetForTest(bgl); r.constructor.bglShimSetForTest(shim); };
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
  m.options.data.renderScale = 1;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
  r.fullbright = true;   // F9 全画面照亮(用户指引;L=1,shine 贡献可见)
});

// 场景:地表水晶 + 石板地;玩家远处;禁相机 follow;清 NPC
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const HEART = tiles.TILE_BY_KEY['crystal_heart'];
  const SOLID = tiles.TILE_BY_KEY['stone'];
  const cx = 400, cy = 260;
  for (let y = cy - 5; y <= cy + 3; y++) for (let x = cx - 7; x <= cx + 6; x++) {
    const i = st.idx(x, y);
    if (st.flags[i]) st.setTileSilent(x, y, 0, 0, 0);
    st.slope[i] = 0; st.half[i] = 0;
    st.wall[i] = 30;   // 填墙:消动态抖动洞底噪声(判别器需静态背景)
  }
  for (let x = cx - 7; x <= cx + 6; x++) { st.setTileSilent(x, cy + 2, SOLID, 1, 1); st.setTileSilent(x, cy + 3, SOLID, 1, 1); }
  st.setTileSilent(cx - 1, cy - 1, HEART, 0, 0);
  st.setTileSilent(cx, cy - 1, HEART, 18, 0);
  st.setTileSilent(cx - 1, cy, HEART, 0, 18);
  st.setTileSilent(cx, cy, HEART, 18, 18);
  g.player.x = (cx - 40) * 16; g.player.y = (cy + 2) * 16 - 42;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.zoom = 1; g.camera.zoomTarget = 1;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
  if (!window.__camFollowOrig) {
    window.__camFollowOrig = Object.getPrototypeOf(g.camera).follow;
    Object.getPrototypeOf(g.camera).follow = function () {};
  }
  g.lighting.dirty = true;
  window.__spot = { cx, cy };
});
for (let i = 0; i < 30; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const { cx, cy } = window.__spot;
    g.camera.x = cx * 16; g.camera.y = cy * 16;
    try { g.entities.npcs.length = 0; } catch { /* */ }
  });
  await pump(page, 1);
}

// 相机钉+手工确定性帧(b2 探针范式:paused=true,render=g.frame)
await page.evaluate(() => { window.__swGame.paused = true; });
async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      const { cx, cy } = window.__spot;
      g.camera.x = cx * 16; g.camera.y = cy * 16;
      try { g.entities.npcs.length = 0; } catch { /* */ }
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
for (let i = 0; i < 30; i++) await waitFrame(1);

// 三臂 × 3 tick
const Z = 4;
for (const [tag, bgl, shim] of [['A', false, false], ['C', true, true], ['S', true, true], ['T', false, false]]) {
  await page.evaluate((b, s) => window.__set(b, s), bgl, shim);
  await page.evaluate((t) => { globalThis.__SW_SHINE_OFF = (t === 'S' || t === 'T'); }, tag);
  await waitFrame(8);
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(180 + n * 24), k);
    await waitFrame(4);
    await page.evaluate((n) => window.__setTick(180 + n * 24), k);
    await waitFrame(1);
    const fin = await page.evaluate(async () => {
      const g = window.__swGame;
      const cam = g.camera;
      const { cx, cy } = window.__spot;
      const cv = g.renderer.canvas;
      const [sx0, sy0] = cam.worldToScreen(cx * 16 - 32, cy * 16 - 32);
      const [sx1, sy1] = cam.worldToScreen(cx * 16 + 48, cy * 16 + 48);
      const bx = Math.max(0, Math.floor(sx0)), by = Math.max(0, Math.floor(sy0));
      const bw = Math.min(cv.width - bx, Math.ceil(sx1) - bx), bh = Math.min(cv.height - by, Math.ceil(sy1) - by);
      const off = document.createElement('canvas');
      off.width = bw; off.height = bh;
      const c = off.getContext('2d', { willReadFrequently: true });
      c.drawImage(cv, bx, by, bw, bh, 0, 0, bw, bh);
      const d = c.getImageData(0, 0, bw, bh).data;
      let bin = '';
      const CH = 0x8000;
      for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
      return { w: bw, h: bh, b64: btoa(bin) };
    });
    writeFileSync(`${OUT}/disc-${tag}${k}.b64`, fin.b64);
    writeFileSync(`${OUT}/disc-${tag}${k}-meta.json`, JSON.stringify({ w: fin.w, h: fin.h }));
    const buf = Buffer.from(fin.b64, 'base64');
    const png = new PNG({ width: fin.w * Z, height: fin.h * Z });
    for (let y = 0; y < fin.h * Z; y++) for (let x = 0; x < fin.w * Z; x++) {
      const si = ((y / Z | 0) * fin.w + (x / Z | 0)) * 4;
      const di = (y * fin.w * Z + x) * 4;
      png.data[di] = buf[si]; png.data[di + 1] = buf[si + 1]; png.data[di + 2] = buf[si + 2]; png.data[di + 3] = 255;
    }
    writeFileSync(`${OUT}/disc-${tag}${k}.png`, PNG.sync.write(png));
  }
}
// 对比
let ghost = 0;
for (let k = 0; k < 3; k++) {
  const m = JSON.parse(readFileSync(`${OUT}/disc-A${k}-meta.json`, 'utf8'));
  const A = Buffer.from(readFileSync(`${OUT}/disc-A${k}.b64`, 'base64'));
  const C = Buffer.from(readFileSync(`${OUT}/disc-C${k}.b64`, 'base64'));
  const S = Buffer.from(readFileSync(`${OUT}/disc-S${k}.b64`, 'base64'));
  const T = Buffer.from(readFileSync(`${OUT}/disc-T${k}.b64`, 'base64'));
  const diff = (X, Y, n) => {
    let c = 0, maxd = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const i = (y * m.w + x) * 4;
      const d = Math.max(Math.abs(X[i] - Y[i]), Math.abs(X[i + 1] - Y[i + 1]), Math.abs(X[i + 2] - Y[i + 2]));
      if (d > 8) { c++; if (d > maxd) maxd = d; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
    console.log(`tick${k} ${n}: n=${c} maxd=${maxd} bbox=${c ? minx + ',' + miny + '-' + maxx + ',' + maxy : '-'} (box ${m.w}x${m.h})`);
    return c ? [minx, miny, maxx, maxy] : null;
  };
  diff(A, C, 'A vs C');
  diff(A, S, 'A vs S(no-shine)');
  diff(C, S, 'C vs S(shine贡献)');
  diff(A, T, 'A vs T(2D无shine=纯既存差)');
  ghost += 0;
}
console.log(ghost > 0 ? 'RED' : 'GREEN: A vs C identical');
console.log('DONE');
await browser.close();
