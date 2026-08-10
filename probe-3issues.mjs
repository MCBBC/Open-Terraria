// 三问题诊断：①木墙合成 ②木锤拆墙 ③桌子放置
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_BY_KEY, ITEM_DEFS } = await import('/src/data/items.ts');
  const { RECIPES } = await import('/src/data/recipes.ts');
  const { T, TILE_DEFS, TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  const res = {};
  // ① 木墙合成表
  res.wallRecipe = RECIPES.filter((r) => r.out.includes('wall')).length;
  // ② 木锤拆墙：先放一面墙再锤
  const wallId = ITEM_DEFS[ITEM_BY_KEY['vi_93_wood_wall']].wallId;
  st.setWallSilent(px, py + 1, wallId);
  const hammer = ITEM_BY_KEY['wood_hammer'];
  const hDef = ITEM_DEFS[hammer];
  res.hammerTool = hDef.tool?.type;
  // toolCanBreak 判定
  res.toolCanBreakHammer = g.toolCanBreak(T.STONE, 25, 'hammer');
  // tryMine:目标格空+有墙
  const tx = px, ty = py + 1;
  res.tryMineWall = (() => {
    // 模拟 updateUse 的调用链:toolCanBreak(type...) type=0
    return g.toolCanBreak(st.get(tx, ty), 25, 'hammer');
  })();
  // ③ 桌子放置
  g.player.inv.add(ITEM_BY_KEY['table'], 1);
  g.player.inv.selected = g.player.inv.slots.findIndex((s) => s && s.id === ITEM_BY_KEY['table']);
  const tx2 = px + 3, ty2 = py + 1;
  const tableId = TILE_BY_KEY['table'];
  res.tableDef = { w: TILE_DEFS[tableId].w, h: TILE_DEFS[tableId].h, framed: TILE_DEFS[tableId].framed };
  // 清出 3×2 空间
  for (let dx = 0; dx < 3; dx++) for (let dy = -1; dy <= 0; dy++) {
    if (st.isActive(tx2 + dx, ty2 + dy)) st.setTileSilent(tx2 + dx, ty2 + dy, 0);
  }
  // 地面保证（ty2+1 实心）
  if (!st.isSolid(tx2 + 1, ty2 + 1)) st.setTileSilent(tx2 + 1, ty2 + 1, T.STONE);
  st.setWallSilent(tx2, ty2, wallId); // 支撑
  for (let dx = 0; dx < 3; dx++) st.setWallSilent(tx2 + dx, ty2, wallId);
  g.player.useTime = 0;
  g.tryPlace(tx2, ty2, ITEM_DEFS[ITEM_BY_KEY['table']]);
  res.tablePlaced = st.get(tx2, ty2) === tableId;
  res.tableFrames = [[0, 0], [1, 0], [2, 0], [0, 1]].map(([dx, dy]) => {
    const i = st.idx(tx2 + dx, ty2 + dy);
    return st.get(tx2 + dx, ty2) === tableId ? `${st.frameX[i]},${st.frameY[i]}` : 'MISS';
  });
  return res;
});
console.log(JSON.stringify(out));
await b.close();
