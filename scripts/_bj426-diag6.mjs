// BJ426 诊断探针⑥：草目标放置失败点定位（逐谓词手算）。
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
  const GameMod = await import('/src/core/Game.ts');
  const items = await import('/src/data/items.ts');
  const tilesMod = await import('/src/data/tiles.ts');
  const TILE_CUT = GameMod.TILE_CUT;
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
  const ax = 403, ay = sy - 2;
  for (let dy = -1; dy <= 0; dy++) if (st.hasTile(ax, ay + dy)) st.setTile(ax, ay + dy, 0);
  st.setTile(ax, ay + 1, 1, 0, 0);
  st.setTile(ax, ay, 3, 0, 0);
  g.world.furnitureItems.length = 0; g.leashed.kites.length = 0;
  const grassInternal = st.type[st.idx(ax, ay)];
  const grassDef = tilesMod.TILE_DEFS[grassInternal];
  R.trace.push(`grass internal=${grassInternal} sheet=${grassDef?.vanilla?.sheet} TILE_CUT.has=${TILE_CUT.has(grassInternal)} def=${grassDef?.key} framed=${grassDef?.framed}`);
  R.trace.push(`netCanEdit=${g.netCanEditTile()} smartLock=${JSON.stringify(g.smartCursor.lockedContinuity)} useTime=${p.useTime}`);
  R.trace.push(`inRange=${g.inTileRange(ax, ay, g.blockRange())} hasSupport=${g.hasSupport(ax, ay, 1, 1, true, false, 723)}`);
  // 全手动逐门: TILE_CUT 成员
  R.trace.push(`TILE_CUT.size=${TILE_CUT.size} sample=${[...TILE_CUT].slice(0, 12).join(',')}`);
  // breakTile 会在清格相调用——直接试
  g.tryPlace(ax, ay, def);
  R.trace.push(`tryPlace: tile=${st.type[st.idx(ax, ay)]}(723=${T723ID}) rec=${!!g.world.furnitureItems.find((r) => r.x === ax && r.y === ay && r.kind === 'kite_anchor')} stack=${p.inv.slots[0]?.stack}`);
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
