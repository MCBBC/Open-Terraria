// 一次性:主菜单帧成本基线/修复对比探针(第二轮:miss率/可裁剪云/逐帧直方图)。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_menu-perf.mjs [秒数=20]
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SECS = Number.isFinite(Number(process.argv[process.argv.length - 1]))
  ? Number(process.argv[process.argv.length - 1]) : 20;
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 900 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction('!!window.__swMenuBg', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 3000));

const report = await page.evaluate(async (secs) => {
  const mb = window.__swMenuBg;
  const sky = mb.sky;
  const proto = Object.getPrototypeOf(sky);
  // ---- cloudTint miss 率:包 cache.get 数命中,cloudTint 数调用 ----
  const cache = sky.cloudTintCache;
  const origGet = cache.get.bind(cache);
  let hits = 0;
  cache.get = (k) => { const v = origGet(k); if (v) hits++; return v; };
  let ctCalls = 0, ctMs = 0;
  const origCt = proto.cloudTint;
  proto.cloudTint = function (...a) { ctCalls++; const t0 = performance.now(); const r = origCt.apply(this, a); ctMs += performance.now() - t0; return r; };
  // ---- 每帧主计时:包 tick(整帧)与子段 ----
  let tickN = 0, tickMs = 0, skyDrawMs = 0, forestMs = 0;
  const origTick = Object.getPrototypeOf(mb).tick;
  Object.getPrototypeOf(mb).tick = function (...a) {
    tickN++; const t0 = performance.now(); const r = origTick.apply(this, a); tickMs += performance.now() - t0; return r;
  };
  const origDraw = proto.draw;
  proto.draw = function (...a) { const t0 = performance.now(); const r = origDraw.apply(this, a); skyDrawMs += performance.now() - t0; return r; };
  const origDF = Object.getPrototypeOf(mb).drawForest;
  Object.getPrototypeOf(mb).drawForest = function (...a) { const t0 = performance.now(); const r = origDF.apply(this, a); forestMs += performance.now() - t0; return r; };
  // ---- drawImage 总数(主 ctx) ----
  const dctx = Object.getPrototypeOf(mb.ctx || mb.canvas.getContext('2d'));
  let diCalls = 0;
  if (!dctx.__swWrapped) {
    const origDI = dctx.drawImage;
    dctx.drawImage = function (...a) { diCalls++; return origDI.apply(this, a); };
    dctx.__swWrapped = true;
  }
  // ---- rAF 间隔 ----
  const deltas = [];
  let last = performance.now();
  let rafOn = true;
  const rafLoop = (t) => { if (!rafOn) return; deltas.push(t - last); last = t; requestAnimationFrame(rafLoop); };
  requestAnimationFrame(rafLoop);

  const t0 = performance.now();
  const beats = [];
  const beatsN = Math.ceil(secs / 2);
  for (let i = 0; i < beatsN; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const dt = performance.now() - t0 - i * 2000;
    const frames = tickN;
    // 屏外可裁剪云统计(用 drawCloudPass 同款 yOf 近似:pass1 y=c.y+distY,distY 逐帧算——这里粗算 y 范围)
    let offX = 0, visX = 0;
    const W = mb.canvas.width, H = mb.canvas.height;
    for (const c of sky.vclouds) {
      const tex = sky.cloudTexs[c.type];
      const w = (tex ? tex.width : 200) * c.scale;
      if (c.x + w < -8 || c.x > W + 8) offX++; else visX++;
    }
    beats.push({
      t: +(performance.now() - t0).toFixed(0), frames,
      fps: +(frames / (dt / 1000)).toFixed(1),
      frameMs: +(dt / frames).toFixed(2),
      tickMs: +tickMs.toFixed(1), skyDrawMs: +skyDrawMs.toFixed(1), forestMs: +forestMs.toFixed(1),
      cloudTint: { calls: ctCalls, hits, missRate: ctCalls ? +((ctCalls - hits) / ctCalls).toFixed(3) : 0, ms: +ctMs.toFixed(1) },
      drawImageCalls: diCalls,
      clouds: { total: sky.vclouds.length, visX, offX },
      cacheSize: cache.size,
      day: +mb.clockTime().toFixed(3),
    });
    ctCalls = 0; hits = 0; ctMs = 0; tickN = 0; tickMs = 0; skyDrawMs = 0; forestMs = 0; diCalls = 0;
  }
  rafOn = false;
  const ds = [...deltas].sort((a, b) => a - b);
  return {
    beats,
    raf: { n: ds.length, p50: +ds[(ds.length >> 1)].toFixed(2), p95: +ds[(ds.length * 0.95) | 0].toFixed(2), p99: +ds[(ds.length * 0.99) | 0].toFixed(2), max: +ds[ds.length - 1].toFixed(1) },
  };
}, SECS);
console.log(JSON.stringify(report, null, 1));
await browser.close();
