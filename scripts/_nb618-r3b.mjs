// ★Ring3 判别#3：同一世界会话内 A(施法前)/B(施法后) 双拍 + 全实体投影档案。
// 运行：SW_ORIGIN=http://localhost:5238 node tools/run-diag.mjs scripts/_nb618-r3b.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[r3b] pageerror', String(e.message).slice(0, 160)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* ignore */ } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5238', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => {
  const s = document.querySelector('select');
  s.selectedIndex = 0;
  s.parentElement.querySelector('button').click();
});
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });

const setup = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('nb618r3b', 4200, 1200, () => {});
  for (let i = 0; i < 100; i++) {
    if (g.world && g.world.store && g.world.store.w === 4200) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const p = g.player;
  const st = g.world.store;
  let col0 = -1, gy = -1;
  for (let c = 100; c < st.w - 200; c++) {
    let y0 = -1;
    for (let y = 20; y < st.h - 40; y++) { if (st.isSolid(c, y)) { y0 = y; break; } }
    if (y0 < 0) continue;
    let flat = true;
    for (let k = 1; k <= 24; k++) {
      let yy = -1;
      for (let y = Math.max(1, y0 - 3); y < y0 + 4; y++) { if (st.isSolid(c + k, y)) { yy = y; break; } }
      if (yy !== y0) { flat = false; break; }
    }
    if (flat) { col0 = c; gy = y0; break; }
    if (col0 < 0 && k_end) ;
  }
  if (col0 < 0) return { fail: 'no-flat-ground' };
  p.x = col0 * 16; p.y = gy * 16 - p.h; p.vx = 0; p.vy = 0;
  g.world.clock.timeOfDay = 0.02;
  p.baseMaxMana = 2000; p.mana = 2000;
  const key3476 = Object.keys(items).find((k) => k.includes('3476'));
  p.inv.slots[0] = { id: items[key3476], stack: 1 };
  p.inv.selected = 0;
  g.fixedUpdate(1 / 60); g.fixedUpdate(1 / 60);
  return { col0, gy };
});
console.log('[r3b] setup', JSON.stringify(setup));
if (setup.fail) { await browser.close(); process.exit(1); }

const dump = (tag) => page.evaluate((tag) => {
  const g = window.__swGame;
  const w2s = (wx, wy) => g.camera.worldToScreen(wx, wy);
  const box = { x0: 460, y0: 240, x1: 820, y1: 370 };
  const inBox = (sx, sy) => sx >= box.x0 && sx <= box.x1 && sy >= box.y0 && sy <= box.y1;
  const out = { tag, clock: +g.world.clock.timeOfDay.toFixed(3), isDay: g.world.clock.isDay, found: [] };
  const kinds = Object.keys(g.entities ?? {}).filter((k) => Array.isArray(g.entities[k]));
  for (const k of kinds) {
    for (const e of g.entities[k]) {
      if (!e || e.dead === true) continue;
      const ex = e.cx ?? e.x, ey = e.cy ?? e.y;
      if (ex == null || ey == null) continue;
      const [sx, sy] = w2s(ex, ey);
      if (inBox(sx, sy)) out.found.push({ k, id: e.id ?? e.type ?? e.projId ?? null, sx: Math.round(sx), sy: Math.round(sy), extra: e.itemId ?? e.stack ?? (e.naAi0 != null ? '618' : null) });
    }
  }
  const dcount = {};
  for (const d of g.vanillaDust?.pool ?? []) {
    if (!d?.active) continue;
    const [sx, sy] = w2s(d.x, d.y);
    if (inBox(sx, sy)) dcount[d.type] = (dcount[d.type] ?? 0) + 1;
  }
  out.dustInBox = dcount;
  out.projTotal = g.entities.projectiles.length;
  return out;
}, tag);

// ---- A 拍：装备但未施法（静置 3s）----
await new Promise((r) => setTimeout(r, 3000));
console.log('[r3b] A-dump', JSON.stringify(await dump('A')));
await page.screenshot({ path: '/tmp/nb618-r3b-A.png' });

// ---- 施法 1.2s（按住 autoReuse）→ 停手等 3s（慢速段+伴生在场）----
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const aimX = p.cx + 200, aimY = p.cy - 8;
  const [sx, sy] = g.camera.worldToScreen(aimX, aimY);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  g.input.mouseHeld = true;
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => { window.__swGame.input.mouseHeld = false; });
await new Promise((r) => setTimeout(r, 3000));
console.log('[r3b] B-dump', JSON.stringify(await dump('B')));
await page.screenshot({ path: '/tmp/nb618-r3b-B.png' });
console.log('[r3b] saved /tmp/nb618-r3b-A.png /tmp/nb618-r3b-B.png');
await browser.close().catch(() => {});
process.exit(0);
