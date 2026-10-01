// BJ426 诊断探针⑦：tryPlace 逐门直查（B/E 间歇拒置定位）。
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
  const GameMod = await import('/src/core/Game.ts');
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
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id, stack: 3, prefix: 0 };
  p.inv.selected = 0;
  g.entities.enemies.length = 0;
  await step(10);
  for (const [tx, ty, tag] of [[405, sy - 1, 'B'], [415, sy - 1, 'E']]) {
    p.x = (tx - 2) * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0; p.useTime = 0;
    await step(3);
    const anchorStyle = GameMod.anchorTilePlacementStyle(st, tx, ty);
    const gates = {
      edit: g.netCanEditTile(),
      range: g.inTileRange(tx, ty, g.blockRange()),
      lock: g.smartCursor.lockedContinuity,
      anchorStyle,
      hasSupport: g.hasSupport(tx, ty, 1, 1, true, false, 723),
      target: st.type[st.idx(tx, ty)],
      flags: st.flags[st.idx(tx, ty)],
      below: st.type[st.idx(tx, ty + 1)],
      belowSolid: st.isSolid(tx, ty + 1),
      wall: st.wall[st.idx(tx, ty)],
      useT: p.useTime,
      held: p.inv.heldItem()?.id ?? -1,
      sel: p.inv.selected,
    };
    const before = p.inv.slots[0].stack;
    g.tryPlace(tx, ty, items.ITEM_DEFS[id]);
    R.trace.push(`${tag}: gates=${JSON.stringify(gates)} tryPlace→ tile=${st.type[st.idx(tx, ty)]}(723=${T723ID}) stack ${before}→${p.inv.slots[0]?.stack} rec=${!!g.world.furnitureItems.find((r) => r.x === tx && r.y === ty && r.kind === 'kite_anchor')}`);
    // 清场重置
    if (st.type[st.idx(tx, ty)] === T723ID) {
      st.setTile(tx, ty, 0);
      g.world.furnitureItems.length = 0;
      g.leashed.kites.length = 0;
    }
  }
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
