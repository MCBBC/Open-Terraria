// ★C10b 聚焦诊断3:diag1 同条件(暂停/冻结/wrapper)下 drawImage 全量计数——定位钩哑因
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
    window.__frameMark = { skyDrawRan: true, ctxIsMain: ctx === window.__swGame.renderer.ctx, ctxCtor: ctx?.constructor?.name };
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
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      if (w.__counting) {
        w.__cnt = (w.__cnt || 0) + 1;
        if (rest.length === 2) {
          w.__cnt3 = (w.__cnt3 || 0) + 1;
          const r = w.__swGame?.renderer;
          if (r && (src === r.glfx?.canvas || src === r.cloudPipeLayer?.canvas)) w.__cntSky = (w.__cntSky || 0) + 1;
        }
      }
      if (w.__blits && w.__snapOn && rest.length === 2) {
        const r = w.__swGame?.renderer;
        if (r && (src === r.glfx?.canvas || src === r.cloudPipeLayer?.canvas)) {
          w.__blits.push({ k: src === r.cloudPipeLayer?.canvas ? 'pipe' : 'glfx', w: src.width, h: src.height });
        }
      }
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
await pump(page, 60);
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
await page.evaluate(() => window.__pause(true));
await pump(page, 60);

async function probeFrame(label, pipeOn) {
  await page.evaluate((v) => window.__swGame.renderer.setCloudPipeForTest(v), pipeOn);
  await pump(page, 8);
  const r = await page.evaluate(() => {
    window.__cnt = 0; window.__cnt3 = 0; window.__cntSky = 0;
    window.__snapOn = true; window.__counting = true;
    return true;
  });
  await pump(page, 1);
  const out = await page.evaluate(() => {
    window.__counting = false; window.__snapOn = false;
    return {
      cnt: window.__cnt, cnt3: window.__cnt3, cntSky: window.__cntSky,
      blits: window.__blitsStr, mark: window.__frameMark,
      cloudPath: window.__swGame.renderer.cloudPathUsed,
      merge: window.__swGame.renderer.cloudMergeUsed,
      bgGl: window.__swGame.renderer.bgGlEnabled,
      cpu: window.__swGame.renderer.isCpuRender?.() ?? null,
    };
  });
  console.log(`[${label}]`, JSON.stringify(out));
  return out;
}

await probeFrame('A 态(off)', false);
await probeFrame('B 态(on)', true);
await probeFrame("A' 态(off)", false);

await browser.close();
process.exit(0);
