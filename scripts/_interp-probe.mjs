// ★interp 渲染插值活机闸（2026-10-14,?interp=1 灰度）:
//   ①静止场景 A/B（旗开/关）逐字节 md5（静止=prev==curr,lerp 恒等）
//   ②120fps 驱动（elapsed 8.33ms）运动场景:渲染期 cam 位≠逻辑位（插值生效证明）
//     ∧ 渲染后还原=逻辑位（物理域零污染）
//   ③60fps 驱动（elapsed 16.67ms）:alpha≈0 → A/B 逐字节（60 档零风险性质）
// 同步驱动口径:running=false+g.frame 手推;vnow 步进=目标帧距。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';
import { createHash } from 'node:crypto';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5204';
const results = [];
const chk = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`); };
const md5 = (b64) => createHash('md5').update(Buffer.from(b64, 'base64')).digest('hex');

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN + '/?interp=1&cloudcache=0');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261014 });
await pump(page, 40);
// 确定性套件（B1 同族）
await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  Object.getPrototypeOf(sky).constructor.cloudRegionBlit = false;
  const proto = Object.getPrototypeOf(sky);
  const origDraw = proto.draw;
  sky.draw = function (ctx, clock, viewW, viewH, camX, dtMs, camY) {
    return origDraw.call(this, ctx, clock, viewW, viewH, camX, 0, camY);
  };
  try { const sl = g.player.inv.slots; sl[g.player.selected] = null; } catch { /* */ }
  sky.maintainClouds = () => {};
  sky.drawAmbience = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 60; w.lightning = 0; w.update = () => {}; }
  window.__gladdSet = (v) => { r.constructor.gladd = v; };
  window.__interpSet = (v) => { g.constructor.interp = v; };
  // 插值观测:渲染期 cam 快照（renderer.render 头钩）+渲染后还原校验
  window.__iObs = [];
  const origRender = r.render.bind(r);
  r.render = function (...a) {
    const cam = a[0];
    window.__iObs.push({ duringCamX: cam.x, afterPlayerX: null, logicCamX: window.__logicCamX ?? null });
    return origRender(...a);
  };
  window.__pause = (v) => { g.paused = v; };
  window.__teleport = (x, y) => { g.player.x = x; g.player.y = y; g.player.vx = 0; g.player.vy = 0; g.camera.x = x; g.camera.y = y; };
  // 每帧渲染前记逻辑 cam 位（还原校验基准）
  window.__logicCamX = g.camera.x;
});
await page.evaluate(() => { window.__swGame.running = false; });
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false; m.options.data.waveQuality = 0;
}));
await page.evaluate(() => import('/src/render/TileFlames.ts').then((m) => m.tileFrameSeedFreezeForTest(true)));
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  Object.defineProperty(r, '_liquidNow', { get: () => 60_000, set: () => {}, configurable: true });
  window.__swGame.lighting.clock.tick = () => {};
});
await page.evaluate(() => import('/src/render/JudderSmooth.ts').then((m) => m.judderSmoothSetForTest(false)));
await page.evaluate(() => import('/src/render/MotionBlur.ts').then((m) => m.mblurSetForTest(false)));
await pump(page, 40);
await page.evaluate(() => window.__pause(true));

async function waitFrame(n, stepMs) {
  for (let i = 0; i < n; i++) {
    await page.evaluate((stepMs) => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + stepMs;
      window.__logicCamX = g.camera.x;
      g.frame(window.__vnow);
    }, stepMs);
  }
}
async function snap() {
  return page.evaluate(() => {
    const c = window.__swGame.renderer.canvas;
    const lc = document.createElement('canvas');
    lc.width = c.width; lc.height = c.height;
    const lx = lc.getContext('2d', { willReadFrequently: true });
    lx.drawImage(c, 0, 0);
    const d = lx.getImageData(0, 0, lc.width, lc.height).data;
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < d.length; i += CH) bin += String.fromCharCode.apply(null, d.subarray(i, Math.min(i + CH, d.length)));
    return { w: c.width, h: c.height, b64: btoa(bin) };
  });
}

// ---- ①静止 A/B 逐字节 ----
await waitFrame(4, 16.67);
await page.evaluate(() => window.__interpSet(false));
await waitFrame(2, 16.67);
const s1a = await snap();
await page.evaluate(() => window.__interpSet(true));
await waitFrame(2, 16.67);
const s1b = await snap();
chk('① 静止 A/B 逐字节（lerp 恒等域）', s1a.b64 === s1b.b64, md5(s1a.b64).slice(0, 8));

// ---- ②120fps 运动:渲染期插值位在途（强证据直读）+还原旁证 ----
// ★设计判例:重放配对法证伪——世界非确定性（NPC 游走/液体两臂漂移）,旗关双跑
//   都不对称（A≠A2）,「必差」判据无效。强证据=逐帧直读:__iObs 记 render 头
//   duringCamX（插值写后）与 frame 前逻辑位 before（上帧还原后物理位）——
//   during≠before 样本=插值公式在途（120fps 半数帧 alpha>0）;camX−iCamX 差=
//   一步相机位移量级=快照/物理位关系健康（还原泄漏会污染成中间位/漂移）。
await page.evaluate(() => {
  const g = window.__swGame;
  window.__pause(false);   // 物理域必须跑（follow/插值快照都在 fixedUpdate）
});
for (let i = 0; i < 24; i++) {
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.x += 2;
    window.__vnow += 8.33;
    window.__logicCamX = g.camera.x;   // frame 前（=上帧还原后物理位）
    g.frame(window.__vnow);
  });
}
const obs = await page.evaluate(() => {
  const pairs = window.__iObs.splice(-12);
  const g = window.__swGame;
  return {
    pairs: pairs.map((o) => ({ during: o.duringCamX, before: o.logicCamX })),
    camX: g.camera.x, iCamX: g._iCamX,
  };
});
const diffs = obs.pairs.filter((pr) => Math.abs(pr.during - pr.before) > 0.001);
chk('②120fps 渲染期插值位在途（during≠before 样本>0）', diffs.length > 0,
  `${diffs.length}/${obs.pairs.length};样本=${JSON.stringify(obs.pairs.slice(0, 4).map((p2) => [p2.before.toFixed(1), p2.during.toFixed(1)]))}`);
const gap = Math.abs(obs.camX - obs.iCamX);
chk('② 还原旁证（camX−iCamX=一步位移量级 0<g≤12px）', gap > 0 && gap <= 12,
  `camX=${obs.camX.toFixed(2)} iCamX=${obs.iCamX.toFixed(2)} gap=${gap.toFixed(2)}`);
await page.evaluate(() => window.__pause(true));

// ---- ③60fps A/B 逐字节（alpha≈0 域） ----
await page.evaluate(() => { clearInterval(window.__mover); window.__interpSet(false); });
await waitFrame(6, 16.67);
const s3a = await snap();
await page.evaluate(() => window.__interpSet(true));
await waitFrame(6, 16.67);
const s3b = await snap();
// 60fps 同步驱动:elapsed=16.67≈FIXED_DT → 每帧恰 1 步,acc≈0 → alpha≈0 → 逐位
chk('③ 60fps A/B 逐字节（alpha≈0 零风险域）', s3a.b64 === s3b.b64,
  s3a.b64 === s3b.b64 ? md5(s3a.b64).slice(0, 8) : `A=${md5(s3a.b64).slice(0, 8)} B=${md5(s3b.b64).slice(0, 8)}`);

if (pageErrors.length) { console.log('PAGE ERRORS:'); for (const e of pageErrors.slice(0, 5)) console.log('  ' + e); }
await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `HAS FAIL (${fails.length})` : 'ALL PASS');
process.exitCode = fails.length ? 1 : 0;
