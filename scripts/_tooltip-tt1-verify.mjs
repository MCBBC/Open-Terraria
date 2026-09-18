// SW-TT1 验证探针：装备格右缘溢出（案①）+ 重铸格平铺背景（案②）
// 断言（每态）：
//   A. bgMismatch == 0      —— 底图固有尺寸 == 元素终布局（repeat 平铺不发生）
//   B. bubble ≥ 最长可见行  —— shrink-to-fit 未被旧 left 约束挤窄（无回弹空窗）
// 变异判别：M-A 摘「定位后烘底」→ A 红凸块；M-B 摘重铸烘底 → A 红平铺；
//           M-C 摘「清位钉」→ B 红挤窄换行。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5245';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 150)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(async () => {
  window.__M = await import('/src/data/items.ts');
  window.__probe = async () => {
    const tt = window.__swUI.tooltip;
    const out = { offsetW: tt.offsetWidth, offsetH: tt.offsetHeight,
      noRepeat: (tt.style.background || '').includes('no-repeat'),
      text: (tt.textContent ?? '').replace(/\s+/g, ' ').slice(0, 50) };
    const lines = tt.querySelector('.sw-tooltip-lines');
    if (lines) {
      // 行盒数 = inline 容器逐行 rect 数（换行/挤窄时 > BR 数+1）
      out.lineBoxes = lines.getClientRects().length;
      out.brCount = lines.querySelectorAll('br').length;
      // 自然宽参照：探针侧临时清位量测后还原（只读仪器,不动生产序）
      const oldL = tt.style.left, oldT = tt.style.top;
      tt.style.left = '0px'; tt.style.top = '0px';
      out.naturalW = tt.offsetWidth;
      tt.style.left = oldL; tt.style.top = oldT;
      const range = document.createRange();
      let seg = [], maxW = 0;
      const flush = () => {
        if (!seg.length) return;
        let w = 0;
        for (const n of seg) { range.selectNodeContents(n); w = Math.max(w, range.getBoundingClientRect().width); }
        maxW = Math.max(maxW, w); seg = [];
      };
      for (const n of lines.childNodes) {
        if (n.nodeType === 3) { seg.push(n); continue; }
        if (n.nodeType === 1) { if (n.tagName === 'BR') { flush(); continue; } seg.push(n); }
      }
      flush();
      const cs = getComputedStyle(tt);
      out.maxSegW = +maxW.toFixed(2);
      out.padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    }
    const m = /url\("data:image\/png;base64,([^"]+)"\)/.exec(tt.style.background || '');
    if (m) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + m[1];
      await img.decode();
      out.bgW = img.naturalWidth; out.bgH = img.naturalHeight;
      out.bgMismatchX = img.naturalWidth - tt.offsetWidth;
      out.bgMismatchY = img.naturalHeight - tt.offsetHeight;
    }
    return out;
  };
  window.__shotRect = () => {
    const r = window.__swUI.tooltip.getBoundingClientRect();
    return { x: Math.max(0, r.left - 40), y: Math.max(0, r.top - 40),
      width: Math.min(560, r.width + 90), height: Math.min(420, r.height + 80) };
  };
});
const assert = (st) => ({
  bgMatch: st.bgW !== undefined ? (st.bgMismatchX === 0 && st.bgMismatchY === 0) : null,
  noSqueeze: st.naturalW !== undefined
    ? (st.offsetW >= st.naturalW - 0.5 && st.lineBoxes <= st.brCount + 1) : null,
});

// ── 案①装备格：右缘窄 tooltip（铁头盔≈65px,钳到右缘）→ 重锤符文（自然 221px）
await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI, M = window.__M;
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const OPT = await import('/src/core/Options.ts');
  await OPT.options.set('showLoadoutShareHint', false);   // 关提示行,铁头盔 tooltip 才够窄
  const inv = g.player.inv;
  inv.armor[3] = { id: idOf(90), stack: 1 };    // 铁头盔（窄）
  inv.armor[4] = { id: idOf(5465), stack: 1 };  // 重锤符文（宽）
  ui.openInventory();
  ui.refreshAllNow?.();
});
await new Promise((r) => setTimeout(r, 250));
await page.evaluate(() => document.querySelector('.sw-slot[data-where="armor"][data-idx="3"]')
  ?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
await new Promise((r) => setTimeout(r, 150));
const short1 = await page.evaluate(() => window.__probe());
await page.evaluate(() => document.querySelector('.sw-slot[data-where="armor"][data-idx="4"]')
  ?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
await new Promise((r) => setTimeout(r, 150));
const ram = await page.evaluate(() => window.__probe());
console.log('CASE1:', JSON.stringify({ short: assert(short1), ram: assert(ram), ramOffsetW: ram.offsetW }));
await page.screenshot({ path: process.env.SW_SHOT1 || '/tmp/tt1-equip-after.png', clip: await page.evaluate(() => window.__shotRect()) });

// ── 案②重铸格：窄底图 → vinv 重铸槽 hover（重锤符文+词缀宽文本）
await page.evaluate(async () => {
  const g = window.__swGame, ui = window.__swUI, M = window.__M;
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  ui.hideBuffTooltip?.();
  ui.vinvReforgeOpen = true;
  ui.reforgeItem = { id: idOf(5465), stack: 1, prefix: 69 };
  ui.refreshAllNow?.();
});
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => window.__swUI.vinvReforgeSlotEl
  ?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })));
await new Promise((r) => setTimeout(r, 150));
const refg = await page.evaluate(() => window.__probe());
console.log('CASE2:', JSON.stringify({ bakedSmallW: short1.bgW, reforge: assert(refg), refOffsetW: refg.offsetW }));
await page.screenshot({ path: process.env.SW_SHOT2 || '/tmp/tt1-reforge-after.png', clip: await page.evaluate(() => window.__shotRect()) });

const ok = assert(ram).bgMatch && assert(ram).noSqueeze && assert(refg).bgMatch;
console.log('VERDICT:', JSON.stringify({ case1_ok: assert(ram).bgMatch && assert(ram).noSqueeze,
  case2_ok: assert(refg).bgMatch, all_ok: ok }));
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
