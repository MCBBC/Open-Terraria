// FX41b 验证探针(2026-09-15 用户实报 modern 制作窗三缺陷修复后回归):
//   A 详情/向导槽与网格叠压 —— 根因1=详情浮层子件双重偏移(容器 (24,73) + 子件 win 绝对值
//     再加 (24,73));根因2=向导态陈旧选中多画 detail/需求行(原版 :619 SelectedEntry 经
//     _recipeListLookup 空判清)。断言:向导态首入(空槽/有槽未点)detail 不画;点选后
//     detail 子件落 (44,385) 系(容器相对系);四件(向导槽/文案/需求行/网格首行)零叠压。
//   B 右缘滚动条 —— 原版 = UIScrollbar Cyan 主题 Scrollbar2 细轨 + ScrollbarInner 白柄,
//     DrawBar(:96-101)三分(盖6/中4/盖6,盖越界±6);本仓旧面 = UI_Scrollbar.png 整胶囊
//     逐16px平铺(「一列粗蓝药丸」)+ VAlign=1 竖臂漏乘(偏高19px,RB28 登记)。
//   C 点配方误播滚动音 —— modern 窗开 = Main.cs:42418-42428 else 分支(DrawRecipesList →
//     AdjustRecipeOffsets)整支不画 ⇒ 吸附步进停摆;旧 rAF 无视窗态步进 = 点格播种后隐藏
//     列表滑行 N 越行 N 响(取证 20 响/900ms)。修后点格 = 恰一声选中音(HandleCraftSlot :520)。
// 运行:SW_ORIGIN=http://localhost:5229 node tools/run-diag.mjs scripts/_fx41b-modern-guide.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5229';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

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
await sleep(200);

// ---- 音效计数器(全探针期挂表) ----
await page.evaluate(() => {
  const g = window.__swGame;
  window.__sfxCounts = {};
  window.__sfxDelta = () => ({ ...window.__sfxCounts });
  const orig = g.sfx.play.bind(g.sfx);
  window.__sfxRestore = () => { g.sfx.play = orig; };
  g.sfx.play = (k, ...a) => { window.__sfxCounts[k] = (window.__sfxCounts[k] || 0) + 1; return orig(k, ...a); };
});

// ---- 几何测量助手(状态空间 = .sw-vinv 原点÷K;理论值 = mcraftGridGeometry 单源) ----
const measure = () => page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  const root = document.querySelector('.sw-vinv');
  const tr = getComputedStyle(root).transform;
  const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
  const rr = root.getBoundingClientRect();
  const rel = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { t: +((b.y - rr.top) / K).toFixed(1), b: +((b.bottom - rr.top) / K).toFixed(1), l: +((b.x - rr.left) / K).toFixed(1) }; };
  const mc = await import('/src/ui/modernCrafting.ts');
  const gg = mc.mcraftGridGeometry(window.innerHeight / K, Math.max(1, ui.vinvModernEntries.length), ui.vinvGuideMenuOpen);
  const detail = ui.vinvModernDetailEl;
  const slots = detail ? [...detail.querySelectorAll('.sw-slot')].map((s) => rel(s)) : [];
  const detailBox = rel(detail);
  return {
    K, gg,
    guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen,
    entries: ui.vinvModernEntries.length, selected: ui.vinvModernSelected ? 'set' : null,
    detailShown: !!detail && detail.style.display !== 'none' && detail.children.length > 0,
    detailDisplay: detail ? detail.style.display : null,
    detailBox, detailSlots: slots,
    slot: rel(ui.vinvGuideSlotModernEl), cap: rel(ui.vinvGuideModernCaptionEl), req: rel(ui.vinvGuideModernReqEl),
    reqText: ui.vinvGuideModernReqEl?.textContent ?? null,
    sep: rel(ui.vinvModernSeparatorEl), cell0: rel(ui.vinvModernGridList?.querySelector('.sw-slot')),
    sbar: rel(ui.vinvModernScrollbarEl), handle: ui.vinvModernScrollHandle ? rel(ui.vinvModernScrollHandle) : null,
    // ★RB29b F4(2026-09-15):轨/柄 DOM 盒 = 元素矩形/柄矩形本体,盖 ±6 绘制移内层
    //   face(firstElementChild)——贴图/三分断言改读 face,盒几何断言读本体
    sbarFace: ui.vinvModernScrollbarEl?.firstElementChild ? rel(ui.vinvModernScrollbarEl.firstElementChild) : null,
    handleFace: ui.vinvModernScrollHandle?.firstElementChild ? rel(ui.vinvModernScrollHandle.firstElementChild) : null,
    handleStyle: ui.vinvModernScrollHandle ? { top: ui.vinvModernScrollHandle.style.top, h: ui.vinvModernScrollHandle.style.height, op: ui.vinvModernScrollHandle.style.opacity } : null,
    sbarStyle: ui.vinvModernScrollbarEl ? { top: ui.vinvModernScrollbarEl.style.top, h: ui.vinvModernScrollbarEl.style.height } : null,
    trackCS: ui.vinvModernScrollbarEl?.firstElementChild ? ((cs) => ({ bi: cs.borderImageSource, slice: cs.borderImageSlice, w: cs.borderTopWidth, bw: cs.borderImageWidth }))(getComputedStyle(ui.vinvModernScrollbarEl.firstElementChild)) : null,
    handleCS: ui.vinvModernScrollHandle?.firstElementChild ? ((cs) => ({ bi: cs.borderImageSource, slice: cs.borderImageSlice, op: getComputedStyle(ui.vinvModernScrollHandle).opacity }))(getComputedStyle(ui.vinvModernScrollHandle.firstElementChild)) : null,
    glideY: ui.vinvCraftGlideY, focusV: ui.vinvCraftFocusV,
  };
});
const overlap = (a, b) => !!a && !!b && !(a.b <= b.t + 0.5 || b.b <= a.t + 0.5);

// ============================================================ 场景 N:normal 态(零回归锚 + B normal)
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  const wid = g.itemId('vi_9_Wood');
  if (wid > 0) g.player.inv.add(wid, 300);
  await ui.refreshAllAsync();
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await sleep(300);
});
await page.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
await sleep(400);
{
  const N = await measure();
  ok(N.modern && !N.guide, 'N0 normal 态开窗', `modern=${N.modern} guide=${N.guide}`);
  // A(normal):预选(:910)→ detail 画,成品槽落 (44,385) 系(容器相对系修复面)
  ok(N.detailShown, 'N1 normal 态预选 → 详情浮层画(:910 预选 + lookup 回填存活)', `display=${N.detailDisplay}`);
  const slot0 = N.detailSlots[0];
  ok(slot0 && Math.abs(slot0.t - 385) <= 1.5 && Math.abs(slot0.l - 44) <= 1.5, 'N2 详情成品槽 = origin(44,385) 状态空间映射(双重偏移摘除)', `got=(${slot0?.l},${slot0?.t}) exp=(44,385)`);
  ok(N.cell0 && !overlap(slot0, N.cell0), 'N3 详情槽 ∩ 网格首行 = 空集(normal 态零叠压)', `slot.b=${slot0?.b} cell0.t=${N.cell0?.t}`);
  // B(normal):轨 = Scrollbar2 + 三分;盒顶 = y−6;y = container.y+15(VAlign=1 竖臂)
  ok(N.trackCS.bi.includes('UI_Scrollbar2.png'), 'N4 轨贴图 = UI_Scrollbar2.png(Cyan 主题,:61-66)', N.trackCS.bi.slice(0, 80));
  ok(N.trackCS.slice.replace(/\s/g, '').startsWith('6') && N.trackCS.slice.includes('fill'), 'N5 轨三分 slice 6 0 fill(DrawBar 盖6/中4/盖6)', N.trackCS.slice);
  ok(N.handleCS.bi.includes('UI_ScrollbarInner.png'), 'N6 柄贴图 = UI_ScrollbarInner.png', N.handleCS.bi.slice(0, 80));
  ok(N.handleCS.op === '0.85', 'N7 柄 α = 0.85(:123 White*0.85)', N.handleCS.op);
  // N8/N10 轨/柄盒几何移至 G 相(向导态条目池 >100 → CanScroll 真显;normal 2 条目 = AutoHide 隐)
  ok(Math.abs(N.gg.scrollbar.y - (N.gg.container.y + 15)) < 0.01, 'N9 normal 模块面:scrollbar.y = container.y+15(VAlign=1 竖臂,19px 修)', `y=${N.gg.scrollbar.y} container.y=${N.gg.container.y}`);
}

// ============================================================ 场景 G:向导态(真实会话链)
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
await sleep(250);
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__fx41bGuide) {
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__fx41bGuide = guide;
  }
  const guide = window.__fx41bGuide;
  guide.dead = false;
  const st = g.world.store;
  const col = Math.floor(guide.cx / 16);
  let gy = Math.max(0, Math.floor((guide.y + guide.h + 2) / 16));
  let solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) { gy++; solid = st.get(col, gy) !== 0 && st.hasTile(col, gy); }
  g.player.x = guide.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  g.player.vx = 0; g.player.vy = 0;
  g.openNpcDialog(guide);
});
await sleep(300);
{
  // 会话建立(抗 NPC 游走抖动=RB28 同款):钮可见(非零 rect)才点,点后未双开则重开话重试
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    await page.evaluate(() => {
      const g = window.__swGame, guide = window.__fx41bGuide;
      guide.dead = false;
      guide.x = g.player.x + 30; guide.y = g.player.y;   // 游走回收:钳回玩家旁
      if (!g.npcDialogActive) g.openNpcDialog(guide);
    });
    await page.waitForFunction(() => {
      const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
      return !!b && b.getBoundingClientRect().width > 0;
    }, { timeout: 10000, polling: 120 });
    const craftPos = await page.evaluate(() => {
      const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
      const r = b.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(craftPos.x, craftPos.y);
    await sleep(450);
    opened = await page.evaluate(() => !!window.__swUI.vinvGuideMenuOpen && !!window.__swUI.vinvModernCraftOpen);
  }
  const G0 = await measure();
  ok(G0.guide && G0.modern, 'G0 「制作」→ 向导态+modern 窗双开(会话保持)', `guide=${G0.guide} modern=${G0.modern}`);
  // A②:向导态首入(空槽)——detail 不画(SelectedEntry null 域)
  ok(!G0.detailShown && G0.detailDisplay === 'none' && G0.selected === null, 'G1 向导态首入(空槽)= 详情浮层不画+无陈旧选中(:619 lookup 空判清)', `shown=${G0.detailShown} sel=${G0.selected}`);
  ok(G0.reqText === '', 'G2 需求行 = 空(:452-456 recipeEntry 域;经典 fallback 摘除)', JSON.stringify(G0.reqText));
  // 向导槽放木材(真实 mousedown 链)
  await page.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    const wid = g.itemId('vi_9_Wood');
    ui.heldStack = { id: wid, stack: 300 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await page.waitForFunction(() => window.__swUI.vinvModernEntries.length >= 100 && !!window.__swUI.vinvModernGridList?.querySelector('.sw-slot'), { timeout: 15000, polling: 120 });
  await sleep(400);
  const G = await measure();
  ok(G.entries >= 100, 'G3 向导槽入料 → 条目池填充(反查域全量)', `entries=${G.entries}`);
  // B(向导态,CanScroll 真显域):轨盒/柄几何(VAlign=1 双态)
  ok(G.sbar && G.gg.contentH > G.gg.list.h, 'B0 向导态滚动条显(CanScroll;内容 44×rows > 列表高)', `contentH=${G.gg.contentH} listH=${G.gg.list.h}`);
  ok(G.sbar && Math.abs(G.sbar.t - G.gg.scrollbar.y) <= 1.5 && G.sbarFace && Math.abs(G.sbarFace.t - (G.gg.scrollbar.y - 6)) <= 1.5, 'B0b 轨盒顶 = scrollbar.y(元素矩形,★RB29b F4 命中域收口)+面顶 = y−6(盖绘制)', `got=${G.sbar?.t} exp=${G.gg.scrollbar.y.toFixed(1)} face=${G.sbarFace?.t} exp=${(G.gg.scrollbar.y - 6).toFixed(1)}`);
  ok(!G.detailShown && G.selected === null, 'G4 有料未点选 = 详情浮层仍不画(原版 SelectedEntry null 域;旧=陈旧选中多画)', `shown=${G.detailShown} sel=${G.selected}`);
  ok(G.reqText === '', 'G5 需求行仍空(点选前)', JSON.stringify(G.reqText));
  // RB28b 几何四件(回归锚):分隔线/网格从向导槽行下起排
  ok(Math.abs(G.sep.t - G.gg.separator.y) <= 1 && Math.abs(G.sep.t - 492) <= 1, 'G6 分隔线顶 = inner.y+130=492 状态空间映射', `got=${G.sep?.t} exp=492`);
  ok(G.cell0 && Math.abs(G.cell0.t - 499) <= 1, 'G7 网格首行 y = 499(容器+7)', `got=${G.cell0?.t}`);
  ok(G.slot && Math.abs(G.slot.b - 495) <= 1, 'G8 向导槽底 = 495', `got=${G.slot?.b}`);
  ok(G.cell0 && G.slot && G.cell0.t >= G.slot.b - 0.5, 'G9 首行 ≥ 槽底(几何不叠)');
  // C:点首格 = 恰一声选中音(计数窗口 600ms 覆盖滑行域)
  const c1 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const before = { ...window.__sfxCounts };
    const cell = ui.vinvModernGridList.querySelector('.sw-slot');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 600));
    const after = { ...window.__sfxCounts };
    const d = (k) => (after[k] || 0) - (before[k] || 0);
    return { tick: d('menuTick'), close: d('menuClose'), open: d('menuOpen'), all: Object.fromEntries(Object.keys(after).filter((k) => d(k) !== 0).map((k) => [k, d(k)])) };
  });
  ok(c1.tick === 1, 'C1 向导态点格 = 恰一声选中音(HandleCraftSlot :520;无隐藏列表滑行音序)', JSON.stringify(c1.all));
  const G2 = await measure();
  ok(G2.detailShown, 'C2 点选后详情浮层画(recipeEntry 域)');
  // A:detail 子件几何(容器相对系 → (44,385) 系)+ 四件零叠压
  const s0 = G2.detailSlots[0];
  ok(s0 && Math.abs(s0.t - 385) <= 1.5 && Math.abs(s0.l - 44) <= 1.5, 'A1 详情成品槽 = (44,385) 状态空间映射(双重偏移摘除)', `got=(${s0?.l},${s0?.t}) exp=(44,385)`);
  const m0 = G2.detailSlots[1];
  ok(m0 && Math.abs(m0.t - 391) <= 1.5 && Math.abs(m0.l - 116) <= 1.5, 'A2 材料格[0] = (116,391) 状态空间映射(原版向量 +(72,22−16))', `got=(${m0?.l},${m0?.t}) exp=(116,391)`);
  ok(s0 && m0 && G2.cell0 && !overlap(s0, G2.cell0) && !overlap(m0, G2.cell0), 'A3 详情槽/材料格 ∩ 网格首行 = 空集(用户主诉零叠压)', `slot.b=${s0?.b} mat.b=${m0?.b} cell0.t=${G2.cell0?.t}`);
  ok(s0 && G2.slot && !overlap(s0, G2.slot), 'A4 详情槽 ∩ 向导槽 = 空集', `detail.b=${s0?.b} guideSlot.t=${G2.slot?.t}`);
  ok(s0 && G2.cap && !overlap(s0, G2.cap) && m0 && G2.cap && !overlap(m0, G2.cap), 'A5 详情块 ∩ 文案行 = 空集');
  ok(G2.reqText && G2.reqText.startsWith((await page.evaluate(async () => (await import('/src/i18n/Lang.ts')).Lang.inter(22)))), 'A6 需求行 = inter[22] 需求串(点选后画,:452-456)', JSON.stringify(G2.reqText?.slice(0, 24)));
  // A7:detail 块整体在分隔线上带(全部子件底 ≤ 分隔线顶+容差)
  const detailBottom = Math.max(...G2.detailSlots.map((s) => s.b));
  ok(detailBottom <= G2.sep.t + 1, 'A7 详情块整体位于分隔线上带(顶带域 385..459)', `detailBottom=${detailBottom.toFixed(1)} sep.t=${G2.sep.t}`);
  // B(向导态):轨盒/柄几何(VAlign=1 双态)
  ok(Math.abs(G2.gg.scrollbar.y - (G2.gg.container.y + 15)) < 0.01 && Math.abs(G2.sbar.t - G2.gg.scrollbar.y) <= 1.5, 'B1 向导态轨盒顶 = scrollbar.y(y=container.y+15=507;★RB29b F4 盒=元素矩形)', `got=${G2.sbar?.t} exp=${G2.gg.scrollbar.y.toFixed(1)}`);
  const hH2 = Math.trunc(G2.gg.scrollbar.innerH * (G2.gg.list.h / Math.max(1, G2.gg.contentH))) + 7;
  // 柄矩形(viewPos=0)= y+5+0−3 = y+2,高 = hH2(GetHandleRectangle :78-84 本体);
  //   面 = 柄矩形 ±6(盖绘制,top y−4 / 高 hH2+12)
  ok(G2.handle && Math.abs(G2.handle.t - (G2.gg.scrollbar.y + 2)) <= 1.5 && Math.abs((G2.handle.b - G2.handle.t) - hH2) <= 1.5
    && G2.handleFace && Math.abs(G2.handleFace.t - (G2.gg.scrollbar.y - 4)) <= 1.5 && Math.abs((G2.handleFace.b - G2.handleFace.t) - (hH2 + 12)) <= 1.5, 'B2 柄盒 = 柄矩形本体(★RB29b F4 命中域=Contains 域)+面 = 柄矩形 ±6(viewPos=0)', `t=${G2.handle?.t} exp=${(G2.gg.scrollbar.y + 2).toFixed(1)} h=${(G2.handle.b - G2.handle.t).toFixed(1)} exp=${hH2} faceT=${G2.handleFace?.t} faceH=${G2.handleFace ? (G2.handleFace.b - G2.handleFace.t).toFixed(1) : null}`);
  // C 补:同格再点(guidePlaced 反查态)= 仍一声音,不合成
  const c2 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const before = { ...window.__sfxCounts };
    const cell = ui.vinvModernGridList.querySelector('.sw-slot');
    cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    await new Promise((r) => setTimeout(r, 400));
    const after = { ...window.__sfxCounts };
    return { tick: (after.menuTick || 0) - (before.menuTick || 0) };
  });
  ok(c2.tick === 1, 'C3 反查态再点已选格 = 一声音 12(:42988 guideItem.IsAir 门 → else-if(flag) 臂;不合成)', `tick=${c2.tick}`);
  // 截图(对照用户原版图:制作+搜索条 → 需求行 → 向导槽+文案 → 分隔线 → 网格整面,零叠压)
  await page.screenshot({ path: '/tmp/fx41b-modern-guide.png', fullPage: false });
  console.log('截图: /tmp/fx41b-modern-guide.png');

  // ---- C 终:关窗 → PipsFastScroll 首拍瞬吸清账(1 响)+ glideY 归零 ----
  const c3 = await page.evaluate(async () => {
    const ui = window.__swUI;
    const before = { ...window.__sfxCounts };
    const glideBefore = ui.vinvCraftGlideY;
    ui.vinvCloseModernCraft(false);
    await new Promise((r) => setTimeout(r, 500));
    const after = { ...window.__sfxCounts };
    return {
      glideBefore, glideAfter: ui.vinvCraftGlideY,
      tick: (after.menuTick || 0) - (before.menuTick || 0),
      close: (after.menuClose || 0) - (before.menuClose || 0),
    };
  });
  ok(c3.close === 1 && c3.tick === 1 && c3.glideAfter === 0, 'C4 关窗 = menuClose 1+瞬吸清账 1 响(glideY→0;PipsFastScroll :871 原版同相)', JSON.stringify(c3));
}

// ============================================================ 场景 R:normal 重开零回归(RB28 F11-F13 锚)
await page.evaluate(() => { window.__swGame.closeNpcDialog(false); });
await page.waitForFunction(() => !window.__swUI.vinvGuideMenuOpen, { timeout: 10000, polling: 120 });
await sleep(300);
{
  const R = await page.evaluate(async () => {
    const ui = window.__swUI;
    if (!ui.vinvModernCraftOpen) {
      const vinv = document.querySelector('.sw-vinv');
      const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
      toggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      await new Promise((r) => setTimeout(r, 300));
    }
    const root = document.querySelector('.sw-vinv');
    const tr = getComputedStyle(root).transform;
    const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
    const rr = root.getBoundingClientRect();
    const mc = await import('/src/ui/modernCrafting.ts');
    const gg = mc.mcraftGridGeometry(window.innerHeight / K, Math.max(1, ui.vinvModernEntries.length), false);
    const sy = (v) => +(rr.top + v * K).toFixed(1);
    const sep = ui.vinvModernSeparatorEl.getBoundingClientRect();
    const list = ui.vinvModernGridList.getBoundingClientRect();
    return {
      guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen,
      containerY: gg.container.y,
      sepGot: +sep.y.toFixed(1), sepExp: sy(gg.separator.y),
      listGot: +list.y.toFixed(1), listExp: sy(gg.list.y),
      sbarExpect: gg.scrollbar.y - 350, sbarTop: ui.vinvModernScrollbarEl.style.top,
    };
  });
  ok(!R.guide && R.modern, 'R0 退向导重开 = normal 态', `guide=${R.guide} modern=${R.modern}`);
  ok(R.containerY === 439 && Math.abs(R.sepGot - R.sepExp) <= 1, 'R1 normal 容器顶回归 inner.y+77=439(零回归锚)', `sep got=${R.sepGot} exp=${R.sepExp}`);
  ok(Math.abs(R.listGot - R.listExp) <= 1, 'R2 normal 列表顶 = 446 屏映射(零回归锚)', `got=${R.listGot} exp=${R.listExp}`);
  // R3 用 style 值判(重开后 normal 域条目池回填 2 条 → AutoHide 隐,rect 恒 0):
  //   轨盒 top 写值 = scrollbar.y−panel.y = 454−350 = 104px(★RB29b F4 盒=元素矩形;
  //   与显示无关,每拍回填)
  ok(R.sbarTop === `${R.sbarExpect}px`, 'R3 normal 轨盒 style.top = 454−350=104(RB29b F4 盒=元素矩形零回归)', `got=${R.sbarTop} exp=${R.sbarExpect}px`);
}

ok(errs.length === 0, `E1 零页面错误(${errs.slice(0, 2).join(' | ')})`);
await page.evaluate(() => window.__sfxRestore?.());
await page.close();
await browser.close();
console.log(fails.length ? `\nFX41b FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nFX41b ALL PASS');
process.exit(fails.length ? 1 : 0);
