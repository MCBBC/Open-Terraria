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
ok(A.bgHasImage, 'A2 白模就绪前纯色兜底仍在(background 保留)', A.bgHasImage ? '' : JSON.stringify(A.bgHasImage));
ok(A.bgSlice.includes('12') && A.bgSlice.includes('fill'), 'A3 面板底九宫 slice 12 fill(UIPanel.cs:10-12)', A.bgSlice);
ok(A.borderSlice.includes('12') && A.borderSlice.includes('fill'), 'A4 面板边九宫 slice 12 fill', A.borderSlice);
ok(A.bgPx.every((v, i) => Math.abs(v - A.expPanel[i]) <= 1) && A.bgPx[3] === A.expPanel[3], 'A5 面板底色 = ShiftBlueToCyan((63,82,151)*0.7)*0.8(反编译链重算;±1=canvas 8bit 预乘读回量化,α=142 半透白模固有;乘色本身逐字精确=对照诊断)', `got=${A.bgPx} exp=${A.expPanel}`);
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
ok(JSON.stringify(C.px) === JSON.stringify(C.exp), 'C3 分隔线色 = ShiftBlueToCyan((89,116,213)*0.9) α0.9(反编译链重算)', `got=${C.px} exp=${C.exp}`);
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

ok(errs.length === 0, `E1 零页面错误(${errs.slice(0, 2).join(' | ')})`);
await page.close();
await browser.close();
console.log(fails.length ? `\nRB28 FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nRB28 ALL PASS');
process.exit(fails.length ? 1 : 0);
