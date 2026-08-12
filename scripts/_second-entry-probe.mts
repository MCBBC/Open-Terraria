// 二次进世界复现探针 v2：分段 evaluate，node 侧逐步打日志定位
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
const log = (s: string) => console.log(`[probe] ${new Date().toISOString().slice(14, 23)} ${s}`);
log('goto');
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 3000));

// 阶段1：第一次进世界
log('newWorld(第一次,慢路径)');
await page.evaluate(() => (window as any).__swFlow.newWorld('probe-crash', 1200, 400));
log('等待世界就绪...');
await page.waitForFunction('!!window.__swGame?.world', { timeout: 300000, polling: 1000 });
log('第一次进世界完成');

// 存档 + 退出（走真实 doSave——同步 quickSaveExists 闭包标志，quickLoad 才会执行）
await page.evaluate(() => { (window as any).__swFlow.doSave(); });
await new Promise((r) => setTimeout(r, 1000));
log('quitToMenu');
await page.evaluate(() => (window as any).__swFlow.quitToMenu());
await new Promise((r) => setTimeout(r, 1500));

// 阶段2：挂诊断钩子 + 第二次进世界
log('挂诊断钩子');
await page.evaluate(() => {
  (window as any).__diag = { getImageData: 0, putImageData: 0 };
  const proto = CanvasRenderingContext2D.prototype as any;
  for (const k of ['getImageData', 'putImageData']) {
    const orig = proto[k];
    proto[k] = function (...args: unknown[]) { (window as any).__diag[k]++; return orig.apply(this, args); };
  }
  (window as any).__longTasks = [];
  new PerformanceObserver((list) => { for (const e of list.getEntries()) (window as any).__longTasks.push(e.duration); })
    .observe({ entryTypes: ['longtask'] });
});
log('quickLoad(第二次,快路径)');
const t2 = Date.now();
await page.evaluate(() => { (window as any).__quickLoadPromise = (window as any).__swFlow.quickLoad(); });
// 轮询观察：进度条文本 / 世界就绪 / quickLoad promise 状态
let entered = false;
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const s = await page.evaluate(() => {
    const g = (window as any).__swGame;
    const prog = document.querySelector('.sw-progress, [class*=progress]')?.textContent?.trim().slice(0, 60) ?? null;
    return {
      hasWorld: !!g?.world,
      worldW: g?.world?.w ?? 0,
      prog,
      settled: (window as any).__quickLoadPromiseSettled ?? null,
    };
  }).catch(() => ({ hasWorld: false, worldW: 0, prog: 'EVAL-FAIL', settled: null }));
  if (i % 5 === 0 || s.hasWorld) log(`poll ${i * 2}s: world=${s.hasWorld}(${s.worldW}) prog="${s.prog}"`);
  if (s.hasWorld && s.worldW > 0) { entered = true; break; }
  if (i === 89) log('poll 超时 180s：quickLoad 未完成');
}
log(`第二次进世界 ${entered ? '完成' : '未完成'} ${Date.now() - t2}ms`);
if (!entered) { await browser.close(); process.exit(1); }

// 阶段3：运行 15s（rAF 帧间隔采样 + 模拟走动）
log('运行采样 15s');
const run = await page.evaluate(async () => {
  const game = (window as any).__swGame;
  const frames: number[] = [];
  let last = performance.now();
  // 模拟向右走（推动小动物/渲染/探索全链路）
  game.input.down = () => true; // 占位防误用——实际用键盘事件路径之外的直接驱动
  await new Promise<void>((done) => {
    const total = 900;
    let n = 0;
    const tick = () => {
      const now = performance.now();
      frames.push(now - last); last = now;
      n++;
      if (n >= total) { done(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return {
    frames,
    critters: game.entities.critters.length,
    numLiquid: game.liquid.numLiquid,
    bottomPad: game.renderer.bottomPadCache.size,
    diag: (window as any).__diag,
    longTasks: (window as any).__longTasks,
    heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
  };
});
const sorted = [...run.frames].sort((a, b) => a - b);
console.log(JSON.stringify({
  secondEntryMs: Date.now() - t2 - 15000,
  critters: run.critters,
  numLiquid: run.numLiquid,
  bottomPadCache: run.bottomPad,
  getImageData: run.diag.getImageData,
  putImageData: run.diag.putImageData,
  longTaskCount: run.longTasks.length,
  worstLongMs: Math.round(Math.max(0, ...run.longTasks)),
  worstFrameMs: Math.round(Math.max(...run.frames)),
  p99FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.99)]),
  medianFrameMs: Math.round(sorted[Math.floor(sorted.length / 2)]),
  heapMB: run.heapMB,
}, null, 1));
await browser.close();
log('done');
