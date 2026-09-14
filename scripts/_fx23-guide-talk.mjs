// FX23 复现:向导「制作」→ 必须有【可见制作 UI】(modern 窗/经典位槽三件套)。
// 真实链 = 伪造向导会话(真实 TownNPC 22)+ g.openNpcDialog(真实 cb.onNpcDialog
// 开面板)→ 页面真实鼠标点「制作」DOM 钮 → Game.npcDialogButton('craft') →
// minimizeNpcDialog + mainFlow onGuideCraftOpen。
// 双 craftingGridControl(modern/classic)× 双入口态(背包关/背包已开)全跑,
// 定位用户所见"只有物品栏/什么都没有"的确切分支。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5206';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

/** 真实向导会话(22):真实 TownNPC 落地 → 玩家贴到向导旁(keepAlive 矩形在界,
 *  同步段先挪人再开对话,无 tick 插隙)+ openNpcDialog 全链 */
const spawnGuideDialog = (page) => page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__fx23Guide) {
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__fx23Guide = guide;
  }
  const guide = window.__fx23Guide;
  g.player.x = guide.cx - 30; g.player.y = guide.cy - 8;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp; g.player.dead = false;
  g.openNpcDialog(guide);
  return { vanillaId: guide.vanillaId, session: !!g.dialogNpc };
});

/** 真实鼠标点「制作」DOM 钮 */
const clickCraft = async (page) => {
  const pos = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: b.textContent };
  });
  if (!pos) return null;
  await page.mouse.click(pos.x, pos.y);
  return pos;
};

const craftState = (page) => page.evaluate(() => {
  const ui = window.__swUI;
  const g = window.__swGame;
  const win = ui.vinvModernCraftEl;
  const cs = ui.vinvGuideSlotClassicEl;
  const tog = ui.vinvGridToggleImg?.parentElement ?? null;
  const rectOf = (e) => { if (!e) return null; const r = e.getBoundingClientRect().toJSON(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  return {
    panel: ui.invPanel?.style.display ?? 'null-panel',
    dialogGone: !document.querySelector('.sw-npc-dialog'),
    sessionKept: !!g.dialogNpc,
    guideMenu: ui.vinvGuideMenuOpen,
    modernOpen: ui.vinvModernCraftOpen,
    winDisplay: win?.style.display ?? 'no-el',
    winVisible: win ? win.offsetParent !== null : false,
    winRect: rectOf(win),
    classicSlotVisible: cs ? cs.offsetParent !== null : false,
    classicSlotRect: rectOf(cs),
    classicText: ui.vinvGuideClassicTextEl?.textContent ?? null,
    classicTextVisible: ui.vinvGuideClassicTextEl ? ui.vinvGuideClassicTextEl.offsetParent !== null : false,
    toggleVisible: tog ? tog.offsetParent !== null : false,
    toggleRect: rectOf(tog),
    craftTitleVisible: ui.vinvCraftTitleEl ? ui.vinvCraftTitleEl.offsetParent !== null : false,
    classicListVisible: ui.vinvClassicCraftVisible(),
    availCount: ui.vinvCraftAvailV.length,
    control: (window.__swOptions?.data?.craftingGridControl) ?? null,
  };
});

// ============ PHASE A:modern(缺省)× 背包关 → 点「制作」 ============
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);
  await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'modern');
    await options.set('inventoryLayout', 'vanilla');
    window.__swUI.closeInventory();
  });
  await sleep(150);

  const spawned = await spawnGuideDialog(page);
  ok(spawned.vanillaId === 22 && spawned.session, `A0 向导会话建立(vid=${spawned.vanillaId} session=${spawned.session})`);
  await sleep(200);
  const a = await craftState(page);
  const aBtns = await page.evaluate(() =>
    [...document.querySelectorAll('.sw-npc-dialog .sw-npc-btn')].map((b) => b.dataset.b).join(','));
  ok(!!aBtns && aBtns.includes('help') && aBtns.includes('craft'), `A1 对话钮含 help+craft(${aBtns})`);
  ok(!a.panel.includes('block'), `A2 仅开对话时物品栏不得打开(display=${a.panel})`);
  ok(!a.guideMenu && !a.modernOpen, `A3 初态无向导态/无窗(guide=${a.guideMenu} modern=${a.modernOpen})`);

  const clicked = await clickCraft(page);
  ok(!!clicked, `A4 「制作」DOM 钮可点(${clicked ? clicked.label : 'miss'})`);
  await sleep(300);
  const b = await craftState(page);
  console.log('[modern-InvClosed]', JSON.stringify(b));
  ok(b.dialogGone, 'B1 点制作后对话面板收');
  ok(b.panel === 'block', `B2 物品栏开(display=${b.panel})`);
  ok(b.sessionKept, 'B3 会话保持(dialogNpc 不清)');
  ok(b.guideMenu && b.modernOpen, `B4 modern 窗态置位(guide=${b.guideMenu} modern=${b.modernOpen})`);
  ok(b.winDisplay !== 'none' && b.winVisible, `B5 modern 窗 DOM 显(display=${b.winDisplay} offsetParent=${b.winVisible})`);
  ok(!!b.winRect && b.winRect.w > 300 && b.winRect.h > 200 && b.winRect.y >= 0 && b.winRect.y < 1000,
    `B6 modern 窗在屏(${JSON.stringify(b.winRect)})`);
  await page.screenshot({ path: '/tmp/fx23-guide.png' });

  // ---- PHASE B:modern × 背包已开 → 点「制作」(原版 playerInventory=true 无条件) ----
  await page.evaluate(async () => {
    const g = window.__swGame;
    const ui = window.__swUI;
    g.closeNpcDialog(true);
    ui.closeInventory();
    await ui.refreshAllAsync?.();
    ui.openInventory(true);          // 先开背包
    g.openNpcDialog(window.__fx23Guide);   // 对话叠在开背包上(原版合法态)
  });
  await sleep(250);
  const pre = await craftState(page);
  ok(pre.panel === 'block' && !pre.dialogGone, `B-pre 背包开+对话叠开(panel=${pre.panel})`);
  await clickCraft(page);
  await sleep(300);
  const b2 = await craftState(page);
  console.log('[modern-InvOpen]', JSON.stringify(b2));
  ok(b2.panel === 'block', `B8 背包已开时点制作背包【保持开】(原版 playerInventory=true 无条件,display=${b2.panel})`);
  ok(b2.winVisible, `B9 modern 窗可见(display=${b2.winDisplay} offsetParent=${b2.winVisible})`);
  await page.screenshot({ path: '/tmp/fx23-guide-invopen.png' });
  ok(errs.length === 0, `B10 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ PHASE C:classic × 背包关 → 点「制作」 ============
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
  await sleep(700);
  await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'classic');
    await options.set('inventoryLayout', 'vanilla');
    window.__swUI.closeInventory();
  });
  await sleep(150);
  const spawned = await spawnGuideDialog(page);
  ok(spawned.session, `C0 向导会话建立(${spawned.vanillaId})`);
  await sleep(200);
  const clicked = await clickCraft(page);
  ok(!!clicked, `C1 「制作」DOM 钮可点(${clicked ? clicked.label : 'miss'})`);
  await sleep(300);
  const c = await craftState(page);
  console.log('[classic-InvClosed]', JSON.stringify(c));
  ok(c.dialogGone, 'C2 对话面板收');
  ok(c.panel === 'block', `C3 物品栏开(display=${c.panel})`);
  ok(!c.modernOpen, 'C4 classic=modern 窗不开');
  ok(c.guideMenu, 'C5 向导态置位');
  ok(c.classicSlotVisible, `C6 经典位槽显(原版 :42401-42415 @(73,331+num52),rect=${JSON.stringify(c.classicSlotRect)})`);
  ok(c.classicTextVisible && !!c.classicText, `C7 经典位文案显("${c.classicText}")`);
  ok(c.toggleVisible, `C8 切换钮显(右键循环 CraftingGridControl,rect=${JSON.stringify(c.toggleRect)})`);
  ok(c.classicListVisible && c.craftTitleVisible, `C9 经典合成面显(title=${c.craftTitleVisible} list=${c.classicListVisible})`);
  ok(c.availCount >= 0, `C10 可制列表条目=${c.availCount}`);
  await page.screenshot({ path: '/tmp/fx23-guide-classic.png' });
  ok(errs.length === 0, `C11 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
