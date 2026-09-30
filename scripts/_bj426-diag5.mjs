// BJ426 诊断探针⑤：tryPlace 直调 air/grass 目标 + 逐门手算。
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
  const items = await import('/src/data/items.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const T723ID = tilesMod.TILE_BY_KEY['v_723_kite_anchor'];
  const p = g.player;
  const st = g.world.store;
  const R = { trace: [] };
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  const KITE_VID = 4613;
  const key = items.VANILLA_ITEM_KEY_BY_ID[KITE_VID];
  const id = items.ITEM_BY_KEY[key];
  const def = items.ITEM_DEFS[id];
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id, stack: 9, prefix: 0 };
  p.inv.selected = 0;
  p.x = 400 * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0;
  p.useTime = 0;
  g.entities.enemies.length = 0;
  const run = (tag, ax, ay, setup) => {
    setup(ax, ay);
    g.world.furnitureItems.length = 0; g.leashed.kites.length = 0;
    p.useTime = 0;
    const before = { tile: st.type[st.idx(ax, ay)] };
    g.tryPlace(ax, ay, def);
    R.trace.push(`${tag}: before=${JSON.stringify(before)} after tile=${st.type[st.idx(ax, ay)]}(723=${T723ID}) flags=${st.flags[st.idx(ax, ay)]} rec=${!!g.world.furnitureItems.find((r) => r.x === ax && r.y === ay && r.kind === 'kite_anchor')} ent=${g.leashed.kites.filter((e) => e.ax === ax && e.ay === ay && e.active).length} stack=${p.inv.slots[0]?.stack} belowSolid=${st.isSolid(ax, ay + 1)} wallHere=${st.wall[st.idx(ax, ay)]} inRange=${g.inTileRange(ax, ay, g.blockRange())} hasSupport=${g.hasSupport(ax, ay, 1, 1, true, false, 723)}`);
  };
  // a) 空气 + 泥底
  run('a-air', 403, sy - 2, (ax, ay) => {
    for (let dy = -2; dy <= 0; dy++) if (st.hasTile(ax, ay + dy)) st.setTile(ax, ay + dy, 0);
    st.setTile(ax, ay + 1, 1, 0, 0);
  });
  // b) 草 + 泥底
  run('b-grass', 405, sy - 2, (ax, ay) => {
    for (let dy = -1; dy <= 0; dy++) if (st.hasTile(ax, ay + dy)) st.setTile(ax, ay + dy, 0);
    st.setTile(ax, ay + 1, 1, 0, 0);
    st.setTile(ax, ay, 3, 0, 0);
  });
  // c) 空气 + 泥底 + 背后墙
  run('c-wall', 407, sy - 2, (ax, ay) => {
    for (let dy = -1; dy <= 0; dy++) if (st.hasTile(ax, ay + dy)) st.setTile(ax, ay + dy, 0);
    st.setTile(ax, ay + 1, 1, 0, 0);
    st.wall[st.idx(ax, ay)] = 2;
  });
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
