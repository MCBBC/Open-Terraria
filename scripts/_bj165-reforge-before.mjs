// BJ165 修前取证探针(2026-09-19):重铸费用 toast 格式/黄渐变块/钱不足静默。
// 运行:SW_ORIGIN=http://localhost:5242 node tools/run-diag.mjs --timeout=300000 scripts/_bj165-reforge-before.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5242';
const SHOT = process.env.SHOT_PREFIX ?? '/tmp/bj169-reforge';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', String(e.stack || e.message).slice(0, 300)));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
await sleep(600);
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); window.__swUI.closeInventory(); });
await sleep(200);

// ---- 开重铸(真实链:哥布林+对话+reforge 钮) ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__ovGoblin) {
    const gob = new TownNPC('goblin_tinkerer', g.player.x + 40, g.world.groundLevel * 16 - 48);
    gob.home = null;
    g.entities.add(gob, 'npcs');
    window.__ovGoblin = gob;
  }
  const gob = window.__ovGoblin;
  gob.dead = false;
  const st = g.world.store;
  const col = Math.floor(gob.cx / 16);
  let gy = Math.max(0, Math.floor((gob.y + gob.h + 2) / 16));
  let solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) { gy++; solid = st.get(col, gy) !== 0 && st.hasTile(col, gy); }
  g.player.x = gob.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  g.player.vx = 0; g.player.vy = 0;
  if (!g.npcDialogActive) g.openNpcDialog(gob);
});
await sleep(300);
let refOpen = false;
for (let attempt = 0; attempt < 3 && !refOpen; attempt++) {
  await page.evaluate(() => {
    const g = window.__swGame, gob = window.__ovGoblin;
    gob.dead = false;
    gob.x = g.player.x + 30; gob.y = g.player.y;
    if (!g.npcDialogActive || !g.dialogNpc) g.openNpcDialog(gob);
  });
  await page.waitForFunction(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="reforge"]');
    return !!b && b.getBoundingClientRect().width > 0;
  }, { timeout: 10000, polling: 120 }).catch(() => {});
  await page.evaluate(() => { window.__swGame.npcDialogButton('reforge'); });
  await sleep(450);
  refOpen = await page.evaluate(() => !!window.__swUI.vinvReforgeOpen);
}
console.log(refOpen ? 'PASS reforge open (real chain)' : 'FAIL reforge open');

// ---- 放入可重铸物(直接置 reforgeItem;选高价值物=费用大) ----
await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  const { ITEM_BY_KEY } = await import('/src/data/items.ts');
  // Megashark vi_293? 用 minishark/巨兽鲨高价值;fallback 任意可重铸
  const pick = (keys) => { for (const k of keys) { const id = ITEM_BY_KEY[k]; if (id !== undefined) return { id: Number(id), key: k }; } return null; };
  const p = pick(['vi_292_Minishark', 'vi_98_Minishark', 'vi_292_Megashark', 'vi_4_WoodenSword', 'vi_4_WoodenSword']);
  window.__refTarget = p;
  ui.reforgeItem = { id: p.id, stack: 1, prefix: 0 };
  ui.refreshAll();
  await new Promise((r) => setTimeout(r, 400));
});
await sleep(300);

// ---- 取证 1:重铸面 DOM/费用文本 + 全屏元素普查(找黄渐变块) ----
const census = await page.evaluate(() => {
  const ui = window.__swUI;
  const out = { costText: ui.vinvReforgeTextEl?.textContent ?? null, costHtml: ui.vinvReforgeTextEl?.innerHTML ?? null };
  // 全元素普查:可见且 fixed/absolute,报告 bbox+背景样式
  const els = [...document.querySelectorAll('body *')];
  const rows = [];
  for (const e of els) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const bg = (cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '') + (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? '|' + cs.backgroundColor : '');
    rows.push({
      tag: e.tagName.toLowerCase(), cls: (e.className && typeof e.className === 'string') ? e.className.slice(0, 60) : '',
      id: e.id || '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      pos: cs.position, z: cs.zIndex, bg: bg.slice(0, 160),
      text: (e.childElementCount === 0 ? (e.textContent || '').slice(0, 40) : ''),
    });
  }
  out.elements = rows;
  return out;
});
console.log('costText =', JSON.stringify(census.costText));
console.log('costHtml =', JSON.stringify(census.costHtml));
// 底部左半屏可见元素(y > 55% 高)
const vh = await page.evaluate(() => window.innerHeight);
const bottomLeft = census.elements.filter((e) => e.y > vh * 0.55 && e.x < vh && e.pos !== 'fixed' || (e.y > vh * 0.55 && e.x < 500));
console.log('--- bottom-left visible elements (y>', Math.round(vh * 0.55), ') ---');
const seen = new Set();
for (const e of bottomLeft) {
  const k = `${e.cls}|${e.x},${e.y},${e.w},${e.h}`;
  if (seen.has(k)) continue; seen.add(k);
  console.log(JSON.stringify(e));
}
await page.screenshot({ path: `${SHOT}-1-reforge-open.png` });

// ---- 取证 2:悬停重铸槽 tooltip ----
const slot = await page.$('.sw-vinv .sw-slot[style*="scale(0.85)"]');
if (slot) {
  const bb = await slot.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await sleep(400);
  const tip = await page.evaluate(() => {
    const t = document.querySelector('.sw-tooltip');
    if (!t || t.style.display === 'none') return null;
    const r = t.getBoundingClientRect();
    return { html: t.innerHTML.slice(0, 300), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  console.log('slot tooltip =', JSON.stringify(tip));
  await page.screenshot({ path: `${SHOT}-2-slot-hover.png` });
  await page.mouse.move(800, 500);
  await sleep(200);
}

// ---- 取证 3:钱不足点锤 ----
await page.evaluate(() => { window.__swGame.coinsOwned = () => 0; });
await page.evaluate(() => { window.__swUI.vinvReforgeHammerHit(); });
await sleep(300);
const poorToast = await page.evaluate(() => document.querySelector('.sw-toast')?.textContent ?? null);
console.log('poor-click toast =', JSON.stringify(poorToast), '(null=静默)');
await page.screenshot({ path: `${SHOT}-3-poor-click.png` });

// ---- 取证 4:有钱点锤 → 捕 toast 文本 ----
const toastText = await page.evaluate(async () => {
  const ui = window.__swUI, g = window.__swGame;
  g.coinsOwned = () => 9999999;
  g.spendCopper = () => true;
  ui.vinvReforgeHammerHit();
  await new Promise((r) => setTimeout(r, 150));
  return document.querySelector('.sw-toast')?.textContent ?? null;
});
console.log('rich-click toast =', JSON.stringify(toastText));
await sleep(400);
await page.screenshot({ path: `${SHOT}-4-rich-click.png` });

// ---- 取证 5:关配方界面(合成窗切换钮左键)/关包 → 重铸族元素显隐 ----
const after = await page.evaluate(async () => {
  const ui = window.__swUI;
  // 直接翻 PipsUseGrid(classic 网格隐藏臂)不便——直接走关包复测
  const snap = (tag) => {
    const vis = (e2) => !!e2 && e2.style.display !== 'none' && e2.getBoundingClientRect().width > 0;
    const g2 = (e2) => { if (!e2) return null; const r = e2.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: vis(e2) }; };
    return {
      tag, invOpen: ui.invPanel?.style.display === 'block',
      reforgeOpen: ui.vinvReforgeOpen,
      slot: g2(ui.vinvReforgeSlotEl), text: g2(ui.vinvReforgeTextEl), hammer: g2(ui.vinvReforgeHammerEl), sav: g2(ui.vinvSavingsEl),
    };
  };
  const a = snap('before-close');
  // 走远:关对话(重铸自动退出链)
  window.__swGame.closeNpcDialog(false);
  await new Promise((r) => setTimeout(r, 500));
  const b = snap('after-dialog-close');
  // 关包
  ui.closeInventory();
  await new Promise((r) => setTimeout(r, 400));
  const c = snap('after-inventory-close');
  return [a, b, c];
});
for (const s of after) console.log(JSON.stringify(s));
await page.screenshot({ path: `${SHOT}-5-after-close.png` });

// 关包后再次普查:黄块是否残留
const census2 = await page.evaluate(() => {
  const rows = [];
  for (const e of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (e.closest('.sw-vinv') && document.querySelector('.sw-vinv').style.display === 'none') continue;
    rows.push({ tag: e.tagName.toLowerCase(), cls: (typeof e.className === 'string' ? e.className : '').slice(0, 50), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), bg: (cs.backgroundImage !== 'none' ? cs.backgroundImage : cs.backgroundColor).slice(0, 80) });
  }
  return rows.filter((e) => e.y > 500);
});
console.log('--- visible elements y>500 after close ---');
for (const e of census2) console.log(JSON.stringify(e));

await browser.close();
