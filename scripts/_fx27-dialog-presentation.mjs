// FX27 对话呈现四案取证+验证探针(2026-09-14 用户实报):
//   ①开对话音=原版 SoundID.Chat(24)(Main.cs:43811)——stub Sfx 记参断言;
//   ②向导两槽空态 ghost 帧(Inventory_Back 底+Extra_54 ctx7 帧 18,ItemSlot.cs:2451-2482);
//   ③头像卡顶=面板顶±3px+面板顶角圆角(1:1 两段绘制 Chat_Back,NPCChatPanel.cs:71-72);
//   ④背包开着开对话=背包先收(IngameUIWindows.CloseAll quiet:true :58-65)。
// 跑法:SW_ORIGIN=http://localhost:5210 node tools/run-diag.mjs scripts/_fx27-dialog-presentation.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5210';
const SHOT = process.env.FX27_SHOT ?? '/tmp/fx27-dialog.png';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

// 真实向导会话(22):真实 TownNPC + 玩家贴身(keepAlive 矩形在界)
const spawnGuide = (page, open = true) => page.evaluate(async (doOpen) => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__fx27Guide) {
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__fx27Guide = guide;
  }
  const guide = window.__fx27Guide;
  g.player.x = guide.cx - 30; g.player.y = guide.cy - 8;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp; g.player.dead = false;
  if (doOpen) g.openNpcDialog(guide);
  return { vanillaId: guide.vanillaId, session: !!g.dialogNpc };
}, open);

// ================= PHASE 0:① 开话音 stub 记参 + ④ 背包先收(同一次开话) =================
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(async () => {
    document.getElementById('sw-welcome-announce')?.remove();
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', 'modern');
    await options.set('inventoryLayout', 'vanilla');
  });
  await sleep(200);

  // ① stub Sfx.play 记参(实例级影子:Game.sfx 与 UISfx 同类,统一包 play)
  await page.evaluate(async () => {
    const g = window.__swGame;
    window.__fx27sfxLog = [];
    const wrap = (obj) => {
      if (!obj || typeof obj.play !== 'function') return;
      const orig = obj.play.bind(obj);
      obj.play = (name, vol, x, y) => { window.__fx27sfxLog.push({ name, vol: vol ?? 1 }); return orig(name, vol, x, y); };
    };
    wrap(g.sfx);
    const { UISfx } = await import('/src/vui/UISfx.ts');
    wrap(UISfx.sfx);
  });
  await spawnGuide(page, false);
  // 背包先开,再开对话(④ 原版链:CloseAll(quiet) 先收包 → PlaySound(24))
  const r = await page.evaluate(() => {
    const g = window.__swGame;
    const ui = window.__swUI;
    window.__fx27sfxLog.length = 0;
    ui.openInventory(true);
    const invBefore = ui.inventoryOpen;
    g.openNpcDialog(window.__fx27Guide);
    return {
      invBefore,
      invAfter: ui.inventoryOpen,
      panel: ui.invPanel?.style.display ?? 'x',
      dialog: !!document.querySelector('.sw-npc-dialog'),
      sfx: window.__fx27sfxLog.slice(),
    };
  });
  ok(r.dialog, `0a 对话面板开`);
  ok(r.invBefore && !r.invAfter && r.panel !== 'block', `④ 开对话收背包(invBefore=${r.invBefore} invAfter=${r.invAfter} display=${r.panel})`);
  const wav = r.sfx.filter((e) => e.name === 'chat');
  ok(wav.length === 1, `① 开对话音=chat(SoundID.Chat 24,Main.cs:43811) 1 次(${JSON.stringify(r.sfx)})`);
  ok(!r.sfx.some((e) => e.name === 'menuOpen'), `① 不再用 menuOpen(id10,原版开话链无此音)`);
  await page.close();
}

// ================= PHASE 1:③ 头像/面板几何测量 + 截图 =================
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
  });
  await sleep(200);
  await spawnGuide(page);
  await sleep(1600);   // 等 hop(EaseOutBounce 80 帧≈1.33s)落定再测——动画期窗整体上浮
  const m = await page.evaluate(() => {
    const rectOf = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const r = e.getBoundingClientRect().toJSON();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    return {
      panel: rectOf('.sw-npc-dialog'),
      bgBody: rectOf('.sw-npc-bg-body'),
      bgCap: rectOf('.sw-npc-bg-cap'),
      win: rectOf('.sw-npc-window'),
      canvas: rectOf('.sw-npc-portrait'),
      pname: rectOf('.sw-npc-pname'),
      bodyImgH: document.querySelector('.sw-npc-bg-body img')?.style.height ?? null,
    };
  });
  console.log('[geom]', JSON.stringify(m));
  // 原版几何(NPCChatPanel.cs:65-68 + Main.cs:41031/41069):面板顶 y=100;
  //   窗顶 = 面板顶+6(=P.y-56,Main.cs:41031 P=topLeft+(-62,+62) → 112 框左上=+(-118,+6));
  //   窗心 = 面板左上+(-62,+62);名字锚 = P+(0,57)。
  if (m.panel && m.win) {
    ok(Math.abs(m.panel.y - 100) <= 1, `③ 面板顶 y=100(实测 ${m.panel.y})`);
    ok(Math.abs(m.panel.x - (800 - 250)) <= 1, `③ 面板左 x=550(1600 宽屏居中,实测 ${m.panel.x})`);
    ok(Math.abs(m.win.y - (m.panel.y + 6)) <= 3, `③ 头像窗顶=面板顶+6(实测 差${(m.win.y - m.panel.y).toFixed(1)}px,用户报 ~20px)`);
    ok(Math.abs((m.win.x - m.panel.x) - (-118)) <= 3, `③ 头像窗左=面板左-118(实测 差${(m.win.x - m.panel.x).toFixed(1)}px)`);
    if (m.canvas) ok(Math.abs((m.canvas.x + m.canvas.w / 2) - (m.panel.x - 62)) <= 3
      && Math.abs((m.canvas.y + m.canvas.h / 2) - (m.panel.y + 62)) <= 3,
    `③ 画布中心=P=左上+(-62,+62)(实测 差(${((m.canvas.x + m.canvas.w / 2) - (m.panel.x - 62)).toFixed(1)},${((m.canvas.y + m.canvas.h / 2) - (m.panel.y + 62)).toFixed(1)}))`);
  } else {
    ok(false, `③ 面板/头像窗未渲染(${JSON.stringify(m)})`);
  }
  await page.screenshot({ path: SHOT });
  console.log(`[shot] ${SHOT}`);
  ok(errs.length === 0, `1-err 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ================= PHASE 2:② 向导两槽空态 ghost 帧(modern 窗槽 + classic 位槽 + 反查浮层槽) =================
for (const control of ['modern', 'classic']) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(async (ctl) => {
    document.getElementById('sw-welcome-announce')?.remove();
    const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
    await options.set('craftingGridControl', ctl);
    await options.set('inventoryLayout', 'vanilla');
  }, control);
  await sleep(200);
  await spawnGuide(page);
  await sleep(300);
  // 点「制作」→ minimizeNpcDialog + 对应向导件(窗/经典位)
  const clicked = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
    if (!b) return null;
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    return b.textContent;
  });
  await sleep(400);
  const s = await page.evaluate((ctl, clicked) => {
    const ui = window.__swUI;
    const g = window.__swGame;
    const ghostInfo = (el) => {
      if (!el) return null;
      const gh = el.querySelector('.sw-slot-ghost');
      return gh ? { pos: gh.style.backgroundPosition, op: gh.style.opacity, w: gh.style.width } : null;
    };
    const bgInfo = (el) => (el ? (el.style.getPropertyValue('--slot-bgimg') || getComputedStyle(el).backgroundImage) : null);
    const modern = ui.vinvGuideSlotModernEl;
    const classic = ui.vinvGuideSlotClassicEl;
    return {
      clicked: !!clicked,
      panelOpen: ui.invPanel?.style.display === 'block',
      guideMenu: ui.vinvGuideMenuOpen,
      modernOpen: ui.vinvModernCraftOpen,
      empty: !ui.guidePlaced,
      session: !!g.dialogNpc,
      modernGhost: ghostInfo(modern),
      classicGhost: ghostInfo(classic),
      modernBg: bgInfo(modern),
      classicBg: bgInfo(classic),
    };
  }, control, clicked);
  console.log(`[ghost-${control}]`, JSON.stringify(s));
  ok(s.clicked && s.panelOpen && s.guideMenu, `②[${control}] 进入向导态(craft 点击→会话保持+背包开)`);
  if (control === 'modern') {
    ok(!!s.modernGhost, `②[${control}] modern 窗向导槽空态 ghost 帧(${JSON.stringify(s.modernGhost)})`);
    if (s.modernGhost) {
      ok(s.modernGhost.pos === '0px -204px', `②[${control}] ghost 帧=Extra_54 帧 18(col0,row6→0px -204px;ItemSlot.cs:2451 case7 num15=18,实测 ${s.modernGhost.pos})`);
      ok(s.modernGhost.op === '0.35', `②[${control}] ghost α=0.35(:2478 num19=0.35)`);
    }
    ok(String(s.modernBg ?? '').includes('Inventory_Back'), `②[${control}] 槽底=Inventory_Back 底图(${String(s.modernBg).slice(0, 60)})`);
  } else {
    ok(!!s.classicGhost, `②[${control}] 经典位向导槽空态 ghost 帧(${JSON.stringify(s.classicGhost)})`);
    if (s.classicGhost) ok(s.classicGhost.pos === '0px -204px', `②[${control}] ghost 帧位 0px -204px(实测 ${s.classicGhost.pos})`);
  }
  ok(errs.length === 0, `②[${control}] 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ================= PHASE 3:② 反查浮层槽(openGuideSearch 空态) =================
{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(700);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.openInventory(true);
    window.__swUI.openGuideSearch();
  });
  await sleep(300);
  const s = await page.evaluate(() => {
    const box = document.querySelector('.sw-guide-overlay .sw-guide-slot');
    if (!box) return null;
    const cs = getComputedStyle(box);
    const gh = box.querySelector('.sw-slot-ghost');
    return {
      rect: box.getBoundingClientRect().toJSON(),
      bgImg: cs.backgroundImage,
      dashed: cs.borderTopStyle,
      ghost: gh ? { pos: gh.style.backgroundPosition, op: gh.style.opacity } : null,
    };
  });
  console.log('[ghost-overlay]', JSON.stringify(s));
  ok(!!s, `②[overlay] 反查浮层槽存在`);
  if (s) {
    ok(String(s.bgImg).includes('Inventory_Back'), `②[overlay] 槽底=Inventory_Back(${String(s.bgImg).slice(0, 70)})`);
    ok(s.dashed !== 'dashed', `②[overlay] 自创虚线框退役(border=${s.dashed})`);
    ok(!!s.ghost && s.ghost.pos === '0px -204px' && s.ghost.op === '0.35',
      `②[overlay] ctx7 幽灵帧 0.35α @(0px -204px)(${JSON.stringify(s.ghost)})`);
  }
  ok(errs.length === 0, `②[overlay] 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
