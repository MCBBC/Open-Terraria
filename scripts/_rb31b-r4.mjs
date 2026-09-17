// RB31b r4(终收敛):A5 向导态(dialogNpc 桩)/B4(先置解锁旗)/C3b+c(口袋加顶盖)。
// 运行:SW_ORIGIN=http://localhost:5265 node tools/run-diag.mjs scripts/_rb31b-r4.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const newPage = async () => {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
  page.__errs = errs;
  await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  await sleep(400);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
    window.__md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await sleep(150);
  return page;
};

const pageA = await newPage();
try {
  await pageA.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    const wid = g.itemId('vi_9_Wood');
    if (wid > 0) g.player.inv.add(wid, 500);
    await ui.refreshAllAsync();
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    window.__md(toggle);
  });
  await pageA.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
  await sleep(250);

  const A5 = await pageA.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    window.__dlgSaved = g.dialogNpc;
    g.dialogNpc = { npcKey: 'guide', vanillaId: 22 };        // 桩:npcDialogActive getter→true
    ui.vinvCloseModernCraft(true);
    ui.openVanillaGuideCraft();
    const flagsAfterOpen = { open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen, act: g.npcDialogActive };
    const wood = g.itemId('vi_9_Wood');
    ui.guidePlaced = { id: wood, stack: 10 };
    ui.vinvUpdateModernCraft();
    const win = ui.vinvModernCraftEl;
    const wr = win.getBoundingClientRect();
    const rel = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - wr.x).toFixed(1), t: +(b.y - wr.y).toFixed(1) }; };
    return {
      flagsAfterOpen,
      open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
      n: ui.vinvModernEntries.length,
      slot: rel(ui.vinvGuideSlotModernEl), cap: rel(ui.vinvGuideModernCaptionEl), req: rel(ui.vinvGuideModernReqEl),
      detailHidden: ui.vinvModernDetailEl.style.display === 'none',
      selected: ui.vinvModernSelected,
    };
  });
  ok(A5.open && A5.guide && A5.selected === null, 'A5a 向导态开窗=窗开+向导旗+无预选(详情不画)', JSON.stringify({ f: A5.flagsAfterOpen, open: A5.open, guide: A5.guide, n: A5.n, sel: A5.selected }));
  ok(Math.abs(A5.slot.l - 24) <= 1 && Math.abs(A5.slot.t - 131) <= 1 && Math.abs(A5.cap.l - 76) <= 1 && Math.abs(A5.cap.t - 146) <= 1, 'A5b 向导槽/文案锚=(24,131)/(76,146)(刀19 锚位)', JSON.stringify(A5.slot));
  const A5c = await pageA.evaluate(() => {
    const ui = window.__swUI;
    const cell = ui.vinvModernCellEls[0]?.el;
    if (!cell) return { err: 'no cells' };
    window.__md(cell);
    const detail = ui.vinvModernDetailEl;
    const win = ui.vinvModernCraftEl;
    const dw = win.getBoundingClientRect(), dd = detail.getBoundingClientRect();
    const relD = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - dd.x).toFixed(1), t: +(b.y - dd.y).toFixed(1) }; };
    const kids = [...detail.children].map(relD);
    const cntEls = [...detail.children].filter((c) => c.tagName === 'DIV' && c.style.pointerEvents === 'none');
    return {
      dRelWin: { l: +(dd.x - dw.x).toFixed(1), t: +(dd.y - dw.y).toFixed(1) },
      kids, ownedShown: cntEls.some((d) => d.style.display !== 'none'),
    };
  });
  ok(A5c.dRelWin && Math.abs(A5c.dRelWin.l - 24) <= 1 && Math.abs(A5c.dRelWin.t - 73) <= 1, 'A5c-1 向导态详情容器=win+(24,73)(相对系无双重偏移)', JSON.stringify(A5c.dRelWin));
  ok(A5c.kids[0] && A5c.kids[0].l === 0 && A5c.kids[0].t === 0, 'A5c-2 向导态成品槽=容器相对(0,0)', JSON.stringify(A5c.kids.slice(0, 2)));
  ok(A5c.ownedShown === false, 'A5c-3 向导态拥有数整支不画(:482 !InGuideCraftMenu 门)', JSON.stringify({ ownedShown: A5c.ownedShown }));
  // 向导态站点 setFilter 臂(:946-951 收向导+保窗)
  const A6 = await pageA.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
    const wb = TILE_DEFS[TILE_BY_KEY['workbench']]?.vanilla?.sheet;
    ui.vinvOpenCloseModernCraftFilter({ kind: 'station', tile: wb });
    const r = { open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen, filterTile: ui.vinvModernCraftFilter?.tile, title: ui.vinvModernTitleEl.textContent };
    ui.vinvCloseModernCraft(true);
    ui.vinvGuideMenuOpen = false;
    ui.vinvReturnGuidePlaced?.();
    g.dialogNpc = window.__dlgSaved;
    return r;
  });
  ok(A6.open && A6.guide === false && A6.filterTile === 18, 'A6 向导态右键站点=setFilter 臂(收向导/保窗/题=工作台制作)', JSON.stringify(A6));
  const errsA = pageA.__errs.filter((e) => !e.includes('favicon'));
  ok(errsA.length === 0, 'A-ERR 页面零异常', errsA.join(' | ').slice(0, 300));
} catch (e) {
  fails.push('PART-A exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-A exception: ' + String(e).slice(0, 500));
}

const pageB = await newPage();
try {
  // B4:先置解锁旗(r3 漏旗=探针序错误)
  const B4 = await pageB.evaluate(async () => {
    const g = window.__swGame;
    g.world.flags.unlockedBiomeTorches = true;
    const using = g.usingBiomeTorches();
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
    const cfIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 966);
    const snowIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 3048);
    const inv = g.player.inv, st = g.world.store;
    const bx = Math.floor(g.player.cx / 16) + 4, by = Math.floor(g.player.cy / 16) + 2;
    for (let dx = -3; dx <= 3; dx++) { st.setTileSilent(bx + dx, by, 1); for (let dy = -3; dy <= -1; dy++) st.setTileSilent(bx + dx, by + dy, 0); }
    g.scene.zoneSnow = true; g.scene.belowSurface = false; g.scene.zoneUnderworldHeight = false;
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: cfIdx, stack: 5 };
    g.tryPlace(bx, by - 1, ITEM_DEFS[cfIdx]);
    const conv = { fx: st.frameX[st.idx(bx, by - 1)], stack: inv.slots[inv.selected]?.stack };
    for (let dx = -2; dx <= 2; dx++) { st.setTileSilent(bx + dx, by - 1, 0); st.setTileSilent(bx + dx, by - 2, 0); }
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: snowIdx, stack: 5 };
    g.tryPlace(bx, by - 1, ITEM_DEFS[snowIdx]);
    const expl = { fx: st.frameX[st.idx(bx, by - 1)] };
    g.scene.zoneSnow = false;
    return { using, conv, expl, same: conv.fx === expl.fx, style: Math.floor(conv.fx / 54) };
  });
  ok(B4.using === true && B4.same && B4.style === 3, 'B4a 雪原持普通营火(解锁旗)→放置=显式雪原营火同帧(style3)', JSON.stringify(B4));

  // C3b/c:口袋加顶盖(带内全实心+口袋留 4 行空)
  const C3 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const h = st.h, w = st.w;
    const y0 = h - 180, y1 = h - 100;
    const solidFill = (xa, xb, ya, yb) => { for (let x = xa; x < xb; x++) for (let y = ya; y < yb; y++) st.setTileSilent(x, y, 1); };
    const clearPocket = (xa, xb, ya, yb) => { for (let x = xa; x < xb; x++) for (let y = ya; y < yb; y++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.setLiquid(x, y, 0, 0); } };
    // 全域清+零墙
    for (let x = 20; x < w - 20; x++) for (let y = y0 - 8; y < y1 + 4; y++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
    // 口袋 A:[250,300)×[y0-4, y1-4) 空,其余带内全实心(含顶盖 y0-8..y0)
    solidFill(40, w - 40, y0 - 8, y1);
    clearPocket(250, 300, y0 - 4, y1 - 4);
    const spotEdge = g.requestDemonConchSpot();
    const tEdge = spotEdge ? { x: Math.round(spotEdge.x / 16), y: Math.round(spotEdge.y / 16) } : null;
    // 口袋 B:海洋侧 [200,240)
    solidFill(40, w - 40, y0 - 8, y1);
    clearPocket(200, 240, y0 - 4, y1 - 4);
    const spotOcean = g.requestDemonConchSpot();
    const tOcean = spotOcean ? { x: Math.round(spotOcean.x / 16), y: Math.round(spotOcean.y / 16) } : null;
    // 清理
    for (let x = 20; x < w - 20; x++) for (let y = y0 - 8; y < y1 + 4; y++) st.setTileSilent(x, y, 0);
    return { w, band: [y0, y1], tEdge, tOcean };
  });
  ok(C3.tEdge && C3.tEdge.x >= 250 && C3.tEdge.x < 300, 'C3b 边缘袋(300 窗④臂 num-50 窗):唯一袋命中', JSON.stringify(C3.tEdge));
  ok(C3.tOcean && C3.tOcean.x >= 200 && C3.tOcean.x < 240, 'C3c 海洋侧地狱(x<380)袋命中(地狱臂无海排他)', JSON.stringify(C3.tOcean));
  const errsB = pageB.__errs.filter((e) => !e.includes('favicon'));
  ok(errsB.length === 0, 'B-ERR 页面零异常', errsB.join(' | ').slice(0, 300));
} catch (e) {
  fails.push('PART-B exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-B exception: ' + String(e).slice(0, 500));
}

console.log(`\n==== R4 SUMMARY: ${fails.length} fail ====`);
for (const f of fails) console.log('FAIL: ' + f);
await browser.close();
process.exit(fails.length ? 3 : 0);
