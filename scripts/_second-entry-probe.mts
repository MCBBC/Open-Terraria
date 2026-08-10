// 二次进世界崩溃复现探针：进世界→存档→退出→快速读档（贴图全缓存=快），
// 挂 getImageData/longtask/帧间隔计数器找运行期元凶
import puppeteer from 'puppeteer-core';

console.error('[probe] launching');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MACOS/Google Chrome', headless: true, defaultViewport: { width: 800, height: 600 }, timeout: 60000, dumpio: true });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE_ERR:', m.text().slice(0, 200)); });
console.error('[probe] goto');
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

console.error('[probe] evaluating');
let out: unknown;
try {
  out = await page.evaluate(async () => {
  const res: Record<string, unknown> = {};
  const flow = (window as any).__swFlow;
  const waitGame = async (ms = 240000) => {
    const t0 = Date.now();
    while (!(window as any).__swGame?.world && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 500));
    return !!(window as any).__swGame?.world;
  };

  // ---- 第一次进世界（生成小世界，慢路径=贴图加载）----
  const t1 = Date.now();
  await flow.newWorld('probe-crash', 1200, 400);
  if (!(await waitGame())) { res.err = 'first world not ready'; return res; }
  res.firstEntryMs = Date.now() - t1;

  // 存档 → 退出 → 快速读档（同会话贴图全缓存）
  flow.doSave();
  await new Promise((r) => setTimeout(r, 1000));
  flow.quitToMenu();
  await new Promise((r) => setTimeout(r, 1500));

  // ---- 挂诊断钩子 ----
  const diag: Record<string, number> = { getImageData: 0, putImageData: 0, createImageData: 0 };
  const proto = CanvasRenderingContext2D.prototype as any;
  for (const k of Object.keys(diag)) {
    const orig = proto[k];
    proto[k] = function (...args: unknown[]) { diag[k]++; return orig.apply(this, args); };
  }
  const longTasks: number[] = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push(e.duration); })
    .observe({ entryTypes: ['longtask'] });

  // ---- 第二次进世界（快路径）----
  const t2 = Date.now();
  await flow.quickLoad();
  if (!(await waitGame())) { res.err = 'second world not ready'; return res; }
  res.secondEntryMs = Date.now() - t2;
  const game = (window as any).__swGame;
  res.critters = game.entities.critters.length;
  res.bottomPadAfterEntry = game.renderer.bottomPadCache?.size ?? -1;

  // ---- 运行 15s：模拟移动（走来走去让小动物/渲染全链路跑起来）----
  const frames: number[] = [];
  let last = performance.now();
  await new Promise<void>((done) => {
    const total = 900;
    let n = 0;
    const tick = () => {
      const now = performance.now();
      frames.push(now - last); last = now;
      n++;
      if (n % 240 === 0) game.input.keydownHandlers?.[0]?.('KeyD'); // 占位，直接驱动 inputX
      if (n >= total) { done(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  // 采样时刻的关键状态
  res.getImageDataCalls = diag.getImageData;
  res.putImageDataCalls = diag.putImageData;
  res.bottomPadAfterRun = game.renderer.bottomPadCache?.size ?? -1;
  res.crittersAfter = game.entities.critters.length;
  res.numLiquid = game.liquid.numLiquid;
  res.longTaskCount = longTasks.length;
  res.worstLongMs = Math.round(Math.max(0, ...longTasks));
  res.worstFrameMs = Math.round(Math.max(...frames));
  const sorted = [...frames].sort((a, b) => a - b);
  res.p99FrameMs = Math.round(sorted[Math.floor(sorted.length * 0.99)]);
  res.medianFrameMs = Math.round(sorted[Math.floor(sorted.length / 2)]);
  // 内存
  if (performance.memory) {
    res.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
  }
  return res;
});
} catch (e) {
  out = { probeError: String(e).slice(0, 500) };
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
