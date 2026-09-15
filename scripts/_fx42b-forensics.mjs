// FX42b 取证(只读,零源码改动):modern 窗 normal 态 搜索条/11 筛选钮/滚动条 DOM 实测。
// 运行:SW_ORIGIN=http://localhost:5237 node tools/run-diag.mjs scripts/_fx42b-forensics.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5237';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
const badResp = [];
page.on('response', (r) => { if (r.status() >= 400) badResp.push(r.status() + ' ' + r.url()); });
page.on('requestfailed', (r) => badResp.push('FAIL ' + r.url()));
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e.message).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 200)); });
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory(); });
await sleep(200);

// ---- normal 态开窗 ----
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
await sleep(500);

const measure = () => page.evaluate(() => {
  const ui = window.__swUI;
  const root = document.querySelector('.sw-vinv');
  const rr = root.getBoundingClientRect();
  const info = (el) => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return {
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      rect: { x: +(b.x - rr.left).toFixed(1), y: +(b.y - rr.top).toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) },
      offsetParent: el.offsetParent ? (el.offsetParent.className || el.offsetParent.tagName) : null,
      offsetW: el.offsetWidth, offsetH: el.offsetHeight,
      styleLeft: el.style.left || null, styleTop: el.style.top || null, styleW: el.style.width || null, styleH: el.style.height || null, styleRight: el.style.right || null,
      zIndex: cs.zIndex, pos: cs.position,
    };
  };
  const win = ui.vinvModernCraftEl, panel = ui.vinvModernPanelEl;
  const row = ui.vinvModernSearchRowEl;
  const searchBox = row ? row.children[1] : null;
  const boxBg = searchBox ? searchBox.children[0] : null;
  const boxBorder = searchBox ? searchBox.children[1] : null;
  const title = ui.vinvModernTitleEl;
  return {
    open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
    entries: ui.vinvModernEntries.length,
    win: { ...info(win), childTags: [...win.children].map((c) => c.tagName + '.' + String(c.className).split(' ')[0]).slice(0, 20) },
    panel: { ...info(panel), childCount: panel ? panel.children.length : 0 },
    title: { ...info(title), text: title?.textContent, offsetWidth: title?.offsetWidth },
    searchRow: { ...info(row), childTags: row ? [...row.children].map((c) => c.tagName + '.' + String(c.className).split(' ')[0]) : [], css: row?.style.cssText },
    searchBox: info(searchBox),
    boxBg: boxBg ? { ...info(boxBg), bg: getComputedStyle(boxBg).backgroundColor, borderImageSource: (getComputedStyle(boxBg).borderImageSource || '').slice(0, 60), border: getComputedStyle(boxBg).borderTopWidth } : null,
    boxBorder: boxBorder ? { ...info(boxBorder), borderImageSource: (getComputedStyle(boxBorder).borderImageSource || '').slice(0, 60) } : null,
    input: info(ui.vinvModernSearchInput),
    cancel: info(ui.vinvModernSearchClear),
    filterBtns: ui.vinvModernFilterBtns.map((b, i) => ({ i, parent: b.parentElement === win ? 'win' : (b.parentElement === panel ? 'panel' : (b.parentElement?.className || 'other')), ...info(b), iconOpacity: b.querySelector('img')?.style.opacity })),
    filterBtn0Tab: ui.vinvModernFilterBtns[0] ? (() => {
      const tab = ui.vinvModernFilterBtns[0].querySelector('div');
      const cs = getComputedStyle(tab);
      return { bgImage: cs.backgroundImage, bgSize: cs.backgroundSize, bgPos: cs.backgroundPosition, w: tab.offsetWidth, h: tab.offsetHeight, display: cs.display };
    })() : null,
    filterBtn0Icon: ui.vinvModernFilterBtns[0] ? (() => {
      const icon = ui.vinvModernFilterBtns[0].querySelector('img');
      const cs = getComputedStyle(icon);
      return { bgImage: cs.backgroundImage, bgSize: cs.backgroundSize, bgPos: cs.backgroundPosition, w: icon.offsetWidth, h: icon.offsetHeight, tag: icon.tagName, src: icon.src || null };
    })() : null,
    sbar: info(ui.vinvModernScrollbarEl),
    handle: ui.vinvModernScrollHandle ? { ...info(ui.vinvModernScrollHandle), faceBorderImage: (getComputedStyle(ui.vinvModernScrollHandle.children[0]).borderImageSource || '').slice(0, 60) } : null,
    sbarFace: ui.vinvModernScrollbarEl ? { borderImageSource: (getComputedStyle(ui.vinvModernScrollbarEl.children[0]).borderImageSource || '').slice(0, 60), bg: getComputedStyle(ui.vinvModernScrollbarEl.children[0]).backgroundColor } : null,
  };
});

const m1 = await measure();
console.log('=== 场景1 normal 态 DOM dump ===');
console.log(JSON.stringify(m1, null, 1));
// 命中/绘制层堆栈:筛选钮 0 中心 + 搜索条中点(elementsFromPoint,root 相对 → 页面绝对)
const stack = await page.evaluate(() => {
  const ui = window.__swUI;
  const root = document.querySelector('.sw-vinv');
  const rr = root.getBoundingClientRect();
  const at = (lx, ly) => {
    const els = document.elementsFromPoint(rr.left + lx, rr.top + ly).map((e) => {
      const cs = getComputedStyle(e);
      return e.tagName + '.' + String(e.className).split(' ').slice(0, 2).join('.') + ' z=' + cs.zIndex + ' bg=' + (cs.backgroundColor === 'rgba(0, 0, 0, 0)' ? '-' : cs.backgroundColor);
    });
    return els.slice(0, 8);
  };
  const b0 = ui.vinvModernFilterBtns[0];
  const row = ui.vinvModernSearchRowEl;
  const box = row ? row.children[1] : null;
  const r0 = b0?.getBoundingClientRect();
  const rb = box?.getBoundingClientRect();
  return {
    filterBtn0Center: r0 ? at(r0.x - rr.left + r0.width / 2, r0.y - rr.top + r0.height / 2) : null,
    searchBoxCenter: rb ? at(rb.x - rr.left + Math.min(rb.width / 2, 300), rb.y - rr.top + rb.height / 2) : null,
    imgDecode: (() => {
      const t = document.createElement('img');
      return new Promise((res) => {
        t.onload = () => res('tabs-sprite OK ' + t.naturalWidth + 'x' + t.naturalHeight);
        t.onerror = () => res('tabs-sprite ERROR');
        t.src = 'sprites/vanilla-ui/UI_Creative_Infinite_Tabs_B_2.png';
      });
    })(),
  };
});
console.log('=== 命中/绘制层堆栈 ===');
console.log(JSON.stringify(stack, null, 1));
console.log('=== bad responses ===');
console.log(badResp.slice(0, 20).join('\n') || '(none)');
await page.screenshot({ path: '/tmp/fx42b-normal.png' });
console.log('SCREENSHOT /tmp/fx42b-normal.png');

// ---- 向导态(FX41b 回归面) ----
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
await sleep(200);
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__fx42bGuide) {
    const guide = new TownNPC('guide', g.player.x + 30, g.world.groundLevel * 16 - 48);
    guide.home = null;
    g.entities.add(guide, 'npcs');
    window.__fx42bGuide = guide;
  }
  const guide = window.__fx42bGuide;
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
const craftPos = await page.evaluate(() => {
  const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (craftPos) { await page.mouse.click(craftPos.x, craftPos.y); await sleep(400); }
await page.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true && window.__swUI.vinvGuideMenuOpen === true, { timeout: 15000, polling: 120 });
await sleep(400);
// 向导槽放木材 → 条目进来
await page.evaluate(() => {
  const ui = window.__swUI, g = window.__swGame;
  const wid = g.itemId('vi_9_Wood');
  ui.heldStack = { id: wid, stack: 300 };
  ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await page.waitForFunction(() => window.__swUI.vinvModernEntries.length > 0, { timeout: 15000, polling: 120 });
await sleep(400);
const m2 = await measure();
console.log('=== 场景2 向导态(木材在槽)DOM dump(摘要) ===');
console.log(JSON.stringify({
  guide: m2.guide, open: m2.open, entries: m2.entries,
  searchRow: m2.searchRow && { rect: m2.searchRow.rect, css: m2.searchRow.css },
  title: m2.title && { text: m2.title.text, offsetWidth: m2.title.offsetWidth },
  filterBtnsVisible: m2.filterBtns.filter((b) => b.rect.w > 0).length,
  sbar: m2.sbar && m2.sbar.rect,
  win: m2.win && m2.win.rect,
  panel: m2.panel && m2.panel.rect,
}, null, 1));
await page.screenshot({ path: '/tmp/fx42b-guide.png' });

await page.close();
await browser.close();
console.log('FORENSICS DONE');
process.exit(0);
