// FX28 向导制作双回归复现(用户实报「你又搞炸了」2026-09-15,RB29 记录探针)。
// 回归1:classic 控制模式点「制作」→ 不得开 modern 窗(原版 Main.cs:42401-42415
//       经典位槽+经典列表;NewCraftingUI.Open 仅 modern 支 :40729-40731)。
//       P0 相 = 根因取证:BJ83 烤档迁移(Options load 卫门)把存档 classic 无声翻
//       modern(修复前本相红:P3/P4;修复后绿=P2/P3/P4)。
// 回归2:modern 窗经切换钮关闭后(vinvModernCraftOpen=false、vinvGuideMenuOpen 仍
//       true)→ 切换钮必须回 (94,300+adjY) 显(Main.cs:42438 num67)、就近箱钮隐
//       (=原版本相 :42440 !InGuideCraftMenu 门)、向导槽显、金标指示条随钮
//       (CraftingUI.cs:275-278 条画在钮位;RB29 前滞留 450 位=用户截图可见异常);
//       「关闭」对话钮 → 全清回常规(两钮回 450/490+adjY)。
// 运行:SW_ORIGIN=http://localhost:5217 node tools/run-diag.mjs scripts/_fx28-guide-regress.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5217';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

async function newPage() {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  await sleep(600);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
  });
  await sleep(150);
  return { page, errs };
}

/** 真实向导会话(真实 TownNPC 22 + 玩家贴身落地吸附 + openNpcDialog 全链) */
const spawnGuideDialog = (page) => page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__fx28Guide) {
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__fx28Guide = guide;
  }
  const guide = window.__fx28Guide;
  guide.dead = false;
  const st = g.world.store;
  const col = Math.floor(guide.cx / 16);
  let gy = Math.max(0, Math.floor((guide.y + guide.h + 2) / 16));
  let solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) { gy++; solid = st.get(col, gy) !== 0 && st.hasTile(col, gy); }
  g.player.x = guide.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
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
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!pos) return null;
  await page.mouse.click(pos.x, pos.y);
  return pos;
};

/** 统一状态读面(internal 坐标 = .sw-vinv 逻辑空间;left/top=layoutVanilla 直写) */
const craftState = (page) => page.evaluate(async () => {
  const ui = window.__swUI;
  const g = window.__swGame;
  const { options } = await import('/src/core/Options.ts');
  const root = document.querySelector('.sw-vinv');
  const tr = root ? getComputedStyle(root).transform : 'none';
  const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
  const sh = window.innerHeight / K;
  const adjY = sh < 700 ? Math.trunc((sh - 508) / 2) : Math.trunc((sh - 600) / 2);
  const tog = ui.vinvGridToggleImg?.parentElement ?? null;
  const nearBtn = [...document.querySelectorAll('.sw-vinv button.vinv-btn')]
    .find((b) => b.querySelector('img')?.src.includes('UI_ChestCraft')) ?? null;
  const bar = [...document.querySelectorAll('.sw-vinv canvas')]
    .find((c) => c.width === 32 && c.height === 20) ?? null;
  const cs = ui.vinvGuideSlotClassicEl;
  const win = ui.vinvModernCraftEl;
  const rectOf = (e) => {
    if (!e) return null;
    const r = e.getBoundingClientRect().toJSON();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
  };
  return {
    K: +K.toFixed(3), adjY,
    panel: ui.invPanel?.style.display ?? 'null-panel',
    dialogOpen: !!document.querySelector('.sw-npc-dialog'),
    sessionKept: !!g.dialogNpc,
    guideMenu: ui.vinvGuideMenuOpen,
    modernOpen: ui.vinvModernCraftOpen,
    control: options.data.craftingGridControl,
    migrated: options.data.craftingGridControlMigrated ?? null,
    winDisplay: win?.style.display ?? 'no-el',
    winVisible: win ? win.offsetParent !== null : false,
    winRect: rectOf(win),
    classicSlotVisible: cs ? cs.offsetParent !== null : false,
    classicSlotPos: cs ? `${cs.style.left},${cs.style.top}` : null,
    classicText: ui.vinvGuideClassicTextEl?.textContent ?? null,
    toggleVisible: tog ? tog.offsetParent !== null : false,
    togglePos: tog ? `${tog.style.left},${tog.style.top}` : null,
    toggleFrame: ui.vinvGridToggleImg ? (ui.vinvGridToggleImg.src.match(/UI_Craft_Toggle_(\d)/) ?? [])[1] ?? null : null,
    nearVisible: nearBtn ? nearBtn.offsetParent !== null : false,
    nearPos: nearBtn ? `${nearBtn.style.left},${nearBtn.style.top}` : null,
    nearDisplay: nearBtn ? nearBtn.style.display : 'no-el',
    barPos: bar ? `${bar.style.left},${bar.style.top}` : 'no-el',
    craftTitleVisible: ui.vinvCraftTitleEl ? ui.vinvCraftTitleEl.offsetParent !== null : false,
    classicListVisible: ui.vinvClassicCraftVisible(),
    availCount: ui.vinvCraftAvailV.length,
    pipsGrid: ui.vinvPipsUseGrid,
  };
});

/** 真实鼠标点切换钮(参数=internal 钮左上角;钮心 +16/+17) */
const clickToggleAt = async (page, ix, iy) => {
  const p = await page.evaluate(([x, y]) => {
    const root = document.querySelector('.sw-vinv');
    const tr = getComputedStyle(root).transform;
    const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
    const r = root.getBoundingClientRect();
    return { sx: r.left + (x + 16) * K, sy: r.top + (y + 17) * K };
  }, [ix, iy]);
  await page.mouse.click(p.sx, p.sy);
  return p;
};

// ============ P0:回归1根因取证——craftingGridControl 持久化/load 卫门面 ============
{
  const { page, errs } = await newPage();
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('craftingGridControl', 'classic');   // = 用户右键切换钮的持久化通道
  });
  await sleep(500);                                        // saveTimer 落盘窗口
  const stored1 = await page.evaluate(() => {
    const raw = localStorage.getItem('sandboxworld.options');
    if (!raw) return null;
    try {
      const v = JSON.parse(raw);
      return { control: v.craftingGridControl, migrated: v.craftingGridControlMigrated ?? null };
    } catch { return null; }
  });
  ok(stored1?.control === 'classic', `P1 set(classic) 落盘=${JSON.stringify(stored1)}`);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  await sleep(600);
  await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
  const s = await craftState(page);
  ok(s.control === 'classic', `P2 reload 后 craftingGridControl 保持 classic(实读=${s.control} migrated=${s.migrated})`);
  // P3/P4 = 用户回归1端到端:重载后存档 classic 态点「制作」→ modern 窗不开
  await page.evaluate(() => { window.__swUI.closeInventory(); });
  await sleep(150);
  const spawned = await spawnGuideDialog(page);
  ok(spawned.session, `P3-pre 重载后向导会话建立(session=${spawned.session})`);
  await sleep(200);
  const clicked = await clickCraft(page);
  ok(!!clicked, 'P3-pre2 「制作」钮可点');
  await sleep(350);
  const p4 = await craftState(page);
  ok(p4.guideMenu && p4.classicSlotVisible, `P4 向导态+经典位槽显(guide=${p4.guideMenu} slot=${p4.classicSlotVisible})`);
  ok(!p4.modernOpen, `P3 存档 classic 态点「制作」=modern 窗不开(modernOpen=${p4.modernOpen})`);
  ok(errs.length === 0, `P5 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ A:classic 控制 × 点「制作」=经典三件套,modern 窗不开 ============
{
  const { page, errs } = await newPage();
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('craftingGridControl', 'classic');
    await options.set('inventoryLayout', 'vanilla');
    window.__swUI.closeInventory();
  });
  await sleep(150);
  const spawned = await spawnGuideDialog(page);
  ok(spawned.vanillaId === 22 && spawned.session, `A0 向导会话建立(vid=${spawned.vanillaId} session=${spawned.session})`);
  await sleep(200);
  const clicked = await clickCraft(page);
  ok(!!clicked, 'A1 「制作」DOM 钮可点');
  await sleep(350);
  const a = await craftState(page);
  console.log('[A]', JSON.stringify(a));
  ok(a.control === 'classic', `A2 控制模式=classic(实读=${a.control})`);
  ok(a.panel === 'block', `A3 背包开(display=${a.panel})`);
  ok(!a.modernOpen, `A4 classic=modern 窗不开(modernOpen=${a.modernOpen})`);
  ok(a.guideMenu, `A5 向导态置位(guideMenu=${a.guideMenu})`);
  ok(a.classicSlotVisible, `A6 经典位槽显(@(73,331+adjY) 实=${a.classicSlotPos} adjY=${a.adjY})`);
  ok(!!a.classicText, `A7 经典位文案显("${a.classicText}")`);
  ok(a.toggleVisible && a.togglePos === `94px,${300 + a.adjY}px`, `A8 切换钮在向导位 (94,300+adjY)(实=${a.togglePos})`);
  ok(a.classicListVisible && a.craftTitleVisible, `A9 经典列表+标题显(title=${a.craftTitleVisible} list=${a.classicListVisible})`);
  ok(a.barPos === `94px,${300 + a.adjY + 17}px`, `A10 金标指示条随钮(Main.cs:42438 num67+CraftingUI.cs:275-278,实=${a.barPos})`);
  ok(!a.nearVisible, `A11 就近箱钮隐=原版本相(Main.cs:42440,display=${a.nearDisplay})`);
  await page.screenshot({ path: '/tmp/fx28-guide-classic.png' });
  ok(errs.length === 0, `A12 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

// ============ B:modern 控制 × 点「制作」=窗开(合规面) → C:切换钮关窗 ============
{
  const { page, errs } = await newPage();
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    await options.set('craftingGridControl', 'modern');
    await options.set('inventoryLayout', 'vanilla');
    window.__swUI.closeInventory();
  });
  await sleep(150);
  const spawned = await spawnGuideDialog(page);
  ok(spawned.session, `B0 向导会话建立(${spawned.vanillaId})`);
  await sleep(200);
  await clickCraft(page);
  await sleep(350);
  const b = await craftState(page);
  console.log('[B]', JSON.stringify(b));
  ok(b.modernOpen && b.guideMenu, `B1 modern 控制下窗态置位(guide=${b.guideMenu} modern=${b.modernOpen})`);
  ok(b.winVisible && b.winDisplay !== 'none', `B2 modern 窗 DOM 显(display=${b.winDisplay})`);
  ok(!!b.winRect && b.winRect.w > 300, `B3 modern 窗在屏(${JSON.stringify(b.winRect)})`);
  ok(b.toggleVisible && b.togglePos === '42px,285px', `B4 窗内切换钮换锚(NewCraftingUI.cs:486-499,实=${b.togglePos})`);
  await page.screenshot({ path: '/tmp/fx28-guide-modern.png' });

  // ---- C:窗经【切换钮】关闭 → 切换钮回 (94,300+adjY)、就近箱隐(原版)、向导槽显 ----
  const t = await clickToggleAt(page, 42, 285);   // mcraftWindowToggleXY(false).toggle=(42,285)
  await sleep(400);
  const c = await craftState(page);
  console.log('[C]', JSON.stringify(c));
  ok(!c.modernOpen, `C1 窗已关(modernOpen=${c.modernOpen} 点击=${JSON.stringify(t)})`);
  ok(c.guideMenu && c.sessionKept, `C2 向导态保持(guideMenu=${c.guideMenu} 会话=${c.sessionKept})`);
  ok(!c.winVisible, `C3 modern 窗 DOM 隐(display=${c.winDisplay})`);
  ok(c.classicListVisible && c.craftTitleVisible, `C4 经典列表回显(title=${c.craftTitleVisible})`);
  ok(c.classicSlotVisible, `C5 向导槽显(实=${c.classicSlotPos})`);
  ok(c.toggleVisible && c.togglePos === `94px,${300 + c.adjY}px`, `C6 切换钮回向导位 (94,300+adjY)(实=${c.togglePos} adjY=${c.adjY})`);
  ok(!c.nearVisible, `C7 就近箱钮隐=原版本相(Main.cs:42440 !InGuideCraftMenu 门,display=${c.nearDisplay})`);
  ok(c.barPos === `94px,${300 + c.adjY + 17}px`, `C8 金标指示条随钮回位(RB29 修复面,实=${c.barPos})`);
  await page.screenshot({ path: '/tmp/fx28-guide-window-closed.png' });

  // ---- D:「关闭」对话钮路径 → 全清回常规 ----
  // 向导态内对话面板已收(minimize)——用户实际「关闭」路径 = 再交谈重开面板
  // (原版开话链首站 IngameUIWindows.CloseAll(quiet) 先收背包,FX23 B-pre 同相)
  // → 点「关闭」=面板收+会话清 → 重开背包后两钮必须回常规位(向导态已清)。
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.hp = g.player.maxHp; g.player.dead = false;
    g.openNpcDialog(window.__fx28Guide);   // = 真实再右键交谈(新会话重开面板)
  });
  await sleep(300);
  const dpre = await craftState(page);
  ok(dpre.dialogOpen, `D0 重开对话=面板开(原版开话链先收背包 CloseAll quiet,panel=${dpre.panel})`);
  ok(dpre.panel !== 'block', `D-pre 开话先收背包(FX23 B-pre 同相,panel=${dpre.panel})`);
  const dpos = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="close"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  ok(!!dpos, 'D0-pre 「关闭」钮在 DOM');
  if (dpos) await page.mouse.click(dpos.x, dpos.y);
  await sleep(450);
  const dmid = await craftState(page);
  ok(!dmid.dialogOpen && !dmid.sessionKept, `D1 「关闭」=面板收+会话清(dialog=${dmid.dialogOpen} session=${dmid.sessionKept})`);
  // 重开背包(E/Esc 链)→ 两钮回常规位
  await page.evaluate(() => { window.__swUI.openInventory(true); });
  await sleep(350);
  const d = await craftState(page);
  console.log('[D]', JSON.stringify(d));
  ok(!d.guideMenu && !d.modernOpen, `D2 向导态/窗态全清(guide=${d.guideMenu} modern=${d.modernOpen})`);
  ok(!d.classicSlotVisible, 'D3 向导槽隐');
  ok(d.panel === 'block', `D4 背包重开(display=${d.panel})`);
  ok(d.toggleVisible && d.togglePos === `94px,${450 + d.adjY}px`, `D5 切换钮回常规位 (94,450+adjY)(实=${d.togglePos})`);
  ok(d.nearVisible && d.nearPos === `94px,${490 + d.adjY}px`, `D6 就近箱钮回常规位 (94,490+adjY)(实=${d.nearPos})`);
  ok(d.barPos === `94px,${450 + d.adjY + 17}px`, `D7 金标指示条回常规位(实=${d.barPos})`);
  await page.screenshot({ path: '/tmp/fx28-guide-after-close.png' });
  ok(errs.length === 0, `D8 无页面错误(${errs.join(' | ')})`);
  await page.close();
}

await browser.close();
if (fails.length) { console.log(`\n${fails.length} FAIL`); process.exit(1); }
console.log('\nALL PASS');
