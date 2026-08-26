// 一次性:门/椅放置锚定验证——①门悬墙(无顶底实心)拒 ②门落地行放行 ③门顶悬挂放行
// ④椅纯墙悬空拒 ⑤椅落地放行 ⑥椅侧邻实心(SolidSide)放行 ⑦门/platform 不算实心锚
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1600, height: 1000 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const st = g.world.store;
  const DOOR = tiles.TILE_BY_KEY['door_closed'];
  const CHAIR = tiles.TILE_BY_KEY['chair'];
  const doorItem = items.ITEM_DEFS.findIndex((d) => d?.tile === 'door_closed');
  const chairItem = items.ITEM_DEFS.findIndex((d) => d?.tile === 'chair');
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 4;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  // 大空场 + 背景木墙全铺
  for (let y = gy - 18; y <= gy + 2; y++) for (let x = px - 24; x <= px + 24; x++) {
    st.setTile(x, y, 0);
    st.setWall(x, y, 30);   // 木墙
  }
  for (let x = px - 24; x <= px + 24; x++) st.setTile(px + x - px, gy + 2, 0); // 保持场地无地砖干扰(地面留在 gy+3 以下)
  const countTile = (ri) => { let n = 0; for (let y = 0; y < st.h; y++) for (let x = 0; x < st.w; x++) if (st.get(x, y) === ri) n++; return n; };
  // 局部计数(扫描区小窗)
  const tryPlace = (itemIdx, tx, ty) => { g.tryPlace(tx, ty, items.ITEM_DEFS[itemIdx]); };
  const cnt = (ri, x0, x1, y0, y1) => { let n = 0; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (st.get(x, y) === ri) n++; return n; };
  const X = px + 4;
  // 清场:gy-12..gy+1 全空,背景木墙已铺;地面测试用临时石块(用完即清)
  for (let y = gy - 12; y <= gy + 1; y++) for (let x = X - 2; x <= X + 2; x++) st.setTile(x, y, 0);
  const res = {};
  // ①门悬墙:候选域内无任何实心 → 拒
  tryPlace(doorItem, X, gy - 4);
  res.doorWallOnly = cnt(DOOR, X - 1, X + 1, gy - 10, gy + 1);
  // ②门落地:石块在 (X, gy+1),点击 gy-2 → 格 gy-2..gy,底锚=gy+1 石 ✓
  st.setTile(X, gy + 1, 2);
  tryPlace(doorItem, X, gy - 2);
  res.doorOnFloor = cnt(DOOR, X - 1, X + 1, gy - 4, gy + 1);
  st.setTile(X, gy + 1, 0);
  for (let y = gy - 4; y <= gy; y++) if (st.get(X, y) === DOOR) st.setTile(X, y, 0);
  // ③门顶悬:石块在 (X, gy-7),点击 gy-5 → 首候选 cy=gy-6,格 gy-6..gy-4,顶锚=gy-7 ✓
  st.setTile(X, gy - 7, 2);
  tryPlace(doorItem, X, gy - 5);
  res.doorHanging = cnt(DOOR, X - 1, X + 1, gy - 8, gy - 3);
  st.setTile(X, gy - 7, 0);
  for (let y = gy - 8; y <= gy - 3; y++) if (st.get(X, y) === DOOR) st.setTile(X, y, 0);
  // ④椅纯墙悬空 → 拒
  tryPlace(chairItem, X, gy - 2);
  res.chairWallOnly = cnt(CHAIR, X, X, gy - 6, gy + 1);
  // ⑤椅落地:石 (X, gy+1),点击 gy → 格 gy-1,gy,底锚=gy+1 ✓
  st.setTile(X, gy + 1, 2);
  tryPlace(chairItem, X, gy);
  res.chairOnFloor = cnt(CHAIR, X, X, gy - 4, gy + 1);
  st.setTile(X, gy + 1, 0);
  for (let y = gy - 4; y <= gy; y++) if (st.get(X, y) === CHAIR) st.setTile(X, y, 0);
  // ⑥椅 SolidSide:石 (X+1, gy)(底行侧邻),下方空 → 放行
  st.setTile(X + 1, gy, 2);
  tryPlace(chairItem, X, gy);
  res.chairSide = cnt(CHAIR, X, X, gy - 4, gy + 1);
  st.setTile(X + 1, gy, 2 - 2);
  for (let y = gy - 4; y <= gy; y++) if (st.get(X, y) === CHAIR) st.setTile(X, y, 0);
  // ⑦门:下方仅平台(SolidWithTop 不在门锚集) → 拒
  const PLAT = tiles.TILE_BY_KEY['v_19_platforms'];
  if (PLAT) {
    st.setTile(X, gy + 1, PLAT);
    tryPlace(doorItem, X, gy - 2);
    res.doorOnPlatform = cnt(DOOR, X - 1, X + 1, gy - 4, gy + 1);
    st.setTile(X, gy + 1, 0);
  }
    res.doorItem = items.ITEM_DEFS[doorItem]?.key; res.chairItem = items.ITEM_DEFS[chairItem]?.key; res.chairTileId = CHAIR;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
