// SW-FX30 补债批探针(2026-09-11)——UI 移债刀②+⑦ 实机面:经典网格视图/切换钮/站点过滤。
// 运行:node tools/probe.mjs run scripts/_fx30-grid-probe.mjs --seed=05162020 --size=small --vite=auto
// ★陈旧备案(RB28 2026-09-15):本探针 11 红全系 FX41/刀20 前时代期望,非现行为回归——
//   ①场景 4 起 mode0 期望 'classic',而缺省已回切 modern(Player.cs:363,SW-FX41 逐字),
//   级联压倒 场景2/3 网格面(左键 modern 态=开窗非开网格)与 站点钩 classic 字段域;
//   ②悬停名断言读 toggle.title 属性,刀20 起 hover 改自有气泡(showBuffTooltip),属性恒空。
//   现行域判据 = scripts/_fx41-modern-craft-probe.mjs(30 断言)+ tests/sw-fx30-grid-toggle.test.ts。
//   再启用前须按上述两锚重写期望,勿以本探针红当回归信号。
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, createGame, ledger, front,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync } from 'node:fs';

const fails = [];
const L = ledger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({ viewport: { width: 1100, height: 750 } });
const page = await openPage(browser, {});
const boot = await bootstrap(page, process.env.SW_ORIGIN || 'http://localhost:5199');
if (!boot.ok) { console.log('BOOT FAIL', boot); process.exit(1); }
// vanilla 布局会话覆盖(Options URL 会话覆盖 ?invlayout=)
await gotoApp(page, page.__probeOrigin || process.env.SW_ORIGIN || 'http://localhost:5199', { extraQuery: '?invlayout=vanilla', tries: 40 });
if (!(await waitForBridge(page, { timeout: 120_000 }))) { console.log('BRIDGE FAIL'); process.exit(1); }

const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界已建', gen.ok);

// ---- 场景 0:给料(木/石 → 徒手配方域非空) ----
await front(page);
const r0 = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood'), sid = g.itemId('vi_3_stone_block');
  if (wid > 0) g.player.inv.add(wid, 300);
  if (sid > 0) g.player.inv.add(sid, 300);
  await ui.refreshAllAsync();
  return { avail: ui.vinvCraftAvailV.length };
});
L.chk('给料后可用配方 ≥2(徒手域)', r0.avail >= 2, `avail=${r0.avail}`);

// ---- 场景 1:切换钮存在/位置/帧/悬停名 ----
await front(page);
const r1 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  await sleep(200);
  const vinv = document.querySelector('.sw-vinv');
  const btns = [...vinv.querySelectorAll('.vinv-btn')];
  const toggle = btns.find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  const o = { toggleFound: !!toggle };
  if (toggle) {
    o.frame0 = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
    o.pos = { x: toggle.offsetLeft, y: toggle.offsetTop };
    o.title = toggle.title;
    o.nearBtn = btns.find((b) => b.querySelector('img')?.src.includes('ChestCraft_'))?.offsetLeft;
    // 悬停 → 帧 1 + 沿音面(sfx 计数经 __swGame.sfx 无计数面,断言帧面)
    toggle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await sleep(60);
    o.frameHover = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
    toggle.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    await sleep(60);
  }
  return o;
});
L.chk('网格切换钮在仓(vinv 域)', r1.toggleFound);
L.chk('list 态帧 = 2(常驻)/3(悬停)', r1.frame0 === '2' && r1.frameHover === '3', `frame0=${r1.frame0} hover=${r1.frameHover}`);
L.chk('切换钮位 @(94,450+adjY) top-left 约定', r1.pos && r1.pos.x === 94, `pos=${JSON.stringify(r1.pos)}`);
L.chk('悬停名 = 原版键(CraftingWindowClassicTip)', (r1.title || '').includes('Crafting Window') || (r1.title || '').includes('制作'), r1.title);
L.chk('就近箱钮同列对齐(x=94)', r1.nearBtn === 94, `near=${r1.nearBtn}`);

// ---- 场景 2:左键开网格 → 几何/格数/关闭 ----
const r2 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(120);
  const grid = [...vinv.children].find((c) => c.style.zIndex === '3');
  const o = {};
  o.gridVisible = !!grid && grid.style.display !== 'none';
  o.pips = ui.vinvPipsUseGrid === true;
  o.frame = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  if (grid) {
    o.left = parseFloat(grid.style.left); o.top = parseFloat(grid.style.top);
    o.cols = Math.round(parseFloat(grid.style.width) / 42);
    o.rows = Math.round(parseFloat(grid.style.height) / 42);
    o.cells = grid.querySelectorAll('.sw-slot').length;
  }
  o.avail = ui.vinvCraftAvailV.length;
  // 列表仍在(网格=拾取器,Main.cs:42425 列表不吃 PipsUseGrid 门)
  o.listCells = ui.vinvCraftCellEls.length;
  // 点首格 → 关网格 + 焦点跳格
  const cell = grid?.querySelector('.sw-slot');
  o.focusBefore = ui.vinvCraftFocusV;
  cell?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(120);
  o.gridClosed = grid.style.display === 'none';
  o.pipsAfter = ui.vinvPipsUseGrid;
  o.focusAfter = ui.vinvCraftFocusV;
  o.frameAfter = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  return o;
});
L.chk('左键开网格:PipsUseGrid=true + 容器可见 + 帧 0', r2.gridVisible && r2.pips && r2.frame === '0', JSON.stringify(r2).slice(0, 160));
L.chk('网格几何 @(310,340) 格距 42(逻辑域)', r2.left === 310 && r2.top === 340 && r2.cols >= 9 && r2.rows >= 9, `left=${r2.left} top=${r2.top} ${r2.cols}x${r2.rows}`);
L.chk('格数 = min(avail, 页容量)', r2.cells === Math.min(r2.avail, r2.cols * r2.rows), `cells=${r2.cells} avail=${r2.avail}`);
L.chk('网格开态列表仍在屏(拾取器语义)', r2.listCells > 0 || r2.avail === 0, `list=${r2.listCells}`);
L.chk('点格:PipsUseGrid=false + 焦点=首格 + 帧回 2', r2.gridClosed && r2.pipsAfter === false && r2.frameAfter === '2' && r2.focusAfter === 0, `focus ${r2.focusBefore}→${r2.focusAfter}`);

// ---- 场景 3:合成 500 假配方压满分页 → 页钮/滚轮 ----
const r3 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  // 假载荷:500 项(同 r 复用=仅几何/分页压力;数据语义走 vitest)
  const orig = g.vanillaAvailableRecipes.bind(g);
  window.__swOrigAvail = orig;
  g.vanillaAvailableRecipes = () => {
    const base = orig();
    const out = [];
    for (let i = 0; i < 500; i++) out.push(base[i % Math.max(1, base.length)] ?? { r: { create: 1, createStack: 1, tile: -1, items: [], groups: [] }, count: 1 });
    return out;
  };
  ui.vinvRefreshCraft();
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(120);
  const grid = [...vinv.children].find((c) => c.style.zIndex === '3');
  const up = ui.vinvCraftGridUpBtn, down = ui.vinvCraftGridDownBtn;
  const o = {};
  o.cells = grid.querySelectorAll('.sw-slot').length;
  o.cols = Math.round(parseFloat(grid.style.width) / 42);
  o.upHidden = up.style.display === 'none';
  o.downShown = down.style.display !== 'none';
  // 下页钮点击 → recStart += cols,上钮现形
  down.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(100);
  o.recAfterDown = ui.vinvCraftRecStart;
  o.upShownAfter = up.style.display !== 'none';
  // 滚轮(窗口级):网格矩形内 +120 → recStart += cols;网格外不动
  const rect = grid.getBoundingClientRect();
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: rect.left + 5, clientY: rect.top + 5, cancelable: true }));
  await sleep(100);
  o.recAfterWheelDown = ui.vinvCraftRecStart;
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: rect.left + 5, clientY: rect.top + 5, cancelable: true }));
  await sleep(100);
  o.recAfterWheelUp = ui.vinvCraftRecStart;
  const focusBefore = ui.vinvCraftFocusV;
  window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, clientX: 5, clientY: 5, cancelable: true }));
  await sleep(100);
  o.recOutsideUnchanged = ui.vinvCraftRecStart === o.recAfterWheelUp;
  // 滚轮同拍列表聚焦(DoScrollingInInventory flag 语义:网格支不清 flag)
  o.focusMovedByWheel = ui.vinvCraftFocusV !== focusBefore || o.recAfterWheelDown !== o.recAfterWheelUp;
  // 上页钮点击 → recStart -= cols,钳 0
  up.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(100);
  o.recAfterUp = ui.vinvCraftRecStart;
  // 收拾:关网格(仅开态才点,防 r4 起点态漂移)+ 还原真载荷
  if (ui.vinvPipsUseGrid) {
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(80);
  }
  g.vanillaAvailableRecipes = orig;
  ui.vinvRefreshCraft();
  o.restored = ui.vinvPipsUseGrid === false && ui.vinvCraftAvailV.length < 500;
  return o;
});
L.chk('压满分页:格数=页容量,上钮隐/下钮现', r3.downShown && r3.upHidden && r3.cells > 0, JSON.stringify(r3).slice(0, 200));
L.chk('下页钮:recStart += cols + 上钮现形', r3.recAfterDown === r3.cols && r3.upShownAfter, `rec=${r3.recAfterDown} cols=${r3.cols}`);
L.chk('滚轮矩形内:+120 下页 / -120 上页', r3.recAfterWheelDown === r3.recAfterDown + r3.cols && r3.recAfterWheelUp === r3.recAfterDown, `rec ${r3.recAfterWheelDown}→${r3.recAfterWheelUp}`);
L.chk('滚轮矩形外:recStart 不动', r3.recOutsideUnchanged);
L.chk('滚轮同拍列表聚焦(flag 语义 Main.cs:17629-17632)', r3.focusMovedByWheel);
L.chk('上页钳 0 + 收拾还原', r3.recAfterUp === 0 && r3.restored, `rec=${r3.recAfterUp}`);

// ---- 场景 4:右键循环 Classic↔Modern + modern 支缺席面(分期) ----
const r4 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame, options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  const o = {};
  o.mode0 = options.data.craftingGridControl;
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  await sleep(80);
  o.mode1 = options.data.craftingGridControl;
  o.titleModern = toggle.title;
  // modern 态左键 = 声效面,网格不开(窗族分期缺席)
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(80);
  o.pipsModernClick = ui.vinvPipsUseGrid;
  o.frameModern = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  // 循环回 classic
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  await sleep(80);
  o.mode2 = options.data.craftingGridControl;
  o.titleClassic = toggle.title;
  return o;
});
L.chk('右键循环 Classic→Modern→Classic', r4.mode0 === 'classic' && r4.mode1 === 'modern' && r4.mode2 === 'classic', JSON.stringify(r4));
L.chk('Modern 态悬停名切 CraftingWindowTip', (r4.titleModern || '').length > 0 && r4.titleModern !== r4.titleClassic, r4.titleModern);
L.chk('Modern 左键不翻网格(窗族分期缺席,声效面照走)', r4.pipsModernClick === false && r4.frameModern === '2', `pips=${r4.pipsModernClick}`);

// ---- 场景 5:站点 focus 钩(刀⑦):开包+网格态+过滤;走远失效;再点清过滤 ----
const r5 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const wb = tiles.TILE_BY_KEY['workbench'];
  // 脚边放一座工作 bench(2×1,TileStore.setTileSilent=生成期写入面;近站扫描只认型+active)
  const store = g.world.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16) - 1;
  const bx = Math.min(Math.max(px + 3, 10), store.w - 12);
  const by = Math.min(Math.max(py, 10), store.h - 6);
  store.setTileSilent(bx, by, wb, 0, 0);
  store.setTileSilent(bx + 1, by, wb, 18, 0);
  await sleep(60);
  ui.closeInventory();
  await sleep(120);
  const titleEl = ui.vinvCraftTitleEl;
  const title0 = titleEl.textContent;
  window.__swFx30Title0 = title0;
  const availAll0 = ui.vinvCraftAvailV.length;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const availWithBench = ui.vinvCraftAvailV.length;
  // 站点过滤(tile 18 工作台):OpenCloseFilter 开支 = 置滤器+开包+网格态
  ui.openCraftingStationFilter({ kind: 'station', tile: 18 });
  await ui.refreshAllAsync();
  await sleep(160);
  const o = {};
  o.benchPlaced = wb > 0;
  o.availAll0 = availAll0; o.availWithBench = availWithBench;
  o.invOpened = ui.invPanel.style.display === 'block';
  o.pips = ui.vinvPipsUseGrid === true;
  o.filterSet = ui.vinvCraftFilter ? ui.vinvCraftFilter.kind + ':' + ui.vinvCraftFilter.tile : null;
  o.titleFiltered = titleEl.textContent;
  o.titleChanged = titleEl.textContent !== title0;
  o.avail = ui.vinvCraftAvailV.length;
  // 走远 → CanRemainOpen 失效 → 过滤清(下一刷新拍)
  g.player.x += 2200;
  await ui.refreshAllAsync();
  await sleep(160);
  o.filterCleared = ui.vinvCraftFilter === null;
  o.titleText = titleEl.textContent;
  o.titleRestored = titleEl.textContent === window.__swFx30Title0;
  g.player.x -= 2200;
  return o;
});
L.chk('站点右键钩:开包+网格态+滤器置位(OpenCloseFilter 开支)', r5.invOpened && r5.pips && r5.filterSet === 'station:18', JSON.stringify(r5).slice(0, 200));
L.chk('列表头 = CombineFormat.Crafting(站名)', r5.titleChanged && /制作|Crafting/.test(r5.titleFiltered || ''), r5.titleFiltered);
L.chk('走远(CanRemainOpen=false)过滤清 + 头复位 inter[25]', r5.filterCleared && (r5.titleRestored === true || /配方|Recipes/.test(r5.titleText || '')), r5.titleText);

// ---- 截图:网格视图(压满 500 假载荷,网格面一目了然)+ 切换钮悬停 ----
{
  const page2 = page;
  mkdirSync('/tmp/probe-out/_fx30', { recursive: true });
  await page2.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI, g = window.__swGame;
    const orig = g.vanillaAvailableRecipes.bind(g);
    window.__swOrigAvail2 = orig;
    g.vanillaAvailableRecipes = () => {
      const base = orig();
      const out = [];
      for (let i = 0; i < 500; i++) out.push(base[i % Math.max(1, base.length)] ?? { r: { create: 1, createStack: 1, tile: -1, items: [], groups: [] }, count: 1 });
      return out;
    };
    ui.vinvPipsUseGrid = false;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(120);
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(150);
    toggle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await sleep(100);
  });
  await page2.screenshot({ path: '/tmp/probe-out/_fx30/grid-view.png' });
  const clip = await page2.evaluate(() => {
    const grid = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '3');
    const r = grid.getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 30), width: Math.min(1100, r.width + 60), height: Math.min(750, r.height + 60) };
  });
  await page2.screenshot({ path: '/tmp/probe-out/_fx30/grid-clip.png', clip });
  await page2.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI, g = window.__swGame;
    if (ui.vinvPipsUseGrid) {
      const toggle = [...document.querySelector('.sw-vinv').querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      await sleep(60);
    }
    g.vanillaAvailableRecipes = window.__swOrigAvail2;
    ui.vinvRefreshCraft();
  });
  L.say('截图: /tmp/probe-out/_fx30/grid-view.png + grid-clip.png');
}

L.print();
browser.close().catch(() => {});
process.exit(L.exitCode());
