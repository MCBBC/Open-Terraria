// BJ426 诊断探针⑧：E 场景（reel 后 415/pin413 hold）tryPlace 调用追踪。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const step = async (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); await raf(); } };
  const items = await import('/src/data/items.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const T723ID = tilesMod.TILE_BY_KEY['v_723_kite_anchor'];
  const st = g.world.store;
  const p = g.player;
  const R = { trace: [] };
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  for (let x = 396; x <= 430; x++) for (let y = sy; y < sy + 3; y++) st.setTile(x, y, 1, 0, 0);
  for (let x = 396; x <= 430; x++) for (let y = sy - 6; y < sy; y++) if (st.hasTile(x, y)) st.setTile(x, y, 0);
  for (let x = 396; x <= 430; x++) for (let y = sy - 6; y < sy; y++) st.wall[st.idx(x, y)] = 0;
  const KITE_VID = 4613;
  const id = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[KITE_VID]];
  const give = (n) => { p.inv.slots[0] = n > 0 ? { id, stack: n, prefix: 0 } : null; p.inv.selected = 0; };
  const pin = (px) => { p.x = px * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0; };
  const aim = (tx, ty) => {
    const [sx, sy2] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy2;
  };
  const hold = (tx, ty, pinX, frames) => {
    for (let i = 0; i < 30; i++) { pin(pinX); g.fixedUpdate(1 / 60); }
    g.input.rightDown = true;
    for (let i = 0; i < frames; i++) { pin(pinX); aim(tx, ty); g.fixedUpdate(1 / 60); }
    g.input.rightDown = false;
    for (let i = 0; i < 2; i++) { pin(pinX); g.fixedUpdate(1 / 60); }
  };
  g.entities.enemies.length = 0;
  give(3);
  await step(10);
  // 1) 飞行态建立：左键出膛
  give(1);
  pin(413);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  for (let i = 0; i < 6; i++) { pin(413); aim(420, sy - 8); g.fixedUpdate(1 / 60); await raf(); }
  g.input.mouseDown = false; g.input.mouseHeld = false;
  await step(2);
  const flying = g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj' && !e.dead).length;
  // 2) 收线 100 拍
  hold(420, sy - 8, 413, 100);
  const flyingAfter = g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj' && !e.dead).length;
  // 3) tryPlace 调用追踪 + hold 放置
  give(3);
  const rhOrig = p.inv.removeHeld.bind(p.inv);
  const rhLog = [];
  p.inv.removeHeld = function (n) { rhLog.push(`rh(${n}) sel=${this.selected} slot0=${this.slots[0]?.stack} mirror=${JSON.stringify(this.cursorMirror?.stack ?? null)}`); const r = rhOrig(n); rhLog.push(`→ slot0=${this.slots[0]?.stack ?? 'null'}`); return r; };
  const orig = g.tryPlace.bind(g);
  const calls = [];
  g.tryPlace = function (tx2, ty2, d) { calls.push([tx2, ty2, d?.vid]); return orig(tx2, ty2, d); };
  const log = [];
  const stOrig = st.setTile.bind(st);
  st.setTile = function (x, y, t, fx, fy) {
    if (x === 415 && y === sy - 1 && t === 0) log.push('CLEAR@' + String(new Error().stack).split('\n').slice(2, 7).join(' <- '));
    return stOrig(x, y, t, fx, fy);
  };
  const btOrig = g.breakTile.bind(g);
  g.breakTile = function (x, y, f) { log.push(`BREAK(${x},${y},${f})`); return btOrig(x, y, f); };
  hold(415, sy - 1, 413, 5);
  st.setTile = stOrig;
  g.breakTile = btOrig;
  g.tryPlace = orig;
  R.trace.push(`LOG=${log.join(' | ').slice(0, 1500)}`);
  R.trace.push(`flying=${flying} flyingAfter=${flyingAfter} tryPlaceCalls=${JSON.stringify(calls)} tile415=${st.type[st.idx(415, sy - 1)]}(723=${T723ID}) stack=${p.inv.slots[0]?.stack} cam=${(g.camera.x / 16).toFixed(2)} px=${Math.floor(p.x / 16)}`);
  R.trace.push(`after: rec=${JSON.stringify(g.world.furnitureItems.filter((r) => r.kind === 'kite_anchor'))} leashed=${g.leashed.kites.filter((e) => e.active).length} drops=${g.entities.drops.filter((d) => !d.dead).map((d) => items.ITEM_DEFS[d.itemId]?.key + 'x' + d.stack).join(',')} rhLog=${rhLog.join(' | ')}`);
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
