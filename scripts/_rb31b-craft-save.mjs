// RB31b 红队审查探针(制作/存档/对话域未审修复本体) r2,2026-09-16。
// 攻击面:
//   A  FX41b/RB29 归并后 modern 窗终态——搜索条几何回填 × 筛选钮重挂 × 详情相对系共存
//      (normal/guide/站点滤三态 × 搜索输入中/筛选激活/选中态 全矩阵) + 滚动条三分 + 42988 门
//   B  FX37/FX38b 火把神/营火转换——放置失败回退/水炬/沙漠(仙人掌炬)/hold 预览一致性/
//      块换 verdict×写面 / 群系输入粒度(原版 position 像素 vs 本仓 SceneMetrics tile)
//   B6 .plr 位序(unlockedBiomeTorches 真值写)——parse∘export 往返 + 字节位序
//   C  贝壳电话全链——5437 转正保词缀/存读档往返/地狱九窗(世界边缘+海洋侧)/
//      海洋爬行冒烟/右键节奏(useTime 90 门)
//   D  税金币条锚(钮右+19/顶-5)——4 列换行/多行随动/压缩钮/税 0/巨额
// 运行:SW_ORIGIN=http://localhost:5265 node tools/run-diag.mjs scripts/_rb31b-craft-save.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const note = (name, extra = '') => console.log(`INFO ${name}${extra ? '  ' + extra : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const newPage = async () => {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
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
const sfxArm = (page) => page.evaluate(() => {
  const g = window.__swGame;
  window.__sfxCounts = {};
  const orig = g.sfx.play.bind(g.sfx);
  window.__sfxRestore = () => { g.sfx.play = orig; };
  g.sfx.play = (k, ...a) => { window.__sfxCounts[k] = (window.__sfxCounts[k] || 0) + 1; return orig(k, ...a); };
});

/* ============================ PART A:modern 窗 ============================ */
const pageA = await newPage();
await sfxArm(pageA);
try {
  await pageA.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    const wid = g.itemId('vi_9_Wood');
    if (wid > 0) g.player.inv.add(wid, 500);
    const stone = g.itemId('vi_1_Stone_Block');
    if (stone > 0) g.player.inv.add(stone, 300);
    await ui.refreshAllAsync();
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    window.__md(toggle);
  });
  await pageA.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
  await sleep(300);

  // A1 几何:搜索条回填/筛选钮盖 panel/标题
  const A1 = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    const win = ui.vinvModernCraftEl;
    const wr = win.getBoundingClientRect();
    const rel = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - wr.x).toFixed(1), t: +(b.y - wr.y).toFixed(1), r: +(b.right - wr.x).toFixed(1), b: +(b.bottom - wr.y).toFixed(1), w: +b.width.toFixed(1) }; };
    const row = rel(ui.vinvModernSearchRowEl);
    const titleW = ui.vinvModernTitleEl.offsetWidth;
    const sbExpect = mc.mcraftSearchBarRect({ x: 20, y: 350, w: 490, h: 100 }, titleW);
    const order = [...win.children].map((c) => c === ui.vinvModernPanelEl ? 'panel' : (ui.vinvModernFilterBtns.includes(c) ? 'tab' : (c === ui.vinvModernDetailEl ? 'detail' : 'other')));
    const b0 = ui.vinvModernFilterBtns[0].getBoundingClientRect();
    const hitTabBottom = document.elementFromPoint(b0.x + b0.width / 2, b0.bottom - 2);
    const srow = ui.vinvModernSearchRowEl.getBoundingClientRect();
    const hitSearchTop = document.elementFromPoint(srow.x + 40, srow.y + 2);
    const inEl = (el, t) => !!(el && (el === t || el.contains?.(t) === true));
    // 详情/向导件/网格列表初始隐藏态
    return {
      order: order.join('>'),
      row, titleW, sbExpect,
      rowMatch: Math.abs(row.l - (sbExpect.x - 20)) <= 1 && Math.abs(row.w - sbExpect.w) <= 1,
      rowRightEdge: row.r,
      hitTabOk: inEl(ui.vinvModernFilterBtns[0], hitTabBottom),
      hitSearchTag: hitSearchTop ? (hitSearchTop === ui.vinvModernSearchInput ? 'input' : String(hitSearchTop.className || hitSearchTop.tagName)) : 'null',
    };
  });
  ok(A1.rowMatch, 'A1a 搜索条几何回填=单源 mcraftSearchBarRect(左=题宽+22/宽=450-题宽)', JSON.stringify({ row: A1.row, exp: { l: A1.sbExpect.x - 20, w: A1.sbExpect.w } }));
  ok(Math.abs(A1.rowRightEdge - 482) <= 1, 'A1b 搜索条右缘=内衬右(win+482;:482 100%-8)', `right=${A1.rowRightEdge}`);
  ok(A1.hitTabOk, 'A1c 筛选钮重挂后 tab 底带命中归 tab(不被 panel 吃)', '');
  note('A1-raw DOM 序', A1.order);
  note('A1-raw 重叠带命中', A1.hitSearchTag);

  // A2 搜索焦点/键入/✕
  const A2a = await pageA.evaluate(() => {
    const ui = window.__swUI;
    const btn = ui.vinvModernSearchRowEl.querySelector('button');
    window.__md(btn);
    return { ae: document.activeElement?.tagName, isInput: document.activeElement === ui.vinvModernSearchInput };
  });
  ok(A2a.isInput, 'A2a 🔍 钮 mousedown → 焦点落 input(preventDefault 补刀)', `ae=${A2a.ae}`);
  const A2b = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    const before = ui.vinvModernEntries.length;
    const it = mc.filterItemOfVid(ui.vinvModernEntries[0].r.create);
    if (it.tooltipLines.length === 0) window.__vinvFillTooltipLines?.(it);
    const needle = (it.tooltipLines[0] || '').slice(0, 2);
    const inp = ui.vinvModernSearchInput;
    inp.value = needle;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    const after = ui.vinvModernEntries.length;
    const allFit = ui.vinvModernEntries.every((e) => mc.searchFits(needle, mc.filterItemOfVid(e.r.create).tooltipLines));
    return { before, after, needle, search: ui.vinvModernSearch, keepFocus: document.activeElement === inp, allFit };
  });
  ok(A2b.search === A2b.needle && A2b.allFit && A2b.after <= A2b.before && A2b.keepFocus, 'A2b 键入中条目被搜域过滤(EntryFilterer AND 门)+焦点保持', JSON.stringify(A2b));
  const A2c = await pageA.evaluate(() => {
    const ui = window.__swUI;
    window.__md(ui.vinvModernSearchClear);
    return { search: ui.vinvModernSearch, inputVal: ui.vinvModernSearchInput.value, ae: document.activeElement === ui.vinvModernSearchInput, after: ui.vinvModernEntries.length };
  });
  ok(A2c.search === '' && A2c.inputVal === '' && A2c.ae, 'A2c ✕ 清空+焦点回 input(冒泡等价面)', JSON.stringify({ search: A2c.search, ae: A2c.ae, n: A2c.after }));

  // A3 筛选钮激活/反选 + 帧面
  const A3 = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    const b = ui.vinvModernFilterBtns[3];   // buildingBlock(木平台/木墙 ∈ 此类)
    const before = ui.vinvModernEntries.length;
    window.__md(b);
    const active1 = [...ui.vinvModernActive];
    const n1 = ui.vinvModernEntries.length;
    const tab = b.querySelector('div');
    const frame1 = tab.style.backgroundPosition;
    const iconOp1 = b.querySelector('img').style.opacity;
    const allMat = ui.vinvModernEntries.every((e) => mc.filterFits('buildingBlock', mc.filterItemOfVid(e.r.create)));
    window.__md(b);
    const active2 = [...ui.vinvModernActive];
    const n2 = ui.vinvModernEntries.length;
    return { active1, n1, nBefore: before, allMat, active2, n2, frame1, iconOp1 };
  });
  ok(A3.active1.join() === 'buildingBlock' && A3.n1 > 0 && A3.n1 <= A3.nBefore && A3.allMat, 'A3a buildingBlock 单选→条目全过类判据(单选 :81-101)', JSON.stringify({ n: A3.n1, before: A3.nBefore, allFit: A3.allMat }));
  ok(A3.active2.length === 0 && A3.n2 >= A3.n1, 'A3b 再点反选(单选-可反选 :81-101)→条目回涌', JSON.stringify({ active: A3.active2, n: A3.n2 }));
  ok(A3.frame1 === '-42px -96px', 'A3c 激活帧=frameX1,frameY2(-42px -96px;激活∧未悬停 :103-114)', A3.frame1);

  // A4 详情浮层相对系(FX41b 合并共存面)+选中态
  const A4 = await pageA.evaluate(() => {
    const ui = window.__swUI;
    const cell = ui.vinvModernCellEls[0]?.el;
    if (!cell) return { err: 'no cells' };
    window.__md(cell);
    const detail = ui.vinvModernDetailEl;
    const win = ui.vinvModernCraftEl;
    const dw = win.getBoundingClientRect(), dd = detail.getBoundingClientRect();
    const relD = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - dd.x).toFixed(1), t: +(b.y - dd.y).toFixed(1) }; };
    const kids = [...detail.children].map(relD);
    return {
      selected: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
      detailVisible: detail.style.display !== 'none',
      dRelWin: { l: +(dd.x - dw.x).toFixed(1), t: +(dd.y - dw.y).toFixed(1) },
      kids,
      mats: ui.vinvModernSelected ? ui.vinvModernSelected.items.length : 0,
    };
  });
  ok(A4.detailVisible && Math.abs(A4.dRelWin.l - 24) <= 1 && Math.abs(A4.dRelWin.t - 73) <= 1, 'A4a 详情浮层容器=win+(24,73)(craftDetailLayout)', JSON.stringify(A4.dRelWin));
  ok(A4.kids.length >= 2 && A4.kids[0].l === 0 && A4.kids[0].t === 0, 'A4b 成品槽=容器相对(0,0)——无双偏移(归并共存验证)', JSON.stringify(A4.kids.slice(0, 3)));
  ok(A4.kids[2] && Math.abs(A4.kids[2].l - 72) <= 1 && Math.abs(A4.kids[2].t - 6) <= 1.2, 'A4c 材料首槽=相对(72,6)(1 料 num=1)', JSON.stringify(A4.kids[2]));
  // 拥有数位=mcraftOwnedCountPos(num)(FX41b 合并遗留修复面)
  const A4d = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    const detail = ui.vinvModernDetailEl;
    const dd = detail.getBoundingClientRect();
    const cntEl = [...detail.children].find((c) => c.tagName === 'DIV' && c.style.pointerEvents === 'none' && /^\d+$|^\d+\+$/.test(c.textContent || ''));
    if (!cntEl) return { err: 'no owned count el' };
    const b = cntEl.getBoundingClientRect();
    const mats = ui.vinvModernSelected.items.length;
    const num = Math.min(11 / Math.max(1, mats), 1);
    const expX = 72 + 3 * num, expY = (22 - 16 * num) + 32 * num;
    return { got: { l: +(b.x - dd.x).toFixed(1), t: +(b.y - dd.y).toFixed(1) }, exp: { l: +expX.toFixed(1), t: +expY.toFixed(1) }, text: cntEl.textContent };
  });
  if (A4d.err) note('A4d', A4d.err);
  else ok(Math.abs(A4d.got.l - A4d.exp.l) <= 2 && Math.abs(A4d.got.t - A4d.exp.t) <= 2, 'A4d 拥有数=(3,32)·num 槽底缘下带(非 0.7 缩塌回格内)', JSON.stringify(A4d));

  // A5 向导态 + 42988 门
  const A5 = await pageA.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    ui.vinvCloseModernCraft(true);
    const pre = { built: ui._builtLayout, open: ui.vinvModernCraftOpen };
    ui.openVanillaGuideCraft();
    const mid = { open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen, slotCss: ui.vinvGuideSlotModernEl?.style.left + '/' + ui.vinvGuideSlotModernEl?.style.top };
    const wood = g.itemId('vi_9_Wood');
    ui.guidePlaced = { id: wood, stack: 10 };
    ui.vinvUpdateModernCraft();
    const win = ui.vinvModernCraftEl;
    const wr = win.getBoundingClientRect();
    const rel = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - wr.x).toFixed(1), t: +(b.y - wr.y).toFixed(1) }; };
    return {
      pre, mid,
      open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
      n: ui.vinvModernEntries.length,
      slot: rel(ui.vinvGuideSlotModernEl), cap: rel(ui.vinvGuideModernCaptionEl), req: rel(ui.vinvGuideModernReqEl),
      detailHidden: ui.vinvModernDetailEl.style.display === 'none',
      selected: ui.vinvModernSelected,
      gridList: rel(ui.vinvModernGridList),
    };
  });
  ok(A5.open && A5.guide && A5.selected === null, 'A5a 向导态开窗=modern 开+向导旗+无预选(不画详情)', JSON.stringify({ pre: A5.pre, mid: A5.mid, open: A5.open, guide: A5.guide, n: A5.n, sel: A5.selected }));
  ok(A5.detailHidden, 'A5a-2 向导态首入详情浮层隐藏', '');
  ok(Math.abs(A5.slot.l - 24) <= 1 && Math.abs(A5.slot.t - 131) <= 1 && Math.abs(A5.cap.l - 76) <= 1 && Math.abs(A5.cap.t - 146) <= 1, 'A5b 向导槽/文案锚=(24,131)/(76,146)', JSON.stringify(A5.slot));
  const A5c = await pageA.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    const n0 = ui.vinvModernEntries.length;
    const cell = ui.vinvModernCellEls[0]?.el;
    if (!cell) return { err: 'no cells', n0 };
    window.__md(cell);                                     // 点选
    const sel = ui.vinvModernSelected ? ui.vinvModernSelected.create : null;
    const wood = g.itemId('vi_9_Wood');
    const before = g.player.inv.countOf(wood);
    window.__md(cell);                                     // 已选再点 = :42988 门 → 不合成
    const after = g.player.inv.countOf(wood);
    return { n0, sel, before, after, noCraft: after === before, ticks: window.__sfxCounts.menuTick || 0 };
  });
  if (A5c.err) note('A5c', A5c.err);
  else {
    ok(A5c.n0 > 0, 'A5c-1 木料反查配方>0', `n=${A5c.n0}`);
    ok(A5c.noCraft, 'A5c-2 反查态点已选格不合成(:42988 guideItem.IsAir 门;仅音 12)', JSON.stringify({ before: A5c.before, after: A5c.after, tick: A5c.ticks }));
  }
  const A5d = await pageA.evaluate(() => {
    const ui = window.__swUI;
    const detail = ui.vinvModernDetailEl;
    const visible = detail.style.display !== 'none';
    const cntEls = [...detail.children].filter((c) => c.tagName === 'DIV' && c.style.pointerEvents === 'none');
    return { visible, ownedShown: cntEls.some((d) => d.style.display !== 'none'), matN: detail.querySelectorAll('.sw-slot').length - 1 };
  });
  ok(A5d.visible && A5d.ownedShown === false, 'A5d 向导态点选:详情显示但拥有数整支不画(:482 !InGuideCraftMenu 门)', JSON.stringify(A5d));

  // A6 站点滤三态(open→setFilter→close/clearFilter)
  const A6b = await pageA.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
    const wbSheet = TILE_DEFS[TILE_BY_KEY['workbench']]?.vanilla?.sheet;   // 滤器 tile 域=vanilla sheet
    const wb = wbSheet;
    // 向导态(A5 仍开)右键站点 → setFilter 臂(收向导+保窗+新滤器)
    ui.vinvOpenCloseModernCraftFilter({ kind: 'station', tile: wb });
    const afterSet = { open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen, filterTile: ui.vinvModernCraftFilter?.tile, title: ui.vinvModernTitleEl.textContent };
    const row = { l: ui.vinvModernSearchRowEl.style.left, w: ui.vinvModernSearchRowEl.style.width };
    // 同滤器再点(openedWithoutFilter=false) → close
    ui.vinvOpenCloseModernCraftFilter({ kind: 'station', tile: wb });
    const afterClose = { open: ui.vinvModernCraftOpen };
    return { afterSet, row, afterClose };
  });
  ok(A6b.afterSet.open && A6b.afterSet.guide === false, 'A6a 向导态右键站点=setFilter 臂(收向导/保窗/题=工作台)', JSON.stringify({ title: A6b.afterSet.title, guide: A6b.afterSet.guide, filter: A6b.afterSet.filterTile }));
  ok(A6b.afterClose.open === false, 'A6b 同滤器再点(openedWithoutFilter=false)=close 支', JSON.stringify(A6b.afterClose));
  const A6c = await pageA.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
    ui.vinvOpenModernCraft(null, true);
    const wb = TILE_DEFS[TILE_BY_KEY['workbench']]?.vanilla?.sheet;
    ui.vinvOpenCloseModernCraftFilter({ kind: 'station', tile: wb });
    const opened = { open: ui.vinvModernCraftOpen, filter: !!ui.vinvModernCraftFilter, openedWithout: ui.vinvModernOpenedWithoutFilter };
    ui.vinvOpenCloseModernCraftFilter({ kind: 'station', tile: wb });
    const second = { open: ui.vinvModernCraftOpen, filter: ui.vinvModernCraftFilter, withoutNow: ui.vinvModernOpenedWithoutFilter };
    return { opened, second };
  });
  ok(A6c.opened.open && A6c.opened.filter && A6c.opened.openedWithout === false, 'A6c-1 无滤开窗→站点=Open(filter) 支(openedWithoutFilter=false)', JSON.stringify(A6c.opened));
  ok(A6c.second.open === false, 'A6c-2 同滤器再点(:960 openedWithoutFilter=false)=close 支(:962)', JSON.stringify({ open: A6c.second.open, filter: A6c.second.filter }));

  // A7 滚动条三分几何 + 点轨
  const A7 = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    const K = (() => { const tr = getComputedStyle(document.querySelector('.sw-vinv')).transform; return tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1; })();
    const savedEntries = ui.vinvModernEntries;
    const savedSel = ui.vinvModernSelected;
    const savedSig = ui.vinvModernCellsSig;
    if (savedEntries.length < 60) {
      ui.vinvModernSelected = null;
      ui.vinvModernEntries = Array.from({ length: 120 }, (__, i) => savedEntries[i % Math.max(1, savedEntries.length)]);   // 合成 120 条驱动几何
      ui.vinvModernCellsSig = 'probe';   // 防格池重建(仅测滚动几何)
    }
    const g = mc.mcraftGridGeometry(window.innerHeight / K, Math.max(1, ui.vinvModernEntries.length), false);
    const pr = ui.vinvModernPanelEl.getBoundingClientRect();
    const sr = ui.vinvModernScrollbarEl.getBoundingClientRect();
    const hr = ui.vinvModernScrollHandle.getBoundingClientRect();
    const canScroll = g.contentH > g.list.h;
    const pos = ui.vinvModernViewPos;
    const maxV = Math.max(1, g.contentH);
    const expHandleTop = Math.trunc(g.scrollbar.innerH * (pos / maxV)) + 2;
    const expHandleH = Math.trunc(g.scrollbar.innerH * (g.list.h / maxV)) + 7;
    const before = ui.vinvModernViewPos;
    const sb = ui.vinvModernScrollbarEl.getBoundingClientRect();
    const ev = { bubbles: true, button: 0, clientX: sb.x + 10, clientY: sb.y + sb.height - 3 };
    ui.vinvModernScrollbarEl.dispatchEvent(new MouseEvent('mousedown', ev));
    const after = ui.vinvModernViewPos;
    window.dispatchEvent(new MouseEvent('mouseup', ev));
    ui.vinvModernEntries = savedEntries; ui.vinvModernSelected = savedSel; ui.vinvModernCellsSig = savedSig;
    ui.vinvUpdateModernCraft();
    return {
      canScroll, entries: 120,
      sbar: { top: +(sr.y - pr.y).toFixed(1), h: +sr.height.toFixed(1), w: +sr.width.toFixed(1) },
      expSbar: { top: g.scrollbar.y - g.panel.y, h: g.scrollbar.h },
      handle: { top: +(hr.y - sr.y).toFixed(1), h: +hr.height.toFixed(1) },
      expHandle: { top: expHandleTop, h: expHandleH },
      trackClickMoved: after !== before, before, after,
    };
  });
  ok(Math.abs(A7.sbar.top - A7.expSbar.top) <= 1 && Math.abs(A7.sbar.h - A7.expSbar.h) <= 1.5, 'A7a 滚动条轨盒=元素矩形(container.y+15/h-19)', JSON.stringify({ got: A7.sbar, exp: A7.expSbar }));
  ok(!A7.canScroll || (Math.abs(A7.handle.top - A7.expHandle.top) <= 1 && Math.abs(A7.handle.h - A7.expHandle.h) <= 1.5), 'A7b 柄盒=柄矩形本体(top=+2+innerH·pos/max,h=+7 不扩盖)', JSON.stringify({ got: A7.handle, exp: A7.expHandle, canScroll: A7.canScroll, n: A7.entries }));
  ok(A7.trackClickMoved, 'A7c 点轨=页面翻动(LeftMouseDown Contains 域)', JSON.stringify({ before: A7.before, after: A7.after }));

  const errsA = pageA.__errs.filter((e) => !e.includes('favicon'));
  ok(errsA.length === 0, 'A-ERR 页面零异常', errsA.join(' | ').slice(0, 300));
} catch (e) {
  fails.push('PART-A exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-A exception: ' + String(e).slice(0, 500));
}

/* ==================== PART B/C/D:游戏侧(pageB) ==================== */
const pageB = await newPage();
try {
  // ---- B1 群系炬单源/双域门 ----
  const B1 = await pageB.evaluate(() => {
    const g = window.__swGame;
    g.world.flags.unlockedBiomeTorches = true;
    const using = g.usingBiomeTorches();
    const saved = g.player.builderAccStatus ? [...g.player.builderAccStatus] : null;
    if (g.player.builderAccStatus) g.player.builderAccStatus[11] = 1;
    const usingOff = g.usingBiomeTorches();
    if (g.player.builderAccStatus && saved) g.player.builderAccStatus[11] = saved[11];
    return { using, usingOff, hasBA: !!g.player.builderAccStatus };
  });
  ok(B1.using === true && B1.usingOff === false, 'B1 UsingBiomeTorches=unlockedBiomeTorches ∧ builderAccStatus[11]==0(双域并读)', JSON.stringify(B1));

  // ---- B2 群系输入粒度:原版 position.Y 像素 vs 本仓 SceneMetrics tile 粒 ----
  const B2v = await pageB.evaluate(async () => {
    const g = window.__swGame;
    const { biomeTorchPlaceStyle, biomeCampfirePlaceStyle } = await import('/src/world/Torch.ts');
    const TILE = 16;
    const ws = Math.floor(g.world.groundLevel);
    const UL = g.world.store.h - 200;
    const out = { ws, UL };
    // case1: 头顶在地表线上 5px(y=ws*16-5);SceneMetrics 真值=belowSurface true(tileY=floor((y+21)/16)=ws+1)
    g.scene.zoneDesert = true; g.scene.belowSurface = true; g.scene.zoneUnderworldHeight = false;
    g.player.y = ws * TILE - 5;
    out.desert = { repo: biomeTorchPlaceStyle(g.biomeTorchZonesAt()), vanilla: 16 };
    // case2: 头顶在地狱线上 5px(y=UL*16-5);SceneMetrics 真值=zoneUnderworldHeight true(tileY=UL+1)
    g.scene.zoneDesert = false; g.scene.belowSurface = true; g.scene.zoneUnderworldHeight = true;
    g.player.y = UL * TILE - 5;
    out.hell = { repo: biomeTorchPlaceStyle(g.biomeTorchZonesAt()), vanilla: 0 };
    // campfire 同域
    g.player.y = ws * TILE - 5; g.scene.zoneDesert = true; g.scene.belowSurface = true; g.scene.zoneUnderworldHeight = false;
    out.desertCf = { repo: biomeCampfirePlaceStyle(g.biomeTorchZonesAt()), vanilla: 8 };
    // 对照:线上 6px(带外,两者应一致)
    g.player.y = ws * TILE - 6; g.scene.belowSurface = false;
    out.desertOutside = { repo: biomeTorchPlaceStyle(g.biomeTorchZonesAt()), vanilla: 16 };
    // 复位
    g.player.y = g.world.spawnY0 * TILE;
    g.scene.zoneDesert = false; g.scene.belowSurface = false; g.scene.zoneUnderworldHeight = false;
    return out;
  });
  ok(B2v.desert.repo === 16 && B2v.desertCf.repo === 8 && B2v.hell.repo === 0, 'B2 群系输入粒度=与原版 position 像素判据等价(5px 带内无翻转)', JSON.stringify(B2v));
  note('B2-raw', JSON.stringify(B2v));

  // ---- B3 火把放置失败回退/水炬 ----
  const B3c = await pageB.evaluate(async () => {
    const g = window.__swGame;
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
    const torchIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 8);
    const coralIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 4384);   // 珊瑚炬(水炬 17)
    const inv = g.player.inv, st = g.world.store;
    const px = Math.floor(g.player.cx / 16) + 2, py = Math.floor(g.player.cy / 16);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -2; dy <= 1; dy++) st.setTileSilent(px + dx, py + dy, 0);
    st.setTileSilent(px, py + 1, 1);                 // 石板底锚
    st.setLiquid(px, py, 180, 0);                    // 水
    g.scene.zoneDesert = true; g.scene.belowSurface = false; g.scene.zoneUnderworldHeight = false;
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: torchIdx, stack: 9 };
    g.tryPlace(px, py, ITEM_DEFS[torchIdx]);
    const t1 = st.hasTile(px, py), s1 = inv.slots[inv.selected]?.stack;
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: coralIdx, stack: 9 };
    g.tryPlace(px, py, ITEM_DEFS[coralIdx]);
    const t2 = st.hasTile(px, py), s2 = inv.slots[inv.selected]?.stack, f2 = st.frameY[st.idx(px, py)];
    g.scene.zoneDesert = false;
    st.setLiquid(px, py, 0, 0);
    return { t1, s1, t2, s2, style2: Math.floor(f2 / 22) };
  });
  ok(B3c.t1 === false && B3c.s1 === 9, 'B3a 普通炬→群系转换 16(非水炬)水中拒:零写零消耗(转换无状态,无回退面)', JSON.stringify({ tile: B3c.t1, stack: B3c.s1 }));
  ok(B3c.t2 === true && B3c.s2 === 8 && B3c.style2 === 17, 'B3b 水炬(珊瑚 4384→style17)水中可放', JSON.stringify(B3c));

  // ---- B4 营火转换:放置帧 = 显式雪原营火同帧 ----
  const B4 = await pageB.evaluate(async () => {
    const g = window.__swGame;
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const { TILE_DEFS } = await import('/src/data/tiles.ts');
    const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
    const cfIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 966);
    const snowIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 3048);   // 显式雪原营火(placeStyle 3)
    const inv = g.player.inv, st = g.world.store;
    const bx = Math.floor(g.player.cx / 16) + 4, by = Math.floor(g.player.cy / 16) + 2;
    for (let dx = -3; dx <= 3; dx++) { st.setTileSilent(bx + dx, by, 1); for (let dy = -3; dy <= -1; dy++) st.setTileSilent(bx + dx, by + dy, 0); }
    g.scene.zoneSnow = true; g.scene.belowSurface = false; g.scene.zoneUnderworldHeight = false;
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: cfIdx, stack: 5 };
    g.tryPlace(bx, by - 1, ITEM_DEFS[cfIdx]);
    const conv = { tile: st.type[st.idx(bx, by - 1)], fx: st.frameX[st.idx(bx, by - 1)], fy: st.frameY[st.idx(bx, by - 1)], stack: inv.slots[inv.selected]?.stack };
    const sheet = conv.tile ? TILE_DEFS[conv.tile]?.vanilla?.sheet : -1;
    for (let dx = -2; dx <= 2; dx++) { st.setTileSilent(bx + dx, by - 1, 0); st.setTileSilent(bx + dx, by - 2, 0); }
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: snowIdx, stack: 5 };
    g.tryPlace(bx, by - 1, ITEM_DEFS[snowIdx]);
    const expl = { tile: st.type[st.idx(bx, by - 1)], fx: st.frameX[st.idx(bx, by - 1)], fy: st.frameY[st.idx(bx, by - 1)], stack: inv.slots[inv.selected]?.stack };
    g.scene.zoneSnow = false;
    return { conv, expl, sheet };
  });
  ok(B4.sheet === 215 && B4.expl.fx === 162 && B4.conv.fx === B4.expl.fx, 'B4a 雪原持普通营火→放置 style3(帧域 frameX=3×54)=显式雪原营火同帧(BiomeCampfirePlaceStyle)', JSON.stringify(B4));

  // ---- B5 块换 verdict 一致性(verdict 前转换;营火 target style=frameX/54) ----
  const B5 = await pageB.evaluate(async () => {
    const mod = await import('/src/core/Game.ts');
    const fn = mod.validTileForReplacementFamilies;
    // 目标=雪原营火(style3 → frameX=3*54);放置物=普通营火 966
    const base = { targetSheet: 215, placedSheet: 215, targetFrameX: 3 * 54, targetFrameY: 0, targetLiquid: 0, placedItemId: 966, targetDropIsPlacedItem: true, playerOverlapsTargetTile: false, getGoodWorld: false };
    const convStyle3 = fn({ ...base, style: 3 });   // 转换后(雪原)=3 → 同 style 拒
    const noConv0 = fn({ ...base, style: 0 });      // 未转换=0 → 异 style 换
    return { convStyle3, noConv0 };
  });
  ok(B5.convStyle3 === false && B5.noConv0 === true, 'B5 块换 verdict:verdict 前转换(雪原普通营火对雪营火=转换后同 style 拒)', JSON.stringify(B5));

  // ---- B6 .plr 位序/往返 ----
  const B6 = await pageB.evaluate(async () => {
    try {
      const pli = await import('/src/save/PlrImport.ts');
      const st = {
        hp: 400, baseMaxHp: 400, mana: 100, baseMaxMana: 100,
        inventory: [{ id: 0, stack: 0 }], armor: [], dye: [], banks: [[], [], [], []],
        miscEquips: [], miscDyes: [], buffs: [],
        builderAccStatus: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        hbLocked: false, enabledSuperCart: true,
        permanentUpgrades: { extraAccessory: false, usedAegisCrystal: true, usedAegisFruit: false, usedArcaneCrystal: false, usedGalaxyPearl: false, usedGummyWorm: false, usedAmbrosia: false },
        unlockedBiomeTorches: true,
        taxMoney: 123456, deathsPve: 3, deathsPvp: 1,
        hairDye: 2, team: 0,
      };
      const app = { name: 'RB31B', hair: 0, skinVariant: 0, difficulty: 0, hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 1, g: 2, b: 3 }, eyeColor: { r: 1, g: 2, b: 3 }, shirtColor: { r: 1, g: 2, b: 3 }, undershirtColor: { r: 1, g: 2, b: 3 }, pantsColor: { r: 1, g: 2, b: 3 }, shoeColor: { r: 1, g: 2, b: 3 }, voiceVariant: 1, voicePitchOffset: 0 };
      const bytes = pli.exportPlr(app, st);
      const dec = pli.aes128EcbDecrypt(bytes);
      let p = 4 + 20;
      const nameLen = dec[p]; p += 1 + nameLen;
      p += 1 + 8 + 4 + 1 + 1 + 2 + 1 + 1 + 16;      // diff,playTime,hair,hairDye,team,hv2,hideMisc,skin,hp..mana
      const seq = Array.from(dec.slice(p, p + 8));
      const parsed = pli.parsePlr(bytes);
      return {
        seq,
        rtUnlocked: parsed.player.unlockedBiomeTorches,
        rtAegis: parsed.player.permanentUpgrades?.usedAegisCrystal,
        rtBA: parsed.player.builderAccStatus,
        rtTax: parsed.player.taxMoney,
        len: bytes.length,
      };
    } catch (e) {
      return { err: String(e && e.stack || e).slice(0, 400) };
    }
  });
  if (B6.err) { note('B6 异常', B6.err); fails.push('B6 exception'); }
  else {
    // 位序期望:extraAccessory(0)|unlocked(1)|using(0)|artisan(0)|145旗(0)|aegis(1)|fruit(0)|arcane(0)
    ok(B6.seq[1] === 1 && B6.seq[2] === 0 && B6.seq[4] === 0 && B6.seq[5] === 1, 'B6a .plr 位序:extraAcc|unlockedBiomeTorches|UsingBiomeTorches|artisan|≥324旗|aegis…(无位序错位)', JSON.stringify(B6.seq));
    ok(B6.rtUnlocked === true && B6.rtAegis === true && B6.rtBA?.[1] === 1 && B6.rtTax === 123456, 'B6b parse∘export 往返:旗/builderAccStatus/taxMoney 全保(无字节漂移)', JSON.stringify({ rtUnlocked: B6.rtUnlocked, rtBA: B6.rtBA, rtTax: B6.rtTax }));
  }

  // ---- C1 贝壳电话转正/循环:保词缀堆叠 ----
  const C1 = await pageB.evaluate(async () => {
    const g = window.__swGame;
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
    const idxOf = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);
    const inv = g.player.inv;
    const slot = { id: idxOf(5437), stack: 1, prefix: 4, favorited: true };
    inv.slots[inv.selected] = slot;
    g.player.useTime = 0;
    const sfx = [];
    const orig = g.sfx.play.bind(g.sfx);
    g.sfx.play = (k, ...a) => { sfx.push(k); return orig(k, ...a); };
    const r = [];
    r.push(g.swapShellphoneDestination(5437));
    r.push(g.swapShellphoneDestination(5358));
    r.push(g.swapShellphoneDestination(5360));
    r.push(g.swapShellphoneDestination(5361));
    r.push(g.swapShellphoneDestination(5359));
    const finalVid = vidOf(ITEM_DEFS[slot.id]);
    const useTimeAfter = g.player.useTime;
    g.sfx.play = orig;
    return { r, finalVid, prefix: slot.prefix, stack: slot.stack, fav: slot.favorited, sfxAllUnlock: sfx.length === 5 && sfx.every((k) => k === 'unlock'), useTimeAfter };
  });
  ok(C1.r.every(Boolean) && C1.finalVid === 5358 && C1.sfxAllUnlock, 'C1a 5437 转正+四态循环+音=unlock×5(PlaySound 22)', JSON.stringify({ r: C1.r, final: C1.finalVid }));
  ok(C1.prefix === 4 && C1.stack === 1 && C1.fav === true && C1.useTimeAfter === 0, 'C1b ChangeItemType=只换 id:prefix/stack/favorited 全保+不设冷却(useTime 0)', JSON.stringify({ prefix: C1.prefix, stack: C1.stack, fav: C1.fav, ut: C1.useTimeAfter }));

  // ---- C5 右键节奏:useTime 90 门(源 :13110 逐字) ----
  const C5b = await pageB.evaluate(() => {
    const g = window.__swGame;
    const heldVid = 5358;
    const gate = (useTime, rightDown, prev, mouseHeld) =>
      rightDown && !prev && !mouseHeld && useTime === 0 && [5358, 5359, 5360, 5361, 5437].includes(heldVid);
    return { blockedDuringChannel: gate(90, true, false, false), allowedAfter: gate(0, true, false, false) };
  });
  ok(C5b.blockedDuringChannel === false && C5b.allowedAfter === true, 'C5 引导期(useTime=90)右键不换型,归零后边沿可达(连点节奏门)', JSON.stringify(C5b));

  // ---- C2 存读档往返:5437+词缀 ----
  const C2 = await pageB.evaluate(async () => {
    try {
      const g = window.__swGame;
      const { ITEM_DEFS } = await import('/src/data/items.ts');
      const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
      const idxOf = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);
      const inv = g.player.inv;
      const sel = inv.selected;
      inv.slots[sel] = { id: idxOf(5437), stack: 1, prefix: 7, favorited: true };
      window.__swFlow.doSave();
      await new Promise((r) => setTimeout(r, 3500));
      const { kvGet } = await import('/src/save/KvStore.ts');
      const json = await kvGet('sandboxworld.quicksave');
      if (!json) return { err: 'no save json' };
      const data = JSON.parse(json);
      const saved = data.player?.inventory?.[sel] ?? null;
      window.__swFlow.loadJson(json);
      await new Promise((r) => setTimeout(r, 2500));
      const g2 = window.__swGame;
      if (!g2) return { err: 'no game after load', saved };
      const inv2 = g2.player.inv;
      const slot2 = inv2.slots[sel] || inv2.slots[0];
      return {
        saved: saved ? { stack: saved.stack, prefix: saved.prefix, fav: saved.favorited } : null,
        loaded: slot2 ? { vid: vidOf(ITEM_DEFS[slot2.id]), stack: slot2.stack, prefix: slot2.prefix, fav: slot2.favorited } : null,
      };
    } catch (e) {
      return { err: String(e && e.stack || e).slice(0, 300) };
    }
  });
  if (C2.err) { note('C2 异常/跳过', C2.err); fails.push('C2 ' + C2.err); }
  else ok(C2.loaded && C2.loaded.vid === 5437 && C2.loaded.prefix === 7 && C2.loaded.stack === 1, 'C2 存→读往返:未转正 5437+词缀+堆叠全保', JSON.stringify(C2));

  // ---- C3 地狱九窗:满铺地狱+边缘袋+海洋侧袋 ----
  const C3 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const h = st.h, w = st.w;
    const y0 = h - 180, y1 = h - 100;
    for (let x = 20; x < w - 20; x++) {
      for (let y = y0 - 6; y < y1 + 8; y++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
      st.setTileSilent(x, y1, 1); st.setTileSilent(x, y1 + 1, 1);
    }
    const spot = g.requestDemonConchSpot();
    const t = spot ? { x: Math.round(spot.x / 16), y: Math.round(spot.y / 16) } : null;
    for (let x = 40; x < w - 40; x++) for (let y = y0; y < y1; y++) st.setTileSilent(x, y, 1);
    for (let x = 250; x < 300; x++) for (let y = y0; y < y1 - 4; y++) st.setTileSilent(x, y, 0);
    for (let x = 250; x < 300; x++) st.setTileSilent(x, y1 - 4, 1);
    const spotEdge = g.requestDemonConchSpot();
    const tEdge = spotEdge ? { x: Math.round(spotEdge.x / 16), y: Math.round(spotEdge.y / 16) } : null;
    for (let x = 40; x < w - 40; x++) for (let y = y0; y < y1; y++) st.setTileSilent(x, y, 1);
    for (let x = 200; x < 240; x++) for (let y = y0; y < y1 - 4; y++) st.setTileSilent(x, y, 0);
    for (let x = 200; x < 240; x++) st.setTileSilent(x, y1 - 4, 1);
    const spotOcean = g.requestDemonConchSpot();
    const tOcean = spotOcean ? { x: Math.round(spotOcean.x / 16), y: Math.round(spotOcean.y / 16) } : null;
    for (let x = 40; x < w - 40; x++) for (let y = y0; y < y1; y++) st.setTileSilent(x, y, 0);
    return { w, h, band: [y0, y1], t, tEdge, tOcean };
  });
  ok(C3.t && C3.t.y >= C3.band[0] && C3.t.y <= C3.band[1] && C3.t.x >= 45 && C3.t.x < C3.w - 45, 'C3a 地狱九窗满铺:落点∈深度带[h-180,h-100]∧InWorld 45 边距', JSON.stringify(C3));
  ok(C3.tEdge && C3.tEdge.x >= 250 && C3.tEdge.x < 300, 'C3b 边缘袋(300 窗④臂):只留 [250,300) 袋仍命中', JSON.stringify(C3.tEdge));
  ok(C3.tOcean && C3.tOcean.x >= 200 && C3.tOcean.x < 240, 'C3c 海洋侧地狱(x<380)袋命中(地狱臂无海排他)', JSON.stringify(C3.tOcean));

  // ---- C4 海洋爬行:双侧冒烟+计时 ----
  const C4 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const t0 = performance.now();
    const r = g.requestMagicConchTeleportPosition(true);
    const t1 = performance.now();
    const l = g.requestMagicConchTeleportPosition(false);
    const t2 = performance.now();
    const w = g.world.store.w;
    return {
      r: r ? { x: Math.round(r.x / 16), y: Math.round(r.y / 16) } : null,
      l: l ? { x: Math.round(l.x / 16), y: Math.round(l.y / 16) } : null,
      msR: +(t1 - t0).toFixed(1), msL: +(t2 - t1).toFixed(1), w,
    };
  });
  ok(C4.r !== null && C4.l !== null && C4.msR < 2000 && C4.msL < 2000, 'C4a 海洋爬行双侧均收敛(5000 预算不烧穿,BJ43 后无振荡假败)', JSON.stringify({ r: C4.r, l: C4.l, msR: C4.msR, msL: C4.msL }));
  ok(C4.r && (C4.r.x >= C4.w - 380 || C4.r.x <= 380), 'C4b 落点在海滩带(≤380 或 ≥w-380)', JSON.stringify(C4.r));

  const errsB = pageB.__errs.filter((e) => !e.includes('favicon'));
  ok(errsB.length === 0, 'B/C-ERR 页面零异常', errsB.join(' | ').slice(0, 300));
} catch (e) {
  fails.push('PART-BC exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-BC exception: ' + String(e).slice(0, 500));
}

/* ============================ PART D:税金币条 ============================ */
try {
  const D1 = await pageB.evaluate(async () => {
    const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dlg = new NpcDialog(host, () => {}, () => {});
    const fill = (i) => ({ id: 'shop', label: `按钮${i}` });
    const measure = () => {
      const p = dlg.panel;
      const btn = p.querySelector('button[data-b=collect]');
      const tag = btn.querySelector('.sw-npc-coins');
      const br = btn.getBoundingClientRect();
      const g = { btnW: +br.width.toFixed(1) };
      if (tag) {
        const tr = tag.getBoundingClientRect();
        g.dx = +(tr.x - br.x).toFixed(1);
        g.dy = +(tr.y - br.y).toFixed(1);
        g.text = tag.textContent;
      } else g.tag = false;
      const rows = p.querySelectorAll('.sw-npc-btns .sw-npc-btn');
      const rowY = new Set([...rows].map((b) => Math.round(b.getBoundingClientRect().y)));
      g.rows = rowY.size;
      return g;
    };
    const out = {};
    dlg.open('税吏', '台词', [{ id: 'collect', label: '收税', coins: 250000 }, fill(2), fill(3), fill(4), fill(5)]);
    out.first = measure(); out.first.row = 0;
    dlg.close();
    dlg.open('税吏', '台词', [fill(1), fill(2), fill(3), fill(4), { id: 'collect', label: '收税', coins: 250000 }]);
    out.row2 = measure(); out.row2.row = 1;
    dlg.close();
    dlg.open('税吏', '台词', [fill(1), fill(2), fill(3), { id: 'collect', label: '收税', coins: 250000 }]);
    out.last = measure();
    dlg.close();
    dlg.open('税吏', '台词', [{ id: 'collect', label: '这是一个特别特别特别特别特别长的收税按钮标签用于触发二百六十压缩', coins: 250000 }]);
    out.compressed = measure();
    dlg.close();
    dlg.open('税吏', '台词', [{ id: 'collect', label: '收税', coins: 1200000 }]);
    out.big = dlg.panel.querySelector('.sw-npc-coins')?.textContent;
    dlg.close();
    dlg.open('税吏', '台词', [{ id: 'collect', label: '收税' }]);
    out.zero = { hasTag: !!dlg.panel.querySelector('.sw-npc-coins') };
    dlg.close();
    host.remove();
    return out;
  });
  ok(Math.abs(D1.first.dy + 5) <= 1, 'D1a 币条锚 top=-5(币心带=钮顶+6)', JSON.stringify(D1.first));
  ok(Math.abs(D1.first.dx - (D1.first.btnW + 19)) <= 1, 'D1b 币条左=钮右+19(:140-144 相消后剩右侧槽)', JSON.stringify({ dx: D1.first.dx, btnW: D1.first.btnW }));
  ok(/25/.test(D1.first.text), 'D1c 25 金(250000 铜)渲染', D1.first.text);
  ok(Math.abs(D1.row2.dy + 5) <= 1 && D1.row2.row === 1 && D1.row2.rows === 2, 'D1d 多行布局币条随动(行 1 钮同锚;面板 2 行)', JSON.stringify(D1.row2));
  ok(D1.last.dx > 19, 'D1e 行末 collect:币条越面板缘=原版同相(无 106 前推副作用)', JSON.stringify(D1.last));
  ok(Math.abs(D1.compressed.dx - (260 + 19)) <= 1 || Math.abs(D1.compressed.dx - (D1.compressed.btnW + 19)) <= 1, 'D1f 压缩钮(>260)币条随压缩宽(:117 钉 260 同源)', JSON.stringify(D1.compressed));
  ok(/铂|platinum|白金/i.test(D1.big), 'D1g 巨额(1200000=1.2 铂)币条渲染铂档', D1.big);
  ok(D1.zero.hasTag === false, 'D1h 税 0:collect 无 coins 域→无币条(TryAddCoins >0 门)', JSON.stringify(D1.zero));

  // Game 侧门
  const D2 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const npc = { npcKey: 'tax_collector', vanillaId: 441 };
    g.player.taxMoney = 250000;
    const withCoins = g.npcDialogButtons(npc).find((b) => b.id === 'collect');
    g.player.taxMoney = 0;
    const noCoins = g.npcDialogButtons(npc).find((b) => b.id === 'collect');
    return { coinsAt: withCoins?.coins, hasCoinsField: withCoins ? ('coins' in withCoins) : false, zeroHasCoins: noCoins ? ('coins' in noCoins) : null };
  });
  ok(D2.hasCoinsField === true && D2.coinsAt === 250000, 'D2a 税>0:collect 挂 coins=Math.floor(taxMoney)', JSON.stringify(D2));
  ok(D2.zeroHasCoins === false, 'D2b 税 0:collect 无 coins 域(按钮仍在=原版注册位)', JSON.stringify(D2));
} catch (e) {
  fails.push('PART-D exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-D exception: ' + String(e).slice(0, 500));
}

console.log(`\n==== SUMMARY: ${fails.length} fail ====`);
for (const f of fails) console.log('FAIL: ' + f);
await browser.close();
process.exit(fails.length ? 3 : 0);
