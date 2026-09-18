// 取证二：复现用户态（共享自配装N 行）+ 气泡右缘逐行扫描（bg 不透明像素最右 x vs
// 最长可见行最右 x）→ 定位"多出一截"发生在哪几行。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5245';
const browser = await puppeteer.launch({ protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1200, height: 862, deviceScaleFactor: 2 } });
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
  const M = await import('/src/data/items.ts');
  const idOf = (vid) => M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[vid]];
  const ram = idOf(5465);
  const inv = g.player.inv;
  // 用户态：配装0 穿该件 → 切配装1 → 该槽空但共享生效（悬停=共享件代打+共享自配装1行）
  inv.armor[3] = { id: ram, stack: 1, favorited: true };   // favorited=共享源（LoadoutShare 语义）
  ui.openInventory();
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 200));
  inv.trySwitchingLoadout(1, g.player.hideVisibleAccessory);
  ui.refreshAllNow?.() ?? ui.refreshAll();
  await new Promise((r) => setTimeout(r, 300));
  const slotEl = document.querySelector('.sw-slot[data-where="armor"][data-idx="3"]');
  slotEl.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
  const tt = ui.tooltip;
  const lines = tt.querySelector('.sw-tooltip-lines');
  const out = {
    text: (tt.textContent ?? '').replace(/\s+/g, ' ').slice(0, 140),
    offsetW: tt.offsetWidth, offsetH: tt.offsetHeight,
    rect: tt.getBoundingClientRect().toJSON(),
    segs: [],
  };
  const range = document.createRange();
  let seg = [];
  const flush = () => {
    if (!seg.length) return;
    let w = 0, text = '';
    for (const n of seg) {
      range.selectNodeContents(n);
      w = Math.max(w, range.getBoundingClientRect().width);
      text += n.textContent ?? '';
    }
    out.segs.push({ w: +w.toFixed(2), text: text.slice(0, 40) });
    seg = [];
  };
  for (const n of lines.childNodes) {
    if (n.nodeType === 3) { seg.push(n); continue; }
    if (n.nodeType === 1) {
      if (n.tagName === 'BR') { flush(); continue; }
      seg.push(n);
    }
  }
  flush();
  out.maxSeg = out.segs.reduce((a, b) => (b.w > a.w ? b : a), { text: '', w: 0 });
  // 气泡右缘扫描：读 style.background dataURL → 离屏 canvas → 每行最右不透明像素
  const m = /url\("data:image\/png;base64,([^"]+)"\)/.exec(tt.style.background || '');
  if (m) {
    const img = new Image();
    img.src = 'data:image/png;base64,' + m[1];
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const rights = [];
    for (let y = 0; y < c.height; y++) {
      let rx = -1;
      for (let xx = c.width - 1; xx >= 0; xx--) {
        if (d[(y * c.width + xx) * 4 + 3] > 10) { rx = xx; break; }
      }
      rights.push(rx);
    }
    const uniq = [...new Set(rights)];
    out.bg = { w: img.width, h: img.height, rightEdgeValues: uniq, maxRight: Math.max(...rights) };
  }
  out.outerHTML = tt.outerHTML.replace(/\s+/g, ' ').slice(0, 600);
  return out;
});
console.log(JSON.stringify(res, null, 1));
// 高清截图（气泡邻域）
const shot = await page.evaluate(() => {
  const r = window.__swUI.tooltip.getBoundingClientRect();
  return { x: Math.max(0, r.left - 40), y: Math.max(0, r.top - 40),
    width: Math.min(500, r.width + 80), height: Math.min(360, r.height + 80) };
});
await page.screenshot({ path: '/tmp/tooltip-probe-shared.png', clip: shot });
console.log('SHOT: /tmp/tooltip-probe-shared.png');
if (errs.length) console.log('PAGEERRORS:', errs.slice(0, 3));
await browser.close();
