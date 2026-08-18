import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const v = await fetch('/sprites/vanilla.json').then((x) => x.json());
  const d = g.spawnDrop(g.player.cx, g.player.y + 4, `vi_4_${v.items['4'].key}`, 1, 0, -1);
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const sel = g.player.inv.slots.findIndex((sl) => sl && sl.id === d.itemId);
  g.player.inv.selected = sel;
  ui['showTooltipFor'](sel, 'inv');
  await new Promise((r2) => setTimeout(r2, 500));
  // 页内采样：克隆 tooltip 到 canvas 读像素太重——直接抓 getComputedStyle 与
  // 元素截图（截图路径走 CDP，与游戏渲染并行不阻塞）
  await ui.tooltip.screenshot ? null : null;
});
const el = await page.$('.sw-tooltip');
await el.screenshot({ path: '/tmp/tt-el.png' }).catch((e) => console.log('shot fail', String(e).slice(0, 80)));
console.log('done');
await browser.close();
