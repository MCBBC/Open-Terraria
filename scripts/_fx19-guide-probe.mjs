// 刀19验收:向导制作菜单 1:1(modern 窗槽/空槽0配方/反查过滤/全亮/打造门/经典位/退出面)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);
  // modern 缺省(Options 缺省 modern;localStorage 新 profile)

  // ---- P1 入口:开向导菜单 → modern 窗开+向导槽显+空槽文案 ----
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
      winDisp: ui.vinvModernCraftEl?.style.display,
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
    return { entries: ui.vinvModernEntries.length, cells: list ? list.children.length : -1, avail: ui.vinvCraftAvailV.length };
  });
  ok(p2.entries === 0 && p2.cells === 0, `P2 空槽=0 配方(entries=${p2.entries} cells=${p2.cells})`);

  // ---- P3 放置木材 → 反查过滤+全亮+无拥有数+文案"需要 X" ----
  const p3 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const g = window.__swGame;
    const mod = await import('/src/data/items.ts');
    const woodKey = mod.VANILLA_ITEM_KEY_BY_ID[9];
    const wood = mod.ITEM_BY_KEY[woodKey];
    ui.heldStack = { id: wood, stack: 10 };
    const slot = ui.vinvGuideSlotModernEl;
    slot.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const list = ui.vinvModernGridInner;
    const cntEls = [...(ui.vinvModernDetailEl?.querySelectorAll('.cnt') ?? [])];
    const slotImg = slot.querySelector('img');
    return {
      placed: !!ui.guidePlaced, heldGone: !ui.heldStack,
      cap: ui.vinvGuideModernCaptionEl?.textContent?.slice(0, 14),
      entries: ui.vinvModernEntries.length, cells: list ? list.children.length : -1,
      detailCnt: cntEls.length, detailCntHidden: cntEls.every((c) => c.style.display === 'none'),
      slotHasImg: !!slotImg,
      woodEntries: ui.vinvModernEntries.length,
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
    // 现代窗成品槽点击(选中即焦点)
    const detail = ui.vinvModernDetailEl;
    const slot = detail?.querySelector('.sw-slot');
    slot?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    const after = g.player.inv.slots.filter(Boolean).reduce((a, s) => a + s.stack, 0);
    return { before, after, held: !!ui.heldStack };
  });
  ok(p4.before === p4.after && !p4.held, `P4 反查态打造被门(总堆 ${p4.before}→${p4.after})`);

  // ---- P5 取回+退出面(closeInventory) ----
  const p5 = await page.evaluate(async () => {
    const ui = window.__swUI;
    // 空手点槽取回
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 100));
    const takenBack = !ui.guidePlaced && !!ui.heldStack;
    ui.heldStack = null;   // 探针清手
    ui.closeInventory();
    await ui.refreshAllAsync();
    return { takenBack, open: ui.vinvGuideMenuOpen, winOpen: ui.vinvModernCraftOpen };
  });
  ok(p5.takenBack, 'P5a 空手取回整组');
  ok(!p5.open && !p5.winOpen, 'P5b 关包=向导态+窗全复位');

  // ---- P6 classic 控制模式:经典位槽 @(73,331+num52)+切换钮上移+窗不开 ----
  const p6 = await page.evaluate(async () => {
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'classic');
    const ui = window.__swUI;
    const g = window.__swGame;
    ui.openInventory(true);
    ui.openVanillaGuideCraft();
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 150));
    const cs = ui.vinvGuideSlotClassicEl;
    const r = cs ? cs.getBoundingClientRect().toJSON() : null;
    // 注入材料保证常规列表非空(P5 取回件未回包=探针世界清白)
    const mod2 = await import('/src/data/items.ts');
    const wood2 = mod2.ITEM_BY_KEY[mod2.VANILLA_ITEM_KEY_BY_ID[9]];
    for (let i = 10; i < 50; i++) if (!g.player.inv.slots[i]) { g.player.inv.slots[i] = { id: wood2, stack: 20 }; break; }
    g.cb.onInventoryChanged?.();
    await ui.refreshAllAsync();
    const normalCount = ui.vinvCraftAvailV.length;
    const sh = 1000;
    const adjY = ui.vinvCraftAdjY(sh);
    const tog = ui.vinvGridToggleImg.parentElement.getBoundingClientRect().toJSON();
    return {
      open: ui.vinvGuideMenuOpen, winOpen: ui.vinvModernCraftOpen,
      slot: r, expectY: 331 + adjY, togY: tog.y, togExpect: 300 + adjY,
      avail: ui.vinvCraftAvailV.length,
      normalCount,
      classicText: ui.vinvGuideClassicTextEl?.textContent?.slice(0, 10),
    };
  });
  ok(p6.open && !p6.winOpen, 'P6a classic 控制=窗不开');
  ok(p6.slot && Math.abs(p6.slot.x - 73) < 2 && Math.abs(p6.slot.y - p6.expectY) < 2,
    `P6b 经典位槽 @(73,${p6.expectY})(实测 ${p6.slot?.x?.toFixed(1)},${p6.slot?.y?.toFixed(1)})`);
  ok(Math.abs(p6.togY - p6.togExpect) < 2, `P6c 切换钮上移 @(94,${p6.togExpect})(实测 y=${p6.togY?.toFixed(1)})`);
  ok(p6.normalCount > 0 && p6.avail === p6.normalCount, `P6d 经典列表=常规可制(空槽 ${p6.avail}=常规 ${p6.normalCount})`);
  ok(p6.classicText === '在此放置材料', `P6e 经典位空槽文案("${p6.classicText}")`);
  ok(errs.length === 0, `无页面错误(${errs.join(' | ')})`);
}
await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
