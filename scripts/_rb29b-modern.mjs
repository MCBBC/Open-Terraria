// RB29b 红队审查探针(modern 制作窗未审改动:FX41b/RB29/RB28-moderncraft),2026-09-15。
// 攻击面:
//   T  筛选条 tab × 主内衬 UIPanel 叠层序(vanilla = filter bar 后 append = 盖面板;
//      仓内 = panel 后 append → 面板顶缘 12px 是否压 tab 底带/吃命中)
//   G  向导态右键合成站 → OpenCloseFilter setFilter 臂(:946-951 向导支:SetTalkNPC(-1)+
//      InGuideCraftMenu=false+dropItemCheck)是否缺位
//   S  滚动条三分:点轨两端/柄拖拽端点钳制/0 条与 1 条 AutoHide/超满柄盒几何
//   K  详情浮层相对系×双缩放档(K≈0.846/0.513)+搜索条让位实测
//   L  lookup 三臂镜像竞态:点选→换向导料/搜索中放料/筛选切换→关窗→重开
//   B  BJ83 迁移退役:classic 存档 reload 原样/切换钮唯一写点;金标条三态像素(条顶=钮顶+17)
//   H  柄悬停音(UIScrollbar.cs:127-129 进柄 Sound 12)——现状记录
// 运行:SW_ORIGIN=http://localhost:5231 node tools/run-diag.mjs scripts/_rb29b-modern.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5231';
const fails = [];
const info = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const note = (name, extra = '') => { console.log(`INFO ${name}${extra ? '  ' + extra : ''}`); info.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

const newPage = async (vp) => {
  const page = await browser.newPage();
  if (vp) await page.setViewport(vp);
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 160)); });
  page.__errs = errs;
  await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  await sleep(500);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
  });
  await sleep(200);
  return page;
};
const rel = (page) => page.evaluate(() => {
  const root = document.querySelector('.sw-vinv');
  const tr = getComputedStyle(root).transform;
  const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
  const rr = root.getBoundingClientRect();
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: +((b.y - rr.top) / K).toFixed(1), b: +((b.bottom - rr.top) / K).toFixed(1), l: +((b.x - rr.left) / K).toFixed(1), r: +((b.right - rr.left) / K).toFixed(1), h: +((b.height) / K).toFixed(1), w: +((b.width) / K).toFixed(1) }; };
  const ui = window.__swUI;
  return {
    K,
    win: r(ui.vinvModernCraftEl), panel: r(ui.vinvModernPanelEl),
    tabs: [...ui.vinvModernFilterBtns].map((b) => { const b2 = b.getBoundingClientRect(); return { t: +((b2.y - rr.top) / K).toFixed(1), b: +((b2.bottom - rr.top) / K).toFixed(1), l: +((b2.x - rr.left) / K).toFixed(1) }; }),
    sbar: r(ui.vinvModernScrollbarEl), handle: r(ui.vinvModernScrollHandle),
    detail: r(ui.vinvModernDetailEl),
    view: ui.vinvModernViewPos,
    guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen,
    entries: ui.vinvModernEntries.length, selected: ui.vinvModernSelected ? ui.vinvModernSelected.create : null,
    search: ui.vinvModernSearch,
  };
});
const sfxArm = (page) => page.evaluate(() => {
  const g = window.__swGame;
  window.__sfxCounts = {};
  const orig = g.sfx.play.bind(g.sfx);
  window.__sfxRestore = () => { g.sfx.play = orig; };
  g.sfx.play = (k, ...a) => { window.__sfxCounts[k] = (window.__sfxCounts[k] || 0) + 1; return orig(k, ...a); };
});
const geo = (page) => page.evaluate(async () => {
  const ui = window.__swUI;
  const root = document.querySelector('.sw-vinv');
  const tr = getComputedStyle(root).transform;
  const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
  const mc = await import('/src/ui/modernCrafting.ts');
  return mc.mcraftGridGeometry(window.innerHeight / K, Math.max(1, ui.vinvModernEntries.length), ui.vinvGuideMenuOpen);
});

// ============================================================ P0:normal 开窗 + T 相(tab×panel 叠层)
const page = await newPage();
await sfxArm(page);
{
  await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    const wid = g.itemId('vi_9_Wood');
    if (wid > 0) g.player.inv.add(wid, 300);
    await ui.refreshAllAsync();
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await page.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
  await page.waitForFunction(() => {
    const p = window.__swUI.vinvModernPanelEl;
    return !!p && [...p.children].some((d) => (d.style.borderImage || '').includes('data:image'));
  }, { timeout: 15000, polling: 120 });
  await sleep(250);
  const T = await page.evaluate(() => {
    const ui = window.__swUI;
    const panel = ui.vinvModernPanelEl;
    const win = ui.vinvModernCraftEl;
    const order = [...win.children].map((c) => c === panel ? 'panel' : (ui.vinvModernFilterBtns.includes(c) ? 'tab' : 'other'));
    const firstTabIdx = order.indexOf('tab');
    const panelIdx = order.indexOf('panel');
    const hits = ui.vinvModernFilterBtns.slice(0, 3).map((b) => {
      const r = b.getBoundingClientRect();
      const mid = document.elementFromPoint(r.x + r.width / 2, r.y + 3);
      const bottom = document.elementFromPoint(r.x + r.width / 2, r.bottom - 3);
      const inWin = (el) => !!(el && (el === b || b.contains(el)));
      return {
        topHit: inWin(mid), bottomHit: inWin(bottom),
        bottomTag: bottom ? (bottom === panel ? 'PANEL' : bottom.className || bottom.tagName) : 'null',
      };
    });
    return { order: order.join(','), tabBeforePanel: firstTabIdx !== -1 && panelIdx !== -1 && firstTabIdx < panelIdx, hits };
  });
  ok(T.tabBeforePanel === false || T.hits.every((h) => h.bottomHit), 'T1 筛选条 tab 底带命中不被 panel 吃(vanilla:bar 后 append=盖面板)', JSON.stringify(T.hits));
  note('T-raw DOM 序(win.children)', `${T.order.slice(0, 60)}`);
}

// ============================================================ G 相:向导态右键合成站(setFilter 臂向导支)
let G = null;
{
  await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
  await sleep(250);
  await page.evaluate(async () => {
    const g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    if (!window.__rb29bGuide) {
      const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
      guide.home = null;
      g.entities.add(guide, 'npcs');
      window.__rb29bGuide = guide;
    }
    const guide = window.__rb29bGuide;
    guide.dead = false;
    guide.x = g.player.x + 30; guide.y = g.player.y;
    if (!g.npcDialogActive) g.openNpcDialog(guide);
    const ui = window.__swUI;
    ui.openInventory(true);   // 真实链 = onGuideCraftOpen: openInventory(true) 先行(FX23)
    ui.heldStack = null;
    ui.guidePlaced = null;
    ui.openVanillaGuideCraft();
    const wid = g.itemId('vi_9_Wood');
    ui.heldStack = { id: wid, stack: 300 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    ui.heldStack = null;
  });
  await page.waitForFunction(() => window.__swUI.vinvModernEntries.length > 0, { timeout: 15000, polling: 120 });
  await sleep(300);
  G = await page.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    return { guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen, dialog: g.npcDialogActive, entries: ui.vinvModernEntries.length, held: !!ui.heldStack };
  });
  ok(G.guide && G.modern && G.dialog && G.entries > 0, 'G0 向导态+modern 窗+条目池建立(前置换靶)', JSON.stringify(G));
  // 右键合成站(工作台 tile 16)→ InteractWithCraftingStation modern 支 → OpenCloseFilter setFilter
  const G1 = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const { tileUsedInRecipes } = await import('/src/core/SmartInteractTiles.ts');
    const has = tileUsedInRecipes().has(16);
    ui.openCraftingStationFilter({ kind: 'station', tile: 16 });
    const sync = {
      guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen, dialog: g.npcDialogActive,
      filter: ui.vinvModernCraftFilter, held: !!ui.heldStack,
    };
    await new Promise((r) => setTimeout(r, 300));
    const afterTick = {
      guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen, dialog: g.npcDialogActive,
      filter: ui.vinvModernCraftFilter, title: ui.vinvModernTitleEl?.textContent ?? null,
      entries: ui.vinvModernEntries.length,
    };
    return { tileOk: has, sync, afterTick };
  });
  note('G1 右键站点:同步态(原版 :946-951 = SetTalkNPC(-1)+InGuideCraftMenu=false+dropItemCheck+setFilter 同步)', JSON.stringify(G1.sync));
  note('G1b 右键站点一拍后(CanRemainOpen 域)', JSON.stringify(G1.afterTick));
  ok(G1.sync.dialog === false && G1.sync.guide === false, 'G1 同步态:对话收+向导退(原版向导支 1:1)', JSON.stringify(G1.sync));
  // 收拾:退回 normal
  await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
  await sleep(250);
}

// ============================================================ S 相:滚动条三分极端域
{
  await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    // 重开 normal 窗(条目=木材系,通常 <10 条=AutoHide)→ 先造超满:向导态 135 条
    const guide = window.__rb29bGuide;
    guide.dead = false;
    if (!g.npcDialogActive) g.openNpcDialog(guide);
    ui.openInventory(true);
    ui.openVanillaGuideCraft();
    const wid = g.itemId('vi_9_Wood');
    ui.heldStack = { id: wid, stack: 300 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    ui.heldStack = null;
  });
  await page.waitForFunction(() => window.__swUI.vinvModernEntries.length > 50, { timeout: 15000, polling: 120 });
  await sleep(300);
  const g0 = await geo(page);
  const R0 = await rel(page);
  ok(R0.sbar && g0.contentH > g0.list.h, 'S0 超满域滚动条显(CanScroll)', `entries=${R0.entries} contentH=${g0.contentH} listH=${g0.list.h}`);
  ok(R0.handle && (R0.handle.b - R0.handle.t) <= (R0.sbar.b - R0.sbar.t) + 0.5, 'S1 柄盒 ⊆ 轨盒(超满域)', `handle=${R0.handle.b - R0.handle.t} sbar=${R0.sbar.b - R0.sbar.t}`);
  // 点轨底端 → viewPos = max;点轨顶端 → 0
  const clickTrack = async (frac) => page.evaluate(async (frac) => {
    const ui = window.__swUI, g = window.__swGame;
    const s = ui.vinvModernScrollbarEl.getBoundingClientRect();
    const ev = new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: s.x + s.width / 2, clientY: s.y + s.height * frac });
    ui.vinvModernScrollbarEl.dispatchEvent(ev);
    await new Promise((r) => setTimeout(r, 60));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { view: ui.vinvModernViewPos, translate: ui.vinvModernGridInner.style.transform };
  }, frac);
  const sb = await clickTrack(0.98);
  const gMax = await geo(page);
  ok(Math.abs(sb.view - (gMax.contentH - gMax.list.h)) <= 1, 'S2 点轨底端 → viewPos=contentH−list.h(钳上限)', `view=${sb.view} max=${(gMax.contentH - gMax.list.h).toFixed(0)} tr=${sb.translate}`);
  const st = await clickTrack(0.02);
  ok(Math.abs(st.view) <= 1, 'S3 点轨顶端 → viewPos=0', `view=${st.view}`);
  // 柄拖拽:向下拽 3000px 钳上限;向上拽 4000px 钳 0;松手 α 回落
  const drag = await page.evaluate(async () => {
    const ui = window.__swUI;
    const h = ui.vinvModernScrollHandle.getBoundingClientRect();
    const mk = (t, y, x) => new MouseEvent(t, { bubbles: true, button: 0, clientX: x, clientY: y });
    ui.vinvModernScrollHandle.dispatchEvent(mk('mousedown', h.y + h.height / 2, h.x + h.width / 2));
    window.dispatchEvent(mk('mousemove', h.y + h.height / 2 + 3000, h.x));
    await new Promise((r) => setTimeout(r, 60));
    const maxState = { view: ui.vinvModernViewPos, op: ui.vinvModernScrollHandle.style.opacity };
    window.dispatchEvent(mk('mousemove', h.y + h.height / 2 - 4000, h.x));
    await new Promise((r) => setTimeout(r, 60));
    const minState = { view: ui.vinvModernViewPos, op: ui.vinvModernScrollHandle.style.opacity };
    window.dispatchEvent(mk('mouseup', h.y, h.x));
    await new Promise((r) => setTimeout(r, 60));
    return { maxState, minState, afterUpOp: ui.vinvModernScrollHandle.style.opacity };
  });
  const g2 = await geo(page);
  ok(Math.abs(drag.maxState.view - (g2.contentH - g2.list.h)) <= 1, 'S4 柄拖拽底端钳制', `view=${drag.maxState.view} max=${(g2.contentH - g2.list.h).toFixed(0)}`);
  ok(Math.abs(drag.minState.view) <= 1, 'S5 柄拖拽顶端钳制', `view=${drag.minState.view}`);
  ok(drag.afterUpOp === '0.85', 'S6 松手柄 α 回落 0.85(:123)', drag.afterUpOp);
  // 0 条 AutoHide:搜索 'zzzz'
  await page.evaluate(() => {
    const ui = window.__swUI;
    const inp = ui.vinvModernSearchInput;
    inp.value = 'zzzz';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);
  const Z = await rel(page);
  ok(Z.entries === 0, 'S7 搜索 zzzz → 条目 0', `entries=${Z.entries}`);
  ok(Z.sbar && (Z.sbar.h === 0 || Z.sbar.t === 0), 'S8 0 条 → 滚动条 AutoHide 隐(rect 归零)', JSON.stringify(Z.sbar));
  ok(Z.selected === null && !(Z.detail && Z.detail.h > 0), 'S9 0 条 → 选中清+详情不画(lookup 空判)', `sel=${Z.selected}`);
  // 1 条:用条目名唯一化搜索
  const one = await page.evaluate(async () => {
    const ui = window.__swUI;
    const { vanillaItemKey } = await import('/src/data/vanillaRecipes.ts');
    const { Lang } = await import('/src/i18n/Lang.ts');
    // 清搜索回满池,再挑一个名字唯一的条目
    const inp = ui.vinvModernSearchInput;
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    let picked = null;
    for (const e of ui.vinvModernEntries.slice(0, 40)) {
      const k = vanillaItemKey(e.r.create);
      const name = k ? Lang.itemNameByKey(k) : null;
      if (!name) continue;
      inp.value = name;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 60));
      if (ui.vinvModernEntries.length === 1) { picked = name; break; }
    }
    return { picked, n: ui.vinvModernEntries.length };
  });
  const O = await rel(page);
  const gOne = await geo(page);
  if (one.picked) {
    ok(one.n === 1 && O.entries === 1, 'S10 单条目域(名字唯一搜索)', `name=${one.picked} n=${one.n}`);
    ok(O.sbar && (O.sbar.h === 0 || O.sbar.t === 0), 'S11 1 条 → AutoHide 隐(contentH 44 < listH)', JSON.stringify(O.sbar));
    ok(gOne.rows === 1 && gOne.cols === 10, 'S12 单条目几何 rows=1', `rows=${gOne.rows}`);
  } else {
    note('S10 单条目域(名字唯一搜索)', '未找到唯一名条目(跳过)');
  }
  // 滚轮:格面滚 → viewPos 变;游戏域缩放不被触发(滚轮在窗内被吞)
  await page.evaluate(() => {
    const ui = window.__swUI;
    const inp = ui.vinvModernSearchInput;
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await sleep(200);
  const W = await page.evaluate(async () => {
    const ui = window.__swUI;
    const before = ui.vinvModernViewPos;
    const cell = ui.vinvModernGridList.querySelector('.sw-slot');
    cell.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 240 }));
    await new Promise((r) => setTimeout(r, 60));
    return { before, after: ui.vinvModernViewPos };
  });
  ok(W.after > W.before, 'S13 格面滚轮下滚 → viewPos 増(UIList ScrollWheel −=)', JSON.stringify(W));
  // 收拾 → normal
  await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
  await sleep(250);
}

// ============================================================ L 相:lookup 三臂镜像竞态(normal 态)
{
  await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    if (!ui.vinvModernCraftOpen) {
      const vinv = document.querySelector('.sw-vinv');
      const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    }
  });
  await page.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
  await sleep(300);
  // L1 点选 A → 换搜索排除 A → 选中存活(vanilla:lookup 全量回填不受搜索筛=SelectedEntry 存活)
  const L1 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const cell = ui.vinvModernGridList.querySelector('.sw-slot');
    if (!cell) return { err: 'no cell' };
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    const selA = ui.vinvModernSelected;
    const inp = ui.vinvModernSearchInput;
    inp.value = 'qqqq';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const s1 = { sel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null, entries: ui.vinvModernEntries.length, detail: ui.vinvModernDetailEl.style.display };
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    return { selA: selA ? selA.create : null, duringSearch: s1, afterClear: { sel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null, entries: ui.vinvModernEntries.length } };
  });
  note('L1 点选→搜索排除→清搜索', JSON.stringify(L1));
  ok(L1.duringSearch && L1.duringSearch.sel !== null, 'L1a 搜索排除期选中存活(lookup 全量回填域=原版 :604-609)', JSON.stringify(L1.duringSearch));
  // L2 筛选切换(点 tools 钮=第 9 钮)→ ResetRecipes → 选中/条目池重建;再关窗→重开 → 全清+预选回归
  const L2 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const cell = ui.vinvModernGridList.querySelector('.sw-slot');
    if (cell) cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    const before = { sel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null, n: ui.vinvModernEntries.length };
    ui.vinvModernFilterBtns[9].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));   // materials
    await new Promise((r) => setTimeout(r, 120));
    const after = { sel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null, n: ui.vinvModernEntries.length };
    // 关窗→重开(normal,toggle 左键两拍)
    ui.vinvToggleModernCraft(false);
    await new Promise((r) => setTimeout(r, 150));
    const closed = { open: ui.vinvModernCraftOpen, sel: ui.vinvModernSelected, active: ui.vinvModernActive.length, search: ui.vinvModernSearch };
    ui.vinvToggleModernCraft(false);
    await new Promise((r) => setTimeout(r, 250));
    const reopened = { open: ui.vinvModernCraftOpen, sel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null, active: ui.vinvModernActive.length, search: ui.vinvModernSearch, detail: ui.vinvModernDetailEl.style.display };
    return { before, after, closed, reopened };
  });
  note('L2 筛选切换→关窗→重开', JSON.stringify(L2));
  ok(L2.after.n <= L2.before.n, 'L2a 筛选切换后条目池重建(ResetRecipes 域)', JSON.stringify(L2.after));
  ok(L2.closed.open === false && L2.closed.sel === null && L2.closed.search === '', 'L2b 关窗 OnDeactivate:_filter/selected 清(:917-924);ActiveFilters 不清=原版同相(仅 OnActivate 清)', JSON.stringify(L2.closed));
  ok(L2.reopened.open === true && L2.reopened.active === 0 && L2.reopened.search === '', 'L2c 重开 OnActivate 搜索/激活集清(:907-915)', JSON.stringify(L2.reopened));
}

// ============================================================ L3:向导态连打(点选→取料→放料)
{
  await page.evaluate(async () => {
    const g = window.__swGame, ui = window.__swUI;
    const guide = window.__rb29bGuide;
    guide.dead = false;
    if (!g.npcDialogActive) g.openNpcDialog(guide);
    ui.openInventory(true);
    ui.openVanillaGuideCraft();
    const wid = g.itemId('vi_9_Wood');
    ui.heldStack = { id: wid, stack: 300 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    ui.heldStack = null;
  });
  await page.waitForFunction(() => window.__swUI.vinvModernEntries.length > 50, { timeout: 15000, polling: 120 });
  await sleep(250);
  const L3 = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const out = {};
    // 点选首格
    ui.vinvModernGridList.querySelector('.sw-slot').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 100));
    out.afterSelect = { sel: ui.vinvModernSelected ? ui.vinvModernSelected.create : null, detail: ui.vinvModernDetailEl.style.display, n: ui.vinvModernEntries.length };
    // 空手取料(槽→手)→ guideKey=-1 → Reset → 选中清/池清/详情收
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 100));
    out.afterTake = { sel: ui.vinvModernSelected, detail: ui.vinvModernDetailEl.style.display, n: ui.vinvModernEntries.length, req: ui.vinvGuideModernReqEl.textContent, held: !!ui.heldStack };
    // 手持同料放回(合并域:槽空→整组)
    const held = ui.heldStack;
    ui.heldStack = held;   // 保持手持
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 100));
    out.afterPlace = { sel: ui.vinvModernSelected, detail: ui.vinvModernDetailEl.style.display, n: ui.vinvModernEntries.length, held: !!ui.heldStack };
    // 搜索中放料:输入搜索→放另一料(石块)
    const inp = ui.vinvModernSearchInput;
    inp.value = '木';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    const nSearch = ui.vinvModernEntries.length;
    let sid = g.itemId('vi_3_Stone');
    if (sid <= 0) sid = g.itemId('vi_8_Torch');
    if (sid > 0) ui.heldStack = { id: sid, stack: 200 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    out.searchSwap = { nSearch, nAfter: ui.vinvModernEntries.length, sel: ui.vinvModernSelected, search: ui.vinvModernSearch, detail: ui.vinvModernDetailEl.style.display };
    out.stonePoolTotal = (() => { return undefined; })();
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 80));
    out.finalN = ui.vinvModernEntries.length;
    return out;
  });
  note('L3 向导态连打', JSON.stringify(L3));
  ok(L3.afterSelect.sel !== null && L3.afterSelect.detail === '', 'L3a 点选→详情画', JSON.stringify(L3.afterSelect));
  ok(L3.afterTake.sel === null && L3.afterTake.n === 0 && L3.afterTake.detail === 'none' && L3.afterTake.req === '', 'L3b 取料→Reset→选中/池/详情/需求行全净(:596-598+619)', JSON.stringify(L3.afterTake));
  ok(L3.afterPlace.n > 50 && L3.afterPlace.sel === null && L3.afterPlace.detail === 'none', 'L3c 放回→池重建+选中不回魂(预选仅 Open 域)', JSON.stringify(L3.afterPlace));
  ok(L3.searchSwap.sel === null && L3.searchSwap.nAfter <= L3.searchSwap.nSearch, 'L3d 搜索中换料→池按新料+搜索重建+选中空', JSON.stringify(L3.searchSwap));
  // 收拾
  await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
  await sleep(250);
}

// ============================================================ K 相:窄屏双档缩放(详情相对系+搜索条让位)
for (const vp of [{ width: 640, height: 660 }, { width: 420, height: 420 }]) {
  await page.setViewport(vp);
  await sleep(350);
  const KMeas = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    if (!ui.vinvModernCraftOpen) {
      const vinv = document.querySelector('.sw-vinv');
      const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      await new Promise((r) => setTimeout(r, 200));
    }
    await ui.refreshAllAsync();
    const root = document.querySelector('.sw-vinv');
    const tr = getComputedStyle(root).transform;
    const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
    const rr = root.getBoundingClientRect();
    const cell = ui.vinvModernGridList.querySelector('.sw-slot');
    if (cell) cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 120));
    const d = ui.vinvModernDetailEl.getBoundingClientRect();
    const slot = ui.vinvModernDetailEl.querySelector('.sw-slot')?.getBoundingClientRect();
    const panel = ui.vinvModernPanelEl;
    const row = ui.vinvModernSearchRowEl;
    const title = ui.vinvModernTitleEl;
    const pr = panel.getBoundingClientRect();
    const rowr = row.getBoundingClientRect();
    // 命中:详情槽中心 elementFromPoint(缩放下 pointer-events 面)
    const hit = slot ? !!ui.vinvModernDetailEl.contains(document.elementFromPoint(slot.x + slot.width / 2, slot.y + slot.height / 2)) : false;
    return {
      K, sh: window.innerHeight / K,
      slotState: slot ? { l: +((slot.x - rr.left) / K).toFixed(1), t: +((slot.y - rr.top) / K).toFixed(1) } : null,
      detailShown: ui.vinvModernDetailEl.style.display !== 'none' && !!slot,
      hitDetail: hit,
      searchRowRight: +((rowr.right - pr.left) / K).toFixed(1),
      searchRowLeftPanel: +((rowr.left - pr.left) / K).toFixed(1),
      titleW: title.offsetWidth,
      panelW: +((pr.width) / K).toFixed(1),
      winBottomState: ui.vinvModernCraftEl ? +((ui.vinvModernCraftEl.getBoundingClientRect().bottom - rr.top) / K).toFixed(1) : null,
      innerSh: window.innerHeight / K,
    };
  });
  const expSlot = { l: 44, t: 385 };
  ok(KMeas.slotState && Math.abs(KMeas.slotState.l - expSlot.l) <= 1.5 && Math.abs(KMeas.slotState.t - expSlot.t) <= 1.5, `K4 详情槽状态空间 (44,385) @视口${vp.width}×${vp.height} K=${KMeas.K.toFixed(3)}`, JSON.stringify(KMeas.slotState));
  ok(KMeas.hitDetail, `K5 详情槽缩放下命中(elementFromPoint) @${vp.width}×${vp.height}`);
  ok(Math.abs(KMeas.searchRowRight - 482) <= 1.5, `K6 搜索条右缘=内衬右 482(panel 系) @${vp.width}×${vp.height}`, `right=${KMeas.searchRowRight}`);
  ok(KMeas.searchRowLeftPanel >= 22 + KMeas.titleW - 1.5, `K7 搜索条左=标题外宽让位 @${vp.width}×${vp.height}`, `left=${KMeas.searchRowLeftPanel} 22+T=${22 + KMeas.titleW}`);
  note(`K-geo @${vp.width}×${vp.height}`, `sh=${KMeas.sh.toFixed(0)} winBottom=${KMeas.winBottomState} panelW=${KMeas.panelW}`);
}
await page.setViewport({ width: 1600, height: 1000 });
await sleep(300);
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); });
await sleep(200);

// ============================================================ B 相:金标条三态 + BJ83 退役面
{
  const B = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const { options } = await import('/src/core/Options.ts');
    const root = document.querySelector('.sw-vinv');
    const tr = getComputedStyle(root).transform;
    const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
    const rr = root.getBoundingClientRect();
    const barC = [...root.querySelectorAll('canvas')].find((c) => c.width === 32 && c.height === 20);
    const btn = [...root.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    const st = (el) => el ? { l: +((el.getBoundingClientRect().x - rr.left) / K).toFixed(1), t: +((el.getBoundingClientRect().y - rr.top) / K).toFixed(1), vis: el.getBoundingClientRect().width > 0 && el.offsetParent !== null } : null;
    // ① normal 态(窗关)
    const normal = { bar: st(barC), btn: st(btn) };
    // ② 向导态(窗关)——开话链首站 CloseAll 收背包(原版同相)→ 重开背包再走向导链
    const guide = window.__rb29bGuide;
    guide.dead = false;
    if (!g.npcDialogActive) g.openNpcDialog(guide);
    ui.openInventory(true);
    ui.openVanillaGuideCraft();            // 向导态+modern 窗开
    await new Promise((r) => setTimeout(r, 250));
    const guideWinOpen = { bar: st(barC), btn: st(btn) };
    ui.vinvToggleModernCraft(false);       // 窗内切换钮关窗 → 向导态窗关(切换钮回 94,300+adjY)
    await new Promise((r) => setTimeout(r, 250));
    const guideWinClosed = { bar: st(barC), btn: st(btn) };
    // ④ normal 态窗开(切换钮锚 42,285)
    g.closeNpcDialog(false);
    await new Promise((r) => setTimeout(r, 300));
    if (!ui.vinvModernCraftOpen) { ui.vinvToggleModernCraft(false); await new Promise((r) => setTimeout(r, 250)); }
    const winOpen = { bar: st(barC), btn: st(btn) };
    ui.vinvCloseModernCraft(true);
    const adjY = ui.vinvCraftAdjY(window.innerHeight / K);
    return { normal, guideWinClosed, guideWinOpen, winOpen, adjY, control: options.data.craftingGridControl, migrated: options.data.craftingGridControlMigrated ?? null };
  });
  const d = (s) => s.bar && s.btn ? +(s.bar.t - s.btn.t).toFixed(1) : null;
  ok(B.normal.bar && B.normal.bar.vis && Math.abs(d(B.normal) - 17) <= 1 && Math.abs(B.normal.bar.l - B.normal.btn.l) <= 1, 'B1 金标条 normal 态 = 钮顶+17(条顶=原版钮心 craftY)', JSON.stringify({ d: d(B.normal), bar: B.normal.bar, btn: B.normal.btn }));
  ok(B.guideWinClosed.bar && B.guideWinClosed.bar.vis && Math.abs(B.guideWinClosed.bar.t - (300 + B.adjY + 17)) <= 1.5 && Math.abs(d(B.guideWinClosed) - 17) <= 1, 'B2 金标条向导态(窗关) = (94,300+adjY+17)(RB29 向导支)', JSON.stringify({ bar: B.guideWinClosed.bar, btn: B.guideWinClosed.btn, adjY: B.adjY }));
  ok(B.guideWinOpen.bar && B.guideWinOpen.bar.vis && Math.abs(d(B.guideWinOpen) - 17) <= 1, 'B3 金标条向导态(窗开) = 窗内切换钮(42,285)+17', JSON.stringify({ d: d(B.guideWinOpen), bar: B.guideWinOpen.bar, btn: B.guideWinOpen.btn }));
  ok(B.winOpen.bar && B.winOpen.bar.vis && Math.abs(d(B.winOpen) - 17) <= 1 && Math.abs(B.winOpen.bar.l - B.winOpen.btn.l) <= 1, 'B4 金标条窗开态 = (42,285)+17', JSON.stringify({ d: d(B.winOpen), bar: B.winOpen.bar, btn: B.winOpen.btn }));
  note('B-options', `control=${B.control} migrated=${B.migrated}`);
}
await page.evaluate(() => window.__sfxRestore?.());
const errs1 = page.__errs;
await page.close();

// ============================================================ H 相:柄悬停音(现状记录,期望=缺)
{
  const p2 = await newPage();
  await sfxArm(p2);
  await p2.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    const wid = g.itemId('vi_9_Wood');
    if (wid > 0) g.player.inv.add(wid, 3000);
    await ui.refreshAllAsync();
    // 造超满:搜索清空下 normal 池太小 → 借向导态
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    if (!window.__rb29bGuide2) {
      const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
      guide.home = null;
      g.entities.add(guide, 'npcs');
      window.__rb29bGuide2 = guide;
    }
    const guide = window.__rb29bGuide2;
    guide.dead = false;
    g.openNpcDialog(guide);
    ui.openInventory(true);
    ui.openVanillaGuideCraft();
    ui.heldStack = { id: wid, stack: 300 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    ui.heldStack = null;
  });
  await p2.waitForFunction(() => window.__swUI.vinvModernEntries.length > 50, { timeout: 15000, polling: 120 });
  await sleep(250);
  const H = await p2.evaluate(async () => {
    const ui = window.__swUI;
    const h = ui.vinvModernScrollHandle.getBoundingClientRect();
    const before = { ...window.__sfxCounts };
    ui.vinvModernScrollHandle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise((r) => setTimeout(r, 150));
    const after = { ...window.__sfxCounts };
    return { tick: (after.menuTick || 0) - (before.menuTick || 0), op: ui.vinvModernScrollHandle.style.opacity };
  });
  note('H1 柄悬停音(UIScrollbar.cs:127-129 原版进柄 Sound 12)', `tick=${H.tick} α=${H.op}(仓内无音=登记候选)`);
  await p2.evaluate(() => window.__sfxRestore?.());
  await p2.close();
}

// ============================================================ BJ 相:迁移退役(classic 存档 reload 原样)
{
  const p3 = await newPage();
  await p3.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    // set() 即时落盘(仓内约定)——classic 显式写档;再清 migrated 旗(模拟 FX30 窗口期未迁移档)
    await options.set('craftingGridControl', 'classic');
    options.data.craftingGridControlMigrated = undefined;
  });
  await sleep(400);   // saveTimer 落盘窗口
  await p3.reload({ waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => window.__swGame && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(400);
  const BJ = await p3.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    return { control: options.data.craftingGridControl, migrated: options.data.craftingGridControlMigrated ?? null };
  });
  ok(BJ.control === 'classic', 'BJ1 classic 存档 reload 原样(迁移退役=不冲写)', JSON.stringify(BJ));
  ok(BJ.migrated === null || BJ.migrated === undefined, 'BJ2 migrated 旗无写点(仅历史档记账)', JSON.stringify(BJ.migrated));
  // 切换钮右键 → modern 落盘 → reload 保持 modern(唯一持久化写点)
  await p3.evaluate(() => {
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 2 }));
  });
  await sleep(900);   // saveTimer 400ms 去抖 + 余量
  await p3.reload({ waitUntil: 'domcontentloaded' });
  await p3.waitForFunction(() => window.__swGame && window.__swUI, { timeout: 280000, polling: 1000 });
  await sleep(400);
  const BJ3 = await p3.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    return options.data.craftingGridControl;
  });
  ok(BJ3 === 'modern', 'BJ3 右键切换=唯一持久化写点(reload 保持 modern)', BJ3);
  await p3.close();
}

ok(errs1.length === 0, `Z1 零页面错误(${errs1.slice(0, 2).join(' | ')})`);
await browser.close();
console.log(fails.length ? `\nRB29b FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nRB29b ALL PASS');
if (info.length) console.log('INFO 项:\n- ' + info.join('\n- '));
process.exit(fails.length ? 1 : 0);
