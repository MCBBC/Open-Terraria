// ★C13b 定谳普查（2026-09-30）——液体家族残余逐 op 形态清单+占比依据。
// 【背景】Trace-20260930T144504（Windows SHM）定谳:flushAcc self=1349ms + resolveTex=782ms
//  =逐 op shim 税;liqgl(09-27 转正)/liqpolish(09-29 转正)已批掉主循环/sparkle/glint/
//  微光带;残余逐 op 形态假设=①浸润带非微光支（水/岩浆/蜂蜜,bg+实心层双 pass）
//  ②斜面覆盖增强（bg,LiquidSlope 懒载表）③IIIII256 白色水面亮线（实心层）。
// 【本探针】水面场景逐帧统计三个液体调用跨度的 shim drawImage 计数差分（draws）
//  +批发射 quad 数（emitBatchQuads）——形态占比实证后动刀。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_c13b-census.mjs
import { launchBrowser, openPage, bootstrap, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const PROF_MS = Number(process.env.PROF_MS || 6000);

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
await bootstrap(page, ORIGIN);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260930 });
console.log('createGame:', gen?.ok, gen?.why ?? '');
await godMode(page, true);

await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
  const surf = Math.floor(g.world.groundLevel);
  const px = Math.floor(g.player.cx / 16);
  // ---- 湖:宽 120×深 10,土岸,岸线带 slope1/2 坡面块+半砖 ----
  const DIRT = window.__swTiles?.['dirt'] ?? 1;
  const x0 = px - 40, x1 = px + 80, ry = surf - 2, depth = 10;
  for (let x = x0 - 8; x <= x1 + 8; x++) {
    for (let y = ry - 6; y <= ry + depth + 6; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
  }
  // 湖底+两岸
  for (let x = x0 - 2; x <= x1 + 2; x++) { st.setTile(x, ry + depth, DIRT); st.setTile(x, ry + depth + 1, DIRT); st.setTile(x, ry + depth + 2, DIRT); }
  for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
  // 水
  for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + depth; y++) st.setLiquid(x, y, 255, 1);
  // 坡面岸块（slope1 右下斜/slope2 左下斜,贴水）→ 斜面增强+LiquidSlope 实心层带+III256 亮线
  for (let i = 0; i < 12; i++) {
    const sx = x0 + 2 + i * 3;
    st.setTile(sx, ry + depth - 1, DIRT); st.setSlope(sx, ry + depth - 1, 1 + (i % 2));
    st.setTile(sx + 1, ry + depth - 1, DIRT); st.setSlope(sx + 1, ry + depth - 1, 2 - (i % 2));
  }
  // 半砖水线（浸润带半砖支+足迹面）
  for (let x = x0 + 4; x <= x0 + 20; x++) { st.setTile(x, ry + depth - 1, DIRT); st.setHalfBrick(x, ry + depth - 1, true); }
  for (let x = x0 + 4; x <= x0 + 20; x++) st.setLiquid(x, ry + depth - 2, 255, 1);
  // 玩家落岸
  g.player.x = (x1 + 4) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
  window.__scene = { x0, x1, ry, depth, surf };

  // ---- 三调用跨度差分仪 ----
  const r = g.renderer;
  window.__shimDraws = () => {
    const s = r.bglShimStats()?.stats;
    return s ? { draws: s.draws, batch: s.emitBatchQuads, flushes: s.flushes, up: s.uploads } : null;
  };
  const wrap = (name) => {
    const proto = Object.getPrototypeOf(r);
    const orig = proto[name];
    window['__n_' + name] = 0;
    window['__d_' + name] = 0;
    window['__b_' + name] = 0;
    r[name] = function (...a) {
      const s0 = window.__shimDraws();
      const res = orig.apply(this, a);
      const s1 = window.__shimDraws();
      if (s0 && s1) {
        window['__d_' + name] += s1.draws - s0.draws;
        window['__b_' + name] += s1.batch - s0.batch;
      }
      window['__n_' + name]++;
      return res;
    };
  };
  wrap('drawLiquids');
  wrap('drawLiquidBehindSolidTiles');
  window.__censusSnap = () => ({
    bgLiq: { n: window.__n_drawLiquids, d: window.__d_drawLiquids, b: window.__b_drawLiquids },
    solid: { n: window.__n_drawLiquidBehindSolidTiles, d: window.__d_drawLiquidBehindSolidTiles, b: window.__b_drawLiquidBehindSolidTiles },
  });
  window.__vnow = performance.now();
  window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; g.frame(window.__vnow); } return window.__vnow; };
});

await page.evaluate(() => import('/src/render/WaterWaves.ts').then((m) => { window.__wwMod = m; }));
await freezeClock(page, { tod: 0.5 });
// 活帧:scene 重扫+acc 就绪
for (let i = 0; i < 12; i++) {
  await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(15); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
  const s = await page.evaluate(() => ({ path: window.__swGame.renderer.bglPathUsed, inv: window.__swGame.renderer._waveLiquidInView }));
  if (s.path.startsWith('b2b-acc') && s.inv) { console.log('scene ready:', JSON.stringify(s)); break; }
}
// 波场定格（对拍/计数确定性——worker 场吞掉）
await page.evaluate(() => {
  window.__swGame.paused = true; window.__swGame.running = false;
  const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  const ww = window.__wwMod.waterWaves;
  if (!ww.__fieldFrozen) { ww.__origApplyField = ww._wwApplyField.bind(ww); ww._wwApplyField = function () { }; ww.__fieldFrozen = true; }
  const origFrame = ww.frame.bind(ww);
  ww.frame = function (fi) { return origFrame({ ...fi, dt: 0 }); };
});

// ---- 计数窗（paused 单帧驱动 ×N,差分口径）----
const snap0 = await page.evaluate(() => window.__censusSnap());
await page.evaluate(() => { window.__drive(120); });
const snap1 = await page.evaluate(() => window.__censusSnap());
const sh = await page.evaluate(() => window.__shimDraws());
const dBg = snap1.bgLiq.d - snap0.bgLiq.d, nBg = snap1.bgLiq.n - snap0.bgLiq.n;
const dSo = snap1.solid.d - snap0.solid.d, nSo = snap1.solid.n - snap0.solid.n;
console.log(`[census] 120 frames:`);
console.log(`  bg drawLiquids        calls=${nBg} shimDraws=${dBg} (${(dBg / Math.max(1, nBg)).toFixed(1)}/call) batchQuads=${snap1.bgLiq.b - snap0.bgLiq.b} (${((snap1.bgLiq.b - snap0.bgLiq.b) / Math.max(1, nBg)).toFixed(0)}/call)`);
console.log(`  solid-layer bands     calls=${nSo} shimDraws=${dSo} (${(dSo / Math.max(1, nSo)).toFixed(1)}/call) batchQuads=${snap1.solid.b - snap0.solid.b} (${((snap1.solid.b - snap0.solid.b) / Math.max(1, nSo)).toFixed(0)}/call)`);
console.log(`  shim totals: ${JSON.stringify(sh)}`);

// ---- V8 self 聚合（液体三函数+shim 税面）----
const cdp = await page.target().createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.evaluate(() => { window.__drive(60); });
await new Promise((r) => setTimeout(r, PROF_MS));
// 采样窗内持续驱动
await page.evaluate(async (ms) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { window.__drive(30); await new Promise((r) => setTimeout(r, 16)); }
}, PROF_MS);
const { profile } = await cdp.send('Profiler.stop');
await cdp.detach();
const selfUs = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const id = profile.samples[i];
  selfUs.set(id, (selfUs.get(id) || 0) + (profile.timeDeltas[i] || 0));
}
const agg = {};
for (const n of profile.nodes) {
  const fn = n.callFrame.functionName || '(anonymous)';
  const us = selfUs.get(n.id) || 0;
  if (us > 0) agg[fn] = (agg[fn] || 0) + us;
}
const total = [...selfUs.values()].reduce((a, b) => a + b, 0) / 1000;
const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 30)
  .map(([k, v]) => `${k}:${(v / 1000).toFixed(0)}`);
console.log(`[profile] total=${total.toFixed(0)}ms`);
console.log('[top]', top.join(' '));
const FNS = ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly', 'flushAcc', 'resolveTex', 'decode', 'push', 'drawImage', 'quadSprite', 'attachAcc', 'finishAccFrame'];
for (const k of FNS) console.log(`  ${k}: ${((agg[k] || 0) / 1000).toFixed(1)}ms (${(((agg[k] || 0) / 1000 / total) * 100).toFixed(2)}%)`);

if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
process.exit(0);
