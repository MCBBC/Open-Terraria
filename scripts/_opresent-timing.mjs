// ★opresent 帧耗时快机实测（2026-09-25;b2b GG 同款同步驱动口径,交错多轮消漂移）。
// A 臂=opresent 关（双 blit 现行为）;B 臂=开（单 present 合并）。每轮 120 帧×2 臂
// 交错 4 轮,取中位数+均值——兑现点=摘一次全屏 blit（IOSurface 往返+Skia 全幅
// drawImage 提交）应有小幅正收益;打平/微差亦可（GPU 侧异步,同步口径下限）。
// 运行:SW_ORIGIN=http://localhost:5214 node tools/run-diag.mjs --timeout=600000 scripts/_opresent-timing.mjs
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/?opresent=1');
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
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
  sky.drawAmbience = () => {};
  sky.ambEntities.length = 0;
  sky.ambNextAttempt = 1000000;
  const origBalloons = proto.drawPartyBalloonsNear;
  sky.drawPartyBalloonsNear = function (ctx, viewW, viewH, camX, dtMs) {
    return origBalloons.call(this, ctx, viewW, viewH, camX, 0);
  };
  sky.maintainClouds = () => {};
  r.biomeBg.update = () => {};
  const w = g.world.weather;
  if (w) { w.raining = false; w.cloudAlpha = 0; w.maxRaining = 0; w.numClouds = 200; w.lightning = 0; w.update = () => {}; }
  g.running = false;
  window.__opresentSet = (v) => r.constructor.opresentSetForTest(v);
});
await freezeClock(page, { tod: 0.5 });
await page.evaluate(() => import('/src/core/Options.ts').then((m) => {
  m.options.data.swayInWind = false;
  m.options.data.waveQuality = 2;
}));
await pump(page, 120);
await page.evaluate(() => { window.__swGame.renderer.biomeBg.update = () => {}; });
await page.evaluate(() => window.__swGame.paused = true);

async function waitFrame(n = 1) {
  for (let i = 0; i < n; i++) {
    await page.evaluate(() => {
      const g = window.__swGame;
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    });
  }
}
async function timing(frames = 120) {
  return page.evaluate((fr) => {
    const g = window.__swGame;
    const t0 = performance.now();
    for (let i = 0; i < fr; i++) {
      window.__vnow = (window.__vnow || performance.now()) + 16.6667;
      g.frame(window.__vnow);
    }
    return (performance.now() - t0) / fr;
  }, frames);
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

// ---- 场景 1:地表云雨重场景（numClouds=200;天空栈满载=合并收益最大面） ----
const A = [], B = [];
for (let round = 0; round < 4; round++) {
  await page.evaluate(() => window.__opresentSet(false));
  await waitFrame(4);
  A.push(await timing());
  await page.evaluate(() => window.__opresentSet(true));
  await waitFrame(4);
  B.push(await timing());
}
const mA = med(A), mB = med(B);
const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
console.log(`[地表·云200] A(双blit) 各轮=${A.map((v) => v.toFixed(2)).join('/')} med=${mA.toFixed(3)}ms avg=${avg(A).toFixed(3)}ms`);
console.log(`[地表·云200] B(单present) 各轮=${B.map((v) => v.toFixed(2)).join('/')} med=${mB.toFixed(3)}ms avg=${avg(B).toFixed(3)}ms`);
console.log(`[地表·云200] 合并净收益 med=${(mA - mB).toFixed(3)}ms/帧（${((mA - mB) / mA * 100).toFixed(2)}%）`);

// ---- 场景 2:水下 warp 重场景（扭曲链+门控纹理在场=pass3 拼接重面） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.world.groundLevel ?? 300);
  for (let y = py; y < py + 6; y++) {
    for (let x = px - 4; x < px + 5; x++) {
      if (!st.inBounds(x, y)) continue;
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      if (st.isSolid(x, y)) { st.type[i] = 0; st.flags[i] = 0; }
    }
  }
  g.player.y = py * 16 + 40; g.player.vy = 0;
});
await page.evaluate(() => { window.__swGame.paused = false; });
await pump(page, 40);
await page.evaluate(() => { window.__swGame.paused = true; });
await waitFrame(6);
const W = [], X = [];
for (let round = 0; round < 4; round++) {
  await page.evaluate(() => window.__opresentSet(false));
  await waitFrame(4);
  W.push(await timing());
  await page.evaluate(() => window.__opresentSet(true));
  await waitFrame(4);
  X.push(await timing());
}
const mW = med(W), mX = med(X);
console.log(`[水下warp]   A(双blit) 各轮=${W.map((v) => v.toFixed(2)).join('/')} med=${mW.toFixed(3)}ms avg=${avg(W).toFixed(3)}ms`);
console.log(`[水下warp]   B(单present) 各轮=${X.map((v) => v.toFixed(2)).join('/')} med=${mX.toFixed(3)}ms avg=${avg(X).toFixed(3)}ms`);
console.log(`[水下warp]   合并净收益 med=${(mW - mX).toFixed(3)}ms/帧（${((mW - mX) / mW * 100).toFixed(2)}%）`);
await browser.close();
