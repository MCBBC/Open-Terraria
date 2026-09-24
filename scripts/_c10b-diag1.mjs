// ★C10b 聚焦诊断1:blit 钩失效根因(ctx 身份?)+A/A' 终帧差分定位
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, URL0);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    window.__blits = [];
    const r = origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
    window.__blitsStr = (window.__blits || []).map((b) => b.k + ':' + b.w + 'x' + b.h).join('|');
    return r;
  };
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__weatherSet = ({ raining, alpha, numClouds }) => {
    const w = g.world.weather;
    if (!w) return false;
    if (raining !== undefined) w.raining = raining;
    if (alpha !== undefined) { w.cloudAlpha = alpha; w.maxRaining = alpha; }
    if (numClouds !== undefined) w.numClouds = numClouds;
    w.lightning = 0;
    return true;
  };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
  window.__pause = (v) => { g.paused = v; };
  const lc = document.createElement('canvas');
  const lctx = lc.getContext('2d', { willReadFrequently: true });
  const b64of = (d) => { let bin = ''; const CH = 0x8000; for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length))); return btoa(bin); };
  window.__snap = () => {
    const c = g.renderer.canvas;
    if (lc.width !== c.width || lc.height !== c.height) { lc.width = c.width; lc.height = c.height; }
    lctx.clearRect(0, 0, lc.width, lc.height);
    lctx.drawImage(c, 0, 0);
    return { w: c.width, h: c.height, b64: b64of(lctx.getImageData(0, 0, lc.width, lc.height).data) };
  };
  // ★原型补丁(抗画布重建)——src 过滤
  const P = Object.getPrototypeOf(lctx);
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      try {
        const r = window.__swGame?.renderer;
        if (r && window.__blits && window.__snapOn && rest.length === 2) {
          const glfxCv = r.glfx?.canvas ?? null;
          const pipeCv = r.cloudPipeLayer?.canvas ?? null;
          if (src === glfxCv || src === pipeCv) {
            if (lc.width !== src.width || lc.height !== src.height) { lc.width = src.width; lc.height = src.height; }
            lctx.clearRect(0, 0, lc.width, lc.height);
            lctx.drawImage(src, 0, 0);
            window.__blits.push({
              k: src === pipeCv ? 'pipe' : 'glfx', w: src.width, h: src.height,
              b64: b64of(lctx.getImageData(0, 0, lc.width, lc.height).data),
            });
          }
        }
      } catch { /* 不干扰 */ }
      return orig.call(this, src, ...rest);
    };
    P.__c10bPatched = true;
  }
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 160);
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
await page.evaluate(() => window.__pause(true));
await pump(page, 120);

// ctx 身份核查
const ctxInfo = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    ctxIsOwn: r.ctx === r.canvas.getContext('2d'),
    patched: !!Object.getPrototypeOf(r.ctx).__c10bPatched,
    bgGlEnabled: r.bgGlEnabled,
  };
});
console.log('ctxInfo:', JSON.stringify(ctxInfo));

async function cap(label) {
  await page.evaluate(() => { window.__snapOn = true; });
  await pump(page, 1);
  const b1 = await page.evaluate(() => { const s = window.__blitsStr; window.__snapOn = false; return s; });
  await page.evaluate(() => { window.__snapOn = true; });
  await pump(page, 1);
  const b2 = await page.evaluate(() => { const s = window.__blitsStr; window.__snapOn = false; return s; });
  const fin = await page.evaluate(() => window.__snap());
  const blits = await page.evaluate(() => JSON.parse(window.__blitsB64 ?? '[]'));
  console.log(`[${label}] blits=${b1}|${b2} fin=${md5(fin.b64).slice(0, 10)} n=${blits.length}`);
  return { fin, blits };
}

console.log('--- A 态(cloudpipe off)');
await page.evaluate(() => window.__swGame.renderer.setCloudPipeForTest(false));
await pump(page, 8);
const A = await cap('A');
console.log('--- B 态(cloudpipe on)');
await page.evaluate(() => window.__swGame.renderer.setCloudPipeForTest(true));
await pump(page, 8);
const B = await cap('B');
console.log('--- A\' 态(翻回)');
await page.evaluate(() => window.__swGame.renderer.setCloudPipeForTest(false));
await pump(page, 8);
const A2 = await cap("A'");
// A vs A' 终帧差分
const diff = await page.evaluate(({ a, b }) => {
  const dec = (s) => { const bin = atob(s); const u = new Uint8ClampedArray(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const P = dec(a.b64), Q = dec(b.b64);
  let n = 0, maxd = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  const W = a.w;
  for (let i = 0; i < P.length; i++) {
    const dd = Math.abs(P[i] - Q[i]);
    if (dd > 0) { n++; if (dd > maxd) maxd = dd; const px = (i >> 2) % W, py = (i >> 2) / W | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  return { n, maxd, bbox: n ? [x0, y0, x1, y1] : null };
}, { a: A.fin, b: A2.fin });
console.log('A vs A\' diff:', JSON.stringify(diff));

await browser.close();
process.exit(0);
