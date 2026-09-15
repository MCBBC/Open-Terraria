// 聚焦小探针:光标持物 hover 不点击是否误放置 + 单击/按住放置核对
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

const prep = await page.evaluate(async () => {
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
  await new Promise((r) => setTimeout(r, 900));
  const { VANILLA_ITEM_KEY_BY_ID, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const woodId = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[9]];
  const inv = g.player.inv;
  for (let i = 0; i < 60; i++) inv.slots[i] = null;
  inv.slots[10] = { id: woodId, stack: 999, favorited: false, prefix: 0 };
  inv.selected = 0;
  window.__swUI.openInventory(true);
  await (window.__swUI.refreshAllAsync ? window.__swUI.refreshAllAsync() : Promise.resolve(window.__swUI.refreshAll()));
  // 目标点
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
  return { target };
});
const t = prep.target;
console.log('target', JSON.stringify(t));

// 拾取
const slot10 = await page.evaluate(() => {
  const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(slot10.x, slot10.y);
await sleep(300);

// hover 不点击
await page.mouse.move(t.sx, t.sy);
await sleep(700);
const hoverRes = await page.evaluate((txty) => ({
  active: window.__swGame.world.store.isActive(txty[0], txty[1]),
  mirror: window.__swGame.player.inv.cursorMirror?.stack ?? null,
}), [t.tx, t.ty]);
console.log('HOVER-no-click:', JSON.stringify(hoverRes), hoverRes.active ? 'PLACED(BAD-hover-place)' : 'not placed(ok)');

// 单击放置
await page.mouse.down(); await sleep(60); await page.mouse.up();
await sleep(400);
const clickRes = await page.evaluate((txty) => ({
  active: window.__swGame.world.store.isActive(txty[0], txty[1]),
  mirror: window.__swGame.player.inv.cursorMirror?.stack ?? null,
}), [t.tx, t.ty]);
console.log('CLICK:', JSON.stringify(clickRes), clickRes.active ? 'PLACED' : 'NOT PLACED');
await browser.close();
process.exit(0);
