// ★30fps 刀1 逐调用语义对拍（活机海面生产流）：texFromRegion 真实调用参数捕获 →
//   逐调用 OLD 窗(分数源→round dest) vs NEW 窗(floor/ceil) 字节对比。
//   场景=海面驻留（waveOn 表面条带最密）。判据:每调用 maxd/diffPx + 聚合。
// run: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=240000 scripts/_erkey-callsab.mjs
import { launchBrowser, openPage, bootstrap, createGame, sleep, teleport, godMode } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const page = await openPage(await launchBrowser({ headless: true }), {});
const boot = await bootstrap(page, ORIGIN, { log: () => {} });
if (!boot?.ok) { console.error('boot fail'); process.exit(1); }
const made = await createGame(page, { mode: 'direct', seed: 'eolcensus', size: 'small', pinRandom: 20261003, log: () => {} });
if (!made?.ok) process.exit(1);
await sleep(1500);

// 海面
const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world;
  const gl = w.groundLevel ?? 300;
  const Wt = w.store?.w ?? 0;
  for (const edge of [4, Wt - 5]) {
    const dir = edge < Wt / 2 ? 1 : -1;
    for (let x = edge; x > 0 && x < Wt - 1; x += dir * 3) {
      for (let y = gl - 6; y <= gl + 4; y++) {
        if (w.liquidAt(x * 16 + 8, y * 16 + 8) > 0 && w.liquidAt(x * 16 + 8, (y - 1) * 16 + 8) === 0) {
          return { x: x * 16 + 8, y: (y - 6) * 16 };
        }
      }
    }
  }
  return null;
});
console.log('ocean spot:', JSON.stringify(spot));
if (!spot) process.exit(1);
await godMode(page, true);
await teleport(page, spot.x, spot.y, { snapCamera: true, zeroVel: true });
await sleep(1500);

// 捕获调用参数（全量;持 img 引用）
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const glw = r._accGlw ?? r.glfx;
  const proto = Object.getPrototypeOf(glw);
  if (globalThis.__erCalls) return;
  const orig = proto.texFromRegion;
  globalThis.__erCalls = [];
  globalThis.__erCallsOn = false;
  proto.texFromRegion = function (key, img, sx, sy, sw, sh) {
    if (globalThis.__erCallsOn && globalThis.__erCalls.length < 4000) {
      globalThis.__erCalls.push({ key, img, sx, sy, sw, sh });
    }
    return orig.call(this, key, img, sx, sy, sw, sh);
  };
});
await page.evaluate(() => { globalThis.__erCalls.length = 0; globalThis.__erCallsOn = true; });
await sleep(8000);
await page.evaluate(() => { globalThis.__erCallsOn = false; });

const out = await page.evaluate(() => {
  const calls = globalThis.__erCalls;
  const pixels = (cv) => cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const drawOld = (img, sx, sy, sw, sh) => {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw)); c.height = Math.max(1, Math.round(sh));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, c.width, c.height);
    x.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  };
  const drawNew = (img, sx, sy, sw, sh) => {
    const isx = Math.floor(sx), isy = Math.floor(sy);
    const w = Math.max(1, Math.ceil(sx + sw) - isx), h = Math.max(1, Math.ceil(sy + sh) - isy);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, w, h);
    x.drawImage(img, isx, isy, w, h, 0, 0, w, h);
    return c;
  };
  const frac = calls.filter((c) => !(Number.isInteger(c.sx) && Number.isInteger(c.sy)
    && Number.isInteger(c.sw) && Number.isInteger(c.sh)));
  const cases = [];
  for (const c of frac.slice(0, 400)) {
    const a = drawOld(c.img, c.sx, c.sy, c.sw, c.sh);
    const b = drawNew(c.img, c.sx, c.sy, c.sw, c.sh);
    const da = pixels(a), db = pixels(b);
    const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
    let nd = 0, maxd = 0;
    for (let i = 0; i < w * h * 4; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]),
        Math.abs(da[i + 2] - db[i + 2]), Math.abs(da[i + 3] - db[i + 3]));
      if (d > 0) nd++;
      if (d > maxd) maxd = d;
    }
    cases.push({ key: c.key.slice(0, 40), args: [c.sx, c.sy, c.sw, c.sh],
      old: `${a.width}x${a.height}`, nw: `${b.width}x${b.height}`, diffPx: nd, total: w * h, maxd });
  }
  // 聚合
  const agg = { fracCalls: frac.length, totalCalls: calls.length, cases: cases.length,
    zeroDiff: cases.filter((c) => c.diffPx === 0).length,
    subLSB: cases.filter((c) => c.diffPx > 0 && c.maxd <= 1).length,
    over1: cases.filter((c) => c.maxd > 1).length,
    keyFracBefore: new Set(frac.map((c) => c.key)).size,
  };
  return { agg, sample: cases.slice(0, 12), over1Samples: cases.filter((c) => c.maxd > 1).slice(0, 6) };
});
console.log(JSON.stringify(out, null, 1));
await page.browser().close();
