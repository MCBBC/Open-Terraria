// SW-FX41 补债批探针(2026-09-12)——UI 移债 modern 窗族实机面:NewCraftingUI 窗体/
// 11 类筛选条/详情浮层/模式循环/缺省回切/站点钩 modern 支。
// 运行:node tools/probe.mjs run scripts/_fx41-modern-craft-probe.mjs --seed=05162020 --size=small --vite=auto
import {
  launchBrowser, openPage, bootstrap, gotoApp, waitForBridge, createGame, ledger, front,
} from '../tools/probe/lib/index.mjs';
import { mkdirSync } from 'node:fs';

const L = ledger();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await launchBrowser({ viewport: { width: 1100, height: 750 } });
const page = await openPage(browser, {});
const boot = await bootstrap(page, process.env.SW_ORIGIN || 'http://localhost:5199');
if (!boot.ok) { console.log('BOOT FAIL', boot); process.exit(1); }
await gotoApp(page, page.__probeOrigin || process.env.SW_ORIGIN || 'http://localhost:5199', { extraQuery: '?invlayout=vanilla', tries: 40 });
if (!(await waitForBridge(page, { timeout: 120_000 }))) { console.log('BRIDGE FAIL'); process.exit(1); }

const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
L.chk('世界已建', gen.ok);

const winOf = `("[...document.querySelector('.sw-vinv').children].find(c => c.style.zIndex === '5')")`;

// ---- 场景 0:给料 + 缺省回切断言 ----
await front(page);
const r0 = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood'), sid = g.itemId('vi_3_stone_block');
  if (wid > 0) g.player.inv.add(wid, 300);
  if (sid > 0) g.player.inv.add(sid, 300);
  await ui.refreshAllAsync();
  return { avail: ui.vinvCraftAvailV.length, mode: options.data.craftingGridControl };
});
L.chk('给料后可用配方 ≥2', r0.avail >= 2, `avail=${r0.avail}`);
L.chk('缺省回切 Modern(Player.cs:363,SW-FX41)', r0.mode === 'modern', `mode=${r0.mode}`);

// ---- 场景 1:modern 缺省左键 → 窗开:几何/筛选条/标题/经典面隐藏 ----
await front(page);
const r1 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  const o = {};
  o.frame0 = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  o.pos0 = { x: toggle.offsetLeft, y: toggle.offsetTop };
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(180);
  const win = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '5');
  o.open = ui.vinvModernCraftOpen === true;
  o.frame1 = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  o.toggleAnchor = { x: toggle.offsetLeft, y: toggle.offsetTop };
  if (win) {
    o.win = {
      left: parseFloat(win.style.left), top: parseFloat(win.style.top),
      w: parseFloat(win.style.width), h: parseFloat(win.style.height),
      vis: win.style.display !== 'none',
      hExpect: ui.vinvLayoutCtx.sh - 350,
    };
    o.tabs = [...win.querySelectorAll('.vinv-btn')].filter((b) => b.querySelector('div')).length;
    o.tab0 = [...win.querySelectorAll('.vinv-btn')].filter((b) => b.querySelector('div'))[0]?.offsetLeft;
    o.title = win.querySelector('.vinv-txt')?.textContent;
    o.searchInput = !!win.querySelector('input');
    o.searchPlaceholder = win.querySelector('input')?.placeholder;
    o.panelBg = [...win.querySelectorAll('div')].map((d) => d.style.background).find((s) => s && s.includes('rgb'));
  }
  o.entries = ui.vinvModernEntries.length;
  o.classicCellsHidden = ui.vinvCraftCellEls.every((c) => c.el.style.display === 'none');
  o.pips = ui.vinvPipsUseGrid;
  o.openedWithoutFilter = ui.vinvModernOpenedWithoutFilter;
  o.selected = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
  return o;
});
L.chk('缺省 modern 左键开窗(vinvModernCraftOpen=true)', r1.open, JSON.stringify(r1).slice(0, 140));
L.chk('切换钮帧 = 4(modern 窗态) + 锚移 (42,285)', r1.frame1 === '4' && r1.toggleAnchor.x === 42 && r1.toggleAnchor.y === 285, `${r1.frame0}→${r1.frame1} @${JSON.stringify(r1.toggleAnchor)}`);
L.chk('窗体 @(20,312) 490×(sh−350)', r1.win && r1.win.left === 20 && r1.win.top === 312 && r1.win.w === 490 && r1.win.h === r1.win.hExpect && r1.win.vis, JSON.stringify(r1.win));
L.chk('筛选条 11 钮,首钮 x=25(容器域)', r1.tabs === 11 && r1.tab0 === 25, `tabs=${r1.tabs} tab0=${r1.tab0}`);
L.chk('标题 = inter[25](无站点滤器)', /制作|Craft/.test(r1.title || ''), r1.title);
L.chk('搜索条在仓(占位 = UI.PlayerNameSlot 原版缺省)', r1.searchInput, r1.searchPlaceholder);
L.chk('窗面板底色 = ShiftBlueToCyan×0.8(MCRAFT_PANEL_BG)', (r1.panelBg || '').includes('26, 64, 108') || (r1.panelBg || '').includes('26,64,108'), r1.panelBg);
L.chk('经典列表格隐藏(Main.cs:42418 else 支不画)', r1.classicCellsHidden, `classic=${r1.classicCellsHidden}`);
L.chk('条目池增量建(UpdateContents)', r1.entries >= 2, `entries=${r1.entries}`);

// ---- 场景 2:详情浮层 + 点选/再点合成 ----
await front(page);
const r2 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const win = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '5');
  const list = [...win.querySelectorAll('div')].find((d) => d.style.overflow === 'hidden');
  const cells = [...list.querySelectorAll('.sw-slot')];
  const o = {};
  o.cellCount = cells.length;
  o.cell0 = cells[0] ? { x: parseFloat(cells[0].style.left), y: parseFloat(cells[0].style.top) } : null;
  o.cell1dx = cells[1] ? parseFloat(cells[1].style.left) - parseFloat(cells[0].style.left) : null;
  o.scale = cells[0] ? /scale\(([\d.]+)\)/.exec(cells[0].style.transform)?.[1] : null;
  cells[0]?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await sleep(120);
  o.tooltipShown = ui.tooltip.style.display !== 'none';
  const slotsBefore = g.player.inv.slots.filter(Boolean).length;
  const stacksBefore = g.player.inv.slots.reduce((a, s) => a + (s ? s.stack : 0), 0);
  cells[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(180);
  o.selected0 = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
  o.detailShown = !!ui.vinvModernDetailEl && ui.vinvModernDetailEl.style.display !== 'none';
  const detail = ui.vinvModernDetailEl;
  o.detailPos = detail ? { x: parseFloat(detail.style.left), y: parseFloat(detail.style.top) } : null;
  o.detailSlots = detail ? detail.querySelectorAll('.sw-slot').length : 0;
  o.ownedCount = detail ? [...detail.querySelectorAll('div')].some((d) => /^\d+$/.test((d.textContent || '').trim())) : false;
  // 已选可用 → 再点 = 合成(HoverOverCraftingItemButton 语义)
  cells[0]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(220);
  const slotsAfter = g.player.inv.slots.filter(Boolean).length;
  const stacksAfter = g.player.inv.slots.reduce((a, s) => a + (s ? s.stack : 0), 0);
  o.afterCraft = { slotsBefore, slotsAfter, stacksBefore, stacksAfter, changed: stacksAfter !== stacksBefore || slotsAfter !== slotsBefore };
  return o;
});
L.chk('网格格在仓且步距 44/缩放 0.846', r2.cellCount >= 1 && r2.cell1dx === 44 && Math.abs(parseFloat(r2.scale) - 0.84615386) < 1e-5, JSON.stringify({ n: r2.cellCount, dx: r2.cell1dx, scale: r2.scale }));
L.chk('悬停首格 → tooltip', r2.tooltipShown);
L.chk('点选(HandleCraftSlot 选中队) + 详情浮层 origin(24,73)', r2.selected0 !== null && r2.detailShown && r2.detailPos && r2.detailPos.x === 24 && r2.detailPos.y === 73, `sel=${r2.selected0} detail=${JSON.stringify(r2.detailPos)}`);
L.chk('详情浮层含成品槽+材料行+拥有数', r2.detailSlots >= 2 && r2.ownedCount, `slots=${r2.detailSlots} owned=${r2.ownedCount}`);
L.chk('已选再点 = 合成链(库存面变化)', r2.afterCraft.changed, JSON.stringify(r2.afterCraft));

// ---- 场景 3:11 类筛选条:单选/反选/搜索/取消钮 ----
await front(page);
const r3 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const win = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '5');
  const tabs = [...win.querySelectorAll('.vinv-btn')];
  const tabFrame = (t) => t.querySelector('div')?.style.backgroundPosition || '';
  const o = {};
  o.entryAll = ui.vinvModernEntries.length;
  o.tabFrameIdle = tabFrame(tabs[0]);
  tabs[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(180);
  o.active1 = [...ui.vinvModernActive];
  o.tabFrameActive = tabFrame(tabs[0]);
  o.entriesWeapon = ui.vinvModernEntries.length;
  tabs[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(180);
  o.active2 = [...ui.vinvModernActive];
  o.entriesRestored = ui.vinvModernEntries.length;
  const input = win.querySelector('input');
  // 搜索词走激活语言域(zh-Hans 探针环境):'墙' 只命中木墙类条目
  input.value = 'zzzz';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await sleep(220);
  o.entriesSearch = ui.vinvModernEntries.length;
  o.searchFiltered = ui.vinvModernEntries.length > 0 && ui.vinvModernEntries.length < o.entryAll;
  const cancel = [...win.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('SearchCancel'));
  cancel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(180);
  o.entriesAfterCancel = ui.vinvModernEntries.length;
  o.inputCleared = win.querySelector('input').value === '';
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(150);
  o.closed = ui.vinvModernCraftOpen === false;
  o.frameClosed = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  o.toggleBack = toggle.offsetLeft;
  return o;
});
L.chk('筛选条单选(weapon):激活帧位移 + 条目域收窄', r3.active1?.[0] === 'weapon' && r3.entriesWeapon <= r3.entryAll && r3.tabFrameActive !== r3.tabFrameIdle, `${JSON.stringify(r3.active1)} ${r3.entriesWeapon}/${r3.entryAll} ${r3.tabFrameIdle}→${r3.tabFrameActive}`);
L.chk('反选清空(ToggleFilter remove 臂)', r3.active2?.length === 0 && r3.entriesRestored === r3.entryAll, `active=${JSON.stringify(r3.active2)} entries=${r3.entriesRestored}/${r3.entryAll}`);
L.chk('搜索项无命中(条目归零,搜索门生效)', r3.entriesSearch === 0, `entries=${r3.entriesSearch}/${r3.entryAll}`);
L.chk('搜索取消钮还原(searchCancelButton_OnClick :189-195)', r3.inputCleared && r3.entriesAfterCancel === r3.entryAll, `entries=${r3.entriesAfterCancel}`);
L.chk('左键关窗:回 list 态帧 2 + 锚回 (94,450)', r3.closed && r3.frameClosed === '2' && r3.toggleBack === 94, `closed=${r3.closed} frame=${r3.frameClosed} x=${r3.toggleBack}`);

// ---- 场景 4:站点钩 modern 支(OpenCloseFilter 四支 + CanRemainOpen 自动关窗) ----
await front(page);
const r4 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const wb = tiles.TILE_BY_KEY['workbench'];
  const anvil = tiles.TILE_BY_KEY['anvil'];
  const store = g.world.store;
  const px = Math.floor(g.player.x / 16), py = Math.floor(g.player.y / 16) - 1;
  const bx = Math.min(Math.max(px + 2, 10), store.w - 12);   // bench px+2..px+3,anvil px+4(全在扫描盒 RX=px+4 内)
  const by = Math.min(Math.max(py, 10), store.h - 6);
  store.setTileSilent(bx, by, wb, 0, 0);
  store.setTileSilent(bx + 1, by, wb, 18, 0);
  // 支撑面:家具站脚下垫实体石(防 settle 支撑链清场——FX30 期浮置短测未触发)
  for (let sx = bx - 1; sx <= bx + 6; sx++) store.setTileSilent(sx, by + 1, tiles.TILE_BY_KEY['stone'], 0, 0);
  if (anvil) { store.setTileSilent(bx + 2, by, anvil, 0, 0); store.setTileSilent(bx + 3, by, anvil, 0, 0); }
  await sleep(60);
  ui.closeInventory();
  await sleep(120);
  ui.openInventory(true);
  await ui.refreshAllAsync();
  // 支1:窗关 → open(带站点滤器,:940-943)
  ui.openCraftingStationFilter({ kind: 'station', tile: 18 });
  await ui.refreshAllAsync();
  await sleep(200);
  const win = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '5');
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  const o = {};
  o.opened = ui.vinvModernCraftOpen === true && win && win.style.display !== 'none';
  o.filter = ui.vinvModernCraftFilter ? ui.vinvModernCraftFilter.kind + ':' + ui.vinvModernCraftFilter.tile : null;
  o.openedWithoutFilter = ui.vinvModernOpenedWithoutFilter;
  o.title = win?.querySelector('.vinv-txt')?.textContent;
  o.toggleAnchor = { x: toggle.offsetLeft, y: toggle.offsetTop };
  // 支2:同滤器再点 → openedWithoutFilter=false → close(:960-963)
  ui.openCraftingStationFilter({ kind: 'station', tile: 18 });
  await sleep(180);
  o.closedBySecond = ui.vinvModernCraftOpen === false;
  // 支3:异滤器(铁砧 16,近站在场) → setFilter 不关窗(:944-954)
  ui.openCraftingStationFilter({ kind: 'station', tile: 18 });
  await sleep(150);
  ui.openCraftingStationFilter({ kind: 'station', tile: 16 });
  await sleep(150);
  o.filterAfterDiff = ui.vinvModernCraftFilter ? ui.vinvModernCraftFilter.tile : null;
  o.stillOpen = ui.vinvModernCraftOpen;
  // 走远 → CanRemainOpen 失效 → Update 拍自动关窗(NewCraftingUI.cs:655-665)
  // ★x/y 快照精确回位(走远会下坠改 y——只回 x 会把玩家留在别处,近站扫描失配)
  const savedX = g.player.x, savedY = g.player.y;
  g.player.x += 2200;
  await sleep(700);
  o.autoClosed = ui.vinvModernCraftOpen === false;
  g.player.x = savedX; g.player.y = savedY;
  return o;
});
L.chk('站点钩 modern 支:开窗+站点滤器置位+openedWithoutFilter=false', r4.opened && r4.filter === 'station:18' && r4.openedWithoutFilter === false, JSON.stringify(r4).slice(0, 200));
L.chk('窗标题 = CombineFormat.Crafting(站名)', /制作|Craft/.test(r4.title || ''), r4.title);
L.chk('同滤器再点 = 关窗(:960-963)', r4.closedBySecond);
L.chk('异滤器 = setFilter 换滤不关窗(:944-954)', r4.stillOpen && r4.filterAfterDiff === 16, `filter=${r4.filterAfterDiff}`);
L.chk('走远 CanRemainOpen=false → Update 拍自动关窗(:655-665)', r4.autoClosed);

// ---- 场景 5:模式循环共存(窗开态右键切 classic → 左键静默收窗+网格照开) ----
await front(page);
const r5 = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame, options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  const o = {};
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(150);
  o.winOpen = ui.vinvModernCraftOpen;
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  await sleep(100);
  o.modeAfterCycle = options.data.craftingGridControl;
  o.winStillOpen = ui.vinvModernCraftOpen;   // 右键不关窗=原版同相
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(150);
  o.winClosed = ui.vinvModernCraftOpen === false;
  o.pips = ui.vinvPipsUseGrid === true;
  o.frameClassicGrid = toggle.querySelector('img').src.match(/Craft_Toggle_(\d)/)?.[1];
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(100);
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  await sleep(100);
  o.modeRestored = options.data.craftingGridControl;
  // 关包 → 窗静默收(Main.cs:46444)
  ui.openCraftingStationFilter({ kind: 'station', tile: 18 });
  await sleep(60);
  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  o.remainOpen60 = { open: ui.vinvModernCraftOpen, remain: ui.vinvFilterRemain({ kind: 'station', tile: 18 }),
    nearbySheets: [...g.vanillaNearbyStations()].map((t) => TILE_DEFS[t]?.vanilla?.sheet) };
  await sleep(120);
  o.openBeforeClose = ui.vinvModernCraftOpen;
  ui.closeInventory();
  await sleep(150);
  o.closedByInvClose = ui.vinvModernCraftOpen === false;
  return o;
});
L.chk('窗开态右键循环 → classic(窗保持=原版同相)', r5.winOpen && r5.modeAfterCycle === 'classic' && r5.winStillOpen, JSON.stringify(r5));
L.chk('classic 左键 = 静默收窗 + 网格照开(两态共存)', r5.winClosed && r5.pips && r5.frameClassicGrid === '0', `pips=${r5.pips} frame=${r5.frameClassicGrid}`);
L.chk('收拾:网格关 + 循环回 modern', r5.modeRestored === 'modern');
L.chk('关包链静默收窗(Main.cs:46444)', r5.openBeforeClose && r5.closedByInvClose);

// ---- 截图:窗全貌(站点过滤+详情浮层+筛选条激活态) ----
{
  mkdirSync('/tmp/probe-out/_fx41', { recursive: true });
  await front(page);
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    await sleep(100);
    ui.openCraftingStationFilter({ kind: 'station', tile: 18 });
    await ui.refreshAllAsync();
    await sleep(200);
    const win = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '5');
    const list = [...win.querySelectorAll('div')].find((d) => d.style.overflow === 'hidden');
    list.querySelector('.sw-slot')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(160);
    const tabs = [...win.querySelectorAll('.vinv-btn')];
    tabs[9]?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await sleep(120);
  });
  await page.screenshot({ path: '/tmp/probe-out/_fx41/modern-window.png' });
  const clip = await page.evaluate(() => {
    const win = [...document.querySelector('.sw-vinv').children].find((c) => c.style.zIndex === '5');
    const r = win.getBoundingClientRect();
    return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 60), width: Math.min(1100, r.width + 30), height: Math.min(750, r.height + 80) };
  });
  await page.screenshot({ path: '/tmp/probe-out/_fx41/modern-clip.png', clip });
  L.say('截图: /tmp/probe-out/_fx41/modern-window.png + modern-clip.png');
}

L.print();
browser.close().catch(() => {});
process.exit(L.exitCode());
