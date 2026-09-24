// ★C10b 聚焦诊断8:翻面后渲染活性——flip off/on 各阶段 rAF/skyDrawN/errors
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errors = [];
page.on('pageerror', (e) => { errors.push('PAGEERROR: ' + e.message + ' | ' + (e.stack ?? '').split('\n').slice(0, 3).join(' / ')); });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`CONSOLE.${m.type()}: ` + m.text()); });
await bootstrap(page, URL0);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260924 });

await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  let n = 0;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    n++;
    window.__skyDrawN = n;
    window.__blits = [];
    window.__wrapFrame = true;
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  window.__rafN = 0;
  const loop = () => { window.__rafN++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const P = Object.getPrototypeOf(document.createElement('canvas').getContext('2d'));
  if (!P.__c10bPatched) {
    const orig = P.drawImage;
    P.drawImage = function (src, ...rest) {
      const w = window;
      if (w.__blits && rest.length === 2) {
        const r = w.__swGame?.renderer;
        const isPipe = !!(r?.cloudPipeLayer && src === r.cloudPipeLayer.canvas);
        const isGlfx = !!(r?.glfx && src === r.glfx.canvas);
        if (isPipe || isGlfx) w.__blits.push({ k: isPipe ? 'pipe' : 'glfx', w: src.width, h: src.height });
      }
      return orig.call(this, src, ...rest);
    };
    P.__c10bPatched = true;
  }
  window.__cloudpipeSet = (v) => window.__swGame.renderer.setCloudPipeForTest(v);
  window.__pause = (v) => { g.paused = v; };
  window.__cloudPin = () => { sky.maintainClouds = () => {}; };
  window.__weatherFreeze = () => { const w = g.world.weather; if (w) w.update = () => {}; };
});
const snap = async (tag) => {
  const s = await page.evaluate(() => ({
    rafN: window.__rafN, skyDrawN: window.__skyDrawN,
    blits: (window.__blits || []).map((b) => b.k),
    path: window.__swGame.renderer.cloudPathUsed,
    merge: window.__swGame.renderer.cloudMergeUsed,
    hasGlfx: !!window.__swGame.renderer.glfx,
    hasLayer: !!window.__swGame.renderer.cloudPipeLayer,
    glfxDead: window.__swGame.renderer.glfx?.unavailable ?? null,
    flag: window.__swGame.renderer.constructor.cloudPipe,
  }));
  console.log(`[${tag}]`, JSON.stringify(s));
  return s;
};

await freezeClock(page, { tod: 0.5 });
await snap('freezeClock后');
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 0;
}));
await snap('options后');
await page.evaluate(() => window.__weatherSet({ raining: false, alpha: 0, numClouds: 60 }));
await pump(page, 160);
await snap('weatherSet+pump160');
await page.evaluate(() => window.__weatherFreeze());
await page.evaluate(() => window.__cloudPin());
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__pause(true));
await pump(page, 120);
// waitRender 等价
for (let i = 0; i < 4; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
await snap('settle完');

await snap('settle');
await page.evaluate(() => window.__cloudpipeSet(false));
await pump(page, 30);
await snap('flip-off+30t');
await pump(page, 60);
await snap('flip-off+90t');
await page.evaluate(() => window.__cloudpipeSet(true));
await pump(page, 30);
await snap('flip-on+30t');
await pump(page, 60);
await snap('flip-on+90t');
console.log('errors:', errors.length ? errors.slice(0, 8).join('\n---\n') : '(无)');

await browser.close();
process.exit(0);
