// ★翅膀扑动动画冻结 AB 判别器 v2（2026-09-27）
// 场景:装翼 → 地面回满 wingTime（松跳 10t）→ 按跳起飞 → 真飞行段采样。
// 三层定谳:①tick 侧 p.wingFrame ②draw 侧 Wings_N 源行 sy 轮转（shim quad 面+2D 面）
// ③翼区像素 hash（用户可见真值）。× {default / noshim / nobgl / nob2b} 分层。
// 运行: SW_ORIGIN=http://localhost:5227 node tools/run-diag.mjs --timeout=300000 \
//         scripts/_wing-flap-anim.mjs default|noshim|nobgl|nob2b
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const MODE = process.argv[2] || 'default';
const QS = MODE === 'noshim' ? '?bglshim=0&cloudcache=0'
  : MODE === 'nobgl' ? '?bgl=0&cloudcache=0'
  : MODE === 'nob2b' ? '?b2b=0&cloudcache=0'
  : '?cloudcache=0';

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + String(e.message).slice(0, 160)));
await bootstrap(page, ORIGIN + QS);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260927 });

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
  } catch (e) { console.warn('sky freeze skip', e); }
  window.__tick = 0;
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => { m.options.data.swayInWind = false; m.options.data.waveQuality = 0; m.options.data.renderScale = 1; }));

const ready = await page.evaluate(() => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(492);
  if (!iid) return { ok: false, why: 'no-iid-492' };
  g.player.inv.armor[3] = { id: iid, stack: 1 };
  return { ok: true };
});
if (!ready.ok) { console.log(JSON.stringify({ MODE, fatal: ready })); await browser.close(); process.exit(1); }

// 逐 tick 驱动:①起飞前 12t 松跳(回满) ②按跳起飞,连 130t;起飞段每 tick 采全量
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const p = g.player;
  const cam = g.camera;
  const r = g.renderer;
  const step = () => { window.__vnow = (window.__vnow || performance.now()) + 16.6667; window.__tick++; g.frame(window.__vnow); };

  // 起飞前:装备生效 + 地面回满 wingTime（原版 :26976 (!controlJump) 门）
  for (let i = 0; i < 12; i++) step();
  const wingLogic = p.equipStats?.wing?.logic ?? 0;
  if (!wingLogic) return { fatal: 'wing-not-equipped' };
  let wingImg = null;
  for (let i = 0; i < 100 && !(wingImg && wingImg.width > 0); i++) {
    wingImg = r.atlas.ensureVImage(`vanilla/Wings_${wingLogic}.png`);
    if (!(wingImg && wingImg.width > 0)) await new Promise((res) => setTimeout(res, 100));
  }
  if (!wingImg || !wingImg.width) return { fatal: 'wing-img-missing', wingLogic };
  window.__wingImg = wingImg;

  // drawImage 探针:2D 原型（noshim 全量/shim 回退支）+ shim bound（quad 发射面）
  const P = CanvasRenderingContext2D.prototype;
  P.__wingLog2d = [];
  if (!P.__wingPatched) {
    P.__wingPatched = true;
    const orig = P.drawImage;
    P.drawImage = function (img, ...rest) {
      if (img === window.__wingImg && P.__wingLog2d.length < 20000) {
        P.__wingLog2d.push({ at: window.__tick, args: rest.map((v) => (typeof v === 'number' ? v : -999)) });
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
      if (img === window.__wingImg && shim.__wingLogGl.length < 20000) {
        shim.__wingLogGl.push({ at: window.__tick, args: rest.map((v) => (typeof v === 'number' ? v : -999)) });
      }
      return o.apply(this, arguments);
    };
  }

  // 起飞:按住跳
  g.input.setVirtualAction('Jump', true);
  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 256;
  const lx = lc.getContext('2d', { willReadFrequently: true });
  const hash32 = (d) => { let h = 0x811c9dc5; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16); };
  const ticks = [];
  const samples = [];
  for (let t = 0; t < 130; t++) {
    step();
    const flyingNow = !!p.inputJump && p.wingTime > 0 && p.jumpHold === 0 && p.vy !== 0;
    ticks.push({ t, wf: p.wingFrame, vy: +p.vy.toFixed(2), wt: Math.round(p.wingTime), jh: p.jumpHold, fly: flyingNow });
    if (flyingNow && t % 2 === 0) {
      const z = cam.zoom || 1;
      const [sx, sy] = cam.worldToScreen(p.cx, p.y + 8);
      const w = Math.round(140 * z), h = Math.round(64 * z);
      const x0 = Math.round(sx - w / 2), y0 = Math.round(sy - h / 2);
      lx.setTransform(1, 0, 0, 1, 0, 0);
      lx.clearRect(0, 0, lc.width, lc.height);
      lx.drawImage(r.canvas, x0, y0, w, h, 0, 0, w, h);
      const d = lx.getImageData(0, 0, w, h).data;
      samples.push({ t, hash: hash32(d) });
    }
  }
  const dist = (arr) => new Set(arr).size;
  const glLog = shim?.__wingLogGl ?? [];
  const log2d = P.__wingLog2d ?? [];
  const syOf = (log) => log.filter((e) => e.args.length === 8).map((e) => ({ at: e.at, sy: e.args[1] }));
  const syGl = syOf(glLog), sy2d = syOf(log2d);
  const flyTicks = ticks.filter((x) => x.fly);
  return {
    wingLogic,
    shimActiveAtEnd: !!shim?.active,
    tick: { n: ticks.length, flyTicks: flyTicks.length, wfDistinctAll: dist(ticks.map((x) => x.wf)), wfDistinctFly: dist(flyTicks.map((x) => x.wf)), wfSeqFly: flyTicks.slice(0, 20).map((x) => x.wf), wtHead: ticks.filter((x) => x.t > 20).slice(0, 6).map((x) => x.wt) },
    drawGl: { n: glLog.length, distinctSy: dist(syGl.map((e) => e.sy)), sySeq: syGl.slice(0, 24) },
    draw2d: { n: log2d.length, distinctSy: dist(sy2d.map((e) => e.sy)), sySeq: sy2d.slice(0, 24) },
    pixels: { n: samples.length, distinctHash: dist(samples.map((s) => s.hash)), hashSeq: samples.slice(0, 16).map((s) => s.hash) },
  };
});

console.log(JSON.stringify({ MODE, result, pageErrors: pageErrors.slice(0, 6) }, null, 1));
await browser.close();
process.exit(0);
