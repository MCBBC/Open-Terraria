// ★翼扑家族普查探针（2026-09-27）:逐翼款 legs——原地飞行（每 tick 复位 y/vy=相机静止）,
// 采 tick 侧 wingFrame / draw 侧翼图 drawImage 参数 / 像素 hash（用户可见真值）。
// legs: 各翼款素绘 + {1,29,34}+染料 1007。判据:fly 段像素 hash 全同=冻结。
// 运行: SW_ORIGIN=http://localhost:5227 node tools/run-diag.mjs --timeout=400000 scripts/_wing-flap-census.mjs [mode]
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const MODE = process.argv[2] || 'default';
const QS = MODE === 'noshim' ? '?bglshim=0&cloudcache=0' : MODE === 'nobgl' ? '?bgl=0&cloudcache=0' : '?cloudcache=0';

// wing slot → item vid（vanilla-itemstats.json wing 字段反查）
const LEGS_ALL = [
  { slot: 1, vid: 492 }, { slot: 5, vid: 749 }, { slot: 12, vid: 948 },
  { slot: 24, vid: 2280 }, { slot: 26, vid: 2609 }, { slot: 27, vid: 2770 },
  { slot: 30, vid: 3469 }, { slot: 33, vid: 3580 }, { slot: 38, vid: 3924 }, { slot: 37, vid: 3883 },
  { slot: 41, vid: 4746 }, { slot: 43, vid: 4754 }, { slot: 46, vid: 4978 },
  { slot: 47, vid: 5586 }, { slot: 48, vid: 5627 }, { slot: 49, vid: 5659 },
  { slot: 50, vid: 5686 },
];

const LEGS = LEGS_ALL.filter((l) => !process.env.WING_LEGS || process.env.WING_LEGS.split(',').includes(String(l.slot) + (l.dye ? 'd' : '')));
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + String(e.message).slice(0, 140)));
await bootstrap(page, ORIGIN + QS);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.player, { timeout: 120000 });

await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  g.running = false;
  try {
    const origDraw = Object.getPrototypeOf(r.sky).draw;
    r.sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) { return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY); };
    r.sky.maintainClouds = () => {}; r.sky.drawAmbience = () => {}; r.biomeBg.update = () => {};
    const w = g.world.weather;
    if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.lightning = 0; w.update = () => {}; }
  } catch { /* ignore */ }
  window.__tick = 0;
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));

const out = await page.evaluate(async (LEGS) => {
  const g = window.__swGame;
  const p = g.player;
  const cam = g.camera;
  const r = g.renderer;
  const step = () => { window.__vnow = (window.__vnow || performance.now()) + 16.6667; window.__tick++; g.frame(window.__vnow); };
  const hash32 = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };

  // drawImage 探针（2D 原型 + shim bound）
  const P = CanvasRenderingContext2D.prototype;
  if (!P.__wingPatched) {
    P.__wingPatched = true;
    P.__wingLog2d = [];
    const orig = P.drawImage;
    P.drawImage = function (img, ...rest) {
      if (window.__wingImg && img === window.__wingImg && P.__wingLog2d.length < 9000) {
        P.__wingLog2d.push({ at: window.__tick, a: rest.map((v) => (typeof v === 'number' ? +(+v).toFixed(2) : -999)) });
      }
      return orig.apply(this, arguments);
    };
  }
  const shim = r.bglEntShim;
  if (shim?.bound?.drawImage && !shim.__wingWrapped) {
    shim.__wingWrapped = true;
    shim.__wingLogGl = [];
    const o = shim.bound.drawImage;
    shim.bound.drawImage = function (img, ...rest) {
      if (window.__wingImg && img === window.__wingImg && shim.__wingLogGl.length < 9000) {
        shim.__wingLogGl.push({ at: window.__tick, a: rest.map((v) => (typeof v === 'number' ? +(+v).toFixed(2) : -999)) });
      }
      return o.apply(this, arguments);
    };
  }

  // 捕获地面出生点
  g.input.setVirtualAction('Jump', false);
  const homeX = p.x, homeY = p.y;
  for (let i = 0; i < 6; i++) step();

  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 256;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  const legs = [];

  for (const leg of LEGS) {
    // 复位:落地+清装备
    g.input.setVirtualAction('Jump', false);
    p.x = homeX; p.y = homeY; p.vx = 0; p.vy = 0;
    p.inv.armor[3] = null;
    p.inv.dye[3] = null;
    p.wingFrame = 0;
    for (let i = 0; i < 14; i++) step();          // 地面回满 wingTime（!inputJump 门）
    const iid = window.__swFlow.itemByVid(leg.vid);
    p.inv.armor[3] = { id: iid, stack: 1 };
    if (leg.dye) {
      const diid = window.__swFlow.itemByVid(leg.dye);
      p.inv.dye[3] = { id: diid, stack: 1 };
    }
    let wingImg = null;
    for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) {
      wingImg = r.atlas.ensureVImage(`vanilla/Wings_${leg.slot}.png`);
      if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50));
    }
    window.__wingImg = wingImg;
    if (P.__wingLog2d) P.__wingLog2d.length = 0;
    if (shim?.__wingLogGl) shim.__wingLogGl.length = 0;
    const cacheBefore = r.wingBakeCache ? r.wingBakeCache.size : -1;

    for (let i = 0; i < 10; i++) step();          // 装备生效 + 地面回满
    console.error('[census] leg', leg.slot, leg.dye ?? '');
    const wtMax = Math.round(p.wingTime);
    if (!wtMax) { legs.push({ ...leg, fatal: 'no-wingtime' }); continue; }

    g.input.setVirtualAction('Jump', true);
    const ticks = [];
    const hashes = [];
    let flySeen = 0, holdY = null;
    for (let t = 0; t < 80; t++) {
      step();
      const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
      if (flyingNow) {
        flySeen++;
        if (holdY === null) holdY = p.y;          // 首个 fly tick 钉住高度
        p.y = holdY; p.vy = -0.5;                 // 原地飞行:相机静止,翼扑成为唯一像素变化源
        ticks.push(p.wingFrame);
        if (t % 2 === 0 && t > 24) {
          const z = cam.zoom || 1;
          const [sx, sy] = cam.worldToScreen(p.cx, p.y + 8);
          const w = Math.round(150 * z), h = Math.round(70 * z);
          lx.setTransform(1, 0, 0, 1, 0, 0);
          lx.clearRect(0, 0, lc.width, lc.height);
          lx.drawImage(r.canvas, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h, 0, 0, w, h);
          hashes.push(hash32(lx.getImageData(0, 0, w, h).data));
        }
      } else if (holdY !== null) { break; }         // 飞行中断（wt 尽）提前收腿
    }
    g.input.setVirtualAction('Jump', false);
    const dArg = (log) => new Set(log.map((e) => e.a.join(','))).size;
    legs.push({
      ...leg, wtMax, flySeen,
      wfDistinct: new Set(ticks).size, wfTail: ticks.slice(-8),
      draw2d: P.__wingLog2d ? { n: P.__wingLog2d.length, distinct: dArg(P.__wingLog2d), head: P.__wingLog2d.slice(0, 3).map((e) => e.a.join(',')), tail: P.__wingLog2d.slice(-3).map((e) => e.a.join(',')) } : null,
      drawGl: shim?.__wingLogGl ? { n: shim.__wingLogGl.length, distinct: dArg(shim.__wingLogGl), head: shim.__wingLogGl.slice(0, 3).map((e) => e.a.join(',')), tail: shim.__wingLogGl.slice(-3).map((e) => e.a.join(',')) } : null,
      px: { n: hashes.length, distinct: new Set(hashes).size },
      bakeCacheDelta: r.wingBakeCache ? r.wingBakeCache.size - cacheBefore : -1,
    });
  }
  window.__wingImg = null;
  return { legs, homeX, homeY };
}, LEGS);

console.log(JSON.stringify({ MODE, out, pageErrors: pageErrors.slice(0, 8) }, null, 1));
await browser.close();
process.exit(0);
