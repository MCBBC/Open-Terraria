// FX43 取证(2026-09-16 用户双图 53=原版/54=本仓):面板/格/搜索条重导链上屏复测
// + 占位符实渲染检查 + 两案追加(切换钮-窗顶间隙 DOM rect + modern 网格滚轮手感)。
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
  for (const [k, n] of [['vi_9_Wood', 999], ['vi_3_stone', 999], ['vi_23_Gel', 999], ['vi_8_Torch', 999],
    ['vi_169_SandBlock', 999], ['vi_22_IronBar', 999], ['vi_20_CopperBar', 999], ['vi_21_SilverBar', 999], ['vi_19_GoldBar', 999]]) {
    const wid = g.itemId(k);
    if (wid > 0) g.player.inv.add(wid, n);
  }
  // 配方原料频次 Top35 入包 → 网格溢出视口(contentH>listH)=滚轮面可达
  try {
    const { VANILLA_RECIPES } = await import('/src/data/vanillaRecipes');
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items');
    const freq = new Map();
    for (const r of VANILLA_RECIPES) for (const it of r.items) freq.set(it.id, (freq.get(it.id) || 0) + 1);
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 35);
    for (const [id] of top) {
      const key = VANILLA_ITEM_KEY_BY_ID[id];
      if (!key) continue;
      const wid = g.itemId(key);
      if (wid > 0) g.player.inv.add(wid, 999);
    }
  } catch (e) { console.log('[mats]', String(e).slice(0, 120)); }
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
  const pr = ui.vinvModernPanelEl.getBoundingClientRect();
  // 切换钮/就近箱钮 = 32×34 vinv-btn(钮心锚 FX43b:top-left=钮心−16/−17 → 底 302,窗顶 312,间隙 10)
  const btns = [...document.querySelectorAll('.sw-vinv button.vinv-btn')]
    .map((b) => b.getBoundingClientRect())
    .filter((r) => Math.round(r.width) === 32 && Math.round(r.height) === 34)
    .sort((a, b) => a.left - b.left);
  const winTop = ui.vinvModernCraftEl.getBoundingClientRect().top;
  return {
    open: ui.vinvModernCraftOpen === true,
    recipes: window.__swGame.vanillaAvailableRecipes().length,
    placeholder: input.placeholder,
    phColor: cs.color,
    phOpacity: cs.opacity,
    value: input.value,
    panelRect: { x: pr.x, y: pr.y, w: pr.width, h: pr.height },
    winScale: ui.vinvModernCraftEl.getBoundingClientRect().width / 490,
    toggleRect: btns[0] ? { left: btns[0].left, top: btns[0].top, w: btns[0].width, h: btns[0].height } : null,
    nearbyRect: btns[1] ? { left: btns[1].left, top: btns[1].top } : null,
    gapWinTopBelowToggleBottom: btns[0] ? +(winTop - (btns[0].top + btns[0].height)).toFixed(2) : null,
  };
});
console.log(JSON.stringify(info, null, 1));

// ---- 滚轮手感(FX43b:余数累计器)——Chrome 型 ±100px/notch 事件 ×3:
//      旧逐事件 trunc 面三拍全 0=死;累计器面 200px 起 −1 档(viewPos+120),余数留置。
//      缩视口令 listH<contentH(可用配方受站点门,大视口下不满屏不可滚;K 随高分缩放,
//      逐档试到可滚为止) ----
for (const h of [560, 500, 460, 420, 380, 340, 320, 300, 280]) {
  await page.setViewport({ width: 1600, height: h });
  await sleep(500);
  const g = await page.evaluate(() => {
    const ui = window.__swUI;
    const gg = ui.vinvModernGridGeometry?.();
    return gg ? { contentH: gg.contentH, listH: gg.list.h } : null;
  });
  if (g && g.listH > 0 && g.contentH > g.listH) break;
}
const wheel = await page.evaluate(async () => {
  const ui = window.__swUI;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cell = ui.vinvModernGridInner?.querySelector('.sw-slot');
  if (!cell) return { err: 'no cell' };
  const read = () => ({ view: ui.vinvModernViewPos, pend: ui.vinvModernWheelPendPx });
  const g = ui.vinvModernGridGeometry?.();
  const steps = [{ at: 'start', ...read() }];
  for (let i = 0; i < 3; i++) {
    cell.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, deltaMode: 0, bubbles: true, cancelable: true }));
    await sleep(30);
    steps.push({ at: `evt${i + 1}(+100px)`, ...read() });
  }
  return { contentH: g?.contentH ?? null, listH: g?.list.h ?? null, steps };
});
console.log('wheel:', JSON.stringify(wheel));
await page.screenshot({ path: '/tmp/fx43-panel.png', fullPage: false });
console.log('截图: /tmp/fx43-panel.png');
await browser.close();
