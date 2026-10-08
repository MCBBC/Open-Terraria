// ★C7 液体渲染面普查 v2（2026-10-08）——活帧口径:aP(drawVanillaLiquids) 自耗构成
//  拆解+残余逐格 2D 归因。v1 教训:paused 帧与活帧路径不同（span 内 push 计数=0 vs
//  活帧 14.3 段/帧）,普查必须活帧。
// 【方法】五臂黑盒差分（页级 URL 旗翻面,场景/驱动/采样窗全同）:
//   default   全旗现役（liqgl/c13b/c13c/liqpolish/swperf 缺省全开）
//   liqgl0    ?liqgl=0  整液体面回 CPU 原链（全逐格基准）
//   c13b0     ?c13b=0   非微光浸润带+III256 亮线+斜面增强批臂关 → 残差=该族
//   c13c0     ?c13c=0   微光波场/带批臂关（回 CPU 双线性张量+CPU 直画）
//   polish0   ?liqpolish=0 ADD(sparkle/glint)+fg 复用臂关
// 每臂:60 活帧采样——shim push 差分（批量段/quad/2D op 三账）、原生 2D 直画签名
//  分类、span 期 acc/avail 计数、帧耗、V8 self 分解（100µs）。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=1200000 scripts/_c7-liq-census.mjs
import { launchBrowser, openPage, createGame, godMode } from '../tools/probe/lib/index.mjs';
import { gotoApp } from '../tools/probe/lib/boot.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const ARMS = (process.env.C7_ARMS || 'default,liqgl0,c13b0,c13c0,polish0').split(',');
const results = {};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));

for (const arm of ARMS) {
  // ★手工引导（_c13c-ab FB 判谳 2026-10-03）:bootstrap 的 cleanStorage 与带参 boot
  //  链竞态间歇断桥——gotoApp 带参+等桥即可。
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
    const x0 = px - 50, x1 = px + 50, ry = surf - 6, depth = 44;
    for (let x = x0 - 6; x <= x1 + 6; x++) {
      for (let y = ry - 8; y <= ry + depth + 6; y++) { st.setTile(x, y, 0); st.setLiquid(x, y, 0, 0); }
    }
    for (let x = x0 - 2; x <= x1 + 2; x++) for (let d = 0; d < 3; d++) st.setTile(x, ry + depth + d, DIRT);
    for (let y = ry; y <= ry + depth; y++) { st.setTile(x0 - 1, y, DIRT); st.setTile(x1 + 1, y, DIRT); }
    for (let x = x0; x <= x1; x++) for (let y = ry; y < ry + 30; y++) st.setLiquid(x, y, 255, 1);
    for (let x = x0 + 20; x < x0 + 32; x++) for (let y = ry + 10; y < ry + 18; y++) { st.setLiquid(x, y, 255, 2); st.setTile(x, y, 0); }
    for (let x = x1 - 16; x < x1 - 6; x++) for (let y = ry + 12; y < ry + 20; y++) { st.setLiquid(x, y, 255, 3); st.setTile(x, y, 0); }
    for (let i = 0; i < 14; i++) {
      const sx = x0 + 4 + i * 5;
      st.setTile(sx, ry + depth - 1, DIRT); st.setSlope(sx, ry + depth - 1, 1 + (i % 2));
      st.setTile(sx + 1, ry + depth - 1, DIRT); st.setSlope(sx + 1, ry + depth - 1, 2 - (i % 2));
    }
    for (let x = x0 + 6; x <= x0 + 26; x++) { st.setTile(x, ry + depth - 1, SAND); st.setHalfBrick(x, ry + depth - 1, true); }
    for (let x = x0 + 6; x <= x0 + 26; x++) st.setLiquid(x, ry + depth - 2, 255, 1);
    g.player.x = (x1 - 2) * 16; g.player.y = (ry - 3) * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.x; g.camera.y = g.player.y;
    window.__vnow = performance.now();
    window.__drive = (n) => { for (let i = 0; i < n; i++) { window.__vnow += 16.6667; window.__swGame.frame(window.__vnow); } return window.__vnow; };
    // ---- 仪器:shim push 差分+span acc+原生 2D 签名 ----
    window.__inSpan = 0;
    window.__sig = {};
    window.__push = { rgba: 0, rgbaFalse: 0, add: 0, q: 0 };
    window.__span = { n: 0, acc: 0, avail: 0 };
    const r = g.renderer;
    const origDl = r.drawLiquids.bind(r);
    r.drawLiquids = function (...a) {
      window.__span.n++; if (r._accMode === 'acc') window.__span.acc++;
      if (r.liqBatchAvail()) window.__span.avail++;
      window.__inSpan++;
      try { return origDl(...a); } finally { window.__inSpan--; }
    };
    const origSo = r.drawLiquidBehindSolidTiles.bind(r);
    r.drawLiquidBehindSolidTiles = function (...a) {
      window.__span.n++; window.__inSpan++;
      try { return origSo(...a); } finally { window.__inSpan--; }
    };
    const proto = CanvasRenderingContext2D.prototype;
    if (!window.__nativePatched) {
      const odi = proto.drawImage, ofr = proto.fillRect;
      const tag = function (kind, a) {
        if (!window.__inSpan) return;
        let k = kind;
        try {
          const img = a[0];
          const isCv = img instanceof HTMLCanvasElement;
          const isBm = typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap;
          k += '|' + (isCv ? 'cv' : isBm ? 'bm' : typeof img) + (img ? `:${img.width}x${img.height}` : '');
        } catch { /* noop */ }
        window.__sig[k] = (window.__sig[k] || 0) + 1;
      };
      proto.drawImage = function (...a) { tag('di', a); return odi.apply(this, a); };
      proto.fillRect = function (...a) { tag('fr', a); return ofr.apply(this, a); };
      window.__nativePatched = true;
    }
  });
  await page.evaluate(() => import('/src/render/glshim/GLShimExecutor.ts').then((m) => {
    const S = m.GLShimExecutor.prototype;
    if (!window.__pushPatched) {
      const oR = S.pushQuadBatchRgba, oA = S.pushLiquidAddBatch;
      S.pushQuadBatchRgba = function (...a) {
        const ok = oR.apply(this, a);
        if (window.__inSpan) { window.__push.rgba++; window.__push.q += a[3] | 0; if (!ok) window.__push.rgbaFalse++; }
        return ok;
      };
      S.pushLiquidAddBatch = function (...a) {
        const ok = oA.apply(this, a);
        if (window.__inSpan) { window.__push.add++; if (!ok) window.__push.rgbaFalse++; }
        return ok;
      };
      window.__pushPatched = true;
    }
  }));
  await page.evaluate(() => import('/src/render/VanillaLiquidRenderer.ts').then((m) => { window.__liqMod = m; }));
  // 活帧暖机（scene 重扫+acc/波场就绪）
  let ready = false;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => { window.__swGame._forceSceneRescan = true; window.__drive(20); const g = window.__swGame; g.camera.x = g.player.x; g.camera.y = g.player.y; });
    const s = await page.evaluate(() => ({ path: window.__swGame.renderer.bglPathUsed, inv: window.__swGame.renderer._waveLiquidInView }));
    if (s.path.startsWith('b2b-acc') && s.inv) { ready = true; break; }
  }
  console.log(`[${arm}] scene ready=${ready}`);
  await page.evaluate(() => { window.__push = { rgba: 0, rgbaFalse: 0, add: 0, q: 0 }; window.__sig = {}; window.__span = { n: 0, acc: 0, avail: 0 }; });

  // ---- V8 self 分解（与计数同窗:60 活帧）----
  const cdp = await page.target().createCDPSession();
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  const tm = await page.evaluate(() => { const t = performance.now(); window.__drive(60); return performance.now() - t; });
  const { profile } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const frameMs = tm / 60;
  const cnt = await page.evaluate(() => ({
    push: { ...window.__push }, sig: { ...window.__sig }, span: { ...window.__span },
    ovfH: window.__liqMod?.liqRingOverflow?.() ?? null, ovfS: window.__liqMod?.liqBatchSoftOverflow?.() ?? null,
    path: window.__swGame.renderer.bglPathUsed,
  }));
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
  const FNS = ['drawVanillaLiquids', 'drawLiquidBehindTilesOnly', 'batQuad', 'shimQuad', 'texFor', 'at', 'sampleGlint', 'sampleDisplace', 'flushAcc', 'drawImage', 'pushQuadBatchRgba', 'replayLiqRun2D', 'applyShimmerBaseTint', 'tileSolidLut', 'liquidCacheIsSolid', 'getCornerLight', 'lightAt', 'shimmerWave', 'emitLiquidQuadBatch', 'glow', 'drawWindSwayTiles'];
  const row = {};
  for (const k of new Set(FNS)) { const v = (agg[k] || 0) / 1000; if (v > 0.05) row[k] = +v.toFixed(1); }
  const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 16)
    .map(([k, v]) => `${k}:${(v / 1000).toFixed(0)}`);
  console.log(`[${arm}] frameMs=${frameMs.toFixed(2)} span(n=${cnt.span.n} acc=${cnt.span.acc} avail=${cnt.span.avail}) push(rgba=${(cnt.push.rgba / 60).toFixed(1)}/f quads=${(cnt.push.q / 60).toFixed(0)}/f add=${(cnt.push.add / 60).toFixed(1)}/f fail=${cnt.push.rgbaFalse}) ovf=[${cnt.ovfH},${cnt.ovfS}] native2D=${JSON.stringify(cnt.sig)}`);
  console.log(`[${arm}] [profile] total=${total.toFixed(0)}ms`);
  console.log(`[${arm}] [top]`, top.join(' '));
  results[arm] = {
    frameMs: +frameMs.toFixed(2), segPerF: +(cnt.push.rgba / 60).toFixed(1), qPerF: +(cnt.push.q / 60).toFixed(0),
    addPerF: +(cnt.push.add / 60).toFixed(1), native2D: cnt.sig, aP: row.drawVanillaLiquids ?? 0,
    band: row.drawLiquidBehindTilesOnly ?? 0, profile: row, total: +total.toFixed(0),
  };
  console.log(`[${arm}] self: aP=${row.drawVanillaLiquids ?? 0}ms band=${row.drawLiquidBehindTilesOnly ?? 0}ms flushAcc=${row.flushAcc ?? 0}ms drawImage=${row.drawImage ?? 0}ms batQuad=${row.batQuad ?? 0}ms shimQuad=${row.shimQuad ?? 0}ms sampleGlint=${row.sampleGlint ?? 0}ms texFor=${row.texFor ?? 0}ms`);
}

console.log('\n=== C7 census v2 summary (per-frame, 60 live frames) ===');
for (const [arm, r] of Object.entries(results)) {
  console.log(`${arm}\tframeMs=${r.frameMs}\tsegs/f=${r.segPerF}\tquads/f=${r.qPerF}\tadd/f=${r.addPerF}\tnative2D=${JSON.stringify(r.native2D)}\taP=${r.aP}ms\tband=${r.band}ms`);
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3).join(' | '));
process.exit(0);
