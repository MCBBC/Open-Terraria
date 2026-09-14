// 刀19验收:向导制作菜单 1:1(modern 窗槽/空槽0配方/反查过滤/全亮/打造门/经典位/会话保持+走远退出)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

// ★刀19:真实入口=对话会话保持(npcDialogActive=true)——探针伪造会话 NPC(置玩家区域=keepAlive 在界)
const mkFake = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  g.dialogNpc = { dead: false, x: p.x, y: p.y, w: p.w, h: p.h };
  return true;
});
const clearFake = (page) => page.evaluate(() => { window.__swGame.dialogNpc = null; return true; });

{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);

  // ---- P1 入口:开向导菜单 → modern 窗开+向导槽显+空槽文案 ----
  await mkFake(page);
  const p1 = await page.evaluate(async () => {
    const ui = window.__swUI;
    document.getElementById('sw-welcome-announce')?.remove();
    ui.openInventory(true);
    await ui.refreshAllAsync();
    ui.openVanillaGuideCraft();
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const slot = ui.vinvGuideSlotModernEl;
    const r = slot ? slot.getBoundingClientRect().toJSON() : null;
    return {
      open: ui.vinvGuideMenuOpen, winOpen: ui.vinvModernCraftOpen,
      slotRect: r, slotVisible: slot ? slot.offsetParent !== null : false,
      cap: ui.vinvGuideModernCaptionEl?.textContent,
    };
  });
  ok(p1.open && p1.winOpen, 'P1a 向导态+modern 窗开');
  ok(p1.slotVisible && p1.slotRect && Math.abs(p1.slotRect.x - 44) < 2 && Math.abs(p1.slotRect.y - 443) < 2,
    `P1b 向导槽 @(44,443)(实测 ${p1.slotRect?.x?.toFixed(1)},${p1.slotRect?.y?.toFixed(1)})`);
  ok(p1.cap === '在此放置材料', `P1c 空槽文案=inter[24]("${p1.cap}")`);

  // ---- P2 空槽=0 配方(GetNumRecipes NewCraftingUI.cs:256-262) ----
  const p2 = await page.evaluate(() => {
    const ui = window.__swUI;
    const list = ui.vinvModernGridInner;
    return { entries: ui.vinvModernEntries.length, cells: list ? list.children.length : -1 };
  });
  ok(p2.entries === 0 && p2.cells === 0, `P2 空槽=0 配方(entries=${p2.entries} cells=${p2.cells})`);

  // ---- P3 放置木材 → 反查过滤+全亮+无拥有数 ----
  const p3 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const mod = await import('/src/data/items.ts');
    const wood = mod.ITEM_BY_KEY[mod.VANILLA_ITEM_KEY_BY_ID[9]];
    ui.heldStack = { id: wood, stack: 10 };
    const slot = ui.vinvGuideSlotModernEl;
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const list = ui.vinvModernGridInner;
    const cntEls = [...(ui.vinvModernDetailEl?.querySelectorAll('.cnt') ?? [])];
    return {
      placed: !!ui.guidePlaced, heldGone: !ui.heldStack,
      cap: ui.vinvGuideModernCaptionEl?.textContent?.slice(0, 16),
      entries: ui.vinvModernEntries.length, cells: list ? list.children.length : -1,
      detailCnt: cntEls.length, detailCntHidden: cntEls.every((c) => c.style.display === 'none'),
      slotHasImg: !!slot.querySelector('img'),
    };
  });
  ok(p3.placed && p3.heldGone, 'P3a 放置成功(手持清空)');
  ok(p3.slotHasImg, 'P3b 槽显物品图');
  // ★inter[21] 原版 zh=「所显示的配方使用此物品:」(Legacy.json:988)——非"需要"
  ok((p3.cap || '').startsWith('所显示的配方使用此物品'), `P3c 文案=inter[21]+名("${p3.cap}")`);
  ok(p3.entries > 0 && p3.cells > 0, `P3d 反查列表非空(entries=${p3.entries} cells=${p3.cells})`);
  ok(p3.detailCnt === 0 || p3.detailCntHidden, `P3e 拥有数不画(${p3.detailCnt} 个${p3.detailCntHidden ? ' 全隐' : ''})`);

  // ---- P4 打造门:点焦点成品 → 不合成(Main.cs:42988) ----
  const p4 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    const before = g.player.inv.slots.filter(Boolean).reduce((a, s) => a + s.stack, 0);
    const slot = ui.vinvModernDetailEl?.querySelector('.sw-slot');
    slot?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    const after = g.player.inv.slots.filter(Boolean).reduce((a, s) => a + s.stack, 0);
    return { before, after, held: !!ui.heldStack };
  });
  ok(p4.before === p4.after && !p4.held, `P4 反查态打造被门(总堆 ${p4.before}→${p4.after})`);

  // ---- P5 取回+走远退出(talkNPC==-1 → :42397) ----
  const p5 = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 100));
    const takenBack = !ui.guidePlaced && !!ui.heldStack;
    ui.heldStack = null;
    return { takenBack };
  });
  ok(p5.takenBack, 'P5a 空手取回整组');
  await clearFake(page);
  const p5b = await page.evaluate(async () => {
    const ui = window.__swUI;
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    return { open: ui.vinvGuideMenuOpen, winOpen: ui.vinvModernCraftOpen };
  });
  ok(!p5b.open && !p5b.winOpen, `P5b 走远=向导态+窗全复位(open=${p5b.open})`);
  await page.close();
}

// ---- P6 classic 控制模式 ----
{
  const page = await browser.newPage();
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);
  const p6 = await page.evaluate(async () => {
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'classic');
    const ui = window.__swUI;
    const g = window.__swGame;
    // 会话保持伪造+注入材料(常规列表非空)
    const p = g.player;
    g.dialogNpc = { dead: false, x: p.x, y: p.y, w: p.w, h: p.h };
    const mod = await import('/src/data/items.ts');
    const wood = mod.ITEM_BY_KEY[mod.VANILLA_ITEM_KEY_BY_ID[9]];
    for (let i = 10; i < 50; i++) if (!g.player.inv.slots[i]) { g.player.inv.slots[i] = { id: wood, stack: 20 }; break; }
    ui.openInventory(true);
    ui.openVanillaGuideCraft();
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const cs = ui.vinvGuideSlotClassicEl;
    const r = cs ? cs.getBoundingClientRect().toJSON() : null;
    const adjY = ui.vinvCraftAdjY(1000);
    const tog = ui.vinvGridToggleImg.parentElement.getBoundingClientRect().toJSON();
    return {
      open: ui.vinvGuideMenuOpen, winOpen: ui.vinvModernCraftOpen,
      slot: r, expectY: 331 + adjY, togY: tog.y, togExpect: 300 + adjY,
      avail: ui.vinvCraftAvailV.length,
      classicText: ui.vinvGuideClassicTextEl?.textContent?.slice(0, 10),
    };
  });
  ok(p6.open && !p6.winOpen, 'P6a classic 控制=窗不开');
  ok(p6.slot && Math.abs(p6.slot.x - 73) < 2 && Math.abs(p6.slot.y - p6.expectY) < 2,
    `P6b 经典位槽 @(73,${p6.expectY})(实测 ${p6.slot?.x?.toFixed(1)},${p6.slot?.y?.toFixed(1)})`);
  ok(Math.abs(p6.togY - p6.togExpect) < 2, `P6c 切换钮上移 @(94,${p6.togExpect})(实测 y=${p6.togY?.toFixed(1)})`);
  ok(p6.avail > 0, `P6d 经典列表=常规可制(${p6.avail})`);
  ok(p6.classicText === '在此放置材料', `P6e 经典位空槽文案("${p6.classicText}")`);
  await page.close();
}

// ---- P7-P9:会话保持入口+走远退出+互斥 ----
{
  const page = await browser.newPage();
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);
  const errs2 = [];
  page.on('pageerror', (e) => errs2.push((e.stack || e.message).slice(0, 160)));
  // P7 重铸:会话保持入口 → 走远退出
  await mkFake(page);
  const p7a = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.openInventory(true);
    ui.showReforge();
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    const slot = ui.vinvReforgeSlotEl;
    return { open: ui.vinvReforgeOpen, visible: ui.vinvReforgeVisible(), slotVis: slot ? slot.offsetParent !== null : false };
  });
  ok(p7a.open && p7a.visible && p7a.slotVis, `P7a 重铸态开+会话保持(open=${p7a.open} vis=${p7a.visible})`);
  await clearFake(page);
  const p7b = await page.evaluate(async () => {
    const ui = window.__swUI;
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    return { open: ui.vinvReforgeOpen, visible: ui.vinvReforgeVisible() };
  });
  ok(!p7b.open && !p7b.visible, `P7b 走远=重铸态退出(open=${p7b.open})`);
  // P8 向导走远退出
  await mkFake(page);
  const p8 = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.openInventory(true);
    ui.openVanillaGuideCraft();
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    const openBefore = ui.vinvGuideMenuOpen;
    window.__swGame.dialogNpc = null;
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    return { openBefore, openAfter: ui.vinvGuideMenuOpen, winOpen: ui.vinvModernCraftOpen };
  });
  ok(p8.openBefore && !p8.openAfter && !p8.winOpen, `P8 向导态走远退出(before=${p8.openBefore} after=${p8.openAfter})`);
  // P9 互斥:重铸态进向导态 → 重铸退出
  await mkFake(page);
  const p9 = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.showReforge();
    await ui.refreshAllAsync();
    const reforgeOpen = ui.vinvReforgeOpen;
    ui.openVanillaGuideCraft();
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    return { reforgeOpen, reforgeAfter: ui.vinvReforgeOpen, guideOpen: ui.vinvGuideMenuOpen };
  });
  ok(p9.reforgeOpen && !p9.reforgeAfter && p9.guideOpen, `P9 重铸↔向导互斥(reforge ${p9.reforgeOpen}→${p9.reforgeAfter})`);
  ok(errs2.length === 0, `无页面错误(${errs2.join(' | ')})`);
  await page.close();
}
await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
