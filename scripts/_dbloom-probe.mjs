// 6152 太阳花法杖运行时出手探针:真实 Game 管线内持杖按住鼠标,步进 tick,
// 统计弹 1114 生成数/魔耗/停发窗行为
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('Error') || t.includes('error')) console.log('[page]', t.slice(0, 200)); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  // 给玩家 vi_6152 并选中
  const key = 'vi_6152_DaybloomStaff';
  const id = g.constructor && null; // noop
  const items = window.__swItems ?? {};
  const vim = window.__swVANILLA_ITEM_KEY_BY_ID;
  const near = { exposed: !!vim, total: vim ? Object.keys(vim).length : 0 };
  if (vim) {
    for (let v = 6150; v <= 6155; v++) near[v] = { k: vim[v] ?? null, inMap: vim[v] ? items[vim[v]] !== undefined : false };
    near.sample6152 = vim[6152] ?? null;
    near.sample100 = vim[100] ?? null;
  }
  const itemId = items[key];
  if (itemId === undefined) return { err: 'vi_6152 不在 ITEM_BY_KEY', near };
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  p.mana = 100; p.maxMana = 100;
  // 准星设到玩家右侧 5 格（世界→屏幕）
  const cam = g.camera;
  const [sx, sy] = cam.worldToScreen(p.cx + 5 * 16, p.cy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  const seen = new Set();
  const snap = () => { const out = []; for (const e of g.entities.projectiles) { const k = e; if (!seen.has(k)) { seen.add(k); out.push(k); } } return out; };
  let known = snap();
  const shots = [];
  const manaTrace = [];
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let t = 0; t < 120; t++) {
    g.fixedUpdate(1 / 60);
    const cur = snap();
    for (const e of cur) {
      if (!known.includes(e)) {
        known = cur;
        shots.push({ cls: e.constructor.name, projId: e.projId ?? null });
      }
    }
    if (t % 10 === 0) manaTrace.push(p.mana);
  }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  const p1114 = shots.filter((x) => x.projId === 1114);
  // 页内直查 use 链各门
  const heldDef = p.inv.heldItem() ? (window).__swITEM_DEFS?.[p.inv.heldItem().id] ?? null : null;
  const diag = {
    heldId: p.inv.heldItem()?.id, heldDefKey: heldDef?.key ?? null,
    vid: heldDef?.vid ?? null,
    mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld, useTime: p.useTime,
  };
  return {
    heldKey: p.inv.heldItem() ? (p.inv.heldItem().id === itemId ? key : 'wrong') : 'none',
    totalNew: shots.length, p1114Count: p1114.length,
    diag, manaTrace: manaTrace.slice(0, 4),
  };
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
