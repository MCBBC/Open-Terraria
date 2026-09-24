// ★C10b 聚焦诊断4:翻转生效性+钩子直测+帧内捕获——三假设步进隔离
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, URL0);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    window.__blits = [];
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      if (w.__blits && w.__snapOn && rest.length === 2) {
        const r = w.__swGame?.renderer;
        const isPipe = !!(r?.cloudPipeLayer && src === r.cloudPipeLayer.canvas);
        const isGlfx = !!(r?.glfx && src === r.glfx.canvas);
        if (isPipe || isGlfx) {
          w.__blits.push({ k: isPipe ? 'pipe' : 'glfx', w: src.width, h: src.height });
        }
      }
      return orig.call(this, src, ...rest);
    };
    P.__c10bPatched = true;
  }
  window.__snapOn = false;
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
  window.__pause = (v) => { g.paused = v; };
});
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await pump(page, 60);

// 假设1:翻转生效性
const flip = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  r.setCloudPipeForTest(true);
  return {
    flagNow: r.constructor.cloudPipe,
    flagStaticGet: r.constructor.cloudPipe === true,
  };
});
console.log('翻转后旗面(立即):', JSON.stringify(flip));
await pump(page, 8);
const after = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    flag: r.constructor.cloudPipe,
    path: r.cloudPathUsed,
    merge: r.cloudMergeUsed,
    hasLayer: !!r.cloudPipeLayer,
  };
});
console.log('8帧后:', JSON.stringify(after));

// 假设2:钩子直测(手动 3 参 blit pipe 画布)
const manual = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  window.__blits = [];
  window.__snapOn = true;
  const cv = r.cloudPipeLayer?.canvas;
  let threw = null;
  try { r.ctx.drawImage(cv, 0, 0); } catch (e) { threw = e.message; }
  const n = window.__blits.length;
  window.__snapOn = false;
  return { n, threw, cvDim: cv ? cv.width + 'x' + cv.height : null, ctxProto: Object.getPrototypeOf(r.ctx).__c10bPatched === true };
});
console.log('手动直测:', JSON.stringify(manual));

// 假设3:帧内捕获
const frame = await page.evaluate(() => { window.__blits = []; window.__snapOn = true; return true; });
await pump(page, 1);
const framed = await page.evaluate(() => {
  const out = { n: (window.__blits || []).length, items: (window.__blits || []).map((b) => b.k), snapOnStill: window.__snapOn };
  window.__snapOn = false;
  return out;
});
console.log('帧内捕获:', JSON.stringify(framed));

await browser.close();
process.exit(0);
