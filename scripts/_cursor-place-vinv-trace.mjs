// 链路追踪:光标持物点击世界 — 包装 tryPlace/tryMine/useSwing 观察 updateUse 分派去向
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
  // 包装链路方法
  window.__TRACE = [];
  const wrap = (name) => {
    const orig = g[name];
    if (typeof orig !== 'function') { window.__TRACE.push(['wrap-fail', name]); return; }
    g[name] = function (...a) {
      window.__TRACE.push([name, JSON.stringify(a[0]), JSON.stringify(a[1]), a[2]?.key ?? null]);
      const r = orig.apply(this, a);
      if (name === 'tryPlace' || name === 'tryMine') window.__TRACE.push([name + '.ret', JSON.stringify(r ?? null)]);
      return r;
    };
  };
  wrap('tryPlace'); wrap('tryMine'); wrap('useSwing'); wrap('tryPlaceWall'); wrap('tryGrassConvert');
  return { spot: [px, py], target, woodId };
});
if (S.fail) { console.log('STAGE-FAIL', JSON.stringify(S)); process.exit(1); }
const t = S.target;
console.log('target', JSON.stringify(t));

// 目标邻域支撑快照
const nb = await page.evaluate((xy) => {
  const st = window.__swGame.world.store;
  const rows = [];
  for (let dy = -1; dy <= 1; dy++) {
    const r = [];
    for (let dx = -1; dx <= 1; dx++) {
      const x = xy[0] + dx, y = xy[1] + dy;
      r.push(st.inBounds(x, y) ? `${st.isActive(x, y) ? st.get(x, y) : '.'}${st.isSolid(x, y) ? 'S' : ''}` : 'O');
    }
    rows.push(r.join(' '));
  }
  return rows;
}, [t.tx, t.ty]);
console.log('neighborhood(target center):', JSON.stringify(nb));

// 拾取 + 点击
const slot10 = await page.evaluate(() => {
  const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(slot10.x, slot10.y);
await sleep(300);
await page.mouse.move(t.sx, t.sy);
await sleep(100);
await page.evaluate(() => { window.__TRACE.push(['PRESS-START', 'mirror=' + (window.__swGame.player.inv.cursorMirror?.stack ?? null), 'held=' + (window.__swUI.heldStack?.stack ?? null)]); });
await page.mouse.down();
await sleep(300);
await page.evaluate(() => {
  const g = window.__swGame;
  window.__TRACE.push(['MID', 'mouseDown=' + g.input.mouseDown, 'held=' + window.__swUI.heldStack?.stack, 'mirror=' + g.player.inv.cursorMirror?.stack, 'overDomUi=' + g.inpOverDomUi(), 'useTime=' + g.player.useTime, 'swing=' + !!g.swing]);
});
await page.mouse.up();
await sleep(300);
const trace = await page.evaluate(() => window.__TRACE);
console.log('TRACE:', JSON.stringify(trace, null, 0));
const after = await page.evaluate((xy) => ({
  active: window.__swGame.world.store.isActive(xy[0], xy[1]),
  mirror: window.__swGame.player.inv.cursorMirror?.stack ?? null,
}), [t.tx, t.ty]);
console.log('after:', JSON.stringify(after));
await browser.close();
process.exit(0);
