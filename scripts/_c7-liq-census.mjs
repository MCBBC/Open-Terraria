// ★C7 液体渲染面普查（2026-10-08）——aP(drawVanillaLiquids) 自耗构成拆解+残余逐格 2D 归因。
// 【方法】五臂黑盒差分（页级 URL 旗翻面,场景/驱动/采样窗全同）:
//   default   全旗现役（liqgl/c13b/c13c/liqpolish/swperf 缺省全开）
//   liqgl0    ?liqgl=0  整液体面回 CPU 原链（全逐格基准）
//   c13b0     ?c13b=0   非微光浸润带+III256 亮线+斜面增强批臂关 → 残差=该族 draws
//   c13c0     ?c13c=0   微光波场/带批臂关（回 CPU 双线性张量+CPU 直画）
//   polish0   ?liqpolish=0 ADD(sparkle/glint)+fg 复用臂关
// 每臂:drawLiquids/实心层带 span 内 shim drawImage 差分（逐格 2D 残余的直接量）、
// 批 quad 数、溢出位探针、帧耗、V8 self 分解（100µs 采样）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=1200000 scripts/_c7-liq-census.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { gotoApp } from '../tools/probe/lib/boot.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const ARMS = (process.env.C7_ARMS || 'default,liqgl0,c13b0,c13c0,polish0').split(',');
const FRAMES = Number(process.env.C7_FRAMES || 120);
const results = {};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

for (const arm of ARMS) {
  // ★手工引导（_c13c-ab FB 判谳 2026-10-03）:bootstrap 的 cleanStorage 与带参 boot
  //  链竞态间歇断桥——每次全新 browser 实例不需要 idb 清扫,gotoApp 带参+等桥即可。
  const q = arm === 'default' ? '' : arm === 'liqgl0' ? '?liqgl=0' : arm === 'c13b0' ? '?c13b=0'
    : arm === 'c13c0' ? '?c13c=0' : arm === 'polish0' ? '?liqpolish=0' : '';
  const nav = await gotoApp(page, ORIGIN, { extraQuery: q, tries: 20 });
  if (!nav) { console.log(`[${arm}] gotoApp FAIL`); continue; }
  const bridged = await page.waitForFunction(
    () => typeof window.__swFlow === 'object' && !!window.__swFlow?.newWorld,
    { timeout: 180000, polling: 500 }).then(() => true).catch(() => false);
  if (!bridged) { console.log(`[${arm}] bridge FAIL`); continue; }
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20261008 });
  console.log(`[${arm}] createGame:`, gen?.ok, gen?.why ?? '');
  await godMode(page, true);

  // ---- 场景:满视口水体（水全幅+岩浆/蜂蜜囊+坡面岸+半砖水线）----
  await page.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    for (const b of document.querySelectorAll('button')) if (/我知道了/.test(b.textContent || '')) b.click();
    const surf = Math.floor(g.world.groundLevel);
    const px = Math.floor(g.player.cx / 16);
    const DIRT = window.__swTiles?.['dirt'] ?? 1;
    const SAND = window.__swTiles?.['sand'] ?? 53;
    // 视口 1280x800@z1 ≈ 80x50 格;窗 ±4 margin → 建 100 宽 × 46 深
    const x0 = px - 50, x1 = px + 50, ry = surf - 6, depth = 44;
    for (let x = x0 - 6; x <= x1 + 6; x++) {
      for (let y = ry - 8; y <= ry + depth + 6; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
    }
    // 底+两岸
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let d = 0; d < 3; d++) st.setTile(x, ry + depth + d, DIRT);
    for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
    // 水:上 30 行;中段岩浆囊 12×8;右段蜂蜜囊 10×8
    for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + 30; y++) st.setLiquid(x, y, 255, 1);
    for (let x = x0 + 20; x < x0 + 32; x++) for (let y = ry + 10; y < ry + 18; y++) { st.setLiquid(x, y, 255, 2); st.setTile(x, y, 0); }
    for (let x = x1 - 16; x < x1 - 6; x++) for (let y = ry + 12; y < ry + 20; y++) { st.setLiquid(x, y, 255, 3); st.setTile(x, y, 0); }
    // 坡面岸块（slope1/2 贴水线）→ 斜面增强+LiquidSlope 实心层带+III256 亮线
    for (let i = 0; i < 14; i++) {
      const sx = x0 + 4 + i * 5;
      st.setTile(sx, ry + depth - 1, DIRT); st.setSlope(sx, ry + depth - 1, 1 + (i % 2));
      st.setTile(sx + 1, ry + depth - 1, DIRT); st.setSlope(sx + 1, ry + depth - 1, 2 - (i % 2));
    }
    // 半砖水线
    for (let x = x0 + 6; x <= x0 + 26; x++) { st.setTile(x, ry + depth - 1, SAND); st.setHalfBrick(x, ry + depth - 1, true); }
    for (let x = x0 + 6; x <= x0 + 26; x++) st.setLiquid(x, ry + depth - 2, 255, 1);
    // 沙“岛”脊（浸润带侧条面）
    for (let x = x0 + 40; x <= x0 + 52; x++) { st.setTile(x, ry + 16, DIRT); }
    g.player.x = (x1 - 2) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    window.__scene = { x0, x1, ry, depth, surf };
  });

  await page.evaluate(() => {
    const r = window.__swGame.renderer;
    window.__shimDraws = () => {
      const s = r.bglShimStats()?.stats;
      return s ? { draws: s.draws, batch: s.emitBatchQuads, flushes: s.flushes, up: s.uploads, rep: s.replays, fb: s.fallback, so: s.emitSO, add: s.emitADD } : null;
    };
    const wrap = (name) => {
      const orig = r[name].bind(r);
      window['__n_' + name] = 0; window['__d_' + name] = 0; window['__b_' + name] = 0; window['__t_' + name] = 0;
      r[name] = function (...a) {
        const s0 = window.__shimDraws(); const t0 = performance.now();
        const res = orig(...a);
        const t1 = performance.now(); const s1 = window.__shimDraws();
        if (s0 && s1) { window['__d_' + name] += s1.draws - s0.draws; window['__b_' + name] += s1.batch - s0.batch; }
        window['__t_' + name] += t1 - t0;
        window['__n_' + name]++;
        return res;
      };
    };
    wrap('drawLiquids');
    wrap('drawLiquidBehindSolidTiles');
    // 原生 2D 直画计数（acc 态应为 0——直画全走 shim rec）
    const proto = CanvasRenderingContext2D.prototype;
    window.__native = { di: 0, fr: 0 };
    if (!window.__nativePatched) {
      const odi = proto.drawImage, ofr = proto.fillRect;
      proto.drawImage = function (...a) { window.__native.di++; return odi.apply(this, a); };
      proto.fillRect = function (...a) { window.__native.fr++; return ofr.apply(this, a); };
      window.__nativePatched = true;
    }
    window.__liqState = () => {
      const g = window.__swGame; const d = g.renderer;
      return {
        path: d.bglPathUsed, accMode: d._accMode, inv: d._waveLiquidInView,
        liqDbg: window.__liqMod?.liquidDebugState?.(),
        ovfHard: window.__liqMod?.liqRingOverflow?.() ?? null,
        ovfSoft: window.__liqMod?.liqBatchSoftOverflow?.() ?? null,
      };
    };
    window.__vnow = performance.now();
    window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__swGame.frame(window.__vnow); } return window.__vnow; };
  });
  await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__liqMod = m; }));
  await freezeClock(page, { tod: 0.5 });
  // 活帧:scene 重扫+acc 就绪
  let ready = false;
  for (let i = 0; i < 14; i++) {
    await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(15); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
    const s = await page.evaluate(() => ({ path: window.__swGame.renderer.bglPathUsed, inv: window.__swGame.renderer._waveLiquidInView }));
    if (s.path.startsWith('b2b-acc') && s.inv) { ready = true; break; }
  }
  console.log(`[${arm}] scene ready=${ready}`);
  // 波场定格（计数确定性）
  await page.evaluate(() => {
    window.__swGame.paused = true; window.__swGame.running = false;
    const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y;
  });

  // ---- 计数窗 ----
  const s0 = await page.evaluate(() => ({
    liq: { n: window.__n_drawLiquids, d: window.__d_drawLiquids, b: window.__b_drawLiquids, t: window.__t_drawLiquids },
    sol: { n: window.__n_drawLiquidBehindSolidTiles, d: window.__d_drawLiquidBehindSolidTiles, b: window.__b_drawLiquidBehindSolidTiles, t: window.__t_drawLiquidBehindSolidTiles },
    sh: window.__shimDraws(), nat: { ...window.__native }, st: window.__liqState(),
  }));
  const t0 = await page.evaluate(() => { const t = performance.now(); window.__drive(30); return { dt: performance.now() - t }; });
  const s1 = await page.evaluate(() => ({
    liq: { n: window.__n_drawLiquids, d: window.__d_drawLiquids, b: window.__b_drawLiquids, t: window.__t_drawLiquids },
    sol: { n: window.__n_drawLiquidBehindSolidTiles, d: window.__d_drawLiquidBehindSolidTiles, b: window.__b_drawLiquidBehindSolidTiles, t: window.__t_drawLiquidBehindSolidTiles },
    sh: window.__shimDraws(), nat: { ...window.__native }, st: window.__liqState(),
  }));
  const nF = 30;
  const dLiq = s1.liq.d - s0.liq.d, nLiq = s1.liq.n - s0.liq.n;
  const dSol = s1.sol.d - s0.sol.d, nSol = s1.sol.n - s0.sol.n;
  const frameMs = t0.dt / nF;
  console.log(`[${arm}] frameMs=${frameMs.toFixed(2)} drawLiquids calls=${nLiq} shimDraws/call=${(dLiq / Math.max(1, nLiq)).toFixed(1)} batchQuads/call=${((s1.liq.b - s0.liq.b) / Math.max(1, nLiq)).toFixed(0)} inclMs/call=${((s1.liq.t - s0.liq.t) / Math.max(1, nLiq)).toFixed(2)}`);
  console.log(`[${arm}] solidBands calls=${nSol} shimDraws/call=${(dSol / Math.max(1, nSol)).toFixed(1)} batchQuads/call=${((s1.sol.b - s0.sol.b) / Math.max(1, nSol)).toFixed(0)} inclMs/call=${((s1.sol.t - s0.sol.t) / Math.max(1, nSol)).toFixed(2)}`);
  console.log(`[${arm}] state path=${s1.st.path} accMode=${s1.st.accMode} ovfHard=${s1.st.ovfHard} ovfSoft=${s1.st.ovfSoft} native2D span-di=${s1.nat.di - s0.nat.di} span-fr=${s1.nat.fr - s0.nat.fr} shimRep=${s1.sh.rep - s0.sh.rep} shFB=${s1.sh.fb - s0.sh.fb}`);

  // ---- V8 self 分解（60 帧 paused 驱动）----
  const cdp = await page.target().createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await page.evaluate(() => { window.__drive(60); });
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const selfUs = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const id = profile.samples[i];
    selfUs.set(id, (selfUs.get(id) || 0) + (profile.timeDeltas[i] || 0));
  }
  const agg = {};
  for (const nd of profile.nodes) {
    const fn = nd.callFrame.functionName || '(anonymous)';
    const us = selfUs.get(nd.id) || 0;
    if (us > 0) agg[fn] = (agg[fn] || 0) + us;
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0) / 1000;
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 18)
    .map(([k, v]) => `${k}:${(v / 1000).toFixed(0)}`);
  console.log(`[${arm}] [profile] total=${total.toFixed(0)}ms`);
  console.log(`[${arm}] [top]`, top.join(' '));
  const FNS = ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly', 'batQuad', 'shimQuad', 'texFor', 'at', 'sampleGlint', 'sampleDisplace', 'flushAcc', 'drawImage', 'pushQuadBatchRgba', 'replayLiqRun2D', 'applyShimmerBaseTint', 'tileSolidLut', 'liquidCacheIsSolid', 'waterWaves', 'sampleDisplace', 'present'];
  const row = {};
  for (const k of new Set(FNS)) { const v = (agg[k] || 0) / 1000; if (v > 0) row[k] = +v.toFixed(1); }
  results[arm] = { frameMs, dLiqPerCall: +(dLiq / Math.max(1, nLiq)).toFixed(1), qLiqPerCall: +((s1.liq.b - s0.liq.b) / Math.max(1, nLiq)).toFixed(0), dSolPerCall: +(dSol / Math.max(1, nSol)).toFixed(1), qSolPerCall: +((s1.sol.b - s0.sol.b) / Math.max(1, nSol)).toFixed(0), ovf: [s1.st.ovfHard, s1.st.ovfSoft], aP: row.drawVanillaLiquids ?? 0, band: row.drawLiquidBehindTilesOnly ?? 0, profile: row, total: +total.toFixed(0) };
  console.log(`[${arm}] self: aP=${row.drawVanillaLiquids ?? 0}ms band=${row.drawLiquidBehindTilesOnly ?? 0}ms flushAcc=${row.flushAcc ?? 0}ms drawImage=${row.drawImage ?? 0}ms batQuad=${row.batQuad ?? 0}ms shimQuad=${row.shimQuad ?? 0}ms sampleGlint=${row.sampleGlint ?? 0}ms`);
}

console.log('\n=== C7 census summary ===');
for (const [arm, r] of Object.entries(results)) {
  console.log(`${arm}\tframeMs=${r.frameMs}\tliqDraws/call=${r.dLiqPerCall}\tliqQuads/call=${r.qLiqPerCall}\tsolDraws/call=${r.dSolPerCall}\tsolQuads/call=${r.qSolPerCall}\tovf=${r.ovf}\taP=${r.aP}ms\tband=${r.band}ms`);
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
process.exit(0);
