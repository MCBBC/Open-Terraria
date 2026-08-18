// 透明度诊断：截图 tooltip 并采样背景像素 alpha 表现
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
const r = await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI;
  const v = await fetch('/sprites/vanilla.json').then((x) => x.json());
  const d = g.spawnDrop(g.player.cx, g.player.y + 4, `vi_4_${v.items['4'].key}`, 1, 0, -1);
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  const sel = g.player.inv.slots.findIndex((sl) => sl && sl.id === d.itemId);
  g.player.inv.selected = sel;
  ui['showTooltipFor'](sel, 'inv');
  await new Promise((r2) => setTimeout(r2, 500));
  const t = ui.tooltip;
  // 取 tooltip 中央 4px 区域与页面背景对比（canvas 像素级采样太重——直接看 CSS）
  const cs = getComputedStyle(t);
  return {
    filter: t.style.filter, bg: cs.backgroundImage.slice(0, 30) + '…',
    rect: { x: t.offsetLeft, y: t.offsetTop, w: t.offsetWidth, h: t.offsetHeight },
  };
});
console.log(JSON.stringify(r));
await page.screenshot({ path: '/tmp/tt.png' });
await browser.close();
