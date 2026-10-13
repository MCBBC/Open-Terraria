// ★gladd 试点四疑点诊断（2026-10-14,_gladd-coat-ab 首轮 6 FAIL 定位）:
//   D1 zoom1.27 A/B 差 48px+maxΔ126:diff 像素逐个 dump（tie 交换 or 系统偏移?）
//   D2 zoom1.27 A'≠A:A 臂非幂等——差在哪些像素（NPC 漂移 or glow 内容变?）
//   D3 洞穴 glow 页缺席（empty=+3）:coat 位/readback/chunks.get().glow 三查
//   D4 重力帧 GL 会话照走（gl=+4）:逐帧 gravDir/_c10e* 状态+stats 流水
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?gladd=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });

await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__gladdSet = (v) => { r.constructor.gladd = v; };
  window.__gladdState = () => ({ flag: r.constructor.gladd, stats: { ...r.gladdCoatStats } });
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => {
    g.player.x = x; g.player.y = y;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2;
  };
  window.__paintGlow = (block, wall) => {
    const st = g.world.store;
    const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16);
    let n = 0;
    for (let dy = -6; dy <= 2; dy++) for (let dx = -10; dx <= 10; dx++) {
      const x = px + dx, y = py + dy;
      if (x < 1 || y < 1 || x >= st.w - 1 || y >= st.h - 1) continue;
      const i = st.idx(x, y);
      const before = st.coat[i];
      const c = before | (block ? 8 : 0) | (wall ? 16 : 0);
      if (c !== before) { st.coat[i] = c; n++; }
    }
    const ch = g.chunks;
    for (let cy = Math.floor((py - 6) / 16); cy <= Math.floor((py + 2) / 16); cy++)
      for (let cx = Math.floor((px - 10) / 16); cx <= Math.floor((px + 10) / 16); cx++)
        ch.markDirty(cx, cy);
    window.__glowPt = { px, py };
    return n;
  };
  // D3:glow 页在位检查（覆盖 chunk 的 pair.glow 有无+coat 位 readback）
  window.__glowPageCheck = () => {
    const st = g.world.store;
    const ch = g.chunks;
    const { px, py } = window.__glowPt;
    const out = { coatSamples: [], pages: [] };
    for (const [dx, dy] of [[-5, -3], [0, 0], [5, -1], [-8, -5], [9, 1]]) {
      const x = px + dx, y = py + dy;
      out.coatSamples.push({ x, y, coat: st.coat[st.idx(x, y)] });
    }
    for (let cy = Math.floor((py - 6) / 16); cy <= Math.floor((py + 2) / 16); cy++)
      for (let cx = Math.floor((px - 10) / 16); cx <= Math.floor((px + 10) / 16); cx++) {
        const p = ch.get(cx, cy);
        out.pages.push({ cx, cy, glow: !!p?.glow, cell: p?.cell });
      }
    return out;
  };
  // D4:逐帧状态流水
  window.__frameProbe = () => ({
    gravDir: g.player.gravDir,
    c10eFrame: r._c10eFrame,
    wToHud: r._c10eWorldToHud,
    composited: r._c10eComposited,
    fullbright: r.fullbright,
    stats: { ...r.gladdCoatStats },
  });
  window.__grav = (v) => { g.player.gravDir = v; };
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false; m.options.data.waveQuality = 0;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await page.evaluate(() => import('/src/render/JudderSmooth.ts').then((m) => m.judderSmoothSetForTest(false)));
await pump(page, 60);
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 1; }));
await page.evaluate(() => window.__pause(true));
await waitFrame(8);

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) await page.evaluate(() => {
    const g = window.__swGame;
    window.__vnow = (window.__vnow || performance.now()) + 16.6667;
    g.frame(window.__vnow);
  });
}
async function snap() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}
/** diff 像素 dump（前 npx 个:x,y,A rgba,B rgba） */
async function diffDump(a, b, maxShow = 10) {
  return page.evaluate(({ a, b, maxShow }) => {
    const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
    const P = dec(a.b64), Q = dec(b.b64);
    const W = a.w;
    const px = [];
    let n = 0, maxd = 0;
    for (let i = 0; i < P.length; i += 4) {
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]), Math.abs(P[i + 3] - Q[i + 3]));
      if (dd > 0) {
        n++; if (dd > maxd) maxd = dd;
        if (px.length < maxShow) px.push({
          x: (i >> 2) % W, y: (i >> 2) / W | 0, dd,
          a: [P[i], P[i + 1], P[i + 2], P[i + 3]], b: [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]],
        });
      }
    }
    return { n, maxd, px };
  }, { a, b, maxShow });
}

// ===== D1/D2:zoom1.27 A/B/A' diff 像素 dump =====
console.log('===== D1/D2 zoom1.27 =====');
await page.evaluate(() => { window.__paintGlow(true, true); });
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await page.evaluate((zz) => { window.__swGame.camera.setZoomTarget(zz); }, 1.27);
await page.evaluate(() => window.__pause(false));
await pump(page, 80);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await page.evaluate(() => window.__gladdSet(false));
await waitFrame(4);
await page.evaluate((n) => window.__setTick(900 + n), 0);
await waitFrame(1);
const A0 = await snap();
await page.evaluate(() => window.__gladdSet(true));
await waitFrame(5);
await page.evaluate((n) => window.__setTick(900 + n), 0);
await waitFrame(1);
const B0 = await snap();
await page.evaluate(() => window.__gladdSet(false));
await waitFrame(4);
await page.evaluate((n) => window.__setTick(900 + n), 0);
await waitFrame(1);
const A2 = await snap();
console.log('D1 A/B:', JSON.stringify(await diffDump(A0, B0)));
console.log('D2 A\'/A:', JSON.stringify(await diffDump(A2, A0)));

// ===== D3:洞穴 glow 页 =====
console.log('===== D3 洞穴 =====');
await page.evaluate(() => {
  const g = window.__swGame;
  const gy = (g.world.groundLevel ?? 300) + 48;
  window.__teleport(g.player.x, gy * 16);
});
await pump(page, 40);
const paintN = await page.evaluate(() => window.__paintGlow(true, true));
await pump(page, 40);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
console.log('D3 paintN=' + paintN, JSON.stringify(await page.evaluate(() => window.__glowPageCheck())));

// ===== D4:重力帧逐帧状态流水 =====
console.log('===== D4 重力 =====');
await page.evaluate(() => window.__teleport(window.__swGame.player.x, (window.__swGame.world.groundLevel ?? 300) * 16 - 80));
await pump(page, 30);
await page.evaluate(() => window.__pause(true));
await waitFrame(4);
await page.evaluate(() => window.__grav(-1));
const flow = [];
for (let i = 0; i < 8; i++) {
  await waitFrame(1);
  flow.push(await page.evaluate(() => window.__frameProbe()));
}
console.log('D4 流水（flag=on 8 帧）:');
for (const f of flow) console.log(' ', JSON.stringify(f));
await page.evaluate(() => window.__grav(1));

await browser.close();
console.log('DIAG DONE');
