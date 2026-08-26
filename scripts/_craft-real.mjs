// 一次性:真实材料路径复现"配方列表消失"——铜币/蛛网/晶状体 → 开背包 → 列表状态+控制台错误
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console.error] ' + m.text().slice(0, 300)); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const inv = g.player.inv;
  const put = (slot, key, n) => { const id = g.itemId(key); if (id !== undefined && id >= 0) inv.slots[slot] = { id, stack: n }; };
  put(11, 'vi_150_Cobweb', 99);   // 蛛网(vi_ 自动注册键) → 蛛丝绳
  ui.openInventory();
  await raf(5); await new Promise((r) => setTimeout(r, 400));
  ui.refreshAll();
  await raf(10);
  return {
    gameAvail: g.vanillaAvailableRecipes().length,
    availRef: ui.craftAvailRef.length,
    poolLen: ui.craftPool.length,
    listChildren: ui.craftListEl.children.length,
    listH: ui.craftListEl.style.height,
    track: ui.craftTrackEl?.style.display,
    firstRow: ui.craftListEl.querySelector('.sw-recipe')?.textContent?.slice(0, 30) ?? null,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', JSON.stringify(errs.slice(0, 5), null, 1));
await page.screenshot({ path: 'shots/craft-real.png' });
await browser.close();
