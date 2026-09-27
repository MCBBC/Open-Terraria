// ★生命水晶实机目视取证 v2:实机跑帧(pump,running=true),三臂各拍水晶区截屏。
//   A=2D(bgl=0) / B1(bgl=1,shim=0) / C=acc(缺省)。NPC 清场防遮挡。
// 运行: SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs --timeout=600000 scripts/_lifeheart-live-shot.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
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
await page.evaluate(() => { window.__swGame.running = false; });
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
});

// 场景:地表清场放水晶(同前),清 TownNPC,玩家放旁边
const spot = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const HEART = tiles.TILE_BY_KEY['crystal_heart'];
  const SOLID = tiles.TILE_BY_KEY['stone'];
  const cx = 760, cy = 260;
  for (let y = cy - 5; y <= cy + 3; y++) for (let x = cx - 7; x <= cx + 6; x++) {
    const i = st.idx(x, y);
    if (st.flags[i]) st.setTileSilent(x, y, 0, 0, 0);
    st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = cx - 7; x <= cx + 6; x++) { st.setTileSilent(x, cy + 2, SOLID, 1, 1); st.setTileSilent(x, cy + 3, SOLID, 1, 1); }
  st.setTileSilent(cx - 1, cy - 1, HEART, 0, 0);
  st.setTileSilent(cx, cy - 1, HEART, 18, 0);
  st.setTileSilent(cx - 1, cy, HEART, 0, 18);
  st.setTileSilent(cx, cy, HEART, 18, 18);
  // 清 TownNPC(防站位遮挡)——TownNPC 落 entities.npcs 桶
  try { g.entities.npcs.length = 0; } catch { /* */ }
  try { g.entities.critters.length = 0; } catch { /* */ }
  // 玩家放远处(30 格左下),防向导跟到水晶位
  for (let y = cy; y <= cy + 6; y++) for (let x = cx - 34; x <= cx - 26; x++) {
    const i = st.idx(x, y);
    if (st.flags[i]) st.setTileSilent(x, y, 0, 0, 0);
  }
  for (let x = cx - 34; x <= cx - 26; x++) { st.setTileSilent(x, cy + 5, SOLID, 1, 1); st.setTileSilent(x, cy + 6, SOLID, 1, 1); }
  g.player.x = (cx - 30) * 16; g.player.y = (cy + 5) * 16 - 42;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
  g.lighting.dirty = true;
  window.__spot = { cx, cy };
  // 校验水晶 4 格在位
  const chk4 = [[cx - 1, cy - 1], [cx, cy - 1], [cx - 1, cy], [cx, cy]].map(([x, y]) => {
    const i = st.idx(x, y);
    return { x, y, type: st.type[i], flags: st.flags[i], fx: st.frameX[i], fy: st.frameY[i] };
  });
  return { cx, cy, chk4, spawnX: g.world.spawnX, spawnY: g.world.spawnY };
});
console.log('spot', JSON.stringify(spot));

// 相机缓动收敛到玩家附近 → 手工钉相机:每帧覆写相机(防漂移)
for (let i = 0; i < 40; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    const { cx, cy } = window.__spot;
    g.camera.x = cx * 16 + 8; g.camera.y = cy * 16 + 8;
    try { g.entities.npcs.length = 0; } catch { /* */ }
  });
  await pump(page, 1);
}

// 三臂 × 3 动画相,各拍水晶区(相机钉死,每帧覆写)
const Z = 4;
for (const [tag, bgl, shim] of [['A', false, false], ['B', true, false], ['C', true, true]]) {
  await page.evaluate((b, s) => window.__set(b, s), bgl, shim);
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      const { cx, cy } = window.__spot;
      g.camera.x = cx * 16 + 8; g.camera.y = cy * 16 + 8;
      try { g.entities.npcs.length = 0; } catch { /* */ }
    });
    await pump(page, 1);
  }
  for (let k = 0; k < 3; k++) {
    await page.evaluate((n) => window.__setTick(180 + n * 24), k);
    // 泵 3 帧让该动画相生效(每帧钉相机)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const g = window.__swGame;
        const { cx, cy } = window.__spot;
        g.camera.x = cx * 16 + 8; g.camera.y = cy * 16 + 8;
        try { g.entities.npcs.length = 0; } catch { /* */ }
      });
      await pump(page, 1);
    }
    await page.evaluate((n) => window.__setTick(180 + n * 24), k);
    await pump(page, 1);
    const fin = await page.evaluate(async () => {
      const g = window.__swGame;
      const cam = g.camera;
      const { cx, cy } = window.__spot;
      const cv = g.renderer.canvas;
      const [sx0, sy0] = cam.worldToScreen(cx * 16 - 36, cy * 16 - 36);
      const [sx1, sy1] = cam.worldToScreen(cx * 16 + 52, cy * 16 + 52);
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
    const buf = Buffer.from(fin.b64, 'base64');
    const png = new PNG({ width: fin.w * Z, height: fin.h * Z });
    for (let y = 0; y < fin.h * Z; y++) for (let x = 0; x < fin.w * Z; x++) {
      const si = ((y / Z | 0) * fin.w + (x / Z | 0)) * 4;
      const di = (y * fin.w * Z + x) * 4;
      png.data[di] = buf[si]; png.data[di + 1] = buf[si + 1]; png.data[di + 2] = buf[si + 2]; png.data[di + 3] = 255;
    }
    writeFileSync(`${OUT}/live2-${tag}${k}.png`, PNG.sync.write(png));
    if (k === 0) {
      const full = await page.evaluate(() => {
        const cv = window.__swGame.renderer.canvas;
        const off = document.createElement('canvas');
        off.width = cv.width; off.height = cv.height;
        const c = off.getContext('2d', { willReadFrequently: true });
        c.drawImage(cv, 0, 0);
        const d = c.getImageData(0, 0, cv.width, cv.height).data;
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
        return { w: cv.width, h: cv.height, b64: btoa(bin) };
      });
      const fb = Buffer.from(full.b64, 'base64');
      const fp = new PNG({ width: full.w, height: full.h });
      for (let i = 0; i < full.w * full.h * 4; i++) fp.data[i] = fb[i];
      fp.data[3] = 255;
      writeFileSync(`${OUT}/live2-${tag}-full.png`, PNG.sync.write(fp));
    }
    if (tag === 'A') {
      writeFileSync(`${OUT}/live2-${k}.b64`, fin.b64);
      writeFileSync(`${OUT}/live2-${k}-meta.json`, JSON.stringify({ w: fin.w, h: fin.h }));
    } else {
      writeFileSync(`${OUT}/live2-${tag}-${k}.b64`, fin.b64);
    }
  }
}
// 对比 + 差异放大图
for (let k = 0; k < 3; k++) {
  const meta = JSON.parse(readFileSync(`${OUT}/live2-${k}-meta.json`, 'utf8'));
  const A = Buffer.from(readFileSync(`${OUT}/live2-${k}.b64`, 'base64'));
  for (const tag of ['B', 'C']) {
    const X = Buffer.from(readFileSync(`${OUT}/live2-${tag}-${k}.b64`, 'base64'));
    let n = 0, maxd = 0, minx = 1e9, miny = 1e9, maxx = -1, maxy = -1;
    for (let y = 0; y < meta.h; y++) for (let x = 0; x < meta.w; x++) {
      const i = (y * meta.w + x) * 4;
      const d = Math.max(Math.abs(A[i] - X[i]), Math.abs(A[i + 1] - X[i + 1]), Math.abs(A[i + 2] - X[i + 2]));
      if (d > 8) { n++; if (d > maxd) maxd = d; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
    console.log(`tick${k} ${tag} vs A: n=${n} maxd=${maxd} bbox=${n ? minx + ',' + miny + '-' + maxx + ',' + maxy : '-'} (box ${meta.w}x${meta.h})`);
  }
}
console.log('DONE');
await browser.close();
