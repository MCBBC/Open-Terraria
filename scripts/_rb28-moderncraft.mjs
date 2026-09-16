// RB28 红蓝对抗:modern 制作窗呈现面(用户实报两案)取证探针,2026-09-15。
//   案1 窗样式:①面板无 12px 黑框(= UIPanel SetPadding(12) 误植)→ 白模 9-slice
//        乘色(PanelBackground/PanelBorder,角 12);②搜索条贯通(右缘=内衬右 482、
//        左随标题让位,UpdateText :419-429)+ 盒为圆角蓝条(角 12 药丸)+✕ 内缩 2;
//        ③分隔线 = Separator1 白模乘色(89,116,213)*0.9 平移(旧=白模未染色白线);
//   案2 切换钮提示 GameUI.CraftingWindowTip zh 值中文化(custom 供键;vanilla zh 无此键)。
// 只读取证,零源码改动。运行:
//   SW_ORIGIN=http://localhost:5219 node tools/run-diag.mjs scripts/_rb28-moderncraft.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5219';
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

// ---- 给料 + 开 modern 窗(切换钮左键,FX41 场景 1 同链) ----
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
  await sleep(250);
});
// 等白模染色通道就绪(border-image data URL 上链)
await page.waitForFunction(() => {
  const p = window.__swUI.vinvModernPanelEl;
  return !!p && [...p.children].some((d) => (d.style.borderImage || '').includes('data:image'));
}, { timeout: 15000, polling: 120 });
await page.waitForFunction(() => {
  const s = window.__swUI.vinvModernSeparatorEl;
  return !!s && (s.style.borderImage || '').includes('data:image');
}, { timeout: 15000, polling: 120 });
await sleep(250);

// ============================================================ A 面板九宫
const A = await page.evaluate(async () => {
  const ui = window.__swUI;
  const panel = ui.vinvModernPanelEl;
  const cs = (el, k) => getComputedStyle(el)[k];
  const bg = panel.children[0], border = panel.children[1];
  const urlOf = (el) => /url\("?(data:[^")]+)"?\)/.exec(el.style.borderImage || '')?.[1] ?? '';
  const px = (url, x, y) => new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
      const d = cx.getImageData(x, y, 1, 1).data; res([d[0], d[1], d[2], d[3]]);
    };
    im.src = url;
  });
  const out = {
    open: ui.vinvModernCraftOpen === true,
    panelBorderWidth: cs(panel, 'borderTopWidth'),
    panelBorderStyle: cs(panel, 'borderTopStyle'),
    panelRadius: cs(panel, 'borderTopLeftRadius'),
    bgRadius: cs(bg, 'borderTopLeftRadius'),
    bgSlice: (bg.style.borderImage || '').replace(/url\("?(data:[^")]+)"?\)/, '').trim(),
    borderSlice: (border.style.borderImage || '').replace(/url\("?(data:[^")]+)"?\)/, '').trim(),
    bgPx: await px(urlOf(bg), 14, 14),
    borderPx: await px(urlOf(border), 14, 1),
    bgHasImage: (bg.style.background || '').includes('rgb'),
  };
  const mc = await import('/src/ui/modernCrafting.ts');
  const [r, g, b] = mc.shiftBlueToCyan(44, 57, 105);           // (63,82,151)*0.7(UIPanel.cs:20)
  out.expPanel = [Math.trunc(r * 0.8), Math.trunc(g * 0.8), Math.trunc(b * 0.8), Math.trunc(255 * 0.7 * 0.8)];   // ×0.8(:330)
  out.expBorder = [0, 0, 0, 204];                              // Black*0.8(:331)
  return out;
});
ok(A.open, 'A0 modern 窗开(vinvModernCraftOpen)');
ok(A.panelBorderWidth === '0px' && A.panelBorderStyle === 'none', 'A1 面板无 12px 黑框(border 0/none)', `w=${A.panelBorderWidth} s=${A.panelBorderStyle}`);
ok(!A.bgHasImage, 'A2 兜底纯色底已撤(九宫就绪即 transparent;α<1 时 background+fill 双绘 = 有效 α 1−(1−α)² 0.557→0.804 偏实,FX43)', A.bgHasImage ? 'background 仍在' : '');
ok(A.bgSlice.includes('12') && A.bgSlice.includes('fill'), 'A3 面板底九宫 slice 12 fill(UIPanel.cs:10-12)', A.bgSlice);
ok(A.borderSlice.includes('12') && A.borderSlice.includes('fill'), 'A4 面板边九宫 slice 12 fill', A.borderSlice);
// ★FX43(2026-09-16 双图实测):XNA 预乘管(UIPanel.cs:50-78 DrawPanel→SpriteBatch
//   BlendState.AlphaBlend)下 out.rgb = texel.rgb×tint(**不乘 α**)——canvas source-over
//   会把 rgb×α,故烘焙面 = tint÷α_texel 预乘补偿,α 位不变;上屏合成 = tint 全亮 +
//   dst×(1−α)。53 图原版面板自身贡献实测 (26,64,108)=tint 全亮(非 ×0.557)。
const pa = A.expPanel[3] / 255;
const expPanelBake = [0, 1, 2].map((i) => Math.round(A.expPanel[i] / pa)).concat([A.expPanel[3]]);
ok(A.bgPx.every((v, i) => Math.abs(v - expPanelBake[i]) <= 1) && A.bgPx[3] === expPanelBake[3], 'A5 面板烘焙色 = tint÷α 预乘补偿(上屏=tint 全亮+dst×(1−142/255);53 实测 P=(26,64,108)=tint 全亮,FX43;±1=canvas 8bit 预乘量化)', `got=${A.bgPx} exp=${expPanelBake}`);
ok(JSON.stringify(A.borderPx) === JSON.stringify(A.expBorder), 'A6 面板边色 = Black*0.8', `got=${A.borderPx} exp=${A.expBorder}`);

// ============================================================ B 搜索条
const B = await page.evaluate(() => {
  const ui = window.__swUI;
  const panel = ui.vinvModernPanelEl;
  const row = ui.vinvModernSearchRowEl;
  const title = ui.vinvModernTitleEl;
  const box = row.querySelector('div[style*="flex:1"], div:not([class])');
  const boxEl = [...row.children].find((d) => d.style.flex === '1') ?? row.lastElementChild;
  const input = row.querySelector('input');
  const cancel = [...row.querySelectorAll('button')].find((b) => b.querySelector('img')?.src.includes('SearchCancel'));
  const boxBg = boxEl.children[0];
  return {
    title: title.textContent,
    titleW: title.offsetWidth,
    rowLeft: row.offsetLeft, rowW: row.offsetWidth, rowH: row.offsetHeight,
    boxW: boxEl.offsetWidth, boxH: boxEl.offsetHeight,
    boxRadius: getComputedStyle(boxBg).borderTopLeftRadius,
    boxBgImg: (boxBg.style.borderImage || '').includes('data:image'),
    cancelRight: cancel.style.right,
    cancelRightEdge: cancel.offsetLeft + cancel.offsetWidth,
    inputInBox: input.offsetParent === boxEl || boxEl.contains(input),
    panelW: panel.offsetWidth,
  };
});
ok(B.title === '制作' || /制作|Craft/.test(B.title), 'B1 标题 = inter[25](无站点滤器)', B.title);
ok(B.rowLeft === 22 + B.titleW, 'B2 条左 = 标题外宽+22(UpdateText :419-429 合成)', `left=${B.rowLeft} 22+T=${22 + B.titleW}`);
ok(B.rowLeft + B.rowW === 482, 'B3 条右缘 = 内衬右(20+490−8=482 panel 系)', `right=${B.rowLeft + B.rowW}`);
ok(B.rowH === 24 && B.boxH === 24, 'B4 条/盒高 24(UIWrappedSearchBar.cs:82)', `row=${B.rowH} box=${B.boxH}`);
ok(B.boxW === B.rowW - 25, 'B5 盒宽 = 条宽−放大镜 22−缝 3(:113)', `box=${B.boxW} row-25=${B.rowW - 25}`);
ok(B.boxRadius === '12px', 'B6 盒圆角 = 角 12(UIPanel.cs:10;24 高=药丸条)', B.boxRadius);
ok(B.boxBgImg, 'B7 盒面 = 白模乘色 data URL');
ok(B.cancelRight === '2px' && B.cancelRightEdge === B.boxW - 2, 'B8 ✕ 右缘内缩 2 且在条内(:144-148)', `right=${B.cancelRight} edge=${B.cancelRightEdge}/${B.boxW}`);
ok(B.inputInBox, 'B9 搜索文本在条内');

// ============================================================ C 分隔线
const C = await page.evaluate(async () => {
  const ui = window.__swUI;
  const sep = ui.vinvModernSeparatorEl;
  const url = /url\("?(data:[^")]+)"?\)/.exec(sep.style.borderImage || '')?.[1] ?? '';
  const im = await new Promise((res) => {
    const i = new Image();
    i.onload = () => {
      const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
      const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(i, 0, 0);
      const d = cx.getImageData(0, 0, 1, 1).data; res({ size: [i.naturalWidth, i.naturalHeight], px: [d[0], d[1], d[2], d[3]] });
    };
    i.src = url;
  });
  const cs = getComputedStyle(sep);
  const mc = await import('/src/ui/modernCrafting.ts');
  const [r, g, b] = mc.shiftBlueToCyan(80, 104, 191);          // (89,116,213)*0.9(:365) XNA 截断后平移
  return {
    h: cs.height, slice: (sep.style.borderImage || '').replace(/url\("?(data:[^")]+)"?\)/, '').trim(),
    bgWhiteGone: !cs.backgroundImage || cs.backgroundImage === 'none',
    size: im.size, px: im.px,
    exp: [r, g, b, Math.trunc(255 * 0.9)],
  };
});
ok(C.h === '4px' && C.slice.includes('2'), 'C1 分隔线高 4 + 边 2 三分(Separator1/EdgeWidth 2)', `h=${C.h} slice=${C.slice}`);
ok(C.size[0] === 6 && C.size[1] === 4, 'C2 乘色贴图 = Separator1 6×4 原尺寸', JSON.stringify(C.size));
// ★FX43:烘焙面 = tint÷α 预乘补偿(同 A5;Separator1 白模 texel 255,α=229/255<1 →
//   上屏 = texel×tint + panel×(1−0.898),53 实测原版线色 (77,150,232)=tint(73,139,218)+panel×0.102)
const sa = C.exp[3] / 255;
const expSepBake = [0, 1, 2].map((i) => Math.round(C.exp[i] / sa)).concat([C.exp[3]]);
ok(JSON.stringify(C.px) === JSON.stringify(expSepBake), 'C3 分隔线烘焙色 = tint÷α 预乘补偿(上屏=texel×tint 全亮+panel×(1−α);FX43)', `got=${C.px} exp=${expSepBake}`);
ok(C.bgWhiteGone, 'C4 旧未染色白模直叠已摘(background-image none)');

// ============================================================ D 提示文案 zh(案2)
const D = await page.evaluate(async () => {
  const { Lang } = await import('/src/i18n/Lang.ts');
  const { craftingWindowTextTipKey } = await import('/src/ui/craftingGrid.ts');
  const tipModern = Lang.text('GameUI.CraftingWindowTip');
  const tipClassic = Lang.text('GameUI.CraftingWindowClassicTip');
  const keyModern = craftingWindowTextTipKey('modern');
  // 端到端:悬停切换钮 → 自有气泡文案
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  toggle.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
  await new Promise((r) => setTimeout(r, 200));
  const tooltip = window.__swUI.tooltip;
  const tipText = tooltip ? tooltip.textContent : '';
  return { tipModern, tipClassic, keyModern, tipText };
});
ok(D.keyModern === 'GameUI.CraftingWindowTip', 'D1 键选择器 modern→CraftingWindowTip', D.keyModern);
ok(D.tipModern.includes('制作窗口') && D.tipModern.includes('切换样式') && !D.tipModern.includes('Crafting Window'), 'D2 Tip zh = 「制作窗口\\n{InputTrigger} 切换样式」', JSON.stringify(D.tipModern));
ok(D.tipClassic.includes('制作窗口(经典)'), 'D3 ClassicTip zh 保持', JSON.stringify(D.tipClassic));
ok(D.tipText.includes('制作窗口') && D.tipText.includes('切换样式'), 'D4 端到端:切换钮气泡渲染 zh 文案', JSON.stringify(D.tipText.slice(0, 60)));

// ---- E 截图(对照原版) ----
await page.evaluate(() => {
  const vinv = document.querySelector('.sw-vinv');
  const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
  toggle.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
});
await sleep(150);
await page.screenshot({ path: '/tmp/fx29b-modern.png', fullPage: false });
console.log('截图: /tmp/fx29b-modern.png');

// ============================================================ F 向导态网格域
// RB28b(2026-09-15 用户实报「modern 窗向导态乱七八糟」):向导态 gridContainer
// VAlign=1 底对齐(NewCraftingUI.cs:354-360 ctor + :409-417 num=130 只改 Height
// .Pixels;UIElement.cs:322-328)→ 顶边 = inner.y+130,网格/分隔线/滚动条从向导槽
// (win-rel 24,131)+文案(76,146)/需求行(76,109)下方起排。旧式顶固定 77 = 网格压
// 向导槽。真链:真实 TownNPC 22 会话 + 「制作」DOM 钮 + 向导槽放木材。
{
  await page.evaluate(async () => {
    const { options } = await import('/src/core/Options.ts');
    if (options.data.craftingGridControl !== 'modern') await options.set('craftingGridControl', 'modern');
  });
  // 真实向导会话(fx28 spawnGuideDialog 同链:真实 TownNPC + 落地吸附 + openNpcDialog)
  const spawned = await page.evaluate(async () => {
    const g = window.__swGame;
    const { TownNPC } = await import('/src/entities/TownNPC.ts');
    if (!window.__rb28Guide) {
      const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
      guide.home = null;
      g.entities.add(guide, 'npcs');
      window.__rb28Guide = guide;
    }
    const guide = window.__rb28Guide;
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
    return { session: !!g.dialogNpc };
  });
  ok(spawned.session, 'F1 向导会话建立(真实 TownNPC+openNpcDialog)');
  // 真实鼠标点「制作」→ modern 控制模式 = NewCraftingUI.Open(quiet) + InGuideCraftMenu
  const craftPos = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (craftPos) { await page.mouse.click(craftPos.x, craftPos.y); await sleep(400); }
  const gOpen = await page.evaluate(() => {
    const ui = window.__swUI;
    return { guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen, session: !!window.__swGame.dialogNpc };
  });
  ok(gOpen.guide && gOpen.modern && gOpen.session, 'F2 「制作」→ 向导态+modern 窗双开(会话保持)', `guide=${gOpen.guide} modern=${gOpen.modern} session=${gOpen.session}`);
  // 向导槽放木材(真实 mousedown 链:heldStack → guidePlaced → 重刷条目池)
  await page.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    const wid = g.itemId('vi_9_Wood');
    ui.heldStack = { id: wid, stack: 300 };
    ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await page.waitForFunction(() => {
    const ui = window.__swUI;
    return ui.vinvModernEntries.length > 0 && !!ui.vinvModernGridList?.querySelector('.sw-slot');
  }, { timeout: 15000, polling: 120 });
  // 几何读面:期望值 = mcraftGridGeometry(sh,·,guide=true) 模块面(玻璃门:模块已被
  //   sw-fx41 vitest 金标钉死 492/499),屏坐标 = root 原点 + (逻辑−312)·K(win@(20,312))
  const F = await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    const root = document.querySelector('.sw-vinv');
    const tr = getComputedStyle(root).transform;
    const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
    const rr = root.getBoundingClientRect();
    const sh = window.innerHeight / K;
    const mc = await import('/src/ui/modernCrafting.ts');
    const gg = mc.mcraftGridGeometry(sh, ui.vinvModernEntries.length, true);
    const sx = (stateY) => rr.top + stateY * K;                  // 模块面=状态空间绝对 y(.sw-vinv 原点)
    const rectOf = (el) => el ? el.getBoundingClientRect().toJSON() : null;
    const slot = rectOf(ui.vinvGuideSlotModernEl);
    const cap = rectOf(ui.vinvGuideModernCaptionEl);
    const req = rectOf(ui.vinvGuideModernReqEl);
    const sep = rectOf(ui.vinvModernSeparatorEl);
    const list = rectOf(ui.vinvModernGridList);
    const cell = rectOf(ui.vinvModernGridList.querySelector('.sw-slot'));
    const hit = (a, b) => !(a.right <= b.left + 0.5 || b.right <= a.left + 0.5 || a.bottom <= b.top + 0.5 || b.bottom <= a.top + 0.5);
    return {
      K, sh,
      expContainerY: gg.container.y, expInnerY: gg.inner.y, expStartY: gg.startY, expListY: gg.list.y,
      sepTop: sep ? +sep.y.toFixed(1) : null, expSepTop: +sx(gg.separator.y).toFixed(1),
      listTop: list ? +list.y.toFixed(1) : null, expListTop: +sx(gg.list.y).toFixed(1),
      cellTop: cell ? +cell.y.toFixed(1) : null, expCellTop: +sx(gg.startY).toFixed(1),
      slotBottom: slot ? +slot.bottom.toFixed(1) : null, expSlotBottom: +sx(312 + 131 + 52).toFixed(1),   // 槽=win@(20,312)+win-rel(24,131)+52
      capRect: cap ? { t: +cap.y.toFixed(1), b: +cap.bottom.toFixed(1) } : null,
      reqRect: req ? { t: +req.y.toFixed(1), b: +req.bottom.toFixed(1) } : null,
      cellHitSlot: cell && slot ? hit(cell, slot) : null,
      cellHitCap: cell && cap ? hit(cell, cap) : null,
      cellHitReq: cell && req ? hit(cell, req) : null,
      sepHitSlot: sep && slot ? hit(sep, slot) : null,
      sepZUnder: sep && slot ? true : null,                 // 槽在 DOM 后=覆盖分隔线(原版 DrawChildren 序)
      entries: ui.vinvModernEntries.length,
    };
  });
  ok(F.expContainerY === F.expInnerY + 130, `F3 模块面:向导态容器顶 = inner.y+130=${F.expContainerY}(底对齐 VAlign=1)`, `innerY=${F.expInnerY}`);
  ok(Math.abs(F.sepTop - F.expSepTop) <= 1, `F4 分隔线顶=容器顶(inner.y+130 屏映射)`, `got=${F.sepTop} exp=${F.expSepTop}`);
  ok(Math.abs(F.listTop - F.expListTop) <= 1, `F5 网格列表顶 = 容器+7`, `got=${F.listTop} exp=${F.expListTop}`);
  ok(Math.abs(F.cellTop - F.expCellTop) <= 1, `F6 网格首行 y = startY=${F.expStartY}(逻辑;=内衬 362+130+7 下方)`, `got=${F.cellTop} exp=${F.expCellTop}`);
  ok(F.cellTop >= F.slotBottom - 0.5, `F7 首行与向导槽零交叠(首行 ${F.cellTop} ≥ 槽底 ${F.slotBottom})`);
  ok(F.cellHitSlot === false, 'F8 首行矩形 ∩ 向导槽矩形 = 空集');
  ok(F.cellHitCap === false && F.cellHitReq === false, 'F9 首行 ∩ 文案/需求行 = 空集', `cap=${F.cellHitCap} req=${F.cellHitReq}`);
  ok(F.sepHitSlot === true, 'F10 分隔线与槽几何相接(492..496 ⊃ 495)=原版同相,槽 DOM 后画覆盖(:441 DrawChildren 序)');
  // 向导态对照截图(对照用户原版图)
  await page.screenshot({ path: '/tmp/fx40b-modern-guide.png', fullPage: false });
  console.log('截图: /tmp/fx40b-modern-guide.png');
  // G:退向导 → normal 态几何零回归(=预修值 439/446)
  await page.evaluate(() => { window.__swGame.closeNpcDialog(false); });
  await page.waitForFunction(() => !window.__swUI.vinvGuideMenuOpen, { timeout: 10000, polling: 120 });
  await sleep(300);
  const reopened = await page.evaluate(async () => {
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
    const gg = mc.mcraftGridGeometry(window.innerHeight / K, ui.vinvModernEntries.length, false);
    const sep = ui.vinvModernSeparatorEl.getBoundingClientRect();
    const list = ui.vinvModernGridList.getBoundingClientRect();
    return {
      guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen,
      expSep: +(rr.top + gg.separator.y * K).toFixed(1),
      gotSep: +sep.y.toFixed(1),
      expList: +(rr.top + gg.list.y * K).toFixed(1),
      gotList: +list.y.toFixed(1),
      containerY: gg.container.y,
    };
  });
  ok(!reopened.guide && reopened.modern, 'F11 退向导重开 = normal 态(guide=false,modern 窗开)', `guide=${reopened.guide} modern=${reopened.modern}`);
  ok(reopened.containerY === 439 && Math.abs(reopened.gotSep - reopened.expSep) <= 1, `F12 normal 态容器顶回归 inner.y+77=${reopened.containerY}(零回归锚)`, `sep got=${reopened.gotSep} exp=${reopened.expSep}`);
  ok(Math.abs(reopened.gotList - reopened.expList) <= 1, 'F13 normal 态列表顶 = 446 屏映射(零回归锚)', `got=${reopened.gotList} exp=${reopened.expList}`);
}

ok(errs.length === 0, `E1 零页面错误(${errs.slice(0, 2).join(' | ')})`);
await page.close();
await browser.close();
console.log(fails.length ? `\nRB28 FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nRB28 ALL PASS');
process.exit(fails.length ? 1 : 0);
