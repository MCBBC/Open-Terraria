// BJ426 诊断探针④：tryPlace 逐门细查（air vs grass 目标）+ anchorSpecOf(723)。
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
  // anchorSpecOf 从模块抓（recon-tileobj 表）
  let spec723 = 'n/a';
  try {
    const m = await import('/src/world/place/TileObjectSpecs.ts');
    spec723 = m.anchorSpecOf ? JSON.stringify(m.anchorSpecOf(723)) : 'no-fn';
  } catch (e1) {
    try {
      const m2 = await import('/src/world/gen/vanilla/TileObjectData.ts');
      spec723 = m2.anchorSpecOf ? JSON.stringify(m2.anchorSpecOf(723)) : 'no-fn2';
    } catch (e2) { spec723 = 'mod-err:' + String(e1?.message ?? e1).slice(0, 60); }
  }
  const p = g.player;
  const st = g.world.store;
  const R = { spec723, trace: [] };
  let sy = 40; for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
  const KITE_VID = 4613;
  const key = items.VANILLA_ITEM_KEY_BY_ID[KITE_VID];
  const id = items.ITEM_BY_KEY[key];
  p.inv.slots.fill(null);
  p.inv.slots[0] = { id, stack: 9, prefix: 0 };
  p.inv.selected = 0;
  p.x = 400 * 16; p.y = (sy - 4) * 16; p.vx = 0; p.vy = 0;
  g.entities.enemies.length = 0;
  const def = items.ITEM_DEFS[id];
  const snap = (tag, x, y) => R.trace.push(`${tag}: tile=${st.type[st.idx(x, y)]} flags=${st.flags[st.idx(x, y)]} rec=${!!g.world.furnitureItems.find((r) => r.x === x && r.y === y && r.kind === 'kite_anchor')} ent=${g.leashed.kites.filter((e) => e.ax === x && e.ay === y && e.active).length} stack=${p.inv.slots[0]?.stack} useTime=${p.useTime} inRange=${g.inTileRange(x, y, g.blockRange())}`);
  // a) 空气目标 + 泥土下方（人造:清理场地后放置）
  {
    const ax = 410, ay = sy - 2;
    for (let dy = -2; dy <= 0; dy++) st.setTile(ax, ay + dy, 0);
    st.setTile(ax, ay + 1, 1, 0, 0);          // 泥
    g.world.furnitureItems.length = 0; g.leashed.kites.length = 0;
    snap('a-before', ax, ay);
    const r = g.rightClickTileNpcDispatch(ax, ay, def);
    snap(`a-after(ret=${r})`, ax, ay);
    st.setTile(ax, ay + 1, 0);
    if (st.type[st.idx(ax, ay)] === T723ID) st.setTile(ax, ay, 0);
  }
  // b) 草目标 + 泥土下方
  {
    const ax = 412, ay = sy - 2;
    for (let dy = -1; dy <= 0; dy++) st.setTile(ax, ay + dy, 0);
    st.setTile(ax, ay + 1, 1, 0, 0);
    st.setTile(ax, ay, 3, 0, 0);              // 草
    g.world.furnitureItems.length = 0; g.leashed.kites.length = 0;
    snap('b-before', ax, ay);
    const r = g.rightClickTileNpcDispatch(ax, ay, def);
    snap(`b-after(ret=${r})`, ax, ay);
  }
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
