// 合成列表调试探针：为何 openInventory 后 craftListEl 零行/滚轮不动
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => console.log('[console]', m.text().slice(0, 160)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 300, H = 180;
  const world = new World(W, H, 777, 'craft-dbg');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < W; x++) { for (let y = 95; y < H; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]], 999);
  // 放工作台 tile(18) 在玩家旁,解锁更多配方
  g.world.store.setTile(152, 93, 13);   // T.WORKBENCH=13(曾误 18=平台)
  const before = {
    invPanel: !!ui.invPanel,
    craftList: !!ui.craftListEl,
    display: ui.invPanel ? ui.invPanel.style.display : 'n/a',
    avail: g.vanillaAvailableRecipes().length,
  };
  ui.openInventory();
  // 轮询等列表真正渲染出来（rAF/懒加载竞态——探针勿假设 400ms 内必达）
  let t0 = Date.now();
  while (ui.craftListEl.children.length === 0 && Date.now() - t0 < 3000) {
    await new Promise((r2) => setTimeout(r2, 100));
  }
  const afterOpen = {
    display: ui.invPanel.style.display,
    rows: ui.craftListEl.children.length,
    avail: g.vanillaAvailableRecipes().length,
    wheelBound: !!ui.craftListEl.__swCraftWheel,
    focus: ui.craftFocus,
  };
  for (let k = 0; k < 12; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  }
  await new Promise((r2) => setTimeout(r2, 400));
  // 悬停预选断言：mouseenter 第 9 行 → craftFocus=9 且材料格刷新为该配方
  const rows9 = ui.craftListEl.children;
  const n9 = rows9.length;
  const hoverRow = rows9[Math.min(9, n9 - 1)];
  // 渲染行 k 对应配方号 = start + k（start=max(0,focus-4)）——悬停前 focus=12→start=8
  const startBefore = Math.max(0, ui.craftFocus - 4);
  const hoverIdx = Math.min(9, n9 - 1);
  hoverRow.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await new Promise((r2) => setTimeout(r2, 400));   // rAF 合并
  const afterHover = {
    hoverIdx, startBefore, expectFocus: startBefore + hoverIdx,
    focus: ui.craftFocus,
    gridChips: ui.craftGridEl ? ui.craftGridEl.querySelectorAll('.sw-slot').length : -1,
    gridFirst: ui.craftGridEl ? (ui.craftGridEl.querySelector('.cnt')?.textContent ?? null) : null,
  };
  const afterWheel = {
    wheelBoundBeforeDispatch: !!ui.craftListEl.__swCraftWheel,
    focus: ui.craftFocus,
    rows: ui.craftListEl.children.length,
    firstRow: ui.craftListEl.children[0] ? ui.craftListEl.children[0].innerText.split('\n')[0].slice(0, 20) : null,
  };
  // 直接调用各环节,定位断链
  const direct = {};
  try { ui.refreshVanillaCrafting(); direct.manualCraft = ui.craftListEl.children.length; } catch (e) { direct.manualCraft = 'throw: ' + String(e).slice(0, 120); }
  direct.gameNonNull = !!ui.game;
  direct.uiBlocking = ui.game && ui.game.input ? ui.game.input.uiBlocking : 'no-input';
  try { direct.stations = JSON.stringify(ui.game.stationsNearby()); } catch (e) { direct.stations = 'throw'; }
  return { before, afterOpen, afterHover, afterWheel, direct };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
