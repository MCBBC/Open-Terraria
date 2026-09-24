// ★C10b 聚焦诊断5:复刻主探针 phase-0 序列,逐帧追踪旗面/blit——定位翻面失效与 blit 空
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
    window.__wrapN = (window.__wrapN || 0) + 1;
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* e */ }
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__cloudUnpin = () => { delete sky.maintainClouds; };
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
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      if (w.__counting && rest.length === 2) {
        w.__c3 = (w.__c3 || 0) + 1;
        if ((w.__c3srs || []).length < 10) w.__c3srs.push((src && (src.width + 'x' + src.height)) || 'null');
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
  window.__cloudpipeSet = (v) => window.__swGame.renderer.setCloudPipeForTest(v);
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 60);
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await pump(page, 60);

// === 主探针 phase 序列逐帧追踪 ===
await page.evaluate(() => window.__cloudpipeSet(false));
for (let i = 0; i < 8; i++) {
  await pump(page, 1);
  const s = await page.evaluate(() => ({
    flag: window.__swGame.renderer.constructor.cloudPipe,
    path: window.__swGame.renderer.cloudPathUsed,
  }));
  if (i < 2 || i === 7) console.log(`A-flip 帧${i}:`, JSON.stringify(s));
}
await page.evaluate(() => { window.__snapOn = true; window.__counting = true; window.__c3 = 0; window.__c3srs = []; });
await pump(page, 1);
const A = await page.evaluate(() => { const o = { blits: (window.__blits || []).map((b) => b.k), snapOn: window.__snapOn, wrapN: window.__wrapN, c3: window.__c3, c3srs: window.__c3srs }; window.__snapOn = false; window.__counting = false; return o; });
console.log('A 捕获:', JSON.stringify(A));

await page.evaluate(() => window.__cloudpipeSet(true));
for (let i = 0; i < 8; i++) {
  await pump(page, 1);
  const s = await page.evaluate(() => ({
    flag: window.__swGame.renderer.constructor.cloudPipe,
    path: window.__swGame.renderer.cloudPathUsed,
    merge: window.__swGame.renderer.cloudMergeUsed,
    hasLayer: !!window.__swGame.renderer.cloudPipeLayer,
  }));
  if (i < 3 || i === 7) console.log(`B-flip 帧${i}:`, JSON.stringify(s));
}
await page.evaluate(() => { window.__snapOn = true; window.__counting = true; window.__c3 = 0; window.__c3srs = []; });
await pump(page, 1);
const B = await page.evaluate(() => { const o = { blits: (window.__blits || []).map((b) => b.k), wrapN: window.__wrapN, c3: window.__c3, c3srs: window.__c3srs }; window.__snapOn = false; window.__counting = false; return o; });
console.log('B 捕获:', JSON.stringify(B));

await browser.close();
process.exit(0);
