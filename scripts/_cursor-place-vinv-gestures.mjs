// 手势矩阵探针 v2:人造竞技场(玩家旁平地),四种手势的光标持物放置行为
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await sleep(1000);

const S = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  document.getElementById('sw-welcome-announce')?.remove();
  // 找一块可开挖的区域
  let spot = null;
  outer:
  for (let x = 220; x < 480; x++) for (let y = 160; y < 380; y++) {
    if (st.isSolid(x, y + 5) && st.isSolid(x + 16, y + 5)) { spot = [x, y]; break outer; }
  }
  if (!spot) return { fail: 'no area' };
  const [px, py] = spot;
  // 造竞技场:清空气盒 [px-4..px+14]×[py-5..py+3],地面 py+4 实心铺满
  for (let x = px - 4; x <= px + 14; x++) {
    for (let y = py - 5; y <= py + 3; y++) { if (st.inBounds(x, y)) st.setTile(x, y, 0, 0, 0); }
    if (st.inBounds(x, py + 4)) st.setTile(x, py + 4, 1, 0, 0);   // dirt
  }
  g.player.x = (px + 1) * 16; g.player.y = (py + 4) * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 1300));
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const woodId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[9]];
  const inv = g.player.inv;
  for (let i = 0; i < 60; i++) inv.slots[i] = null;
  inv.slots[10] = { id: woodId, stack: 500, favorited: false, prefix: 0 };
  inv.selected = 0;
  window.__swUI.openInventory(true);
  await (window.__swUI.refreshAllAsync ? window.__swUI.refreshAllAsync() : Promise.resolve(window.__swUI.refreshAll()));
  // 目标格 = (px+2..px+5, py+3)(地面上方一格,air,邻=地面),算屏坐标
  const targets = [];
  for (let k = 2; k <= 5; k++) {
    const tx = px + k, ty = py + 3;
    const sx = Math.round((tx * 16 + 8) * (g.camera.zoom ?? 1) + g.renderer.canvas.width / 2 - g.player.cx * (g.camera.zoom ?? 1));
    targets.push({ tx, ty, sx: null, sy: null });
  }
  // 直接用 camera.screenToWorld 的逆:扫描屏点反查匹配格
  const out = [];
  for (const t of targets) {
    let found = null;
    for (let sy = 380; sy <= 640; sy += 4) for (let sx = 640; sx <= 1100; sx += 4) {
      const [wx, wy] = g.camera.screenToWorld(sx, sy);
      if (Math.floor(wx / 16) === t.tx && Math.floor(wy / 16) === t.ty) { found = { sx, sy }; break; }
      if (found) break;
    }
    if (found) out.push({ tx: t.tx, ty: t.ty, ...found });
  }
  return { spot: [px, py], targets: out, woodId, pcx: g.player.cx, pcy: g.player.cy };
});
if (S.fail) { console.log('STAGE-FAIL', JSON.stringify(S)); process.exit(1); }
console.log('targets:', JSON.stringify(S.targets));
const [t1, t2, t3, t4] = S.targets;
if (!t4) { console.log('not enough targets'); process.exit(1); }

const slot10 = await page.evaluate(() => {
  const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

const snap = (t) => page.evaluate((xy) => {
  const g = window.__swGame;
  const st = g.world.store;
  const S0 = window.S0;
  const news = [];
  for (let x = S0.spot[0] - 4; x <= S0.spot[0] + 14; x++) for (let y = S0.spot[1] - 5; y <= S0.spot[1] + 3; y++) {
    if (st.inBounds(x, y) && st.isActive(x, y)) news.push([x, y, st.get(x, y)]);
  }
  return {
    activeAtTarget: st.isActive(xy[0], xy[1]),
    newTiles: news,
    mirror: g.player.inv.cursorMirror?.stack ?? null,
    held: window.__swUI.heldStack?.stack ?? null,
    drops: g.entities.drops?.length ?? -1,
    mouseDown: g.input.mouseDown,
    paused: g.paused, dead: g.player.dead,
    useTime: g.player.useTime, swing: !!g.swing,
    tileUnder: g.camera.tileUnder(g.input.mouseX, g.input.mouseY),
    uiBlocking: g.input.uiBlocking,
    overDomUi: (() => { try { return g.inpOverDomUi(); } catch { return 'err'; } })(),
  };
}, [t.tx, t.ty]);

const reset = () => page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const inv = g.player.inv;
  inv.cursorMirror = null;
  window.__swUI.heldStack = null;
  window.__swUI.dragFrom = null;
  // 清空目标区
  for (let x = S0.spot[0] + 2; x <= S0.spot[0] + 14; x++) for (let y = S0.spot[1] - 3; y <= S0.spot[1] + 3; y++) {
    if (st.inBounds(x, y) && st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
  }
  if (inv.slots[10]) inv.slots[10].stack = 500;
  g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false;
  window.__swUI.refreshAll();
  return true;
});
// 把 spot 注入页面侧
await page.evaluate((spot) => { window.S0 = { spot }; }, S.spot);
const resetSide = `(() => {
  const g = window.__swGame, st = g.world.store, inv = g.player.inv, S0 = window.S0;
  inv.cursorMirror = null; window.__swUI.heldStack = null; window.__swUI.dragFrom = null;
  for (let x = S0.spot[0] + 2; x <= S0.spot[0] + 14; x++) for (let y = S0.spot[1] - 3; y <= S0.spot[1] + 3; y++) {
    if (st.inBounds(x, y) && st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
  }
  if (inv.slots[10]) inv.slots[10].stack = 500;
  g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false;
  window.__swUI.refreshAll(); return true;
})()`;

// ============ 手势 A:点击槽拾取 → 移动 → 单击世界 ============
await page.mouse.click(slot10.x, slot10.y);
await sleep(250);
await page.mouse.move(t1.sx, t1.sy);
await sleep(100);
await page.mouse.down(); await sleep(80); await page.mouse.up();
await sleep(400);
console.log('A click-click:', JSON.stringify(await snap(t1)));
await page.evaluate(resetSide);

// ============ 手势 B:按下槽 → 拖到世界(保持按住 500ms) → 松开 ============
await page.mouse.move(slot10.x, slot10.y);
await page.mouse.down();
await sleep(60);
await page.mouse.move((slot10.x + t2.sx) / 2, (slot10.y + t2.sy) / 2, { steps: 6 });
await page.mouse.move(t2.sx, t2.sy, { steps: 8 });
await sleep(500);
const bHold = await snap(t2);
await page.mouse.up();
await sleep(400);
console.log('B drag-hold-release:', JSON.stringify({ hold: bHold, after: await snap(t2) }));
await page.evaluate(resetSide);

// ============ 手势 C:拾取后按住世界点原地 500ms ============
await page.mouse.click(slot10.x, slot10.y);
await sleep(250);
await page.mouse.move(t3.sx, t3.sy);
await sleep(80);
await page.mouse.down();
await sleep(500);
const cHold = await snap(t3);
await page.mouse.up();
await sleep(300);
console.log('C hold-still:', JSON.stringify({ hold: cHold, after: await snap(t3) }));
await page.evaluate(resetSide);

// ============ 手势 D:拾取后按住横向拖刷 ============
await page.mouse.click(slot10.x, slot10.y);
await sleep(250);
await page.mouse.move(t4.sx, t4.sy);
await sleep(80);
await page.mouse.down();
for (let k = 1; k <= 10; k++) { await page.mouse.move(t4.sx + k * 12, t4.sy, { steps: 2 }); await sleep(40); }
const dHold = await snap(t4);
await page.mouse.up();
await sleep(300);
console.log('D drag-paint:', JSON.stringify({ hold: dHold, after: await snap(t4) }));
await browser.close();
process.exit(0);
