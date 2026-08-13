// 一次性:图鉴面板回归探针（原版门控回归后）
//   ① 未解锁条目 = 暗影剪影（.sw-bst-lock）+ 详情 "???"
//   ② 滚轮换页（下滚 offset 前进）
//   ③ 敌方Boss 过滤 25 格
// SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_bst-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { BestiaryPanel } = await import('/src/ui/BestiaryPanel.ts');
  const panel = new BestiaryPanel(document.body, {
    getTracker: () => g.world.bestiary,
    atlas: g.renderer?.atlas ?? null,
    isCrimson: () => false,
    onBack: () => {},
  });
  await new Promise((r) => setTimeout(r, 600));
  const cells = document.querySelectorAll('.sw-bst-cell').length;
  const locked = document.querySelectorAll('.sw-bst-cell.sw-bst-lock').length;
  const pct = document.querySelector('.sw-bst-pct')?.textContent;
  // 点第一个锁定格 → 详情标题应为 ???
  const firstLock = document.querySelector('.sw-bst-cell.sw-bst-lock');
  let lockedInfo = null;
  if (firstLock) {
    firstLock.click();
    await new Promise((r) => setTimeout(r, 200));
    lockedInfo = document.querySelector('.sw-bst-info h3')?.textContent;
  }
  // 滚轮：网格区下发 wheel → range 应前进
  const rangeBefore = document.querySelector('.sw-bst-range')?.textContent;
  const wrap = document.querySelector('.sw-bst-gridwrap');
  wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 250));
  const rangeAfter = document.querySelector('.sw-bst-range')?.textContent;
  // boss 过滤
  const bossChip = [...document.querySelectorAll('.sw-bst-chip')].find((c) => c.textContent.includes('Boss'));
  let boss = { found: !!bossChip };
  if (bossChip) {
    // 先滚回第一页（滚轮向上直到 range 起点为 1）
    for (let i = 0; i < 8; i++) wrap.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 250));
    bossChip.click();
    await new Promise((r) => setTimeout(r, 300));
    boss = { found: true, cells: document.querySelectorAll('.sw-bst-cell').length, range: document.querySelector('.sw-bst-range')?.textContent };
    bossChip.click();
  }
  panel.close();
  return { cells, locked, pct, lockedInfo, rangeBefore, rangeAfter, wheelPaged: rangeBefore !== rangeAfter, boss };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
