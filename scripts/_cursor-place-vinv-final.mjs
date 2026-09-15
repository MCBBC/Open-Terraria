// 终局手势验证(修正 reset 吞物 bug):A 点击-点击 / E 按槽拖拽-松手 / F 拾取后按住拖刷
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
  let spot = null;
  outer:
  for (let x = 200; x < 500; x++) for (let y = 150; y < 400; y++) {
    let air = true;
    for (let dy = -1; dy <= 1 && air; dy++) for (let dx = -1; dx <= 1; dx++) if (st.isActive(x + dx, y + dy)) { air = false; break; }
    if (!air) continue;
    let floor = true;
    for (let dx = -1; dx <= 1; dx++) if (!st.isSolid(x + dx, y + 2)) { floor = false; break; }
    if (floor) { spot = [x, y]; break outer; }
  }
  if (!spot) return { fail: 'no flat spot' };
  const [px, py] = spot;
  g.player.x = px * 16; g.player.y = (py + 2) * 16 - g.player.h; g.player.vx = 0; g.player.vy = 0;
  await new Promise((r) => setTimeout(r, 1000));
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const woodId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[9]];
  const inv = g.player.inv;
  inv.slots[10] = { id: woodId, stack: 500, favorited: false, prefix: 0 };
  inv.selected = 0;
  window.__swUI.openInventory(true);
  await (window.__swUI.refreshAllAsync ? window.__swUI.refreshAllAsync() : Promise.resolve(window.__swUI.refreshAll()));
  const [pcx, pcy] = [g.player.cx, g.player.cy];
  let target = null;
  for (let sy = 200; sy <= 900; sy += 25) for (let sx = 700; sx <= 1500; sx += 25) {
    const [wx, wy] = g.camera.screenToWorld(sx, sy);
    const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
    if (!st.inBounds(tx, ty) || st.isActive(tx, ty)) continue;
    let nb = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (st.isActive(tx + dx, ty + dy)) { nb = true; break; }
    if (!nb) continue;
    if (Math.hypot(tx * 16 + 8 - pcx, ty * 16 + 8 - pcy) > 5 * 16) continue;
    target = { sx, sy, tx, ty };
    break;
  }
  if (!target) return { fail: 'no target' };
  window.__S = { px, py, target };
  return { spot: [px, py], target };
});
if (S.fail) { console.log('STAGE-FAIL', JSON.stringify(S)); process.exit(1); }
const t = S.target;
console.log('target', JSON.stringify(t));
const slot10 = await page.evaluate(() => {
  const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});

const survey = (tag) => page.evaluate((tag2) => {
  const g = window.__swGame, st = g.world.store, S0 = window.__S;
  const tiles = [];
  for (let x = S0.px - 6; x <= S0.px + 8; x++) for (let y = S0.py - 4; y <= S0.py + 1; y++) {
    if (st.inBounds(x, y) && st.isActive(x, y)) tiles.push([x, y]);
  }
  return {
    tag: tag2, woodTiles: tiles,
    held: window.__swUI.heldStack?.stack ?? null,
    slot10: g.player.inv.slots[10]?.stack ?? null,
    mirror: g.player.inv.cursorMirror?.stack ?? null,
    drops: g.entities.drops?.length ?? -1,
  };
}, tag);

// ============ A:点击槽拾取 → 单击世界 ============
await page.mouse.click(slot10.x, slot10.y);
await sleep(250);
await page.mouse.move(t.sx, t.sy);
await sleep(100);
await page.mouse.down(); await sleep(80); await page.mouse.up();
await sleep(400);
console.log('A:', JSON.stringify(await survey('A')));
// 归位:把光标物放回槽 10(点击槽 10)
await page.mouse.click(slot10.x, slot10.y);
await sleep(250);
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, S0 = window.__S;
  for (let x = S0.px - 6; x <= S0.px + 8; x++) for (let y = S0.py - 4; y <= S0.py + 1; y++) {
    if (st.inBounds(x, y) && st.isActive(x, y)) st.setTile(x, y, 0, 0, 0);
  }
  if (window.__swUI.heldStack) { g.player.inv.slots[10] = { ...window.__swUI.heldStack }; window.__swUI.heldStack = null; window.__swUI.heldFrom = null; }
  g.player.inv.cursorMirror = null;
  window.__swUI.refreshAll();
});

// ============ E:按住槽拖拽到世界 → 停 400ms → 松手 ============
await page.mouse.move(slot10.x, slot10.y);
await sleep(80);
await page.mouse.down();
await sleep(60);
await page.mouse.move((slot10.x + t.sx) / 2, (slot10.y + t.sy) / 2, { steps: 8 });
await page.mouse.move(t.sx, t.sy, { steps: 10 });
await sleep(400);
const eHold = await survey('E-hold');
await page.mouse.up();
await sleep(400);
const eAfter = await survey('E-after');
console.log('E hold:', JSON.stringify(eHold));
console.log('E after:', JSON.stringify(eAfter));
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store, S0 = window.__S;
  if (window.__swUI.heldStack) { g.player.inv.slots[10] = { ...(g.player.inv.slots[10] ?? {}), id: window.__swUI.heldStack.id }; }
  // 简化清理:统计后统一重置
});

// 终态盘点
console.log('FINAL:', JSON.stringify(await survey('FINAL')));
console.log('slot10 after all:', await page.evaluate(() => window.__swGame.player.inv.slots[10]));
await browser.close();
process.exit(0);
