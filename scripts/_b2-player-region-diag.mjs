// ★B2 玩家区偏差定性小探针:①B2 vs B1 差分是否 ±1texel 平移可解释 ②per-frame 上传溯源
// 运行: SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs --timeout=600000 scripts/_b2-player-region-diag.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?bgl=1&bglshim=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const origDraw = Object.getPrototypeOf(r.sky).draw;
  r.sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { }
  r.sky.maintainClouds = () => {}; r.sky.drawAmbience = () => {}; r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; w.update = () => {}; }
  window.__set = (bgl, shim) => { r.constructor.bglSetForTest(bgl); r.constructor.bglShimSetForTest(shim); };
  window.__setTick = async (n) => { const m = await import('/src/render/TileAnim.ts'); m.tileAnim.tick = n; };
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => { g.player.x = x; g.player.y = y; g.player.vx = 0; g.player.vy = 0; g.camera.x = x + g.player.w / 2; g.camera.y = y + g.player.h / 2; };
  // 上传溯源:执行器 stats 直读（uploads 分解面在 GLP texImage2D 桩:按宽度分桶）
  const GLP = WebGL2RenderingContext.prototype;
  if (!GLP.__b2diag) {
    GLP.__b2diag = { imgs: [] };
    const oImg = GLP.texImage2D;
    GLP.texImage2D = function (t, lvl, ia, ...rest) {
      try {
        const wArg = typeof rest[0] === 'number' ? rest[0] : (rest[0]?.width ?? 0);
        const hArg = typeof rest[1] === 'number' ? rest[1] : (rest[0]?.height ?? 0);
        if (GLP.__b2diag.imgs.length < 400) GLP.__b2diag.imgs.push(`${wArg}x${hArg}`);
      } catch { }
      return oImg.apply(this, arguments);
    };
    GLP.__b2diag = GLP.__b2diag;
    GLP.__b2Patched = true;
  }
  window.__imgReset = () => { GLP.__b2diag.imgs.length = 0; };
  window.__imgRead = () => GLP.__b2diag.imgs.slice();
  window.__shimStats = () => window.__swGame.renderer.bglShimStats();
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await pump(page, 60);
await page.evaluate(() => window.__pause(true));
const wf = async (n = 1) => {
  for (let i = 0; i < n; i++) await page.evaluate(() => {
    window.__vnow = (window.__vnow || performance.now()) + 16.6667;
    window.__swGame.frame(window.__vnow);
  });
};
await wf(8);

async function snap() {
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

// ---- ①玩家区差分定性:A2D vs B2 @ zoom1.0（tick 注入定相） ----
await page.evaluate((b, s) => window.__set(b, s), 0, 0);
await wf(4);
await page.evaluate((n) => window.__setTick(500), 0);
await wf(1);
const A = await snap();
await page.evaluate((b, s) => window.__set(b, s), 1, 1);
await wf(5);
await page.evaluate((n) => window.__setTick(500), 0);
await wf(1);
const B = await snap();

const diag = await page.evaluate(({ a, b }) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64), W = a.w, H = a.h;
  // 收差分像素（全幅）
  const diffs = [];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const i = (py * W + px) * 4;
      const dd = Math.max(Math.abs(P[i] - Q[i]), Math.abs(P[i + 1] - Q[i + 1]), Math.abs(P[i + 2] - Q[i + 2]));
      if (dd > 8) diffs.push([px, py, dd]);
    }
  }
  // 平移解释检验:差分像素在 B 中平移 (dx,dy) 后等于 A?（±2 texel 穷举;同色域±8）
  const shiftScore = {};
  for (let sy = -2; sy <= 2; sy++) for (let sx = -2; sx <= 2; sx++) {
    let ok = 0, tot = 0;
    for (const [px, py] of diffs) {
      const qx = px + sx, qy = py + sy;
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      const i = (py * W + px) * 4, j = (qy * W + qx) * 4;
      tot++;
      const d = Math.max(Math.abs(P[i] - Q[j]), Math.abs(P[i + 1] - Q[j + 1]), Math.abs(P[i + 2] - Q[j + 2]));
      if (d <= 8) ok++;
    }
    if (tot) shiftScore[`${sx},${sy}`] = +(ok / tot).toFixed(3);
  }
  // bbox + 通道直方（差分是否集中在边缘列/行）
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const [px, py] of diffs) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  const colHist = {}, rowHist = {};
  for (const [px, py] of diffs) { colHist[px - x0] = (colHist[px - x0] || 0) + 1; rowHist[py - y0] = (rowHist[py - y0] || 0) + 1; }
  // 采样 12 个差分像素:A/B 的 RGBA 原值(比值/差值定性:α缩放?灰偏?无关联?)
  const samples = [];
  for (let k = 0; k < diffs.length && samples.length < 12; k += Math.max(1, Math.floor(diffs.length / 12))) {
    const [px, py] = diffs[k];
    const i = (py * W + px) * 4;
    samples.push({
      px, py,
      A: [P[i], P[i + 1], P[i + 2], P[i + 3]],
      B: [Q[i], Q[i + 1], Q[i + 2], Q[i + 3]],
      // 周边参照:同点 B 的 α 与 rgb 关系（预乘违规检测:rgb>a?）
      Bratio: Q[i + 3] ? +(Q[i] / Q[i + 3]).toFixed(2) : 'a0',
    });
    k += 0;
  }
  // ASCII 强度图:diff bbox 外扩 6px,A/B 亮度图并排
  const pad = 6;
  let art = '';
  if (diffs.length) {
    for (let py = y0 - pad; py <= y1 + pad; py++) {
      let rowA = '', rowB = '';
      for (let px = x0 - pad; px <= x1 + pad; px++) {
        const i = (Math.max(0, py) * W + Math.max(0, px)) * 4;
        const la = Math.round((P[i] + P[i + 1] + P[i + 2]) / 3 / 255 * 9);
        const lb = Math.round((Q[i] + Q[i + 1] + Q[i + 2]) / 3 / 255 * 9);
        rowA += la.toString(9 === 9 ? 10 : 10);
        rowB += lb.toString(10);
      }
      art += `A ${rowA} | B ${rowB} | y=${py}\n`;
    }
  }
  return { n: diffs.length, bbox: diffs.length ? [x0, y0, x1, y1] : null, maxd: diffs.reduce((m, d) => Math.max(m, d[2]), 0), shiftScore, samples, art };
}, { a: A, b: B });
console.log('[定性]', JSON.stringify(diag, null, 1));

// ---- ②上传溯源:连续 3 帧 B2 态 uploads/imgs ----
await page.evaluate(() => window.__set(1, 1));
await wf(6);
for (let f = 0; f < 3; f++) {
  await page.evaluate(() => window.__imgReset());
  await wf(1);
  const imgs = await page.evaluate(() => window.__imgRead());
  const st = await page.evaluate(() => window.__shimStats());
  const bucket = {};
  for (const s of imgs) bucket[s] = (bucket[s] || 0) + 1;
  console.log(`[帧${f}] texImage2D=${imgs.length} 桶=${JSON.stringify(bucket)} uploads=${st?.stats?.uploads} draws=${st?.stats?.draws} emits=${(st?.stats?.emitSO ?? 0) + (st?.stats?.emitADD ?? 0)}`);
}
if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors.slice(0, 5));
await browser.close();
process.exitCode = 0;
