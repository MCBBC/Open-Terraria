// 映射探针:光标持物(槽10 取物)点全屏网格,逐点记录放置成败+阻断条件。
// 运行:SW_ORIGIN=http://localhost:5226 node tools/run-diag.mjs --timeout=300000 scripts/_cursor-place-vinv-map.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  defaultViewport: { width: 1600, height: 1000 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
await sleep(1000);

const prep = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  document.getElementById('sw-welcome-announce')?.remove();
  // 站位:开阔平地中央
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
  return { spot: [px, py], woodId };
});

if (prep.fail) { console.log('PREP-FAIL', JSON.stringify(prep)); process.exit(1); }

// 点槽 10 拾取
const slot10 = await page.evaluate(() => {
  const el = document.querySelector('.sw-vinv .sw-slot[data-idx="10"][data-where="inv"]');
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
await page.mouse.click(slot10.x, slot10.y);
await sleep(300);
const picked = await page.evaluate(() => ({
  held: window.__swUI.heldStack?.stack ?? null,
  mirror: window.__swGame.player.inv.cursorMirror?.stack ?? null,
}));
console.log('picked:', JSON.stringify(picked));

// 全屏网格扫描:每点按下 250ms 采样,记录放置/阻断面
const results = [];
for (let sy = 100; sy <= 900; sy += 100) {
  for (let sx = 150; sx <= 1500; sx += 100) {
    const r = await page.evaluate(async (pt) => {
      const g = window.__swGame;
      const st = g.world.store;
      const [wx, wy] = g.camera.screenToWorld(pt.sx, pt.sy);
      const tx = Math.floor(wx / 16), ty = Math.floor(wy / 16);
      const el = document.elementFromPoint(pt.sx, pt.sy);
      const cls = el ? (typeof el.className === 'string' ? el.className : '') : 'null';
      const tag = el ? el.tagName : 'null';
      const mirrorBefore = g.player.inv.cursorMirror?.stack ?? null;
      const activeBefore = st.inBounds(tx, ty) ? st.isActive(tx, ty) : null;
      // 该点是否"可放"(空气+邻活+射程)
      let placeable = false;
      if (st.inBounds(tx, ty) && !st.isActive(tx, ty)) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (st.isActive(tx + dx, ty + dy)) { placeable = true; break; }
      }
      const inRange = st.inBounds(tx, ty)
        && Math.hypot(tx * 16 + 8 - g.player.cx, ty * 16 + 8 - g.player.cy) <= 5 * 16;
      return { tag, cls: cls.slice(0, 40), placeable, inRange, activeBefore, mirrorBefore };
    }, { sx, sy });
    results.push({ sx, sy, ...r, action: 'probe' });
  }
}
// 分两类点:placeable∧inRange(期望放置) vs 其余
const good = results.filter((r) => r.placeable && r.inRange);
console.log('candidate placeable+inRange points:', good.length, '/', results.length);
console.log(JSON.stringify(good.slice(0, 40), null, 0));
console.log('pageerrors:', JSON.stringify(errs));
await browser.close();
process.exit(0);
