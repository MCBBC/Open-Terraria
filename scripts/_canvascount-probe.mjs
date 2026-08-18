// 单页 canvas 张数普查(2026-08-18):IOSurface 资源耗尽机制下的持数基线。
// 双窗风暴根因=GPU 进程 IOSurface 按张计费(字节无关,16x16 也会失败)——
// 先量清楚一页steady state 持有多少张 canvas、其中 chunk 烘焙占多少。
// 用法:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_canvascount-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const TMP = '/Users/vinlic/.claude/jobs/8405c930/tmp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', userDataDir: `${TMP}/cc-profile`,
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  // getContext 拦截:统计所有真实获得过上下文的 canvas 元素
  window.__ctxCanvases = new WeakSet();
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (...a) {
    try { window.__ctxCanvases.add(this); } catch {}
    return orig.apply(this, a);
  };
  window.__ctxCount = 0;
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await sleep(1500);
await page.evaluate(() => import('/src/data/items.ts').then(() => import('/src/entities/Enemy.ts')).catch(() => {})).catch(() => {});
await sleep(1500);
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
console.log('生成小世界(计数与视口相关,与大世界无关)…');
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });

for (let i = 0; i < 6; i++) {
  await sleep(10000);
  const s = await page.evaluate(() => {
    const dom = document.querySelectorAll('canvas').length;
    // WeakSet 无 size:遍历 DOM 全量数(离屏 canvas 不在 DOM,由 __swRenderLog 补)
    const snap = window.__swRenderLog?.snap?.() || {};
    return { dom, ...snap, gpuMode: !!(window.__swGame?.renderer?.cpuRender === false) };
  }).catch((e) => ({ err: String(e).slice(0, 80) }));
  console.log(`t=${(i + 1) * 10}s`, JSON.stringify(s));
}
await browser.close();
