// ★Ring3 判别#2：夜世界 + 零施法 → 那排蓝珠是否仍在?+ 该屏幕盒内实体/物件档案。
// 运行：SW_ORIGIN=http://localhost:5238 node tools/run-diag.mjs scripts/_nb618-discrim2.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
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
const info = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = window.__swItems ?? {};
  await g.newWorld('nb618', 4200, 1200, () => {});
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
    for (let k = 1; k <= 60; k++) {
      let yy = -1;
      for (let y = Math.max(1, y0 - 3); y < y0 + 4; y++) { if (st.isSolid(c + k, y)) { yy = y; break; } }
      if (yy !== y0) { flat = false; break; }
    }
    if (flat) { col0 = c; gy = y0; break; }
  }
  if (col0>=0) { p.x = col0 * 16; p.y = gy * 16 - p.h; } p.vx = 0; p.vy = 0; g.world.clock.timeOfDay = 0.02;
  // 不给武器不施法
  for (let i = 0; i < 240; i++) g.fixedUpdate(1 / 60);   // 4s 模拟,等待入夜动画推进
  return { col0, gy, worldTime: g.world?.time ?? g.world?.store?.time ?? null, projs: g.entities.projectiles.length };
});
await new Promise((r) => setTimeout(r, 1200));
const dump = await page.evaluate(() => {
  const g = window.__swGame;
  const box = { x0: 480, y0: 260, x1: 800, y1: 350 };  // 屏幕盒（球排行区）
  const inBox = (sx, sy) => sx >= box.x0 && sx <= box.x1 && sy >= box.y0 && sy <= box.y1;
  const hits = [];
  const cam = g.camera;
  const w2s = (wx, wy) => cam.worldToScreen(wx, wy);
  for (const q of g.entities.projectiles) {
    const [sx, sy] = w2s(q.cx, q.cy);
    if (inBox(sx, sy)) hits.push({ kind: 'proj', id: q.projId, sx: Math.round(sx), sy: Math.round(sy) });
  }
  for (const d of g.vanillaDust?.pool ?? []) {
    if (!d?.active) continue;
    const [sx, sy] = w2s(d.x, d.y);
    if (inBox(sx, sy)) hits.push({ kind: 'dust', t: d.type, sx: Math.round(sx), sy: Math.round(sy) });
  }
  // 敌怪/掉落物/其它实体粗扫
  for (const key of ['enemies', 'items', 'npcs']) {
    const arr = g.entities?.[key];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (!e || e.dead) continue;
      const ex = e.cx ?? e.x, ey = e.cy ?? e.y;
      if (ex == null) continue;
      const [sx, sy] = w2s(ex, ey);
      if (inBox(sx, sy)) hits.push({ kind: key, id: e.id ?? e.type ?? null, sx: Math.round(sx), sy: Math.round(sy) });
    }
  }
  // 世界 tile 剖面（盒中心行）
  const st = g.world.store;
  const [wx0] = (() => { const a = cam.worldToScreen(0, 0); return [a[0]]; })();
  const pxPerTile = 16 * (cam.zoom ?? 1);
  const tileRow = [];
  const sy = 305;
  for (let sx = 500; sx <= 780; sx += 28) {
    const [wx, wy] = cam.screenToWorld(sx, sy);
    const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
    tileRow.push({ sx, tx, ty, tile: st.getTile?.(tx, ty)?.type ?? st.tileAt?.(tx, ty)?.type ?? null, wall: st.getWall?.(tx, ty) ?? null });
  }
  return { hits, tileRow, zoom: cam.zoom };
});
console.log('[disc2] boot', JSON.stringify(info));
console.log('[disc2] box-dump', JSON.stringify(dump, null, 1));
await page.screenshot({ path: '/tmp/nb618-disc2.png' });
console.log('[disc2] saved /tmp/nb618-disc2.png');
await browser.close().catch(() => {});
process.exit(0);
