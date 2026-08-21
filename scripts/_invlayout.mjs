// 背包布局对齐探针（用户报"面板底部空白大+表情/住房位置不对"）：
// ①顶栏无"住房/表情/快速堆叠"文字钮，页签=装备/住房/杂项
// ②钮簇在背包格下方右对齐（quickstack 30×30 图标 + emote 30×30）
// ③合成列表高度自适应（4 配方时 <240px，面板底边贴内容）
// ④住房页签点击开 HousingPanel 覆盖层
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(300, 180, 777, 'inv-layout');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  world.store.setTile(152, 93, 13);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]], 999);
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[23]], 50);
  ui.openInventory();
  let t0 = Date.now();
  while (ui.craftListEl.children.length === 0 && Date.now() - t0 < 3000) await new Promise((r2) => setTimeout(r2, 100));
  await new Promise((r2) => setTimeout(r2, 300));
  // ① 顶栏文字
  const topRow = ui.invPanel.children[0];
  const topTexts = [...topRow.querySelectorAll('button')].map((b) => b.textContent.trim());
  // ② 钮簇几何：quickstack 图标钮与背包格底/合成区顶的相对位置
  const qs = ui.quickStackBtn;
  const qsRect = qs.getBoundingClientRect();
  const gridRect = ui.slotEl(10, 'inv').parentElement.getBoundingClientRect();   // 背包 grid
  const craftRect = ui.craftListEl.getBoundingClientRect();
  const qsIcon = qs.style.backgroundImage.includes('UI_ChestStack_');
  // ③ 列表高度自适应
  const listH = ui.craftListEl.getBoundingClientRect().height;
  const rows = ui.craftListEl.children.length;
  // ④ 住房页签 → 覆盖层
  const houseBtn = [...topRow.querySelectorAll('button')].find((b) => b.textContent.includes('住房'));
  let housingOpened = false;
  if (houseBtn) {
    houseBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await new Promise((r2) => setTimeout(r2, 500));
    housingOpened = !!document.querySelector('.sw-housing-panel');
  }
  // ⑥ PvP 钮在合成区右侧（不占流高度）：pvp 剑 x ≥ 列表右缘，y 在搜索行之下
  const sword = ui.pvpSwordBtn.getBoundingClientRect();
  const listR = ui.craftListEl.getBoundingClientRect();
  const searchRow = ui.craftSearchEl.getBoundingClientRect();
  const pvpPos = {
    pvpRightOfList: sword.left >= listR.right - 2,
    pvpBelowSearch: sword.top >= searchRow.bottom - 4,
    pvpInPanel: sword.right <= ui.invPanel.getBoundingClientRect().right + 1,
  };
  // ⑤ 顶锚不遮热键栏：面板 top ≥ 热键栏底(72)+间隙
  const hotbarSlot = document.querySelector('.sw-hotbar .sw-slot');
  const hbBottom = hotbarSlot ? hotbarSlot.getBoundingClientRect().bottom : 72;
  const panelTop = ui.invPanel.getBoundingClientRect().top;
  return { ...pvpPos,
    hotbarBottom: Math.round(hbBottom), panelTop: Math.round(panelTop),
    noOverlap: panelTop >= hbBottom - 1,
    topTexts,
    qsIcon, qsSize: [Math.round(qsRect.width), Math.round(qsRect.height)],
    qsBelowGrid: Math.round(qsRect.top - gridRect.bottom),
    qsAboveCraft: Math.round(craftRect.top - qsRect.bottom),
    listH, rows,
    housingOpened,
    panelBottomGap: Math.round(ui.invPanel.getBoundingClientRect().bottom),
  };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.topTexts.includes('住房') && !r.topTexts.includes('快速堆叠至附近宝箱')
  && r.qsIcon && r.qsSize[0] === 30 && r.qsBelowGrid >= -40 && r.qsAboveCraft >= 0
  && r.listH <= 240 && r.housingOpened && r.noOverlap
  && r.pvpRightOfList && r.pvpBelowSearch && r.pvpInPanel;
console.log(ok ? 'PASS' : 'FAIL');
await page.screenshot({ path: '/tmp/inv-layout.png' });
await browser.close();
