// SW-BM1 2026-09-06 第6项基线/复测探针:compositePaperDoll hair 单格病态尖峰定位。
//   量:hair 页首烘 + 暖重烘(hairColor 微动)全链 wall/longtask 清单/drawImage 慢调用
//      (源尺寸聚合)/createImageBitmap 计数/堆增量;look 页守线复测。
//   尖峰判别:longtask 时长 ≫ 该窗内插桩到的 drawImage 累计 → 非绘制面(GC/位图回调);
//      单个慢 drawImage 大源 → 解码/上传;慢调用均摊小但 task 长 → 批内格数过多。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  userDataDir: '/tmp/bm1-cc-' + (Date.now() % 100000),
  args: ['--no-proxy-server'],
});
const page = await browser.newPage();
await page.bringToFront();
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const go = await page.evaluate(() => !document.getElementById('sw-splash') && !!document.querySelector('[data-act=sp]'));
  if (go) break;
}
// ★SW-BM1: 直开面板(主菜单流受并行会话共享 UI.ts 在途态影响偶发失活——探针只测
//  烘焙管线,直接 import 模块构造面板,绕过菜单导航)
await page.evaluate(async () => {
  const { CharCreation } = await import('/src/ui/CharCreation.ts');
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:9999;';
  document.body.appendChild(root);
  window.__cc = new CharCreation(root, { onCreate() {}, onCancel() {} });
});
await page.waitForSelector('.sw-cc-tab[data-tab=look]', { timeout: 30000 });

await page.evaluate(() => {
  const W = window;
  W.__bm1 = {
    lt: [], diSlow: [], di: { n: 0, ms: 0 }, cib: 0, cibSlow: [], t0: performance.now(),
    gid: [], tob: [],
    mem0: (performance).memory?.usedJSHeapSize ?? 0,
    window: null,
    windows: [],
  };
  const A = W.__bm1;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) A.lt.push({ at: +e.startTime.toFixed(0), ms: +e.duration.toFixed(1) });
  }).observe({ entryTypes: ['longtask'] });

  const oGID = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function (...a) {
    const t = performance.now();
    const r = oGID.apply(this, a);
    const ms = performance.now() - t;
    A.gid.push({ t, ms: +ms.toFixed(1), w: a[2] ?? this.canvas.width, h: a[3] ?? this.canvas.height });
    return r;
  };
  const oTB = HTMLCanvasElement.prototype.toBlob;
  HTMLCanvasElement.prototype.toBlob = function (cb, ...a) {
    const t = performance.now();
    const r = oTB.call(this, (b) => { A.tob.push({ t, init: +(performance.now() - t).toFixed(1), w: this.width, h: this.height }); cb(b); }, ...a);
    return r;
  };

  const oDI = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
    const t = performance.now();
    const r = oDI.apply(this, [img, ...a]);
    const ms = performance.now() - t;
    A.di.n++; A.di.ms += ms;
    const w = (img && (img.width ?? 0)) || 0, h = (img && (img.height ?? 0)) || 0;
    if (ms > 5) A.diSlow.push({ ms: +ms.toFixed(1), w, h, src: (img && img.src ? String(img.src).slice(-40) : '') });
    return r;
  };
  const oCIB = globalThis.createImageBitmap;
  if (oCIB) {
    globalThis.createImageBitmap = function (src, ...a) {
      A.cib++;
      const t = performance.now();
      const p = oCIB.call(globalThis, src, ...a);
      return p.then((b) => {
        const ms = performance.now() - t;
        if (ms > 16) A.cibSlow.push({ ms: +ms.toFixed(1), w: src?.width ?? 0, h: src?.height ?? 0 });
        return b;
      });
    };
  }
});

// hair 页 mask on→off 窗口计时 + 窗内统计快照
const measureHair = async (label, tabSel, containerSel) => page.evaluate(async (label, tabSel, containerSel) => {
  const A = window.__bm1;
  const tab = document.querySelector(tabSel);
  if (!tab) return { label, error: 'no tab ' + tabSel };
  tab.click();
  let el = null;
  for (let i = 0; i < 40 && !el; i++) {
    el = document.querySelector(containerSel);
    if (!el) await new Promise((r) => requestAnimationFrame(r));
  }
  if (!el) return { label, error: 'no container ' + containerSel };
  const bmod = await import('/src/ui/charBake.ts');
  bmod.clearBakeStats();
  let maskOn = -1, maskOff = -1, bakeDone = -1;
  const t0 = performance.now();
  const w0 = { label, t0, t1: 0 };
  A.window = w0; A.windows.push(w0);
  // 轮询 baking 态(遮罩 120ms 延迟挂——快烘可能整程无 baking 类;6s 上限防挂)
  let sawBtnImg = false;
  for (let i = 0; i < 3600; i++) {
    const baking = el.classList.contains('baking');
    if (baking && maskOn < 0) maskOn = performance.now() - t0;
    if (!baking && maskOn >= 0) { maskOff = performance.now() - t0; break; }
    // 批环完成信号:本轮 clearBakeStats 后累计格数 ≥ 213 → 烘焙循环已走完
    if (bmod.bakeLastBatches().reduce((s, b) => s + b.cells, 0) >= 213) { bakeDone = performance.now() - t0; }
    if (bakeDone >= 0 && performance.now() - t0 > bakeDone + 600) break;   // 批完+600ms 尾窗
    await new Promise((r) => setTimeout(r, 8));
  }
  w0.t1 = performance.now();
  A.window = null;
  await new Promise((r) => setTimeout(r, 350));   // 收尾长任务/toBlob
  const mem = (performance).memory?.usedJSHeapSize ?? 0;
  // SW-BM1: 批级诊断账(bakeCells 环形账,共享模块实例)
  const bm = await import('/src/ui/charBake.ts');
  const batches = bm.bakeLastBatches().slice(-40).map((b) => [b.cells, b.ms, b.maxCellMs]);
  const worstBatch = bm.bakeLastBatches().reduce((a, b) => (b.ms > (a?.ms ?? -1) ? b : a), null);
  return {
    label, maskOn: +maskOn.toFixed(1), maskOff: +maskOff.toFixed(1), wall: +(w0.t1 - w0.t0).toFixed(1),
    bakeDone: +bakeDone.toFixed(1), heapMB: +(mem / 1048576).toFixed(1),
    worstBatch: worstBatch ? { cells: worstBatch.cells, ms: worstBatch.ms, maxCellMs: worstBatch.maxCellMs } : null,
    batchesTail: batches,
  };
}, label, tabSel, containerSel);

const snapshot = (label) => page.evaluate((label) => {
  const A = window.__bm1;
  const ws = A.windows.filter((w) => w.label === label).map((w) => [w.t0, w.t1]);
  const inWin = (at) => ws.some(([a, b]) => at >= a && at <= b);
  return {
    label,
    longtasks: A.lt.filter((e) => inWin(e.at)).map((e) => e.ms),
    longtasksAt: A.lt.filter((e) => inWin(e.at)).map((e) => [Math.round(e.at), e.ms]),
    getImageData: A.gid.slice(-6), toBlob: A.tob.slice(-4),
    diSlow: A.diSlow.slice(-12), diTotal: { n: A.di.n, ms: +A.di.ms.toFixed(1) },
    createImageBitmapCalls: A.cib, cibSlow: A.cibSlow.slice(-6),
  };
}, label);

const snap0 = await page.evaluate(() => ({ diN: window.__bm1.di.n, diMs: window.__bm1.di.ms, cib: window.__bm1.cib, lt: window.__bm1.lt.length }));

console.log('==== hair 首烘(cold ensure) ====');
const cold = await measureHair('hair-cold', '.sw-cc-tab[data-tab=hair]', '.sw-cc-hair');
console.log(JSON.stringify(cold));
console.log(JSON.stringify(await snapshot('hair-cold')));

await new Promise((r) => setTimeout(r, 1500));

// 暖重烘:发色条微动(键变)→ hair 页重烘(ensure 已暖,纯合成+编码)
console.log('==== hair 暖重烘(发色微动×3) ====');
for (let k = 0; k < 3; k++) {
  await page.evaluate(() => { document.querySelector('.sw-cc-tab[data-tab=hairColor]').click(); });
  await page.evaluate((k) => {
    const bar = document.querySelector('.sw-cc-sliderbar');
    const rect = bar.getBoundingClientRect();
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + rect.width * (0.3 + k * 0.2), buttons: 1 }));
    bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rect.left + rect.width * (0.3 + k * 0.2) }));
  }, k);
  await new Promise((r) => setTimeout(r, 420));
  const warm = await measureHair('hair-warm' + k, '.sw-cc-tab[data-tab=hair]', '.sw-cc-hair');
  console.log(JSON.stringify(warm));
  console.log(JSON.stringify(await snapshot('hair-warm' + k)));
  await new Promise((r) => setTimeout(r, 900));
}

// look 页守线
console.log('==== look 页(守线 20-42ms) ====');
await page.evaluate(() => { document.querySelector('.sw-cc-tab[data-tab=look]').click(); });
await new Promise((r) => setTimeout(r, 420));
await page.evaluate(() => { document.querySelector('.sw-cc-tab[data-tab=hairColor]').click(); });
await page.evaluate(() => {
  const bar = document.querySelector('.sw-cc-sliderbar');
  const rect = bar.getBoundingClientRect();
  bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: rect.left + rect.width * 0.8, buttons: 1 }));
  bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: rect.left + rect.width * 0.8 }));
});
await new Promise((r) => setTimeout(r, 420));
const look = await measureHair('look-looktab', '.sw-cc-tab[data-tab=look]', '.sw-cc-look');
await page.evaluate(() => { document.querySelector('.sw-cc-tab[data-tab=look]').click(); });
await new Promise((r) => setTimeout(r, 120));
console.log(JSON.stringify(look));
console.log(JSON.stringify(await snapshot('look')));

console.log('==== 全程累积 ====');
console.log(JSON.stringify(await page.evaluate(() => {
  const A = window.__bm1;
  const mem = (performance).memory?.usedJSHeapSize ?? 0;
  return { ltAll: A.lt.length, ltMaxMs: Math.max(0, ...A.lt.map((e) => e.ms)), di: A.di, cib: A.cib, heapMB: +(mem / 1048576).toFixed(1), heap0MB: +(A.mem0 / 1048576).toFixed(1) };
})));
await browser.close();
