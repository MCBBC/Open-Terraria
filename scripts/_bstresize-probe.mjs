// 图鉴 resize 风暴 + contextlost 韧性探针(2026-08-14,用户报"resize 后头像全消失"):
// ①开图鉴数 painted ②连续 viewport resize(模拟拖拽,10 档) ③等稳定后数 painted
// ④对全部画布合成派发 contextlost+contextrestored ⑤数 painted 恢复
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto('http://localhost:5311/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
for (let i = 0; i < 60; i++) { await sleep(2000); if (await page.evaluate(() => !!window.__swGame).catch(() => false)) break; }
await page.evaluate(() => window.__swUI?.onBestiary?.());
await sleep(2000);

const countPainted = () => page.evaluate(() => {
  const canvases = [...document.querySelectorAll('.sw-bst canvas')];
  let painted = 0;
  for (const c of canvases) {
    try {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < d.length; i += 64) { if (d[i] > 10) { painted++; break; } }
    } catch { /* ignore */ }
  }
  return { total: canvases.length, painted };
});

const before = await countPainted();
console.log('① 开面板:', JSON.stringify(before));

// ② resize 风暴:10 档连续缩放(每档 80ms,模拟拖拽)
for (let i = 0; i < 10; i++) {
  await page.setViewport({ width: 1280 - i * 60, height: 800 - i * 20 });
  await sleep(80);
}
await page.setViewport({ width: 1280, height: 800 });
await sleep(800);  // RO 150ms 稳定 + rAF
const afterResize = await countPainted();
console.log('② resize 风暴后:', JSON.stringify(afterResize));

// ③ 合成 contextlost → contextrestored 全画布
const restored = await page.evaluate(() => {
  let n = 0;
  for (const c of document.querySelectorAll('.sw-bst canvas')) {
    c.dispatchEvent(new Event('contextlost'));
    c.dispatchEvent(new Event('contextrestored'));
    n++;
  }
  return n;
});
await sleep(1500);  // 重画走 bstLoadSheet(缓存命中同步,留余量)
const afterLoss = await countPainted();
console.log(`③ 合成 context 丢失/恢复 ×${restored} 张后:`, JSON.stringify(afterLoss));

const ok = afterResize.painted >= before.painted * 0.9 && afterLoss.painted >= before.painted * 0.9;
console.log(ok ? 'PASS: resize 风暴存活+context 恢复重画' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
