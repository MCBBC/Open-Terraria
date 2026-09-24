// ★C10b 聚焦诊断6:settle 期是否真渲染(set wrapN/c3 基线)+flip 前先捕获
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
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    window.__blits = [];
    window.__wrapN = (window.__wrapN || 0) + 1;
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      if (w.__counting) {
        w.__cAll = (w.__cAll || 0) + 1;
        if (rest.length === 2) {
          w.__c3 = (w.__c3 || 0) + 1;
          if ((w.__c3srs || []).length < 8) w.__c3srs.push((src && (src.width + 'x' + src.height)) || 'null');
        }
      }
      if (w.__blits && w.__snapOn && rest.length === 2) {
        const r = w.__swGame?.renderer;
        const isPipe = !!(r?.cloudPipeLayer && src === r.cloudPipeLayer.canvas);
        const isGlfx = !!(r?.glfx && src === r.glfx.canvas);
        if (isPipe || isGlfx) w.__blits.push({ k: isPipe ? 'pipe' : 'glfx', w: src.width, h: src.height });
      }
      return orig.call(this, src, ...rest);
    };
    P.__c10bPatched = true;
  }
  window.__snapOn = false;
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
  window.__pause = (v) => { g.paused = v; };
  window.__cloudpipeSet = (v) => window.__swGame.renderer.setCloudPipeForTest(v);
});
await freezeClock(page, { tod: 0.5 });
await pump(page, 60);
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await pump(page, 60);

// 基线捕获（无任何翻转,默认 cloudpipe on）
await page.evaluate(() => {
  window.__snapOn = true; window.__counting = true; window.__c3 = 0; window.__c3srs = [];
});
await pump(page, 1);
const b1 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const o = { blits: (window.__blits || []).map((b) => b.k), wrapN: window.__wrapN || 0, c3: window.__c3, cAll: window.__cAll, c3srs: window.__c3srs,
    protoSame: Object.getPrototypeOf(r.ctx) === Object.getPrototypeOf(document.createElement('canvas').getContext('2d')),
    regionBlit: Object.getPrototypeOf(r.sky ?? window.__swGame.renderer.sky).constructor.cloudRegionBlit };
  window.__snapOn = false; window.__counting = false;
  return o;
});
console.log('基线捕获(默认态):', JSON.stringify(b1));

// 然后 flip-off → 捕获
await page.evaluate(() => window.__cloudpipeSet(false));
await pump(page, 8);
await page.evaluate(() => { window.__snapOn = true; window.__counting = true; window.__c3 = 0; window.__c3srs = []; });
await pump(page, 1);
const a1 = await page.evaluate(() => {
  const o = { blits: (window.__blits || []).map((b) => b.k), c3: window.__c3, c3srs: window.__c3srs, path: window.__swGame.renderer.cloudPathUsed };
  window.__snapOn = false; window.__counting = false;
  return o;
});
console.log('flip-off 捕获(A 态):', JSON.stringify(a1));

await browser.close();
process.exit(0);
