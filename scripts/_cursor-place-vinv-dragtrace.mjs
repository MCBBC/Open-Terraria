// 拖拽放置链路追踪(修复验证):按住槽位拖到世界 → 期望按住期连续放置+松手物品保留
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
  window.__TRACE = [];
  const wrap = (name) => {
    const orig = g[name];
    if (typeof orig !== 'function') return;
    g[name] = function (...a) {
      window.__TRACE.push([name, a[0], a[1]]);
      return orig.apply(this, a);
    };
  };
  wrap('tryPlace'); wrap('tryMine');
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

// 按住槽位 → 拖到世界 → 停 500ms → 松手
await page.mouse.move(slot10.x, slot10.y);
await sleep(80);
await page.mouse.down();
await sleep(50);
await page.mouse.move((slot10.x + t.sx) / 2, (slot10.y + t.sy) / 2, { steps: 8 });
await page.mouse.move(t.sx, t.sy, { steps: 10 });
await sleep(120);
const mid = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld,
    mirror: g.player.inv.cursorMirror?.stack ?? null, held: window.__swUI.heldStack?.stack ?? null,
    overDomUi: g.inpOverDomUi(), tileUnder: g.camera.tileUnder(g.input.mouseX, g.input.mouseY),
    useTime: g.player.useTime,
  };
});
console.log('MID(hold):', JSON.stringify(mid));
await sleep(400);
await page.mouse.up();
await sleep(300);
const trace = await page.evaluate(() => window.__TRACE);
const after = await page.evaluate((xy) => {
  const g = window.__swGame;
  return {
    placed: g.world.store.isActive(xy[0], xy[1]),
    held: window.__swUI.heldStack?.stack ?? null,
    mirror: g.player.inv.cursorMirror?.stack ?? null,
    drops: g.entities.drops?.length ?? -1,
    slot10: g.player.inv.slots[10]?.stack ?? null,
    mouseDown: g.input.mouseDown, mouseHeld: g.input.mouseHeld,
    overDomUi: g.inpOverDomUi(), dead: g.player.dead, paused: g.paused,
    blockMouse: g.input.blockMouse, delayUseItem: g.input.delayUseItem,
    uiBlocking: g.input.uiBlocking, useTime: g.player.useTime, swing: !!g.swing,
    tileUnder: g.camera.tileUnder(g.input.mouseX, g.input.mouseY),
    playerTile: [Math.floor(g.player.cx / 16), Math.floor(g.player.cy / 16)],
    dist: Math.hypot(xy[0] * 16 + 8 - g.player.cx, xy[1] * 16 + 8 - g.player.cy),
  };
}, [t.tx, t.ty]);
console.log('TRACE count:', trace.length, 'first:', JSON.stringify(trace.slice(0, 6)));
console.log('AFTER:', JSON.stringify(after));
await browser.close();
process.exit(0);
