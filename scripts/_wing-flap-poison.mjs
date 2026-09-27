// ★翼扑冻结·染面单槽串味定向复现（2026-09-27）
// 假设:wingTexSource 缓存条目=共享 wingTintScratch 本体;多消费者/帧（染甲+翼/全亮翼
// tint 面互踩）→ 翼 cache-hit 画到别人烘焙内容=翼冻结/错图。
// legs: A=34 素 B=34+染甲 C=1+翼染+染甲 D=1+翼染 —— 每腿:原地飞行+像素 hash+
//       scratch 落笔内容 hash（draw 时点抓拍=所见即所画）。
// 运行: SW_ORIGIN=http://localhost:5227 node tools/run-diag.mjs --timeout=400000 scripts/_wing-flap-poison.mjs [mode]
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const MODE = process.argv[2] || 'default';
const QS = MODE === 'noshim' ? '?bglshim=0&cloudcache=0' : '?cloudcache=0';

const LEGS = [
  { id: 'A_34_plain', wing: 34, wingVid: 3582 },
  { id: 'B_34_dyedArmor', wing: 34, wingVid: 3582, armorVid: 1004, armorDye: 1007 },
  { id: 'C_1_wingDye_dyedArmor', wing: 1, wingVid: 492, wingDye: 1007, armorVid: 1004, armorDye: 1007 },
  { id: 'D_1_wingDye_only', wing: 1, wingVid: 492, wingDye: 1007 },
];

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
  const hashCanvas = (cv) => {
    const c = window.__hashCv ??= document.createElement('canvas');
    if (c.width !== cv.width || c.height !== cv.height) { c.width = cv.width; c.height = cv.height; }
    const x = c.getContext('2d', { willReadFrequently: true });
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
    (P.__origDrawImage || x.drawImage).call(x, cv, 0, 0);
    return hash32(x.getImageData(0, 0, c.width, c.height).data);
  };

  // scratch 落笔抓拍:凡 drawImage(img===wingTintScratch) 记 draw 时点内容 hash
  const P = CanvasRenderingContext2D.prototype;
  if (!P.__scratchPatched) {
    P.__scratchPatched = true;
    P.__scratchLog = [];
    P.__origDrawImage = P.drawImage;
    const orig = P.drawImage;
    P.drawImage = function (img, ...rest) {
      if (img === window.__scratch && P.__scratchLog.length < 9000) {
        P.__scratchLog.push({ at: window.__tick, h: hashCanvas(img), a: rest.map((v) => (typeof v === 'number' ? +(+v).toFixed(1) : -999)) });
      }
      return orig.apply(this, arguments);
    };
  }

  g.input.setVirtualAction('Jump', false);
  const homeX = p.x, homeY = p.y;
  for (let i = 0; i < 6; i++) step();
  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 256;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  const legs = [];

  for (const leg of LEGS) {
    g.input.setVirtualAction('Jump', false);
    p.x = homeX; p.y = homeY; p.vx = 0; p.vy = 0;
    p.inv.armor[1] = null; p.inv.armor[3] = null;
    p.inv.dye[1] = null; p.inv.dye[3] = null;
    p.wingFrame = 0;
    for (let i = 0; i < 14; i++) step();
    p.inv.armor[3] = { id: window.__swFlow.itemByVid(leg.wingVid), stack: 1 };
    if (leg.armorVid) p.inv.armor[1] = { id: window.__swFlow.itemByVid(leg.armorVid), stack: 1 };
    if (leg.wingDye) p.inv.dye[3] = { id: window.__swFlow.itemByVid(leg.wingDye), stack: 1 };
    if (leg.armorDye) p.inv.dye[1] = { id: window.__swFlow.itemByVid(leg.armorDye), stack: 1 };
    let wingImg = null;
    for (let i = 0; i < 40 && !(wingImg && wingImg.width > 0); i++) {
      wingImg = r.atlas.ensureVImage(`vanilla/Wings_${leg.wing}.png`);
      if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 50));
    }
    window.__scratch = r.wingTintScratch;
    if (P.__scratchLog) P.__scratchLog.length = 0;
    for (let i = 0; i < 10; i++) step();
    const wtMax = Math.round(p.wingTime);
    if (!wtMax) { legs.push({ ...leg, fatal: 'no-wingtime' }); continue; }

    g.input.setVirtualAction('Jump', true);
    const hashes = [];
    const scratchHashes = [];
    let holdY = null;
    for (let t = 0; t < 80; t++) {
      step();
      const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
      if (flyingNow) {
        if (holdY === null) holdY = p.y;
        p.y = holdY; p.vy = -0.5;
        if (t % 2 === 0 && t > 24) {
          const z = cam.zoom || 1;
          const [sx, sy] = cam.worldToScreen(p.cx, p.y + 8);
          const w = Math.round(150 * z), h = Math.round(70 * z);
          lx.setTransform(1, 0, 0, 1, 0, 0);
          lx.clearRect(0, 0, lc.width, lc.height);
          lx.drawImage(r.canvas, Math.round(sx - w / 2), Math.round(sy - h / 2), w, h, 0, 0, w, h);
          hashes.push(hash32(lx.getImageData(0, 0, w, h).data));
        }
      } else if (holdY !== null) break;
    }
    g.input.setVirtualAction('Jump', false);
    const sh = P.__scratchLog.map((e) => e.h);
    legs.push({
      id: leg.id, wtMax,
      px: { n: hashes.length, distinct: new Set(hashes).size, tail: hashes.slice(-6) },
      scratch: { n: sh.length, distinct: new Set(sh).size, tail: sh.slice(-6) },
      bakeCacheSize: r.wingBakeCache.size,
    });
  }
  window.__scratch = null;
  return { legs };
}, LEGS);

console.log(JSON.stringify({ MODE, out, pageErrors: pageErrors.slice(0, 8) }, null, 1));
await browser.close();
process.exit(0);
