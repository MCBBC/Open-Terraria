// SW-FX39 缺省转正实机探针(2026-09-11)——缺省开=vanilla 布局 + 全交互面直读 + legacy 回退旗。
// 运行:node tools/probe.mjs run scripts/_fx39-default-flip-probe.mjs --seed=05162020 --size=small --vite=auto
// 蓝=缺省分派/几何锚(K=1 @1600×1000)/交互面在位/箱条/货架/停车坪;红=零页面错误/legacy 守恒/截图存档。
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, createGame,
  ledger, front, savePageShot,
} from '../tools/probe/lib/index.mjs';

const fails = [];
const L = ledger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';

const browser = await launchBrowser({ viewport: { width: 1600, height: 1000 } });

// ============================================================
// A. 缺省态(无任何 invlayout 参数)——vanilla 应为缺省分派
// ============================================================
{
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
  const boot = await bootstrap(page, ORIGIN);
  if (!boot.ok) { console.log('BOOT FAIL', boot); process.exit(1); }

  // A0. 选项单例缺省(进世界前即成立)
  const opt0 = await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    return options.data.inventoryLayout;
  });
  L.chk('A0 缺省 inventoryLayout=vanilla(无参数)', opt0 === 'vanilla', `got=${opt0}`);

  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('A1 世界已建', gen.ok);

  await front(page);
  const a = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI, g = window.__swGame;
    const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
    const iidOf = (vid) => { const k = VANILLA_ITEM_KEY_BY_ID[vid]; return k !== undefined ? ITEM_BY_KEY[k] : undefined; };
    if (iidOf(9)) g.player.inv.add(iidOf(9), 300);
    if (iidOf(23)) g.player.inv.add(iidOf(23), 300);
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(250);
    const vinv = document.querySelector('.sw-vinv');
    const out = { built: ui._builtLayout, hasVinv: !!vinv, hasClassicGrid: !!document.querySelector('.sw-invgrid') };
    if (!vinv) return out;
    const off = (sel) => {
      const e = vinv.querySelector(sel);
      return e && e.offsetParent !== null ? { x: e.offsetLeft, y: e.offsetTop } : null;
    };
    // ---- 几何锚(vanillaInvLayout 金标,K=1:sw=1600,sh=1000,mH=256,num20=430) ----
    out.slot0 = off('.sw-slot[data-idx="0"][data-where="inv"]');          // (20,20)
    out.slot49 = off('.sw-slot[data-idx="49"][data-where="inv"]');        // (448,210)
    out.coin = off('.sw-slot[data-idx="50"][data-where="inv"]');          // (497,105)
    out.ammo = off('.sw-slot[data-idx="54"][data-where="inv"]');          // (534,105)
    out.trash = off('.sw-trash');                                         // (448,258)
    out.equip0 = off('.sw-slot[data-idx="0"][data-where="armor"]');       // (1508,430)
    out.dye0 = off('.sw-slot[data-idx="0"][data-where="dye"]');           // (1414,430)
    out.quick = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('UI_ChestStack_'));
    out.quickPos = out.quick ? { x: out.quick.offsetLeft, y: out.quick.offsetTop } : null;   // (498,244)
    out.sort = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('UI_Sort_'));
    out.sortPos = out.sort ? { x: out.sort.offsetLeft, y: out.sort.offsetTop } : null;       // (534,244)
    out.bestiary = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('UI_Bestiary'));
    out.emote = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('UI_Emotes'));
    out.camera = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('DisplaySlots_8'));
    out.housingTab = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('DisplaySlots_4'));
    out.lock = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('Lock_'));
    out.builderCol = [...vinv.querySelectorAll('.vinv-btn')].filter((b) => (b.style.backgroundImage || '').includes('UI_BuilderIcons')).length;
    out.loadout = vinv.querySelectorAll('.sw-loadout-btn').length;
    out.pvp = [...vinv.querySelectorAll('.vinv-btn')].find((b) => (b.style.backgroundImage || '').includes('UI_PVP_0'));
    out.defense = !!vinv.querySelector('[data-role="defense"]');
    out.advisor = !!vinv.querySelector('img[src*="Extra_"], .sw-ach-advisor, [class*="advisor"]');
    out.settings = [...vinv.querySelectorAll('button')].some((b) => b.textContent && b.textContent.length <= 4 && b.className.includes('vinv-txt'));
    out.craftTitle = [...vinv.querySelectorAll('.vinv-txt')].some((c) => (c.textContent || '').length > 0 && c.style.fontSize === '14px');
    out.gridToggle = !!vinv.querySelector('img[src*="Craft_Toggle_"]');
    out.nearChest = !!vinv.querySelector('img[src*="UI_ChestCraft_"]');
    // ---- Sort 钮行为直读(点击=ItemSorting.SortInventory,观察者插桩) ----
    out.sortClicks = await (async () => {
      let n = 0;
      const orig = g.sortInventory.bind(g);
      g.sortInventory = () => { n++; orig(); };
      out.sort?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await sleep(80);
      g.sortInventory = orig;
      return n;
    })();
    // ---- 箱条内嵌(vinvBuildChest:bank 存钱罐) ----
    ui.openChestPanel({ x: -2, items: new Array(40).fill(null), name: '' });
    await ui.refreshAllAsync();
    await sleep(150);
    const chestSlot = vinv.querySelector('.sw-slot[data-where="chest"]');
    out.chestSlotVisible = !!chestSlot && chestSlot.offsetParent !== null;
    out.chestName = (document.querySelectorAll('.vinv-txt')[0] ? null : null)
      ?? [...vinv.querySelectorAll('.vinv-txt')].map((t) => t.textContent).find((t) => t && t.length > 0 && t !== '物品栏' && !/^\d+$/.test(t)) ?? null;
    out.lootAll = [...vinv.querySelectorAll('button')].some((b) => (b.textContent || '').includes('拿走全部') && b.offsetParent !== null);
    ui.closeChest();
    await ui.refreshAllAsync();
    // ---- 货架内嵌(vinvBuildShop:torch 价 50) ----
    g.npcShopOpen = true;
    ui.showNpcShop('商人', [{ vanillaId: 8, price: 50, prefix: 0, stack: 1, buyback: false }], 10000, 1);
    await ui.refreshAllAsync();
    await sleep(150);
    const shelf = vinv.querySelector('[data-vshop="0"]');
    out.shelfVisible = !!shelf && shelf.offsetParent !== null;
    out.shelfTitle = [...vinv.querySelectorAll('.vinv-txt')].some((t) => t.textContent === '商人');
    out.happiness = !!vinv.querySelector('div[style*="UI_NPCHappiness"]');
    g.npcShopOpen = false;
    ui.closeChest();
    await ui.refreshAllAsync();
    return out;
  });
  const eq = (name, got, want) => L.chk(name, JSON.stringify(got) === JSON.stringify(want), `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`);
  L.chk('A2 _builtLayout=vanilla + .sw-vinv 在 + classic 网格缺', a.built === 'vanilla' && a.hasVinv && !a.hasClassicGrid, JSON.stringify({ built: a.built, hasVinv: a.hasVinv, hasClassicGrid: a.hasClassicGrid }));
  eq('A3 网格槽0/49 (20,20)/(448,210)', [a.slot0, a.slot49], [{ x: 20, y: 20 }, { x: 448, y: 210 }]);
  eq('A4 钱币/弹药 (497,105)/(534,105)', [a.coin, a.ammo], [{ x: 497, y: 105 }, { x: 534, y: 105 }]);
  eq('A5 垃圾桶 (448,258)', a.trash, { x: 448, y: 258 });
  eq('A6 装备/染料列 x=sw-92/sw-186', [a.equip0, a.dye0], [{ x: 1508, y: 430 }, { x: 1414, y: 430 }]);
  eq('A7 QuickStack/Sort (498,244)/(534,244)', [a.quickPos, a.sortPos], [{ x: 498, y: 244 }, { x: 534, y: 244 }]);
  L.chk('A8 图鉴/表情/相机页签/住房页签在位', !!(a.bestiary && a.emote && a.camera && a.housingTab));
  L.chk('A9 热键锁/建筑配件列(rulerLine 恒显≥1)/配装轨3/PvP/防御', !!(a.lock && a.builderCol >= 1 && a.loadout === 3 && a.pvp && a.defense), `builder=${a.builderCol} loadout=${a.loadout}`);
  L.chk('A10 成就 Advisor/设置钮/合成标题/网格切换钮/就近箱钮在位', !!(a.advisor && a.settings && a.craftTitle && a.gridToggle && a.nearChest));
  L.chk('A11 Sort 点击=game.sortInventory ×1(FX29 链)', a.sortClicks === 1, `clicks=${a.sortClicks}`);
  L.chk('A12 箱条内嵌:槽可见+名+拿走全部钮', !!(a.chestSlotVisible && a.lootAll), `name=${a.chestName}`);
  L.chk('A13 货架内嵌:格可见+店名+快乐度图标', !!(a.shelfVisible && a.shelfTitle && a.happiness));

  // A14 停车坪(vanilla 门控=缺省常态路径):设置钮 → 暂停面板含自创面入口
  const park = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const vinv = document.querySelector('.sw-vinv');
    const setBtn = [...vinv.querySelectorAll('button')].find((b) => b.className.includes('vinv-txt') && (b.textContent || '').length <= 4);
    setBtn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await sleep(250);
    const panel = document.querySelector('.sw-pause-panel');
    const txt = panel ? panel.textContent : '';
    return {
      open: !!panel,
      itemSearch: (txt || '').includes('道具搜索'),
      weather: (txt || '').includes('天气控制'),
      time: (txt || '').includes('时间控制'),
    };
  });
  L.chk('A14 停车坪:暂停面板+道具搜索/天气/时间入口', park.open && park.itemSearch && park.weather && park.time, JSON.stringify(park));
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('.sw-pause-panel button')].find((x) => !!x);
    b?.click();
  });
  await sleep(200);

  L.chk('A15 零页面错误(缺省态)', errs.length === 0, errs.join(' | '));
  await savePageShot(page, '/tmp/probe-out/fx39-default-vanilla-open.png');
  await page.evaluate(async () => { window.__swUI.closeInventory(); await window.__swUI.refreshAllAsync(); });
  await page.close();
}

// ============================================================
// B. 回退旗 ?invlayout=legacy——classic 构建器守恒
// ============================================================
{
  const page = await openPage(browser, {});
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e?.message ?? e).slice(0, 160)));
  const ok = await gotoApp(page, page.__probeOrigin || ORIGIN, { extraQuery: '?invlayout=legacy', tries: 40 });
  if (!ok) { console.log('GOTO FAIL'); process.exit(1); }
  if (!(await waitForBridge(page, { timeout: 120_000 }))) { console.log('BRIDGE FAIL'); process.exit(1); }
  const optB = await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    return options.data.inventoryLayout;
  });
  L.chk('B1 ?invlayout=legacy → classic(选项单例)', optB === 'classic', `got=${optB}`);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('B2 世界已建(legacy)', gen.ok);
  const b = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await new Promise((r) => setTimeout(r, 200));
    return {
      built: ui._builtLayout,
      classicGrid: !!document.querySelector('.sw-invgrid'),
      vinv: !!document.querySelector('.sw-vinv'),
      eqDock: !!document.querySelector('.sw-eqdock'),
      quickStack: !!ui.quickStackBtn,
      smartStack: !!ui.qsSmartBtn,
    };
  });
  L.chk('B3 _builtLayout=classic + classic 网格/坞在 + vinv 缺', b.built === 'classic' && b.classicGrid && b.eqDock && !b.vinv, JSON.stringify(b));
  L.chk('B4 零页面错误(legacy 态)', errs.length === 0, errs.join(' | '));
  await savePageShot(page, '/tmp/probe-out/fx39-legacy-classic-open.png');
  await page.close();
}

console.log(`\n== SW-FX39 探针完成 ${L.elapsed()} ==`);
if (L.fails.length) { console.log('FAILS:', L.fails.join(' | ')); process.exit(2); }
process.exit(0);
