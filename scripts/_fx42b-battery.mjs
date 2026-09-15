// FX42b 验证电池:normal 态 搜索条/11 钮/滚动条 几何断言 + 站点滤器开窗 + 向导态进出。
// 运行:SW_ORIGIN=http://localhost:5237 node tools/run-diag.mjs scripts/_fx42b-battery.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5237';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 700 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e.message).slice(0, 200)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory(); });
await sleep(200);

const measure = () => page.evaluate(() => {
  const ui = window.__swUI;
  const root = document.querySelector('.sw-vinv');
  const rr = root.getBoundingClientRect();
  const trs = getComputedStyle(root).transform;
  const K = trs && trs !== 'none' ? parseFloat(trs.slice(7).split(',')[0]) : 1;
  const rect = (elm) => { if (!elm) return null; const b = elm.getBoundingClientRect(); return { x: +((b.x - rr.left) / K).toFixed(1), y: +((b.y - rr.top) / K).toFixed(1), w: +(b.width / K).toFixed(1), h: +(b.height / K).toFixed(1) }; };
  const row = ui.vinvModernSearchRowEl;
  const box = row ? row.children[1] : null;
  const boxBg = box ? box.children[0] : null;
  const g = ui.vinvModernGridGeometry();
  const title = ui.vinvModernTitleEl;
  return {
    open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
    rootDisplay: root.style.display,
    entries: ui.vinvModernEntries.length,
    titleText: title?.textContent, titleW: title?.offsetWidth,
    rowStyle: { left: row?.style.left, width: row?.style.width },
    rowRect: rect(row), bgRect: rect(boxBg),
    bgComputed: boxBg ? getComputedStyle(boxBg).backgroundColor : null,
    tabsPainted: ui.vinvModernFilterBtns.map((b) => {
      const t = b.querySelector('div');
      return !!t && !!t.style.backgroundImage && t.offsetWidth === 40 && t.offsetHeight === 46 && b.offsetParent !== null;
    }).filter(Boolean).length,
    tabsRects: ui.vinvModernFilterBtns.slice(0, 2).map(rect),
    sbarDisplay: ui.vinvModernScrollbarEl?.style.display,
    sbarRect: rect(ui.vinvModernScrollbarEl),
    handleRect: rect(ui.vinvModernScrollHandle),
    geo: g ? { listH: g.list.h, contentH: g.contentH, sbarX: g.scrollbar.x, sbarY: g.scrollbar.y, sbarH: g.scrollbar.h, containerY: g.container.y } : null,
    guideSlotVisible: ui.vinvGuideSlotModernEl ? ui.vinvGuideSlotModernEl.style.display !== 'none' : null,
  };
});
const openModern = async () => {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await sleep(300);
  });
  await sleep(400);
};

// ===== 场景A:many-entries normal 态(工作台+全材料 → 滚动条 AutoHide 应现) =====
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.__swGame, ui = window.__swUI, st = g.world.store;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wb = window.__swTiles['workbench'];
  const fu = window.__swTiles['furnace'];
  const av = window.__swTiles['anvil'];
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  st.setTileSilent(ptx + 1, pty - 1, av, 0, 0);
  st.setTileSilent(ptx + 2, pty - 1, av, 18, 0);
  st.setTileSilent(ptx + 3, pty - 1, wb, 0, 0);
  st.setTileSilent(ptx + 4, pty - 1, wb, 18, 0);
  st.setTileSilent(ptx - 3, pty - 1, fu, 0, 0);
  st.setTileSilent(ptx - 4, pty - 1, fu, 18, 0);
  st.setTileSilent(ptx - 5, pty - 1, fu, 36, 0);
  window.__wbType = wb;
  // 全材料:按 vid 白名单从 ITEM_DEFS 取 key(覆盖工作台/熔炉域常见原料)
  const defs = window.__swITEM_DEFS;
  const vids = new Set([9, 3, 23, 8, 22, 169, 150, 171, 172, 173, 174, 166, 167, 168, 1098, 110, 125, 126, 132, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80, 82, 84, 86, 88, 90]);
  let added = 0;
  for (const d of defs) {
    if (!d || !d.key) continue;
    const m = /^vi_(\d+)_/.exec(d.key);
    if (m && vids.has(Number(m[1]))) { const iid = g.itemId(d.key); if (iid > 0) { g.player.inv.add(iid, 999); added++; } }
  }
  window.__matsAdded = added;
  await ui.refreshAllAsync();
  await sleep(200);
  window.__availCount = g.vanillaAvailableRecipes().length;
  window.__stations = (ui.vinvNearbyStations ? ui.vinvNearbyStations() : null);
});
await sleep(300);
const dbg = await page.evaluate(() => ({ mats: window.__matsAdded, avail: window.__availCount, stations: window.__stations }));
console.log('debug:', JSON.stringify(dbg));
await openModern();
await page.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
const mA = await measure();
console.log('=== 场景A many-entries normal 态 ===');
console.log(JSON.stringify(mA, null, 1));
ok(mA.open && !mA.guide, 'A1 窗开∧非向导态');
ok(mA.entries > 60, `A2 条目数>60 (got ${mA.entries})`);
const tw = mA.titleW ?? 0;
ok(Math.abs(parseFloat(mA.rowStyle.left) - (tw + 22)) < 0.5, `A3 搜索行 left=${tw}+22 (got ${mA.rowStyle.left})`);
ok(Math.abs(parseFloat(mA.rowStyle.width) - (460 - tw)) < 0.5, `A4 搜索行 width=460−${tw} (got ${mA.rowStyle.width})`);
ok(mA.bgRect && Math.abs(mA.bgRect.w - (435 - tw)) < 1.5 && mA.bgRect.h === 24, `A5 蓝条实宽 ${mA.bgRect?.w}≈${435 - tw}×24`);
ok(mA.bgComputed === 'rgb(27, 56, 111)', `A6 蓝条色=反编译 (35,40,83) shift=${mA.bgComputed}`);
ok(mA.tabsPainted === 11, `A7 11 枚筛选钮帧面+几何+可见 (got ${mA.tabsPainted})`);
ok(mA.tabsRects[0] && Math.abs(mA.tabsRects[0].x - 45) < 0.5 && Math.abs(mA.tabsRects[0].y - 316) < 0.5, `A8 首钮 @(45,316) (got ${JSON.stringify(mA.tabsRects[0])})`);
const canScroll = mA.geo.contentH > mA.geo.listH;
ok(canScroll, `A9a 条目足以滚动 contentH=${mA.geo.contentH} > listH=${mA.geo.listH}`);
ok(mA.sbarDisplay === '' && mA.sbarRect && Math.abs(mA.sbarRect.x - 482) < 0.5 && Math.abs(mA.sbarRect.y - mA.geo.sbarY) < 0.5 && Math.abs(mA.sbarRect.w - 20) < 0.5, `A9b 滚动条可见 @482,${mA.geo.sbarY} 20×${mA.geo.sbarH} (got ${JSON.stringify(mA.sbarRect)} display=${mA.sbarDisplay})`);
ok(mA.handleRect && mA.handleRect.h >= 12 && mA.handleRect.w === 20, `A10 柄可见 ${mA.handleRect?.w}×${mA.handleRect?.h}`);
ok(mA.guideSlotVisible === false, 'A11 向导槽 normal 态隐藏');
await page.screenshot({ path: '/tmp/fx42b-normal.png' });
console.log('SCREENSHOT /tmp/fx42b-normal.png');

// ===== 场景B:右击工作台 → 滤器开窗(标题长文案) =====
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); });
await sleep(300);
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { craftingFilterForTile } = await import('/src/ui/craftingGrid.ts');
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const sheet = TILE_DEFS[window.__wbType]?.vanilla?.sheet ?? window.__wbType;   // 原版 sheet 域(游戏右击链同域)
  const f = craftingFilterForTile(sheet);
  window.__fB = f ?? null;
  window.__sheetB = sheet;
  if (f) window.__swUI.openCraftingStationFilter(f);
  await sleep(400);
});
await sleep(400);
const mB = await measure();
console.log('=== 场景B 站点滤器态 ===', JSON.stringify({ open: mB.open, titleText: mB.titleText, titleW: mB.titleW, rowStyle: mB.rowStyle, bgRect: mB.bgRect, tabsPainted: mB.tabsPainted, entries: mB.entries }));
const twB = mB.titleW ?? 0;
ok(mB.open, 'B1 站点链开窗');
ok(/工作台|Work Bench/.test(mB.titleText || ''), `B2 标题=站名文案 (got ${mB.titleText})`);
ok(Math.abs(parseFloat(mB.rowStyle.left) - (twB + 22)) < 0.5, `B3 搜索条 left 随长标题 (got ${mB.rowStyle.left})`);
ok(Math.abs(parseFloat(mB.rowStyle.width) - (460 - twB)) < 0.5, `B4 搜索条 width=460−${twB} (got ${mB.rowStyle.width})`);
ok(mB.tabsPainted === 11, `B5 11 钮仍全可见 (got ${mB.tabsPainted})`);
await page.screenshot({ path: '/tmp/fx42b-station.png' });

// ===== 场景C:向导态(modern)进出 → normal 复位 =====
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swUI.openInventory(true); });
await sleep(300);
await page.evaluate(async () => {
  const g = window.__swGame, st = g.world.store;
  // 清掉场景A摆放的站点(防向导落位被砧/台占位)
  const ptx = Math.floor(g.player.cx / 16), pty = Math.floor((g.player.y + g.player.h) / 16);
  for (let dx = -6; dx <= 12; dx++) st.setTileSilent(ptx + dx, pty - 1, 0, 0, 0);
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__fx42bGuide) {
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__fx42bGuide = guide;
  }
  const guide = window.__fx42bGuide;
  guide.dead = false;
  const st2 = g.world.store;
  const col = Math.floor(guide.cx / 16);
  let gy = Math.max(0, Math.floor((guide.y + guide.h + 2) / 16));
  let solid = st2.get(col, gy) !== 0 && st2.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) { gy++; solid = st2.get(col, gy) !== 0 && st2.hasTile(col, gy); }
  g.player.x = guide.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  g.player.vx = 0; g.player.vy = 0;
  let err = null;
  try { g.openNpcDialog(guide); } catch (e) { err = String(e && e.stack || e).slice(0, 300); }
  window.__dlgErr = err;
  window.__dlgAfter = { dialogNpc: !!g.dialogNpc, active: !!g.npcDialogActive };
});
await sleep(400);
console.log('dlgErr:', await page.evaluate(() => JSON.stringify({ err: window.__dlgErr, after: window.__dlgAfter, playerX: window.__swGame.player.x, guideX: window.__fx42bGuide?.x, guideY: window.__fx42bGuide?.y, guideDead: window.__fx42bGuide?.dead })));
await sleep(500);
const dlg = await page.evaluate(() => {
  const d = document.querySelector('.sw-npc-dialog');
  return {
    active: !!window.__swGame.npcDialogActive,
    hasDialog: !!d,
    btns: [...document.querySelectorAll('.sw-npc-btn')].map((b) => b.dataset.b || b.textContent?.slice(0, 6)),
  };
});
console.log('dialog:', JSON.stringify(dlg));
const craftPos = await page.evaluate(() => {
  const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]')
    || [...document.querySelectorAll('.sw-npc-btn')].find((b) => (b.textContent || '').includes('制作'));
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (craftPos) { await page.mouse.click(craftPos.x, craftPos.y); await sleep(600); }
const mC1 = await measure();
console.log('=== 场景C1 向导态(modern) ===', JSON.stringify({ guide: mC1.guide, open: mC1.open, containerY: mC1.geo?.containerY, tabsPainted: mC1.tabsPainted, guideSlot: mC1.guideSlotVisible, sbar: mC1.sbarRect }));
ok(mC1.guide && mC1.open, `C1 向导态∧窗开 (guide=${mC1.guide} open=${mC1.open})`);
ok(mC1.geo && mC1.geo.containerY === 492, `C2 向导态网格顶=inner.y+130=492 (got ${mC1.geo?.containerY})`);
ok(mC1.tabsPainted === 11, `C2b 向导态 11 钮仍全可见 (got ${mC1.tabsPainted})`);
// 关对话 → 向导态退出(+窗收)→ 重开背包 → 切换钮重开 = normal
await page.evaluate(() => { window.__swGame.closeNpcDialog(false); });
await sleep(400);
const mC2 = await measure();
ok(!mC2.guide, `C3 对话关→向导旗复位 (got ${mC2.guide})`);
ok(!mC2.open, 'C4 向导退出→modern 窗随收(:42396-42400)');
await page.evaluate(() => { window.__swUI.openInventory(true); });
await sleep(300);
await openModern();
const mC3 = await measure();
console.log('=== 场景C3 重开(normal) ===', JSON.stringify({ open: mC3.open, guide: mC3.guide, containerY: mC3.geo?.containerY, tabsPainted: mC3.tabsPainted, rowRect: mC3.rowRect, sbarDisplay: mC3.sbarDisplay, rootDisplay: mC3.rootDisplay }));
ok(mC3.open && !mC3.guide && mC3.rootDisplay === 'block', 'C5 重开=normal 态(根可见)');
ok(mC3.geo && mC3.geo.containerY === 439, `C6 normal 网格顶=inner.y+77=439 (got ${mC3.geo?.containerY})`);
ok(mC3.guideSlotVisible === false, 'C7 向导槽保持隐藏');
ok(mC3.tabsPainted === 11, `C8 11 钮重开仍全可见 (got ${mC3.tabsPainted})`);
ok(mC3.rowRect && mC3.rowRect.w > 300, `C9 搜索条重开仍实宽 (got ${mC3.rowRect?.w})`);

console.log(fails.length ? `BATTERY ${fails.length} FAIL: ${fails.join(' | ')}` : 'BATTERY ALL PASS');
await page.close();
await browser.close();
process.exit(fails.length ? 1 : 0);
