// 一次性:背包网格修复复验——面板 4 行×10=40 格,无幻影第 5 行,50-57 只在左列
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message.slice(0, 140)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.openInventory?.();
  const grids = [...document.querySelectorAll('.sw-slot[data-where="inv"]')];
  const byIdx = {};
  for (const s of grids) {
    const k = s.dataset.idx;
    (byIdx[k] = byIdx[k] || []).push(s);
  }
  const dup = Object.entries(byIdx).filter(([, v]) => v.length > 1).map(([k, v]) => k);
  const gridRow5 = [...document.querySelectorAll('[data-idx="50"][data-where="inv"]')].length;
  return {
    invSlotTotal: grids.length,
    expected: 40 + 8,          // 网格 40 + 左列钱币弹药 8
    idx50Count: gridRow5,      // 应=1(仅左列钱币格)
    duplicateIdx: dup,
  };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: 'shots/inv-grid-check.png' });
await browser.close();
