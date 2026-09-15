// FX41b 取证(只读,零源码改动):modern 窗向导态/常规态 详情浮层+向导槽+网格 几何实测。
// 运行:SW_ORIGIN=http://localhost:5229 node tools/run-diag.mjs scripts/_fx41b-forensics.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5229';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.stack || e.message).slice(0, 200)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory(); });
await sleep(200);

const measure = () => page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  const root = document.querySelector('.sw-vinv');
  const tr = getComputedStyle(root).transform;
  const K = tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1;
  const rr = root.getBoundingClientRect();
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: +(b.y - rr.top).toFixed(1), bottom: +(b.bottom - rr.top).toFixed(1), left: +(b.x - rr.left).toFixed(1) }; };
  const detail = ui.vinvModernDetailEl;
  const detailSlots = detail ? [...detail.querySelectorAll('.sw-slot')].map((s) => ({ ...r(s), k: (s.querySelector('img')?.src || '').split('/').pop() })) : [];
  const mc = await import('/src/ui/modernCrafting.ts');
  const gg = mc.mcraftGridGeometry(window.innerHeight / K, Math.max(1, ui.vinvModernEntries.length), ui.vinvGuideMenuOpen);
  return {
    guide: ui.vinvGuideMenuOpen, modern: ui.vinvModernCraftOpen, K,
    detailContainer: detail ? { left: parseFloat(detail.style.left), top: parseFloat(detail.style.top), display: detail.style.display } : null,
    detailSlots,
    hammer: detail ? r(detail.querySelector('img[src*="UI_Craft"]')) : null,
    guideSlot: r(ui.vinvGuideSlotModernEl), caption: r(ui.vinvGuideModernCaptionEl), req: r(ui.vinvGuideModernReqEl),
    sep: r(ui.vinvModernSeparatorEl), list: r(ui.vinvModernGridList), cell0: r(ui.vinvModernGridList?.querySelector('.sw-slot')),
    sbar: r(ui.vinvModernScrollbarEl), handle: ui.vinvModernScrollHandle ? { top: ui.vinvModernScrollHandle.style.top, h: ui.vinvModernScrollHandle.style.height, bg: (ui.vinvModernScrollHandle.style.backgroundImage || '').split('/').pop() } : null,
    sbarBg: (ui.vinvModernScrollbarEl?.style.backgroundImage || '').split('/').pop(), sbarBgSize: ui.vinvModernScrollbarEl?.style.backgroundSize,
    mod: { containerY: gg.container.y, sepY: gg.separator.y, listY: gg.list.y, startY: gg.startY, sbarY: gg.scrollbar.y, sbarInnerY: gg.scrollbar.innerY },
    selected: ui.vinvModernSelected ? (ui.vinvModernSelected.create ?? '?') : null,
    entries: ui.vinvModernEntries.length,
  };
});

// ---- 场景1:normal 态开窗(站点链:给木材+工作台近旁? 简化=切换钮开窗+预选) ----
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
console.log('=== 场景1 normal 态(预选在) ===');
console.log(JSON.stringify(await measure(), null, 1));
await page.screenshot({ path: '/tmp/fx41b-forensics-normal.png' });

// ---- 场景2:向导态(真实会话+modern 窗)首入(空槽) ----
await page.evaluate(() => { window.__swUI.vinvCloseModernCraft(true); window.__swGame.closeNpcDialog(false); });
await sleep(200);
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
const craftPos = await page.evaluate(() => {
  const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
  if (!b) return null;
  const r = b.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (craftPos) { await page.mouse.click(craftPos.x, craftPos.y); await sleep(400); }
await sleep(400);
console.log('=== 场景2 向导态首入(空槽) ===');
console.log(JSON.stringify(await measure(), null, 1));

// ---- 场景3:向导槽放木材 → 点首格(几何+音效链取证) ----
await page.evaluate(() => {
  const ui = window.__swUI, g = window.__swGame;
  const wid = g.itemId('vi_9_Wood');
  ui.heldStack = { id: wid, stack: 300 };
  ui.vinvGuideSlotModernEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
});
await page.waitForFunction(() => window.__swUI.vinvModernEntries.length > 0 && !!window.__swUI.vinvModernGridList?.querySelector('.sw-slot'), { timeout: 15000, polling: 120 });
await sleep(400);
console.log('=== 场景3 向导态(木材在槽,未点选) ===');
const m3 = await measure();
console.log(JSON.stringify(m3, null, 1));
await page.screenshot({ path: '/tmp/fx41b-forensics-guide.png' });

// 点首格 → 音效计数 + 详情显隐 + glideY
const clickData = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  const counts = {};
  const orig = g.sfx.play.bind(g.sfx);
  g.sfx.play = (k, ...a) => { counts[k] = (counts[k] || 0) + 1; return orig(k, ...a); };
  window.__fx41bRestoreSfx = () => { g.sfx.play = orig; };
  const cell = ui.vinvModernGridList.querySelector('.sw-slot');
  const r = cell.getBoundingClientRect();
  const before = { focus: ui.vinvCraftFocusV, glide: ui.vinvCraftGlideY };
  cell.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await new Promise((res) => setTimeout(res, 900));   // 覆盖吸附滑行窗口
  const detail = ui.vinvModernDetailEl;
  const rr = document.querySelector('.sw-vinv').getBoundingClientRect();
  const slots = [...(detail?.querySelectorAll('.sw-slot') ?? [])].map((s) => { const b = s.getBoundingClientRect(); return { top: +(b.y - rr.top).toFixed(1), left: +(b.x - rr.left).toFixed(1) }; });
  return { counts, focusBefore: before, focusAfter: { focus: ui.vinvCraftFocusV, glide: ui.vinvCraftGlideY }, detailShown: detail ? detail.style.display !== 'none' : false, detailSlots: slots, selected: ui.vinvModernSelected ? 'set' : null };
});
console.log('=== 场景4 点首格后(音效计数/详情几何) ===');
console.log(JSON.stringify(clickData, null, 1));
await page.evaluate(() => window.__fx41bRestoreSfx?.());
await page.screenshot({ path: '/tmp/fx41b-forensics-guide-clicked.png' });

await page.close();
await browser.close();
console.log('FORENSICS DONE');
process.exit(0);
