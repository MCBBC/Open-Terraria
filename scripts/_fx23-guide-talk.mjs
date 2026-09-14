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

/** 真实向导会话(22):真实 TownNPC 落地 → 玩家贴到向导旁(keepAlive 矩形在界)。
 *  open=true = 同步段 openNpcDialog 全链(A/B/C 用);open=false = 只落实体,
 *  对话留给真实右键驱动(PHASE R 用) */
const spawnGuideDialog = (page, open = true) => page.evaluate(async (doOpen) => {
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
  if (doOpen) g.openNpcDialog(guide);
  return { vanillaId: guide.vanillaId, session: !!g.dialogNpc };
}, open);

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

// ============ PHASE R:真实右键全链(interactAt 格交互先行 + NPC 交谈臂) ============
// 用户复测新回归:「和向导对话直接打开物品栏,对话框根本不出现」——真实右键路径
// 与直调 openNpcDialog 分叉。本相:①栈捕获仪器(openInventory 等)②真实鼠标右键
// 驱动 ③工作台同格场景(格臂吞右键嫌疑)④角标 -1 三态。
{
  const page = await browser.newPage();
  const errs = [];
  const cons = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') cons.push(m.text().slice(0, 400)); });
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
    // ---- 栈捕获仪器(实例级影子法:内部 this.openInventory 亦走影子) ----
    const ui = window.__swUI;
    const g = window.__swGame;
    window.__fx23invLog = [];
    const wrap = (obj, key, tag) => {
      if (typeof obj[key] !== 'function') return;
      const orig = obj[key];
      obj[key] = function (...a) {
        const stack = (new Error().stack || '').split('\n').slice(2, 8)
          .map((s) => s.trim().replace(/^at /, '').replace(/\?v=[^ ]*/, '')).join(' <- ');
        window.__fx23invLog.push({ tag, stack, panel: ui.invPanel?.style.display, dialog: !!document.querySelector('.sw-npc-dialog') });
        return orig.apply(this, a);
      };
    };
    wrap(ui, 'openInventory', 'openInventory');
    wrap(ui, 'openCraftingStationFilter', 'openCraftingStationFilter');
    wrap(ui, 'openChest', 'openChest');
    wrap(ui, 'closeNpcDialog', 'uiCloseNpcDialog');
    // ---- 右键分派链仪器(帧循环熔断会吞 pageerror,console 已挂;此处录分派轨迹) ----
    const wlog = (obj, key, tag, argFn) => {
      if (typeof obj[key] !== 'function') return;
      const orig = obj[key];
      obj[key] = function (...a) {
        let r;
        try { r = orig.apply(this, a); } catch (e) {
          window.__fx23invLog.push({ tag: tag + ':THROW', err: String(e && e.stack || e).slice(0, 300) });
          throw e;
        }
        window.__fx23invLog.push({ tag, args: argFn ? argFn(a) : '', ret: typeof r === 'object' ? 'obj' : String(r) });
        return r;
      };
    };
    wlog(g, 'rightClickTileNpcDispatch', 'dispatch', (a) => `tx=${a[0]},ty=${a[1]}`);
    wlog(g, 'npcChatBubbleHovered', 'bubble', (a) => `${Math.round(a[0])},${Math.round(a[1])}`);
    wlog(g, 'talkToNearbyNpc', 'talk', (a) => `${Math.round(a[0])},${Math.round(a[1])}`);
    wlog(g, 'interactAt', 'interactAt', (a) => `${a[0]},${a[1]}`);
  });
  await sleep(150);
  await spawnGuideDialog(page, false);   // 只落实体,对话留给真实右键
  await sleep(500);                      // 向导落地+首帧 atlas 就位(R1 竞态防:首秒编译抖动)

  // 真实右键驱动:向导碰撞盒中心(worldToScreen)按住 500ms(保证 press 边沿进 tick)
  const rightClickGuide = async () => {
    const p = await page.evaluate(() => {
      const g = window.__swGame, guide = window.__fx23Guide;
      const [sx, sy] = g.camera.worldToScreen(guide.cx, guide.y + guide.h * 0.5);
      return { sx, sy };
    });
    await page.mouse.move(p.sx, p.sy);
    await sleep(120);
    await page.mouse.down({ button: 'right' });
    await sleep(500);
    await page.mouse.up({ button: 'right' });
    await sleep(280);
    return page.evaluate(() => ({
      dialogOpen: !!document.querySelector('.sw-npc-dialog'),
      panel: window.__swUI.invPanel?.style.display ?? 'x',
      invCalls: window.__fx23invLog.filter((e) => e.tag === 'openInventory').length,
      filter: window.__swUI.vinvModernCraftFilter,
      running: window.__swGame.running,
      log: window.__fx23invLog.filter((e) => !String(e.tag).includes('bubble')),
    }));
  };

  // ---- R1 洁净场景:真实右键向导 = 只开对话,物品栏不动 ----
  const r1 = await rightClickGuide();
  console.log('[R1]', JSON.stringify(r1.log));
  ok(r1.running, 'R1-pre 游戏帧循环存活');
  ok(r1.dialogOpen, `R1 真实右键向导=对话面板开`);
  ok(r1.panel !== 'block', `R1 物品栏不动(display=${r1.panel})`);
  ok(r1.invCalls === 0, `R1 零 openInventory 调用(${r1.invCalls})`);

  // ---- R2 工作台同格:向导躯干格放工作台 → 真实右键向导 ----
  // 原版闩(Player.cs:32188-32197 currentNPCShowingChatBubble → releaseUseTile=false)
  // ⇒ :32414 if(flag) 包住的全部标准格交互支(含 :33541 合成站臂)让位 ⇒ 交谈臂开对话。
  await page.evaluate(() => {
    const g = window.__swGame, guide = window.__fx23Guide, st = g.world.store;
    const tx = Math.floor(guide.cx / 16), ty = Math.floor((guide.y + guide.h / 2) / 16);
    const wb = window.__swTiles['workbench'];
    st.setTileSilent(tx, ty, wb, 0, 0);
    st.setTileSilent(tx + 1, ty, wb, 18, 0);
    window.__fx23wbCell = { tx, ty };
    window.__fx23invLog.length = 0;
    g.closeNpcDialog(true);   // 收 R1 对话,场景复位
  });
  await sleep(150);
  const r2 = await rightClickGuide();
  console.log('[R2]', JSON.stringify(r2.log));
  ok(r2.dialogOpen, `R2 工作台同格右键向导=对话开(格臂让位,原版 :32188 闩)`);
  ok(r2.panel !== 'block', `R2 物品栏不动(display=${r2.panel})`);
  ok(r2.invCalls === 0 && r2.filter === null, `R2 零 openInventory/零站点过滤(inv=${r2.invCalls} filter=${String(r2.filter)})`);

  // ---- R5 闩不杀格交互:向导帧盒外(+4 格)的工作台 → 右键 = 站点过滤+开包 ----
  await page.evaluate(() => {
    const g = window.__swGame, st = g.world.store, { tx, ty } = window.__fx23wbCell;
    const wb = window.__swTiles['workbench'];
    st.setTileSilent(tx + 4, ty, wb, 0, 0);
    st.setTileSilent(tx + 5, ty, wb, 18, 0);
    window.__fx23wbFar = { x: (tx + 4) * 16 + 8, y: ty * 16 + 8 };
    window.__fx23invLog.length = 0;
  });
  {
    const p = await page.evaluate(() => {
      const g = window.__swGame;
      const [sx, sy] = g.camera.worldToScreen(window.__fx23wbFar.x, window.__fx23wbFar.y);
      return { sx, sy };
    });
    await page.mouse.move(p.sx, p.sy);
    await sleep(120);
    await page.mouse.down({ button: 'right' });
    await sleep(500);
    await page.mouse.up({ button: 'right' });
    await sleep(280);
  }
  const r5 = await page.evaluate(() => ({
    panel: window.__swUI.invPanel?.style.display ?? 'x',
    filter: window.__swUI.vinvModernCraftFilter,
    invCalls: window.__fx23invLog.filter((e) => e.tag === 'openInventory').length,
    log: window.__fx23invLog,
  }));
  console.log('[R5]', JSON.stringify(r5.log));
  ok(r5.panel === 'block' && r5.invCalls > 0, `R5 帧盒外右键工作台=格交互照常(开包 ${r5.panel} inv=${r5.invCalls})`);
  ok(r5.filter !== null, `R5 站点过滤置位(${JSON.stringify(r5.filter)})`);

  // ---- R4 角标三态:点「住房」→ DisplaySlots_5 角标显 → 点角标 = 关对话+开背包 ----
  await page.evaluate(() => {
    window.__swUI.closeInventory();          // 收 R5 面板,角标从「关」起测
    window.__fx23invLog.length = 0;
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="home"]');
    b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await sleep(200);
  const r4a = await page.evaluate(() => !!document.querySelector('.sw-npc-dialog img.sw-corner-item[data-corner="-1"]'));
  ok(r4a, 'R4a 点「住房」后角标(DisplaySlots_5)显');
  {
    const p = await page.evaluate(() => {
      const img = document.querySelector('.sw-npc-dialog img.sw-corner-item[data-corner="-1"]');
      if (!img) return null;
      const r = img.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    if (p) {
      await page.mouse.click(p.x, p.y);
      await sleep(250);
    }
  }
  const r4b = await page.evaluate(() => ({
    dialogOpen: !!document.querySelector('.sw-npc-dialog'),
    panel: window.__swUI.invPanel?.style.display ?? 'x',
    invCalls: window.__fx23invLog.filter((e) => e.tag === 'openInventory').length,
  }));
  ok(!r4b.dialogOpen, 'R4b 点角标=对话收(Main.cs:40535 CloseNPCChatOrSign)');
  ok(r4b.panel === 'block' && r4b.invCalls > 0, `R4b 点角标=开装备页背包(Main.cs:40536,display=${r4b.panel} inv=${r4b.invCalls})`);
  ok(errs.length === 0 && cons.length === 0, `R9 无页面错误/无熔断(页错=${errs.join(' | ')} 控制台=${cons.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
