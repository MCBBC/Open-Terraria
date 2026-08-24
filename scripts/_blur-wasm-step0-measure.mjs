// Step0 测量探针(anti-decompile-plan-v2 B3 光照 WASM 前置):
// 光照引擎占 rAF 帧比 + Scan/Blur 分解 —— go/no-go 数据。
// 方法:dev 页运行时补丁(不改任何源码),实例/原型级 wrap 精确计时:
//   g.frame → LightingEngine.compute → { runFullCycle | step }
//     → processScan → scanner.exportTo
//     → processBlurAndPresent → LightMap.blur (+Present 导出)
// 三相:walk(真实移动脏路径)/ forced(静止强制脏=稳态最坏)/ idle(空转 step 路径)。
// 运行:cd game && SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs --timeout=420000 scripts/_blur-wasm-step0-measure.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const PHASES = [
  { name: 'walk', ms: 30_000 },
  { name: 'forced', ms: 20_000 },
  { name: 'idle', ms: 10_000 },
];

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--use-gl=swiftshader'],
});
const p = await b.newPage();
await p.setViewport({ width: 1920, height: 1080 });
p.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await p.waitForFunction(() => window.__swGame?.world?.store, { timeout: 300_000 });
await new Promise((r) => setTimeout(r, 2500));

const report = await p.evaluate(async (phases) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame;
  g.enemySpawnEnabled = false;

  const { LightMap } = await import('/src/lighting/LightMap.ts');
  const { TileLightScanner } = await import('/src/lighting/TileLightScanner.ts');

  const S = {
    forceDirty: false,
    frames: [],        // {exec, interval}
    compute: [], scan: [], blurPresent: [], blur: [], exportTo: [],
    full: [], step: [],
    fullCount: 0, stepCount: 0, computeCount: 0,
  };
  const pct = (arr, q) => {
    if (!arr.length) return 0;
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(q * (a.length - 1)))];
  };
  const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
  const stats = (arr) => arr.length
    ? { n: arr.length, mean: +mean(arr).toFixed(4), p50: +pct(arr, .5).toFixed(4), p95: +pct(arr, .95).toFixed(4), p99: +pct(arr, .99).toFixed(4), max: +Math.max(...arr).toFixed(4) }
    : { n: 0 };

  // ---- 补丁(实例级 shadow / 原型级)----
  const origFrame = g.frame;
  let lastNow = performance.now();
  g.frame = function (now) {
    const t0 = performance.now();
    origFrame.call(this, now);
    S.frames.push({ exec: performance.now() - t0, interval: now - lastNow });
    lastNow = now;
  };
  const origCompute = g.lighting.compute;
  g.lighting.compute = function (...a) {
    if (S.forceDirty) this.dirty = true;
    const t0 = performance.now();
    origCompute.apply(this, a);
    S.compute.push(performance.now() - t0);
    S.computeCount++;
  };
  const origFull = g.lighting.runFullCycle;
  g.lighting.runFullCycle = function (...a) {
    const t0 = performance.now();
    origFull.apply(this, a);
    S.full.push(performance.now() - t0);
    S.fullCount++;
  };
  const origStep = g.lighting.step;
  g.lighting.step = function (...a) {
    const t0 = performance.now();
    origStep.apply(this, a);
    S.step.push(performance.now() - t0);
    S.stepCount++;
  };
  const origScan = g.lighting.processScan;
  g.lighting.processScan = function (...a) {
    const t0 = performance.now();
    origScan.apply(this, a);
    S.scan.push(performance.now() - t0);
  };
  const origBlurPresent = g.lighting.processBlurAndPresent;
  g.lighting.processBlurAndPresent = function (...a) {
    const t0 = performance.now();
    origBlurPresent.apply(this, a);
    S.blurPresent.push(performance.now() - t0);
  };
  const origBlur = LightMap.prototype.blur;
  LightMap.prototype.blur = function (...a) {
    const t0 = performance.now();
    origBlur.apply(this, a);
    S.blur.push(performance.now() - t0);
  };
  const origExport = TileLightScanner.prototype.exportTo;
  TileLightScanner.prototype.exportTo = function (...a) {
    const t0 = performance.now();
    origExport.apply(this, a);
    S.exportTo.push(performance.now() - t0);
  };

  // ---- 三相测量 ----
  const out = { phases: {}, region: {}, meta: {} };
  out.region = { rw: g.lighting.rw, rh: g.lighting.rh, cells: g.lighting.rw * g.lighting.rh };
  out.meta.viewTW = g.renderer?.viewTW ?? null;
  out.meta.frameCap = (window.__swOptions?.data?.frameCap) ?? 'n/a';

  const snap = (name, ms) => {
    const frames = S.frames.map((f) => f.exec);
    const intervals = S.frames.map((f) => f.interval).slice(1);
    const exportMs = S.blurPresent.map((v, i) => v - (S.blur[i] ?? 0));
    const sum = (a) => a.reduce((s, x) => s + x, 0);
    const totalFrame = sum(frames);
    out.phases[name] = {
      wallMs: ms,
      frames: frames.length,
      frameExec: stats(frames),
      frameInterval: stats(intervals),
      compute: { ...stats(S.compute), totalMs: +sum(S.compute).toFixed(2) },
      fullCycle: { n: S.fullCount, ...stats(S.full) },
      step: { n: S.stepCount, ...stats(S.step) },
      scan: { ...stats(S.scan), totalMs: +sum(S.scan).toFixed(2) },
      exportTo: { ...stats(S.exportTo), totalMs: +sum(S.exportTo).toFixed(2) },
      blur: { ...stats(S.blur), totalMs: +sum(S.blur).toFixed(2) },
      present: { ...stats(exportMs), totalMs: +sum(exportMs).toFixed(2) },
      share: {
        lightingOfFrame: +(sum(S.compute) / totalFrame * 100).toFixed(2),
        scanOfFrame: +(sum(S.scan) / totalFrame * 100).toFixed(2),
        blurOfFrame: +(sum(S.blur) / totalFrame * 100).toFixed(2),
        presentOfFrame: +(sum(exportMs) / totalFrame * 100).toFixed(2),
        blurOfLighting: +(sum(S.blur) / sum(S.compute) * 100).toFixed(2),
        scanOfLighting: +(sum(S.scan) / sum(S.compute) * 100).toFixed(2),
      },
    };
    S.frames.length = 0; S.compute.length = 0; S.scan.length = 0; S.blurPresent.length = 0;
    S.blur.length = 0; S.exportTo.length = 0; S.full.length = 0; S.step.length = 0;
    S.fullCount = 0; S.stepCount = 0; S.computeCount = 0;
  };

  // Phase A:walk(右移 + 每 2s 左挪 8 格防卡墙,相机持续移动 → dirty 路径)
  g.input.rightDown = true;
  let walkT0 = performance.now();
  const nudge = setInterval(() => { g.player.x -= 8 * 16; }, 2000);
  await sleep(phases[0].ms);
  clearInterval(nudge);
  g.input.rightDown = false;
  snap('walk', performance.now() - walkT0);

  // Phase B:静止 + 每帧强制 dirty(稳态最坏路径)
  await sleep(300);
  S.forceDirty = true;
  let forcedT0 = performance.now();
  await sleep(phases[1].ms);
  S.forceDirty = false;
  snap('forced', performance.now() - forcedT0);

  // Phase C:idle(不脏 → 4 tick 一态 step 路径)
  await sleep(300);
  let idleT0 = performance.now();
  await sleep(phases[2].ms);
  snap('idle', performance.now() - idleT0);

  return out;
}, PHASES);

console.log('=== Step0 光照成本测量(1920×1080, ?play=small) ===');
console.log(JSON.stringify(report, null, 1));
const w = report.phases.walk, f = report.phases.forced;
console.log('---- 判读 ----');
console.log(`region: ${report.region.rw}x${report.region.rh} = ${report.region.cells} 格`);
for (const [k, ph] of Object.entries(report.phases)) {
  console.log(`[${k}] 光照占帧 ${ph.share.lightingOfFrame}% | scan ${ph.share.scanOfFrame}% blur ${ph.share.blurOfFrame}% present ${ph.share.presentOfFrame}% | blur占光照 ${ph.share.blurOfLighting}% | 帧exec p95 ${ph.frameExec.p95}ms`);
}
await b.close();
process.exit(0);
