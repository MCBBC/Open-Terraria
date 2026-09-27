// ★生命水晶(放置态,crystal_heart=vanilla tile 12) shim 链渲染 AB 对拍(2026-09-27) v3。
// 症状:缺省(bgl+bglshim+b2b acc)下水晶带暗色底框/背景盒;?bglshim=0 干净。
// 方法论=_b2-entity-ab 单页三臂(__set 翻面)+手工确定性帧+逐字节 census。
//   A=2D 真值(0,0) / B1=bgl 桥(1,0) / B2b=acc 累积(1,1)。
// 两景: 地表昼光 + 地下洞(天然墙)。
// 运行: SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs --timeout=900000 scripts/_lifeheart-bglshim-ab.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const OUT = '/tmp/lifeheart-ab';
mkdirSync(OUT, { recursive: true });
const results = [];
const chk = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const DPR = Number(process.env.SW_DPR || 1);
const browser = await launchBrowser({ viewport: { width: 1280, height: 800, deviceScaleFactor: DPR } });
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const origDraw = Object.getPrototypeOf(sky).draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* 域差异 */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__set = (bgl, shim) => { r.constructor.bglSetForTest(bgl); r.constructor.bglShimSetForTest(shim); };
  window.__shimState = () => ({ bgl: r.constructor.bgl, shim: r.constructor.bglShim, path: r.bglPathUsed, acc: r._accMode, stats: r.bglShimStats() });
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
  window.__pause = (v) => { g.paused = v; };
});
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const fixed = 60_000;
  Object.defineProperty(r, '_liquidNow', { get: () => fixed, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));

// ---- 场景搭建:地表水晶 + 地下洞水晶 ----
const spots = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const HEART = tiles.TILE_BY_KEY['crystal_heart'];
  const SOLID = tiles.TILE_BY_KEY['stone'];
  const out = {};
  // ① 地表 (400,260):清场+石板地+玩家
  {
    const cx = 400, cy = 260;
    for (let y = cy - 4; y <= cy + 3; y++) for (let x = cx - 6; x <= cx + 5; x++) {
      const i = st.idx(x, y);
      if (st.flags[i]) st.setTileSilent(x, y, 0, 0, 0);
      st.slope[i] = 0; st.half[i] = 0;
    }
    for (let x = cx - 6; x <= cx + 5; x++) { st.setTileSilent(x, cy + 2, SOLID, 1, 1); st.setTileSilent(x, cy + 3, SOLID, 1, 1); }
    st.setTileSilent(cx - 1, cy - 1, HEART, 0, 0);
    st.setTileSilent(cx, cy - 1, HEART, 18, 0);
    st.setTileSilent(cx - 1, cy, HEART, 0, 18);
    st.setTileSilent(cx, cy, HEART, 18, 18);
    out.surf = { cx, cy };
  }
  // ② 地下洞: 找 4×4 空+墙域
  {
    let found = false;
    for (let y = 380; y < 560 && !found; y++) {
      for (let x = 340; x < 460 && !found; x++) {
        let ok = true;
        for (let dy = -1; dy <= 4 && ok; dy++) for (let dx = -1; dx <= 4 && ok; dx++) {
          const j = st.idx(x + dx, y + dy);
          if (st.flags[j] || st.wall[j] === 0) ok = false;
        }
        if (!ok) continue;
        st.setTileSilent(x, y, HEART, 0, 0);
        st.setTileSilent(x + 1, y, HEART, 18, 0);
        st.setTileSilent(x, y + 1, HEART, 0, 18);
        st.setTileSilent(x + 1, y + 1, HEART, 18, 18);
        out.cave = { cx: x, cy: y, wall: st.wall[st.idx(x, y)] };
        found = true;
      }
    }
  }
  g.lighting.dirty = true;
  window.__spots = out;
  return out;
});
chk('scene setup', !!spots?.surf && !!spots?.cave, JSON.stringify(spots));

// 玩家站地表地板上;相机对地表水晶;泵收敛
await page.evaluate(({ spots }) => {
  const g = window.__swGame;
  const { cx, cy } = spots.surf;
  g.player.x = (cx + 2) * 16; g.player.y = (cy + 2) * 16 - 42;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
}, { spots });
for (let i = 0; i < 60; i++) await pump(page, 1);
await page.evaluate(() => window.__pause(true));
const camSurf = await page.evaluate(() => { const g = window.__swGame; return { x: g.camera.x, y: g.camera.y, z: g.camera.zoom }; });

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}

async function snapFin() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}

// census: 全帧可选窗;返回 node 侧可渲染差异缓冲
async function census(aFin, bFin, region) {
  return page.evaluate(({ a, b, region }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const W = a.w, H = a.h;
    const rx0 = region ? Math.max(0, region[0]) : 0, ry0 = region ? Math.max(0, region[1]) : 0;
    const rx1 = region ? Math.min(W, region[2]) : W, ry1 = region ? Math.min(H, region[3]) : H;
    for (let py = ry0; py < ry1; py++) {
      for (let px = rx0; px < rx1; px++) {
        const i = (py * W + px) * 4;
        const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]),
          Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
        if (dd > 0) {
          n++;
          if (dd > maxd) maxd = dd;
          if (px < x0) x0 = px; if (px > x1) x1 = px;
          if (py < y0) y0 = py; if (py > y1) y1 = py;
        }
      }
    }
    const area = (rx1 - rx0) * (ry1 - ry0);
    return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null, area, pct: +(100 * n / area).toFixed(3) };
  }, { a: aFin, b: bFin, region: region ?? null });
}

// 水晶屏幕窗(世界盒→屏幕;以相机 zoom 换算,留 24px 余量)
async function crystalScreenBox(spot) {
  return page.evaluate(({ spot }) => {
    const g = window.__swGame;
    const cam = g.camera;
    const [sx0, sy0] = cam.worldToScreen(spot.cx * 16 - 24, spot.cy * 16 - 24);
    const [sx1, sy1] = cam.worldToScreen(spot.cx * 16 + 40, spot.cy * 16 + 40);
    return [Math.floor(sx0), Math.floor(sy0), Math.ceil(sx1), Math.ceil(sy1)];
  }, { spot });
}

async function phase3(label, box, ticks = 3) {
  const fins = {};
  const arms = [['A', false, false], ['B1', true, false], ['B2', true, true]];
  for (const [tag, bgl, shim] of arms) {
    await page.evaluate((b, s) => window.__set(b, s), bgl, shim);
    await waitFrame(6);
    for (let k = 0; k < ticks; k++) {
      await page.evaluate((n) => window.__setTick(500 + n), k);
      await waitFrame(1);
      fins[tag + k] = await snapFin();
    }
  }
  const st = await page.evaluate(() => window.__shimState());
  console.log(`  [${label}] state=`, JSON.stringify(st));
  for (let k = 0; k < ticks; k++) {
    const cAB = await census(fins['A' + k], fins['B1' + k], box);
    const cAC = await census(fins['A' + k], fins['B2' + k], box);
    const cAF = await census(fins['A' + k], fins['B2' + k], null);
    console.log(`  tick${k}: crystalBox B1 vs A n=${cAB.n} | B2b vs A n=${cAC.n} maxd=${cAC.maxd} bbox=${JSON.stringify(cAC.bbox)} | full B2b vs A n=${cAF.n} bbox=${JSON.stringify(cAF.bbox)}`);
    if (k === 0) {
      writeFileSync(`${OUT}/${label}-A0.b64`, fins['A0'].b64);
      writeFileSync(`${OUT}/${label}-B20.b64`, fins['B20'].b64);
      writeFileSync(`${OUT}/${label}-B10.b64`, fins['B10'].b64);
      writeFileSync(`${OUT}/${label}-meta.json`, JSON.stringify({ w: fins.A0.w, h: fins.A0.h, box }));
    }
  }
  return fins;
}

// ---- 相 1: 地表 ----
const boxSurf = await crystalScreenBox(spots.surf);
console.log('surf crystal screen box:', JSON.stringify(boxSurf), 'cam', JSON.stringify(camSurf));
await phase3('surf', boxSurf);

// ---- 相 2: 地下洞(相机移到洞穴水晶) ----
await page.evaluate(({ spots }) => {
  const g = window.__swGame;
  const { cx, cy } = spots.cave;
  g.player.x = cx * 16; g.player.y = cy * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
  g.lighting.dirty = true;
}, { spots });
for (let i = 0; i < 60; i++) await pump(page, 1);
await page.evaluate(() => window.__pause(true));
const boxCave = await crystalScreenBox(spots.cave);
console.log('cave crystal screen box:', JSON.stringify(boxCave));
await phase3('cave', boxCave);

// ---- 相 3: 水晶闪光尘(placement sparkle dust 43 粉色 α254 scale0.5;Game.ts:44814 同族) ----
// 回到地表水晶;钉帧;在水晶区确定性撒尘(暂停态尘不动,渲染每帧都画)
await page.evaluate(({ spots }) => {
  const g = window.__swGame;
  const { cx, cy } = spots.surf;
  g.camera.zoom = 1; g.camera.zoomTarget = 1;
  g.player.x = (cx + 2) * 16; g.player.y = (cy + 2) * 16 - 42;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
  g.lighting.dirty = true;
  window.__spawnHeartDust = () => {
    const vd = g.renderer.vanillaDust;
    if (!vd) return 0;
    let n = 0;
    // 水晶 2×2 格盒 ± 环:40 粒,type 43,粉 #AE1845,α254,scale0.5(与放置水晶闪光同参)
    for (let i = 0; i < 40; i++) {
      const dx = (i % 8) * 4 - 14;
      const dy = ((i >> 3) % 5) * 4 - 12;
      const d = vd.spawn((cx - 1) * 16 + 8 + dx, (cy - 1) * 16 + 8 + dy, 16, 16, 43, 0, 0, 254,
        { r: 174, g: 24, b: 69, a: 255 }, 0.5);
      if (d) n++;
    }
    return n;
  };
}, { spots });
for (let i = 0; i < 30; i++) await pump(page, 1);
await page.evaluate(() => window.__pause(true));
const nd = await page.evaluate(() => window.__spawnHeartDust());
console.log('spawned heart dust:', nd);
const boxDust = await crystalScreenBox(spots.surf);
await phase3('dust', boxDust, 2);

// ---- 相 5: renderScale(低清档 wK<1;自动档饥饿阶梯 0.75/0.66/0.5) ----
for (const rs of [0.75, 0.66, 0.5]) {
  await page.evaluate((v) => {
    const g = window.__swGame;
    const { cx, cy } = window.__spots.surf;
    return import('/src/core/Options.ts').then((m) => {
      m.options.data.renderScale = v;
      m.options.data.renderScaleAuto = false;
      g.camera.zoom = 1; g.camera.zoomTarget = 1;
      g.player.x = (cx + 2) * 16; g.player.y = (cy + 2) * 16 - 42;
      g.camera.x = cx * 16; g.camera.y = cy * 16;
      g.lighting.dirty = true;
    });
  }, rs);
  for (let i = 0; i < 40; i++) await pump(page, 1);
  await page.evaluate(() => window.__pause(true));
  const boxR = await crystalScreenBox(spots.surf);
  console.log(`renderScale ${rs} crystal screen box:`, JSON.stringify(boxR));
  await phase3(`rs${String(rs).replace('.', '_')}`, boxR, 2);
  await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));
}
// ---- 相 4: 缩放扫(地表水晶;zoom 1.25/1.5625/0.75) ----
for (const zm of [1.25, 1.5625, 0.75]) {
  await page.evaluate((z) => {
    const g = window.__swGame;
    const { cx, cy } = window.__spots.surf;
    g.camera.setZoomTarget(z);
    g.camera.zoom = z; g.camera.zoomTarget = z;
    g.player.x = (cx + 2) * 16; g.player.y = (cy + 2) * 16 - 42;
    g.camera.x = cx * 16; g.camera.y = cy * 16;
    g.lighting.dirty = true;
  }, zm);
  for (let i = 0; i < 40; i++) await pump(page, 1);
  await page.evaluate(() => window.__pause(true));
  const boxZ = await crystalScreenBox(spots.surf);
  console.log(`zoom ${zm} crystal screen box:`, JSON.stringify(boxZ));
  await phase3(`zoom${String(zm).replace('.', '_')}`, boxZ);
}

console.log('DONE ' + JSON.stringify(results));
await browser.close();
