// 帧级 canvas 使用普查(2026-08-18):数"每帧实际作为绘制源的 canvas 数"。
// patch drawImage 按帧(rAF 边界)聚合去重源,分 HTMLCanvasElement/ImageBitmap;
// 另附常驻资产账(DOM canvas/chunk 页/云染缓存/单例)。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=240000 scripts/_framescan-probe.mjs
import { HOME, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = join(HOME, '.claude/jobs/8405c930/tmp');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/framescan-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  window.__frameSamples = [];          // 每帧去重源计数样本
  window.__srcIds = new WeakMap();
  let idSeq = 0;
  let perFrame = null;                 // {canvas:Set, bitmap:Set}
  const flush = () => {
    if (perFrame) window.__frameSamples.push({
      canvas: perFrame.canvas.size, bitmap: perFrame.bitmap.size,
      canvasDraws: perFrame.canvasDraws, bitmapDraws: perFrame.bitmapDraws,
    });
    perFrame = { canvas: new Set(), bitmap: new Set(), canvasDraws: 0, bitmapDraws: 0 };
  };
  const raf = () => { flush(); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...rest) {
    if (perFrame) {
      if (img instanceof HTMLCanvasElement) { perFrame.canvasDraws++; perFrame.canvas.add(img); }
      else if (img instanceof ImageBitmap) { perFrame.bitmapDraws++; perFrame.bitmap.add(img); }
    }
    return orig.call(this, img, ...rest);
  };
  // 常驻账:live canvas 总数(所有获得过 2d/webgl 上下文的)
  window.__liveCanvases = new WeakSet();
  const probeCtx = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    try { window.__liveCanvases.add(this); } catch {}
    return probeCtx.call(this, type, ...rest);
  };
});
page.setDefaultTimeout(300000);
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
console.log('世界就绪,采样 12s(前 6s 静止 + 后 6s 移动)…');
await sleep(6000);
const staticHalf = await page.evaluate(() => window.__frameSamples.splice(0));
for (let i = 0; i < 4; i++) { await page.evaluate(() => { window.__swGame.player.x += 600; }); await sleep(1500); }
const movingHalf = await page.evaluate(() => ({ s: window.__frameSamples.splice(0), live: document.querySelectorAll('canvas').length }));

const stat = (arr) => {
  const v = arr.map((x) => x.canvas).sort((a, b) => a - b);
  const cd = arr.map((x) => x.canvasDraws);
  const bd = arr.map((x) => x.bitmap);
  const bdd = arr.map((x) => x.bitmapDraws);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  return `帧数=${arr.length} 去重canvas源 p50=${v[Math.floor(v.length / 2)] ?? '-'} max=${v[v.length - 1] ?? '-'} | canvas绘制调用/帧 avg=${arr.length ? Math.round(sum(cd) / arr.length) : '-'} | 去重bitmap源 p50=${bd[Math.floor(bd.length / 2)] ?? '-'} | bitmap调用/帧 avg=${arr.length ? Math.round(sum(bdd) / arr.length) : '-'}`;
};
console.log(`[静止 6s] ${stat(staticHalf)}`);
console.log(`[移动 6s] ${stat(movingHalf.s)}`);

// 常驻账
const assets = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const sky = r.sky;
  return {
    domCanvas: document.querySelectorAll('canvas').length,
    chunkPages: g.chunks.pageCount,
    chunkCanvases: g.chunks.pageCount * 2,
    chunkCached: g.chunks.chunks.size,
    cloudTintCache: sky?.cloudTintCache?.size ?? -1,
    cloudTintFree: sky?.cloudTintFree?.length ?? -1,
  };
}).catch((e) => ({ err: String(e).slice(0, 120) }));
console.log('[常驻账]', JSON.stringify(assets));
await browser.close();
