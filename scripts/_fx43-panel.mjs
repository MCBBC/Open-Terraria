// FX43 取证(2026-09-16 用户双图 53=原版/54=本仓 面板观感):面板/格/搜索条重导链
// 上屏复测 + 占位符实渲染检查(54 旧图 placeholder 已设不渲染 = 空搜索条根因域)。
// 产出 /tmp/fx43-panel.png。只读取证,零源码改动。运行:
//   SW_ORIGIN=http://localhost:5248 node tools/run-diag.mjs scripts/_fx43-panel.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5248';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e.message).slice(0, 200)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.closeInventory();
});
await sleep(200);
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood');
  if (wid > 0) g.player.inv.add(wid, 300);
  await ui.refreshAllAsync();
  const vinv = document.querySelector('.sw-vinv');
  const toggle = vinv?.querySelector('[data-role="craft-grid-toggle"], .sw-craft-toggle');
  if (toggle) toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  else ui.vinvOpenModernCraft?.(null, true);
  await sleep(400);
});
await sleep(800);
const info = await page.evaluate(() => {
  const ui = window.__swUI;
  const input = ui.vinvModernSearchInput;
  const cs = getComputedStyle(input, '::placeholder');
  const win = ui.vinvModernCraftEl;
  const panel = ui.vinvModernPanelEl;
  const pr = panel.getBoundingClientRect();
  // 面板左上角:顶缘暗描边带在 x 上的起点(圆角弧度实测)
  return {
    open: ui.vinvModernCraftOpen === true,
    placeholder: input.placeholder,
    phColor: cs.color,
    phOpacity: cs.opacity,
    value: input.value,
    panelRect: { x: pr.x, y: pr.y, w: pr.width, h: pr.height },
    winScale: win.getBoundingClientRect().width / 490,
  };
});
console.log(JSON.stringify(info, null, 1));
await page.screenshot({ path: '/tmp/fx43-panel.png', fullPage: false });
console.log('截图: /tmp/fx43-panel.png');
await browser.close();
