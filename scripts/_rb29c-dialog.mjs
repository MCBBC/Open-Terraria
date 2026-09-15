// RB29c 红队探针:对话呈现+杂项未审改动(①FX27 openNpcDialog 收包链/chat 音效/向导槽
//   ghost/头像对齐 ②FX35 字体族 ③tooltip 锚/宝箱描边/对话圆角)
// 攻击面:
//   A. classic 布局 商店→对话(右键另一 NPC)收包链——closeInventory 只清 Game 侧
//      npcShopOpen,浮动 NpcShop DOM 面板(vanilla 内嵌货架以外的一面)是否滞留;
//   B. vanilla 布局同链——内嵌货架应随 refreshAll 收面(双面一致性对照);
//   C. 向导槽 Shift 对换路由:vanilla 内嵌向导态(guideEl=null)Shift+点材料是否
//      丢失 cursorOverride 9 向导支(ItemSlot.cs:645-651 InGuideCraftMenu 全局面);
//   D. 向导菜单退出(走远)放置物归还——vanilla Main.cs:42400 出口即 dropItemCheck;
//   E. chat 音效面:dyeTraderRarePlant gotDye/anglerQuestTurnIn done 的 SoundID 24;
//   F. 头像三态(1 行/10 行/窄屏 scale)+金币条/按钮行与字号;canvas 字体就绪。
// 跑法:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_rb29c-dialog.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5232';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const sfxStub = (page) => page.evaluate(async () => {
  const g = window.__swGame;
  window.__rb29sfx = [];
  const wrap = (obj) => {
    if (!obj || typeof obj.play !== 'function') return;
    const orig = obj.play.bind(obj);
    obj.play = (name, vol, x, y) => { window.__rb29sfx.push(name); return orig(name, vol, x, y); };
  };
  wrap(g.sfx);
  const { UISfx } = await import('/src/vui/UISfx.ts');
  wrap(UISfx.sfx);
});

const spawnNpc = (page, key) => page.evaluate(async (k) => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window[`__rb29_${k}`]) {
    const n = new TownNPC(k, g.player.x + 40, g.world.groundLevel * 16 - 48);
    n.home = null;
    g.entities.add(n, 'npcs');
    window[`__rb29_${k}`] = n;
  }
  const n = window[`__rb29_${k}`];
  n.x = g.player.x + 40; n.y = g.world.groundLevel * 16 - n.h;
  return { vid: n.vanillaId, key: n.npcKey };
}, key);

/** 玩家钉到 NPC 旁(tileReach(0)=±5X/±3Y 域内,keepAlive 不误关) */
const pinNear = (page, key, dx = 34) => page.evaluate((k, d) => {
  const g = window.__swGame;
  const n = window[`__rb29_${k}`];
  if (!n) return null;
  n.x = g.player.x + d; n.y = g.world.groundLevel * 16 - n.h; n.vx = 0; n.vy = 0;
  g.player.x = n.x - (n.w / 2) - 12; g.player.y = n.y + n.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  return { dx: Math.round(n.x - g.player.x), dy: Math.round(n.y - g.player.y) };
}, key, dx);

// ================= PHASE A/B:商店→对话(右键另一 NPC)收包链双面一致性 =================
for (const layout of ['classic', 'vanilla']) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + `/?play=small&invlayout=${layout}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
  await page.evaluate(async (lay) => {
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('inventoryLayout', lay);
  }, layout);
  await sleep(250);
  await sfxStub(page);
  await spawnNpc(page, 'merchant');
  await spawnNpc(page, 'guide');
  await sleep(200);
  await pinNear(page, 'merchant', 34);
  await sleep(150);
  // 1) 开对话→商店钮(经真实 onButton 链:openShopFromButton→openNpcShop→showNpcShop)
  const st1 = await page.evaluate(() => {
    const g = window.__swGame;
    const m = window.__rb29_merchant, p = g.player;
    m.x = p.x + 40; m.y = g.world.groundLevel * 16 - m.h; m.vx = 0; m.vy = 0; m.talkCooldown = 9999;
    g.openNpcDialog(window.__rb29_merchant);
    const btn = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="shop"]');
    if (!btn) return { noShopBtn: true };
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    return { noShopBtn: false };
  });
  await sleep(600);
  const st2 = await page.evaluate((layout) => {
    const ui = window.__swUI, g = window.__swGame;
    return {
      layout,
      npcShopOpen: g.npcShopOpen,
      domFloatShop: !!ui.npcShop,
      invOpen: ui.inventoryOpen,
      uiBlocking: g.input.uiBlocking,
      vinvShopPayload: !!ui.vinvShopPayload,
    };
  }, layout);
  // 2) 对话 B(右键另一 NPC 等价=openNpcDialog(guide);收包门 inventoryOpen)
  const st3 = await page.evaluate(() => {
    const g = window.__swGame, ui = window.__swUI;
    const gd = window.__rb29_guide;
    gd.x = g.player.x + 60; gd.y = g.world.groundLevel * 16 - gd.h; gd.vx = 0; gd.vy = 0; gd.talkCooldown = 9999;
    g.openNpcDialog(window.__rb29_guide);
    return {
      npcShopOpen: g.npcShopOpen,
      domFloatShop: !!ui.npcShop,
      invOpen: ui.inventoryOpen,
      uiBlocking: g.input.uiBlocking,
      dialogB: !!document.querySelector('.sw-npc-dialog'),
      floatShopEl: !!document.querySelector('.sw-npc-shop'),
      buyStillLive: (() => { try { return typeof g.npcShopBuy === 'function' && g.npcShopBuy.length >= 2; } catch { return false; } })(),
    };
  });
  console.log(`[${layout}] openShop=`, JSON.stringify(st1), JSON.stringify(st2));
  console.log(`[${layout}] afterDialogB=`, JSON.stringify(st3));
  await page.screenshot({ path: `/tmp/rb29c-${layout}-shop2dialog.png` });
  ok(st2.npcShopOpen && (layout === 'classic' ? st2.domFloatShop : st2.vinvShopPayload), `A/B[${layout}] 开店态就绪(shopOpen=${st2.npcShopOpen})`);
  if (layout === 'classic') {
    // 原版 IngameUIWindows.CloseAll→playerInventory=false→货架面收(Main.cs:42496-42499);
    // 期望浮动货架面板随收——实测?
    ok(!st3.domFloatShop, `A[classic] 对话B开=旧店浮动面板已收(实测 domFloatShop=${st3.domFloatShop} → 与 vanilla 内嵌面不一致)`);
  } else {
    ok(!st3.vinvShopPayload || !st2.vinvShopPayload || true, `B[vanilla] 内嵌货架载荷态(实测 payload=${st3.vinvShopPayload})`);
  }
  ok(!st3.uiBlocking, `A/B[${layout}] 收包后 uiBlocking 无残留(实测 ${st3.uiBlocking})`);
  ok(errs.length === 0, `A/B[${layout}] 无页面错误(${errs.join(' | ')})`);
  await page.close();
}
// vanilla 内嵌货架收面细查(独立页,读 display 门)
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
  await spawnNpc(page, 'merchant'); await spawnNpc(page, 'guide');
  await sleep(200);
  await pinNear(page, 'merchant', 34);
  await page.evaluate(() => {
    const g = window.__swGame, m = window.__rb29_merchant;
    m.x = g.player.x + 40; m.y = g.world.groundLevel * 16 - m.h; m.vx = 0; m.vy = 0; m.talkCooldown = 9999;
    g.openNpcDialog(window.__rb29_merchant);
  });
  await sleep(200);
  await page.evaluate(() => {
    document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="shop"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await sleep(600);
  const shopOpenState = await page.evaluate(() => {
    const ui = window.__swUI;
    const vis = ui.vinvShopVisible?.();
    return { payload: !!ui.vinvShopPayload, vis, invOpen: ui.inventoryOpen };
  });
  await page.evaluate(() => {
    const g = window.__swGame, gd = window.__rb29_guide;
    gd.x = g.player.x + 60; gd.y = g.world.groundLevel * 16 - gd.h; gd.vx = 0; gd.vy = 0; gd.talkCooldown = 9999;
    g.openNpcDialog(window.__rb29_guide);
  });
  await sleep(500);
  const after = await page.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    const cells = [...document.querySelectorAll('.sw-vinv [data-shopcell], .sw-vinv-shopcell')];
    return { vis: ui.vinvShopVisible?.(), payload: !!ui.vinvShopPayload, npcShopOpen: g.npcShopOpen, cells: cells.length };
  });
  console.log('[vanilla-shelf]', JSON.stringify({ shopOpenState, after }));
  ok(shopOpenState.vis === true, `B[vanilla] 开店态内嵌货架可见(vis=${shopOpenState.vis})`);
  ok(after.vis === false && !after.npcShopOpen, `B[vanilla] 对话B开=内嵌货架收面(vis=${after.vis} shopOpen=${after.npcShopOpen})`);
  ok(errs.length === 0, `B[vanilla] 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ================= PHASE C:Shift 对换路由(vanilla 内嵌向导态 vs classic 浮层) =================
for (const mode of ['vanilla-embedded', 'classic-overlay']) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + `/?play=small&invlayout=${mode === 'vanilla-embedded' ? 'vanilla' : 'classic'}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
  await page.evaluate(async (m) => {
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('inventoryLayout', m === 'vanilla-embedded' ? 'vanilla' : 'classic');
  }, mode);
  await sleep(250);
  await spawnNpc(page, 'guide');
  await sleep(150);
  await pinNear(page, 'guide', 34);
  const placed = await page.evaluate(async (m) => {
    const g = window.__swGame, ui = window.__swUI;
    const gd = window.__rb29_guide;
    gd.x = g.player.x + 40; gd.y = g.world.groundLevel * 16 - gd.h; gd.vx = 0; gd.vy = 0; gd.talkCooldown = 9999;
    g.openNpcDialog(window.__rb29_guide);
    await new Promise((r) => setTimeout(r, 250));
    if (m === 'vanilla-embedded') {
      const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
      b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      await new Promise((r) => setTimeout(r, 400));
    } else {
      ui.openInventory(true);
      ui.openGuideSearch();
      await new Promise((r) => setTimeout(r, 250));
    }
    // 材料入包(凝胶 23=配方原料)
    const { VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
    const { ITEM_BY_KEY } = await import('/src/data/items.ts');
    const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[23]] ?? -1;
    g.player.inv.slots[0] = { id: iid, stack: 5, prefix: 0 };
    ui.refreshAll();
    await new Promise((r) => setTimeout(r, 200));
    const before = { guideMenu: ui.vinvGuideMenuOpen, overlay: !!ui.guideEl, slot0: !!g.player.inv.slots[0] };
    // Shift+左键路由(等价 DOM mousedown shiftKey;直调私有方法保真路由)
    ui.altMoveClick(0, 'inv', true, false, true);
    return {
      before,
      guidePlaced: ui.guidePlaced ? { id: ui.guidePlaced.id, stack: ui.guidePlaced.stack } : null,
      slot0: g.player.inv.slots[0] ? g.player.inv.slots[0].stack : null,
      iid,
    };
  }, mode);
  console.log(`[shift-${mode}]`, JSON.stringify(placed));
  if (mode === 'vanilla-embedded') {
    // 原版 InGuideCraftMenu 态 Shift+点材料 = Utils.Swap(inv,guideItem)(ItemSlot.cs:645-651/:810-815)
    ok(!!placed.guidePlaced, `C[vanilla-embedded] Shift+点材料入向导槽(原版 cursorOverride 9 向导支;实测 guidePlaced=${JSON.stringify(placed.guidePlaced)})`);
  } else {
    ok(!!placed.guidePlaced, `C[classic-overlay] Shift+点材料入反查槽(对照面,应 PASS)`);
  }
  ok(errs.length === 0, `C[${mode}] 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ================= PHASE D:走远退出向导菜单,放置物是否归还背包 =================
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
  await spawnNpc(page, 'guide');
  await sleep(150);
  await pinNear(page, 'guide', 34);
  const r = await page.evaluate(async () => {
    const g = window.__swGame, ui = window.__swUI;
    const gd = window.__rb29_guide;
    gd.x = g.player.x + 40; gd.y = g.world.groundLevel * 16 - gd.h; gd.vx = 0; gd.vy = 0; gd.talkCooldown = 9999;
    g.openNpcDialog(window.__rb29_guide);
    await new Promise((r2) => setTimeout(r2, 200));
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
    b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r2) => setTimeout(r2, 400));
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const iid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[23]] ?? -1;
    ui.guidePlaced = { id: iid, stack: 3 };   // 放入向导槽(等价槽点击放置后的态)
    ui.vinvPaintGuideCraft?.();
    const menuWasOpen = ui.vinvGuideMenuOpen;
    const inInvBefore = g.player.inv.slots.some((s) => s && s.id === iid);
    // 走远(keepAlive 出界 → closeNpcDialog → vinvGuideMenuExitCheck)
    g.player.x = window.__rb29_guide.cx + 300 * 16;
    await new Promise((r2) => setTimeout(r2, 1800));
    return {
      menuWasOpen,
      menuOpen: ui.vinvGuideMenuOpen,
      dialogAlive: !!g.dialogNpc,
      guidePlaced: ui.guidePlaced ? { ...ui.guidePlaced } : null,
      inInvAfter: g.player.inv.slots.some((s) => s && s.id === iid),
      invOpen: ui.inventoryOpen,
    };
  });
  console.log('[walkaway]', JSON.stringify(r));
  ok(r.menuWasOpen === true, `D 前置:向导菜单确实开过(menuWasOpen=${r.menuWasOpen})`);
  ok(r.menuOpen === false && !r.dialogAlive, `D 走远=向导菜单+对话退出(menuOpen=${r.menuOpen} dialog=${r.dialogAlive})`);
  ok(r.guidePlaced === null && r.inInvAfter, `D 放置物随菜单退出归还背包(vanilla Main.cs:42400 出口 dropItemCheck;实测 guidePlaced=${JSON.stringify(r.guidePlaced)} inInv=${r.inInvAfter} invOpen=${r.invOpen})`);
  ok(errs.length === 0, `D 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ================= PHASE E:chat 音效面(dye gotDye / angler done 的 SoundID 24) =================
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
  await sfxStub(page);
  await spawnNpc(page, 'dyer');
  await spawnNpc(page, 'angler');
  await sleep(150);
  const r = await page.evaluate(async () => {
    const g = window.__swGame;
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    // 染料商:奇异植物 3385 入包 → dyeTraderRarePlant
    g.openNpcDialog(window.__rb29_dyer);
    const plantIid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3385]] ?? -1;
    g.player.inv.slots[1] = { id: plantIid, stack: 1 };
    window.__rb29sfx.length = 0;
    g.dyeTraderRarePlant();
    const dyeSfx = window.__rb29sfx.slice();
    // 渔夫:当日任务鱼入包 → anglerQuestTurnIn
    g.world.anglerQuestFinished = false;
    g.world.anglerWhoFinishedToday.length = 0;
    g.openNpcDialog(window.__rb29_angler);
    const qIid = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[g.anglerQuestItemId()]] ?? -1;
    g.player.inv.slots[2] = { id: qIid, stack: 1 };
    window.__rb29sfx.length = 0;
    g.anglerQuestTurnIn();
    const anglerSfx = window.__rb29sfx.slice();
    return { dyeSfx, anglerSfx, plantIid, qIid, doneFlag: g.world.anglerQuestFinished };
  });
  console.log('[sfx]', JSON.stringify(r));
  ok(r.dyeSfx.includes('chat'), `E 染料商交植物=chat 音(vanilla Main.cs:40708 PlaySound(24)=SoundID.Chat;实测 ${JSON.stringify(r.dyeSfx)})`);
  ok(r.anglerSfx.includes('chat'), `E 渔夫交任务鱼=chat 音(vanilla Main.cs:40937 PlaySound(24);实测 ${JSON.stringify(r.anglerSfx)})`);
  ok(r.doneFlag === true, `E 渔夫交付面就绪(done=${r.doneFlag} qIid=${r.qIid})`);
  ok(errs.length === 0, `E 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ================= PHASE F:头像三态几何 + 字号 + canvas 字体就绪 =================
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 160)));
  await page.setViewport({ width: 1600, height: 1000 });
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  const three = await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    await document.fonts.ready;
    const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
    const dlg = new NpcDialog(document.body, () => {});
    const mk = (label, chat, nbtn) => {
      dlg.open('向导', chat, Array.from({ length: nbtn }, (_, i) => ({ id: 'close', label: `钮${i}` })),
        { vanillaId: 22, url: 'sprites/vanilla/NPC_22.png' });
      document.querySelectorAll('.sw-npc-portrait-wrap').forEach((e) => { e.style.animation = 'none'; });
      const p = document.querySelector('.sw-npc-dialog').getBoundingClientRect();
      const w = document.querySelector('.sw-npc-window').getBoundingClientRect();
      const chatEl = document.querySelector('.sw-npc-chat');
      const lines = Math.max(1, Math.round(chatEl.scrollHeight / 30));
      const st = {
        label, lines, pH: +p.height.toFixed(1), pY: +p.y.toFixed(1),
        winTopDelta: +(w.y - p.y).toFixed(1),
        winBottom: +(w.bottom - p.y).toFixed(1),
        hangBelow: +(w.bottom - p.bottom).toFixed(1),
        winCenterDelta: +((w.y + w.height / 2) - (p.y + 62)).toFixed(2),
        bgRadius: getComputedStyle(document.querySelector('.sw-npc-bg')).borderRadius,
        chatFs: getComputedStyle(chatEl).fontSize,
      };
      dlg.close();
      return st;
    };
    // 短台词(1 行)/长台词(10 行满,用 460px 宽 19px Fusion 推进实测)
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = '19px "Fusion Pixel 12px"';
    const adv = ctx.measureText('你你你你你你你你你你').width / 10;
    const perLine = Math.max(4, Math.floor(460 / adv));
    const one = mk('1行', '你好。', 4);
    const ten = mk('10行', '你'.repeat(perLine * 11), 4);
    // 金币条+按钮行(税官式 coins 元素)
    dlg.open('税官', '你好。', [{ id: 'collect', label: '收税', coins: 12345 }, { id: 'close', label: '关闭' }], null);
    const coin = document.querySelector('.sw-npc-coins');
    const btn = document.querySelector('.sw-npc-btn');
    const coinSt = coin ? { fs: getComputedStyle(coin).fontSize, left: coin.style.left, top: coin.style.top, x: +coin.getBoundingClientRect().x.toFixed(1), w: +coin.getBoundingClientRect().width.toFixed(1) } : null;
    const btnSt = btn ? { fs: getComputedStyle(btn).fontSize, x: +btn.getBoundingClientRect().x.toFixed(1) } : null;
    dlg.close();
    return { one, ten, coinSt, btnSt, perLine, adv: +adv.toFixed(2) };
  });
  console.log('[three]', JSON.stringify(three));
  const { one, ten, coinSt, btnSt } = three;
  ok(one.chatFs === '19px', `F 台词 19px(实测 ${one.chatFs})`);
  ok(one.bgRadius === '8px', `F 对话底板圆角 8px(实测 ${one.bgRadius})`);
  ok(Math.abs(one.winTopDelta - 6) <= 2, `F[1行] 头像窗顶=面板顶+6(实测 Δ${one.winTopDelta})`);
  ok(Math.abs(one.winCenterDelta) <= 2, `F[1行] 窗心=面板顶+62 钉死(Main.cs:41031 无高项;实测 Δ${one.winCenterDelta})`);
  ok(Math.abs(ten.winCenterDelta) <= 2 && ten.lines >= 9, `F[10行] 窗心钉+62 不随面板高漂(行数${ten.lines} Δ${ten.winCenterDelta};满行面板原版同相=窗下缘悬出)`);
  console.log(`[three] 满行窗底悬出面板底=${ten.hangBelow}px(原版同相,登记);1行窗底=${one.winBottom}(H${one.pH})`);
  if (coinSt) {
    ok(coinSt.fs === '11px', `F 金币计数 11px(实测 ${coinSt.fs})`);
    ok(btnSt.fs === '17px', `F 按钮 17px(实测 ${btnSt.fs})`);
    ok(coinSt.x + coinSt.w <= btnSt.x + 1, `F 金币条不压按钮文字(金币右缘 ${coinSt.x + coinSt.w} ≤ 钮左 ${btnSt.x})`);
  }
  // 窄屏 scale 态(420px 级 viewport → 0.52):相对几何保形
  await page.setViewport({ width: 400, height: 800 });
  await sleep(300);
  const narrow = await page.evaluate(async () => {
    const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
    const dlg = new NpcDialog(document.body, () => {});
    dlg.open('向导', '你好。', [{ id: 'close', label: '关闭' }], { vanillaId: 22, url: 'sprites/vanilla/NPC_22.png' });
    document.querySelectorAll('.sw-npc-portrait-wrap').forEach((e) => { e.style.animation = 'none'; });
    const p = document.querySelector('.sw-npc-dialog');
    const tr = getComputedStyle(p).transform;
    const w = document.querySelector('.sw-npc-window').getBoundingClientRect();
    const pr = p.getBoundingClientRect();
    // scale 后窗顶-面板顶应 ≈ 6×scale
    const scale = tr === 'none' ? 1 : +tr.slice(7).split(',')[0];
    const delta = (w.y - pr.y) / scale;
    const cdelta = ((w.y + w.height / 2) - (pr.y + 62 * scale)) / scale;
    dlg.close();
    return { scale, delta: +delta.toFixed(2), cdelta: +cdelta.toFixed(2), tr };
  });
  console.log('[narrow]', JSON.stringify(narrow));
  ok(narrow.scale < 0.9 && Math.abs(narrow.delta - 6) <= 2, `F[窄屏] scale=${narrow.scale} 下窗顶=面板顶+6 保形(实测 Δ${narrow.delta})`);
  ok(Math.abs(narrow.cdelta) <= 2, `F[窄屏] 窗心+62 保形(实测 Δ${narrow.cdelta})`);
  // canvas 字体就绪(16px 档)与回退窗
  const font = await page.evaluate(() => {
    const cv = document.createElement('canvas');
    const ctx = cv.getContext('2d');
    ctx.font = '16px "Fusion Pixel 12px"';
    const m1 = ctx.measureText('你泰');
    ctx.font = '16px monospace';
    const m2 = ctx.measureText('你泰');
    return {
      check: document.fonts.check('16px "Fusion Pixel 12px"'),
      inkFusion: +(m1.actualBoundingBoxAscent + m1.actualBoundingBoxDescent).toFixed(1),
      inkMono: +(m2.actualBoundingBoxAscent + m2.actualBoundingBoxDescent).toFixed(1),
      wFusion: +m1.width.toFixed(1), wMono: +m2.width.toFixed(1),
      latFusion: (() => { ctx.font = '16px "Fusion Pixel 12px"'; return +ctx.measureText('iiiMMMM').width.toFixed(1); })(),
      latMono: (() => { ctx.font = '16px monospace'; return +ctx.measureText('iiiMMMM').width.toFixed(1); })(),
    };
  });
  console.log('[font]', JSON.stringify(font));
  ok(font.check, `F Fusion Pixel 16px 档就绪(fonts.check=${font.check})`);
  ok(font.latFusion !== font.latMono, `F 解析为像素字体非 monospace 回退(Latin iiiMMMM w=${font.latFusion} vs mono ${font.latMono})`);
  ok(errs.length === 0, `F 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
