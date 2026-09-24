// ★B1 对拍差异定位探针 v2（diag;非判据门）——zoom/K 相位 worldCanvas 差异
// 按 chunk 设备边界距离分类 + 采样值。运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs scripts/_b1-debug-diff.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5209';
const MODE = process.env.B1_DEBUG_MODE || 'k05';   // 'k05' | 'z127' | 'z15625'
const browser = await launchBrowser({});
const page = await openPage(browser, {});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

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
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch {}
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__bglSet = (v) => r.constructor.bglSetForTest(v);
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
  window.__pause = (v) => { g.paused = v; };
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};   // FlickerClock 每帧步进钉死
});
if (MODE === 'k05') {
  await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.renderScale = 0.5; }));
} else if (MODE === 'z127') {
  await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.27); });
} else if (MODE === 'z15625') {
  await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.5625); });
} else if (MODE === 'ocean' || MODE === 'ocean125') {
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.x = 400; g.player.y = g.world.groundLevel * 16 - 40;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x + g.player.w / 2; g.camera.y = g.player.y + g.player.h / 2;
  });
  if (MODE === 'ocean125') await page.evaluate(() => { window.__swGame.camera.setZoomTarget(1.25); });
} else if (MODE === 'cave') {
  await page.evaluate(() => {
    const g = window.__swGame;
    const gy = (g.world.groundLevel ?? 300) + 48;
    g.player.x = g.player.x; g.player.y = gy * 16;
    g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x + g.player.w / 2; g.camera.y = g.player.y + g.player.h / 2;
  });
}
await pump(page, MODE === 'k05' || MODE === 'z127' || MODE === 'z15625' || MODE === 'ocean125' ? 80 : 40);
await page.evaluate(() => window.__pause(true));

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
async function snapWorld() {
  return page.evaluate(() => {
    const cv = window.__swGame.renderer.worldCanvas;
    const lc = document.createElement('canvas');
    lc.width = cv.width; lc.height = cv.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(cv, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: cv.width, h: cv.height, b64: btoa(bin) };
  });
}

await waitFrame(4);
await page.evaluate((n) => window.__setTick(500 + n), 0);
/** 页稳定性哨兵:同 chunk cell/内容在三时点的读数（重烘/换槽侦测） */
async function pageSnap(tag) {
  return page.evaluate((tag) => {
    const g = window.__swGame;
    const cam = g.camera, z = cam.zoom;
    const r = g.renderer;
    const k = r._worldLowK || 1;
    const zz = z * k, ox = Math.round(r._worldLowW / 2), oy = Math.round(r._worldLowH / 2);
    const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
    const cc = g.chunks;
    const out = { tag, dirty: cc.dirtyQueue.length, cells: [] };
    for (const [cx, cy, px, py] of [[0, 21, 35, 0], [0, 21, 60, 0], [0, 21, 100, 0], [0, 21, 125, 0]]) {
      const pair = cc.chunks.get((cx & 0xffff) | ((cy & 0xffff) << 16));
      if (!pair || pair.cell < 0) { out.cells.push({ cx, cy, missing: true }); continue; }
      const pageIdx = Math.floor(pair.cell / 16), slot = pair.cell % 16;
      const page = cc.pageCanvas('tile', pageIdx);
      const wpc = page.getContext('2d', { willReadFrequently: true });
      const xd0 = ox + Math.round((cx * 256 - camRX) * zz);
      const yd0 = oy + Math.round((cy * 256 - camRY) * zz);
      const xd1 = ox + Math.round(((cx + 1) * 256 - camRX) * zz);
      const lx = Math.floor((px - xd0) * 256 / (xd1 - xd0));
      const ly = Math.floor((py - yd0) * 256 / ((oy + Math.round(((cy + 1) * 256 - camRY) * zz)) - yd0));
      const d = wpc.getImageData((slot % 4) * 256 + Math.max(0, Math.min(255, lx)), Math.floor(slot / 4) * 256 + Math.max(0, Math.min(255, ly)), 1, 1).data;
      out.cells.push({ cx, cy, cell: pair.cell, lx, ly, rgba: [d[0], d[1], d[2], d[3]] });
    }
    return out;
  }, tag);
}
const PS0 = await pageSnap('pre-A');
await page.evaluate(() => window.__bglSet(false));
await waitFrame(1);
const PS1 = await pageSnap('post-A');
const Aw = await snapWorld();
await page.evaluate(() => window.__bglSet(true));
await waitFrame(4);
const PS2 = await pageSnap('pre-B');
await page.evaluate((n) => window.__setTick(500 + n), 0);
await waitFrame(1);
const PS3 = await pageSnap('post-B');
const Bw = await snapWorld();
console.log('pageStability:', JSON.stringify([PS0, PS1, PS2, PS3]));

const rep = await page.evaluate(({ a, b, mode }) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64);
  const W = a.w, H = a.h;
  const g = window.__swGame;
  const r = g.renderer;
  const z = g.camera.zoom;
  const cam = g.camera;
  const k = r._worldLowK || 1;
  const lw = r._worldLowW, lh = r._worldLowH;
  const zz = z * k;
  const ox = Math.round(lw / 2), oy = Math.round(lh / 2);
  const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;
  let n = 0, maxd = 0;
  const edgeDist = {};   // 'dx,dy'（到 chunk 设备矩形右/下边界的距离,99=非边界）
  const samples = [];
  const pageProbe = [];
  for (let i = 0; i < P.length; i += 4) {
    let dd = 0;
    for (let c = 0; c < 4; c++) dd = Math.max(dd, Math.abs(P[i + c] - Q[i + c]));
    if (dd > 0) {
      n++;
      if (dd > maxd) maxd = dd;
      const px = (i >> 2) % W, py = (i >> 2) / W | 0;
      // 设备→世界→chunk
      const wx = (px - ox) / zz + camRX, wy = (py - oy) / zz + camRY;
      const cx = Math.floor(wx / 256), cy = Math.floor(wy / 256);
      const ex = ox + Math.round(((cx + 1) * 256 - camRX) * zz) - 1 - px;   // 距本 chunk 右边界(设备px)
      const ey = oy + Math.round(((cy + 1) * 256 - camRY) * zz) - 1 - py;
      const bk = `${Math.min(ex, 3)},${Math.min(ey, 3)}`;
      edgeDist[bk] = (edgeDist[bk] || 0) + 1;
      if (samples.length < 16) {
        samples.push({ px, py, ex, ey, wx: Math.round(wx), wy: Math.round(wy), c: [cx, cy],
          A: [P[i], P[i + 1], P[i + 2], P[i + 3]], B: [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]] });
      }
      if (pageProbe.length < 6) {
        // 页面 texel 对照：该 chunk 的 cell/页/slot → 页画布 texel（A 假设 c 与 c−1 两候补）
        const key = (cx & 0xffff) | ((cy & 0xffff) << 16);
        const pair = window.__swGame.chunks.chunks.get(key);
        if (pair && pair.cell >= 0) {
          const pageIdx = Math.floor(pair.cell / 16), slot = pair.cell % 16;
          const page = window.__swGame.chunks.pageCanvas('tile', pageIdx);
          const wpc = page.getContext('2d', { willReadFrequently: true });
          const xd0 = ox + Math.round((cx * 256 - camRX) * zz);
          const xd1 = ox + Math.round(((cx + 1) * 256 - camRX) * zz);
          const yd0 = oy + Math.round((cy * 256 - camRY) * zz);
          const yd1 = oy + Math.round(((cy + 1) * 256 - camRY) * zz);
          const lxLocal = Math.floor((px - xd0) * 256 / (xd1 - xd0));
          const lyLocal = Math.floor((py - yd0) * 256 / (yd1 - yd0));
          const texel = (tx, ty) => {
            const d = wpc.getImageData((slot % 4) * 256 + Math.max(0, Math.min(255, tx)), Math.floor(slot / 4) * 256 + Math.max(0, Math.min(255, ty)), 1, 1).data;
            return [d[0], d[1], d[2], d[3]];
          };
          pageProbe.push({ px, py, cx, cy, lxLocal, lyLocal,
            texelC: texel(lxLocal, lyLocal), texelCm1: texel(lxLocal - 1, lyLocal), texelRm1: texel(lxLocal, lyLocal - 1) });
        }
      }
    }
  }
  return { n, maxd, edgeDist, samples, pageProbe, dims: [W, H], zz, lw, lh, camRX, camRY, zoom: z, k };
}, { a: Aw, b: Bw, mode: MODE });
console.log(`mode=${MODE} worldCanvas A vs B:`, JSON.stringify({ n: rep.n, maxd: rep.maxd, dims: rep.dims, zz: rep.zz, k: rep.k }));
console.log('chunk-edge distance histogram (dx,dy → count, capped 3):', JSON.stringify(rep.edgeDist));
console.log('samples:', JSON.stringify(rep.samples.slice(0, 6)));
console.log('pageProbe:', JSON.stringify(rep.pageProbe, null, 1));
await browser.close();
