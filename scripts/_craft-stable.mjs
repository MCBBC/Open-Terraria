// 一次性:hover 前后行高稳定 + 列表贴内容 + 长列表滚动正常
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  const vr = await import('/src/data/vanillaRecipes.ts');
  const fake = vr.VANILLA_RECIPES.slice(0, 3).map((r) => ({ r, count: 3 }));
  g.vanillaAvailableRecipes = () => fake;
  ui.openInventory(); await raf(5);
  const snap = () => ({
    inputTop: Math.round(ui.craftSearchEl.getBoundingClientRect().top),
    inputH: Math.round(ui.craftSearchEl.getBoundingClientRect().height),
    gridH: Math.round(ui.craftGridEl.getBoundingClientRect().height),
    listH: ui.craftListEl.style.height,
  });
  ui.hoverFocus = -1; ui.refreshAll(); await raf(4);
  const noHover = snap();
  ui.hoverFocus = 0; ui.refreshAll(); await raf(4);
  const hovered = snap();
  ui.hoverFocus = -1; ui.refreshAll(); await raf(4);
  const unHover = snap();
  // 短列表(3 行)贴内容 + 无死区:滚到底 maxTop=0,行仍可见
  const list = ui.craftListEl;
  list.dispatchEvent(new WheelEvent('wheel', { deltaY: 600, cancelable: true, bubbles: false }));
  await raf(30);
  const shortScroll = { listH: list.style.height, firstRi: list.querySelector('[data-ri]')?.dataset.ri ?? '?',
    rowVisible: !!list.querySelector('[data-ri="2"]') };
  // 长列表:200 行,顶部贴 0、尾部 210/240
  g.vanillaAvailableRecipes = () => vr.VANILLA_RECIPES.slice(0, 200).map((r) => ({ r, count: 3 }));
  ui.refreshAll(); await raf(4);
  const longListH = list.style.height;
  return { noHover, hovered, unHover,
    jitterFree: noHover.inputTop === hovered.inputTop && hovered.inputTop === unHover.inputTop
      && noHover.gridH === hovered.gridH && hovered.gridH === unHover.gridH,
    shortScroll, longListH };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
