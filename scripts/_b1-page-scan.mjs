import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5209';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 400; g.player.y = g.world.groundLevel * 16 - 40;
  g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x + g.player.w / 2; g.camera.y = g.player.y + g.player.h / 2;
  g.camera.setZoomTarget(1.25);
  const sky = g.renderer.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  g.renderer.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__bglSet = (v) => g.renderer.constructor.bglSetForTest(v);
  window.__pause = (v) => { g.paused = v; };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; }));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await pump(page, 80);
await page.evaluate(() => window.__pause(true));

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) await page.evaluate(() => { const g = window.__swGame; window.__vnow = (window.__vnow || performance.now()) + 16.6667; g.frame(window.__vnow); });
}
async function snapWorld() {
  return page.evaluate(() => {
    const cv = window.__swGame.renderer.worldCanvas;
    const lc = document.createElement('canvas');
    lc.width = cv.width; lc.height = cv.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(cv, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: cv.width, h: cv.height, b64: btoa(bin) };
  });
}
await waitFrame(6);
await page.evaluate(() => window.__bglSet(false));
await waitFrame(1);
const camA = await page.evaluate(() => { const r = window.__swGame.renderer, c = window.__swGame.camera; return { cx: c.x, cy: c.y, z: c.zoom, lw: r._worldLowW, lh: r._worldLowH, k: r._worldLowK }; });
const Aw = await snapWorld();
await page.evaluate(() => window.__bglSet(true));
await waitFrame(5);
await waitFrame(1);
const camB = await page.evaluate(() => { const r = window.__swGame.renderer, c = window.__swGame.camera; return { cx: c.x, cy: c.y, z: c.zoom, lw: r._worldLowW, lh: r._worldLowH, k: r._worldLowK }; });
const Bw = await snapWorld();
console.log('camA:', JSON.stringify(camA));
console.log('camB:', JSON.stringify(camB));
const rep = await page.evaluate(({ a, b }) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64);
  const W = a.w;
  const g = window.__swGame, r = g.renderer, cam = g.camera, z = cam.zoom;
  const zz = z * (r._worldLowK || 1);
  const ox = Math.round(r._worldLowW / 2), oy = Math.round(r._worldLowH / 2);
  const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
  const cc = g.chunks;
  // 收集前 8 个差异像素
  const diffs = [];
  for (let i = 0; i < P.length && diffs.length < 8; i += 4) {
    let dd = 0;
    for (let c = 0; c < 4; c++) dd = Math.max(dd, Math.abs(P[i + c] - Q[i + c]));
    if (dd > 0) diffs.push({ px: (i >> 2) % W, py: (i >> 2) / W | 0, A: [P[i], P[i+1], P[i+2], P[i+3]], B: [Q[i], Q[i+1], Q[i+2], Q[i+3]] });
  }
  const out = [];
  for (const d of diffs.slice(0, 5)) {
    const wx = (d.px - ox) / zz + camRX, wy = (d.py - oy) / zz + camRY;
    const cx = Math.floor(wx / 256), cy = Math.floor(wy / 256);
    const key = (cx & 0xffff) | ((cy & 0xffff) << 16);
    const pair = cc.chunks.get(key);
    if (!pair || pair.cell < 0) { out.push({ ...d, cx, cy, missing: true }); continue; }
    const pageIdx = Math.floor(pair.cell / 16), slot = pair.cell % 16;
    const xd0 = ox + Math.round((cx * 256 - camRX) * zz), xd1 = ox + Math.round(((cx + 1) * 256 - camRX) * zz);
    const yd0 = oy + Math.round((cy * 256 - camRY) * zz), yd1 = oy + Math.round(((cy + 1) * 256 - camRY) * zz);
    const lx = Math.floor((d.px - xd0) * 256 / (xd1 - xd0));
    const ly = Math.floor((d.py - yd0) * 256 / (yd1 - yd0));
    // 孤立复刻 2D drawChunkGrid:同页同源矩形同设备矩形 → 该像素产物
    const iso = document.createElement('canvas');
    iso.width = 256 * 4; iso.height = 256 * 4;
    const ic = iso.getContext('2d', { willReadFrequently: true });
    ic.imageSmoothingEnabled = false;
    for (const layer of ['tile', 'wall']) {
      const pg = cc.pageCanvas(layer, pageIdx);
      ic.clearRect(0, 0, iso.width, iso.height);
      ic.drawImage(pg, (slot % 4) * 256, Math.floor(slot / 4) * 256, 256, 256, 800, 800, xd1 - xd0, yd1 - yd0);
      const v = ic.getImageData(800 + (d.px - xd0), 800 + (d.py - yd0), 1, 1).data;
      d['iso' + layer] = [v[0], v[1], v[2], v[3]];
    }
    out.push({ px: d.px, py: d.py, lx, ly, A: d.A, B: d.B, isoTile: d.isotile, isoWall: d.isowall });
  }
  return { n: P.length, out };
}, { a: Aw, b: Bw });
for (const d of rep.out) {
  console.log(`px=${d.px} py=${d.py} lx=${d.lx} ly=${d.ly}`);
  console.log(`  A  =${JSON.stringify(d.A)}`);
  console.log(`  B  =${JSON.stringify(d.B)}`);
  console.log(`  isoTile(2D复刻)=${JSON.stringify(d.isoTile)}  isoWall=${JSON.stringify(d.isoWall)}`);
}
await browser.close();
