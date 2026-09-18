// 实报取证：装备格 hover 饰品（DeadCellsRamRune 5465 重锤符文）tooltip 气泡右侧
// 多出一截。本探针逐段量测气泡 DOM：元素宽 vs 最长可见行宽 → 找"宽被算进去但
// 没渲染"的段。产出 JSON 取证 + 修前截图。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5245';
const SHOT = process.env.SW_SHOT || '/tmp/tooltip-probe-before.png';
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
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  if (!ui) return { err: 'no ui' };
  const M = await import('/src/data/items.ts');
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const ram = idOf(5465);   // DeadCellsRamRune 重锤符文
  const inv = g.player.inv;
  inv.armor[3] = { id: ram, stack: 1 };   // 配饰位
  ui.openInventory();
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  const slotEl = document.querySelector('.sw-slot[data-where="armor"][data-idx="3"]');
  if (!slotEl) return { err: 'no slot el' };
  slotEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const tt = ui.tooltip;
  const lines = tt.querySelector('.sw-tooltip-lines');
  const cs = getComputedStyle(tt);
  const out = {
    visible: tt.style.display,
    offsetW: tt.offsetWidth, offsetH: tt.offsetHeight, clientW: tt.clientWidth,
    pad: [cs.paddingLeft, cs.paddingRight],
    maxW: cs.maxWidth, whiteSpace: cs.whiteSpace, font: cs.fontSize + '|' + cs.fontFamily,
    bgUrl: (tt.style.backgroundImage || '').slice(0, 40),
    linesRectW: lines.getBoundingClientRect().width,
    segs: [],
    stray: [],
  };
  // 逐行段量测：BR 分隔；每段（文本节点/元素混合）用 Range 量实际盒宽
  const range = document.createRange();
  let seg = [];
  const flush = () => {
    if (!seg.length) return;
    let w = 0, text = '';
    for (const n of seg) {
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      w = Math.max(w, r.width);
      text += n.textContent ?? '';
    }
    out.segs.push({ w: +w.toFixed(2), text: text.slice(0, 44) });
    seg = [];
  };
  for (const n of lines.childNodes) {
    if (n.nodeType === 3) { seg.push(n); continue; }
    if (n.nodeType === 1) {
      if (n.tagName === 'BR') { flush(); continue; }
      const d = getComputedStyle(n).display;
      out.stray.push({ tag: n.tagName, display: d, cls: n.className?.toString?.().slice(0, 30),
        w: +n.getBoundingClientRect().width.toFixed(2), text: (n.textContent ?? '').slice(0, 30) });
      seg.push(n);
    }
  }
  flush();
  out.maxSeg = out.segs.reduce((a, b) => (b.w > a.w ? b : a), { text: '', w: 0 });
  out.delta = +(out.offsetW - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - out.maxSeg.w).toFixed(2);
  out.outerHTML = tt.outerHTML.replace(/\s+/g, ' ').slice(0, 1000);
  return out;
});
console.log(JSON.stringify(res, null, 1));
// 截图：气泡 + 邻域
const shot = await page.evaluate(() => {
  const tt = window.__swUI.tooltip;
  const r = tt.getBoundingClientRect();
  return { x: Math.max(0, r.left - 60), y: Math.max(0, r.top - 60),
    width: Math.min(600, r.width + 120), height: Math.min(400, r.height + 120) };
});
await page.screenshot({ path: SHOT, clip: shot });
console.log('SHOT:', SHOT);
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
