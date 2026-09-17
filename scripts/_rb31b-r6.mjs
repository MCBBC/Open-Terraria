// RB31b r6(向导态逐拍选中丢失定位):包装 ResetRecipes/UpdateModernCraft 计数+快照。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.stack || e.message).slice(0, 240)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(400);
await page.evaluate(() => {
  document.getElementById('sw-welcome-announce')?.remove();
  window.__swUI.closeInventory();
  window.__md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await sleep(150);
const R = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood');
  if (wid > 0) g.player.inv.add(wid, 500);
  await ui.refreshAllAsync();
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  window.__md(toggle);
  await new Promise((r) => setTimeout(r, 250));
  window.__dlgSaved = g.dialogNpc;
  g.dialogNpc = { npcKey: 'guide', vanillaId: 22 };
  ui.vinvCloseModernCraft(true);
  ui.openVanillaGuideCraft();
  const wood = g.itemId('vi_9_Wood');
  ui.guidePlaced = { id: wood, stack: 10 };
  ui.vinvUpdateModernCraft();
  const cell = ui.vinvModernCellEls[0]?.el;
  window.__md(cell);
  const sel0 = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
  // 对话态逐拍维持桩:真实对话由 NPC 交互距离链每拍维持 dialogNpc;此处等价钉住
  const pin = setInterval(() => { g.dialogNpc = window.__dlgStub; }, 8);
  window.__dlgStub = { npcKey: 'guide', vanillaId: 22 };
  g.dialogNpc = window.__dlgStub;
  // 仪表:包装两个方法
  window.__log = [];
  const origReset = ui.vinvModernResetRecipes.bind(ui);
  ui.vinvModernResetRecipes = (...a) => {
    window.__log.push({ t: performance.now() | 0, ev: 'reset', selBefore: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
      stack: new Error().stack.split('\n').slice(2, 5).map((s) => s.trim().slice(0, 90)) });
    return origReset(...a);
  };
  const origClose = ui.vinvCloseModernCraft.bind(ui);
  ui.vinvCloseModernCraft = (...a) => {
    window.__log.push({ t: performance.now() | 0, ev: 'close', stack: new Error().stack.split('\n').slice(2, 5).map((x) => x.trim().slice(0, 110)) });
    return origClose(...a);
  };
  const origExit = ui.vinvGuideMenuExitCheck.bind(ui);
  ui.vinvGuideMenuExitCheck = (...a) => {
    const g2 = ui.game;
    const cond = { openChest: !!ui.openChest, shop: !!g2?.npcShopOpen, dlg: !!g2?.npcDialogActive, reforge: ui.vinvReforgeOpen, dlgNpc: !!g2?.dialogNpc };
    if (ui.vinvGuideMenuOpen && (cond.openChest || cond.shop || !cond.dlg || cond.reforge)) {
      window.__log.push({ t: performance.now() | 0, ev: 'exitFire', cond });
    }
    return origExit(...a);
  };
  const origUpd = ui.vinvUpdateModernCraft.bind(ui);
  let lastSel = sel0;
  ui.vinvUpdateModernCraft = (...a) => {
    const before = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
    const out = origUpd(...a);
    const after = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
    if (before !== after || after === null) {
      window.__log.push({ t: performance.now() | 0, ev: 'update', before, after, lookup: ui.vinvModernLookup.size,
        entries: ui.vinvModernEntries.length, availN: null, stack: new Error().stack.split('\n').slice(2, 4).map((s) => s.trim().slice(0, 90)) });
    }
    lastSel = after;
    return out;
  };
  await new Promise((r) => setTimeout(r, 700));
  clearInterval(pin);
  const end = {
    open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
    cond: { openChest: !!ui.openChest, shop: !!ui.game?.npcShopOpen, dlg: !!ui.game?.npcDialogActive, reforge: ui.vinvReforgeOpen, dlgNpcType: typeof ui.game?.dialogNpc },
    selected: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
    lookup: ui.vinvModernLookup.size, entries: ui.vinvModernEntries.length,
    resetForGuide: ui.vinvModernResetForGuide, guideKey: ui.guidePlaced?.id,
    detail: ui.vinvModernDetailEl.style.display,
  };
  const log = window.__log.slice(0, 12);
  ui.vinvModernResetRecipes = origReset;
  ui.vinvUpdateModernCraft = origUpd;
  ui.vinvCloseModernCraft(true);
  ui.vinvGuideMenuOpen = false;
  ui.vinvReturnGuidePlaced?.();
  g.dialogNpc = window.__dlgSaved;
  return { sel0, end, log };
});
console.log(JSON.stringify(R, null, 1));
await browser.close();
