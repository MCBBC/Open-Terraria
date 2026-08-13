// 图鉴滚轮风暴探针(2026-08-13,用户报"滚动翻两页崩溃"):
// 进世界 → 开图鉴 → gridWrap 上连发 80 个 wheel(模拟 trackpad 惯性)跨多页
// → 断言:页码推进/渲染进程存活/头像画布非空/堆平稳。
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 140)); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
// 轮询等进世界(生产构建生成+预载较慢)
let inGame = false;
for (let i = 0; i < 60; i++) {
  await sleep(2000);
  inGame = await page.evaluate(() => !!window.__swGame).catch(() => false);
  if (inGame) break;
}
console.log('⓪ 进世界:', inGame);
if (!inGame) { console.log('FAIL: 未进世界'); await browser.close(); process.exit(1); }
await page.evaluate(() => window.__swUI?.onBestiary?.());
await sleep(1500);
const opened = await page.evaluate(() => !!document.querySelector('.sw-bst'));
console.log('① 图鉴打开:', opened);
if (!opened) { console.log('FAIL: 图鉴未打开'); await browser.close(); process.exit(1); }

const before = await page.evaluate(() => ({
  range: document.querySelector('[class*="range"], .sw-bst-range')?.textContent ?? '?',
  heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
}));
// 滚轮风暴:80 个事件,分两波(波内 0ms 间隔=trackpad 惯性)
const storm = await page.evaluate(async () => {
  const wrap = document.querySelector('.sw-bst-grid')?.parentElement
    ?? document.querySelector('.sw-bst');
  if (!wrap) return { fail: 'no gridWrap' };
  const fire = (n) => {
    for (let i = 0; i < n; i++) {
      wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
    }
  };
  fire(40);
  await new Promise((r) => setTimeout(r, 700));
  fire(40);
  await new Promise((r) => setTimeout(r, 1500)); // 等 rAF 合并+加载+绘制
  return { ok: true };
});
if (storm.fail) { console.log('FAIL:', storm.fail); await browser.close(); process.exit(1); }

const after = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('[class*="bst"] canvas')];
  let painted = 0;
  for (const c of canvases.slice(0, 40)) {
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 64) { if (d[i] > 10) { painted++; break; } }
    } catch { /* ignore */ }
  }
  return {
    range: document.querySelector('[class*="range"], .sw-bst-range')?.textContent ?? '?',
    heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
    canvases: canvases.length, painted,
  };
});
console.log('② 风暴前:', JSON.stringify(before));
console.log('③ 风暴后:', JSON.stringify(after));
const ok = after.range !== before.range && after.painted > 5 && after.heap < 600;
console.log(ok ? 'PASS: 滚轮风暴存活+翻页+头像绘制+堆可控' : 'FAIL: 条件不满足');
await browser.close();
process.exit(ok ? 0 : 1);
