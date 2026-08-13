// 一次性:图鉴面板视觉探针（boss 过滤/锁定态/分页）
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
  const chips = [...document.querySelectorAll('.sw-bst-chip')].map((c) => c.textContent);
  const cells = () => document.querySelectorAll('.sw-bst-cell').length;
  const names = () => [...document.querySelectorAll('.sw-bst-name')].slice(0, 8).map((n) => n.textContent);
  const base = { chips, cells: cells(), names: names() };
  // 点"敌方Boss"chip
  const bossChip = [...document.querySelectorAll('.sw-bst-chip')].find((c) => c.textContent.includes('Boss'));
  let boss = { found: !!bossChip };
  if (bossChip) {
    bossChip.click();
    await new Promise((r) => setTimeout(r, 300));
    boss = { found: true, cells: cells(), names: names(), range: document.querySelector('.sw-bst-range')?.textContent };
  }
  // 恢复 + 看首格 canvas 是否画了内容
  const canvases = () => [...document.querySelectorAll('.sw-bst-cell canvas')].slice(0, 3).map((cv) => {
    const cx = cv.getContext('2d');
    const d = cx.getImageData(0, 0, cv.width, cv.height).data;
    let nonZero = 0;
    for (let i = 3; i < d.length; i += 40) if (d[i] > 0) nonZero++;
    return nonZero;
  });
  if (bossChip) { bossChip.click(); await new Promise((r) => setTimeout(r, 200)); }
  const painted = canvases();
  const navs = [...document.querySelectorAll('[data-nav]')].map((b) => b.textContent);
  panel.close();
  return { base, boss, painted, navs, pct: document.querySelector('.sw-bst-pct')?.textContent };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
