// 页内定标：引擎运行时火把的真空堆上限（绕过任何表读数）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1200, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', String(e.stack || e.message).slice(0, 300)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const m = await import('/src/data/items.ts');
  const key = m.VANILLA_ITEM_KEY_BY_ID[8];
  const kidA = m.ITEM_BY_KEY[key];      // 探针实例读数
  const results = { key, kidA };
  // 引擎侧真值：清空一格后让引擎建新堆——新堆 stack 上限即引擎内 maxStack
  const keep = [];
  for (let i = 2; i < 50; i++) { keep.push(g.player.inv.slots[i]); g.player.inv.slots[i] = null; }
  const left = g.player.inv.add(kidA, 500000);
  const stacks = g.player.inv.slots.map((sl) => sl && sl.id === kidA ? sl.stack : -1).filter((v) => v > 0);
  results.createdFirstStacks = stacks.slice(0, 6);
  results.maxCreated = Math.max(...stacks, 0);
  results.leftOverFromHalfMillion = left;
  results.numFullStacksNeeded = stacks.length;
  // 还原
  let k = 2;
  for (const old of keep) g.player.inv.slots[k++] = old;
  return results;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
