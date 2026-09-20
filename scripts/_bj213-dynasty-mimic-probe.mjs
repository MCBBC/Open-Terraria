// ★BJ213 一次性探针：王朝木箱（DynastyChest 2230,placeStyle 28）× 光明钥匙 召唤链
//  背景：用户实报"光明钥匙放入王朝木箱关箱不召唤神圣宝箱怪"；底座探针（普通箱 style0）全绿。
//  原版门（NPC.cs:78334）：BasicChest && (type!=21 || fx/36 <5 || >6) —— tile21 style 5/6 排除；
//  原版 2230 placeStyle=28（Item.cs:22520）。假设：本仓王朝木箱 frameX 落位错段/或放置链
//  给出的 style 不在 5/6 但本仓单源对 467/21 的 style 计算与原版错位。
//  场景 S1：直接按 placeStyle*28*36 铺 tile21 + 手动开/关箱拍 → 判定面
//  场景 S2：本仓真实放置链 placeItem（ DynastyChest 物品）→ 读落位 frameX → 同链判定
//  场景 S3：走真实 UI 链（UI 注入 openChestRef + 槽写入 + closeChest + update 每拍自动 chestChangeEvents）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN + '/?play=small&bj213' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) throw new Error('未进游戏');
await new Promise((r) => setTimeout(r, 9000));   // 出生清场窗口 settle

const out = {};

// ---- 页内公共夹具：hardmode + 箱铺放 + 钥匙入箱 + 开关箱拍 ----
out.S1 = await page.evaluate(async () => {
  const g = window.__swGame;
  const M = await import('/src/data/mods.ts').catch(() => ({}));
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  g.world.flags.hardMode = true;
  const st = g.world.store;
  const chestTile = TILE_BY_KEY['chest'];
  const sheet = TILE_DEFS[chestTile]?.vanilla?.sheet;
  const iid = invIndexOfVanilla(2230);           // DynastyChest
  const dynDef = items.ITEM_DEFS[iid];
  const ps = dynDef?.placeStyle ?? dynDef?.vanilla?.placeStyle ?? (items.ITEM_BY_KEY['vi_2230_DynastyChest'] != null ? items.ITEM_DEFS[items.ITEM_BY_KEY['vi_2230_DynastyChest']]?.placeStyle : undefined);
  // 铺 style 28 箱：frameX = 28*36 (+列/行内偏移)
  const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) - 30;
  const fx = 28 * 36;
  st.setTile(tx, ty, chestTile, fx, 0);
  st.setTile(tx + 1, ty, chestTile, fx + 18, 0);
  st.setTile(tx, ty + 1, chestTile, fx, 18);
  st.setTile(tx + 1, ty + 1, chestTile, fx + 18, 18);
  const chestData = { x: tx, y: ty, items: [{ id: invIndexOfVanilla(3092), stack: 1 }, null, null, null, null, null, null, null, null, null] };
  g.world.chests.push(chestData);
  const keyDef = items.ITEM_DEFS[invIndexOfVanilla(3092)];
  g.openChestRef = () => chestData;
  g.chestChangeEvents();
  g.openChestRef = () => null;
  g.chestChangeEvents();
  await new Promise((r) => setTimeout(r, 500));
  const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 475);
  const tileLeft = [0, 1, 2, 3].map((i) => st.type[st.idx(tx + (i % 2), ty + Math.floor(i / 2))]);
  return {
    sheet, iid, dynDefPlaceStyle: ps, dynDef: { key: dynDef?.key, tile: dynDef?.tile, placeStyle: dynDef?.placeStyle },
    keyDef: { key: keyDef?.key },
    chestGone: !g.world.chests.includes(chestData),
    tileCleared: tileLeft.every((t) => t === 0),
    mimic475: mimic ? { x: Math.round(mimic.x), y: Math.round(mimic.y), hp: mimic.hp } : null,
  };
});

// ---- S2：真实放置链 ----
out.S2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const { TILE_DEFS } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) - 10;
  const iid = invIndexOfVanilla(2230);
  const def = (await import('/src/data/items.ts')).ITEM_DEFS[iid];
  // 走本仓放置 API（placeItem/placeThing 等价入口）
  let placeRet = 'no-api';
  const api = g;
  const fnNames = ['placeItem', 'placeThing', 'tryPlaceTile', 'placeTileAt', 'useItemOn'];
  for (const fn of fnNames) {
    if (typeof api[fn] === 'function') { placeRet = fn; break; }
  }
  // 兜底：直接查本仓放置源 materialize——改用 tileInspect：手动模拟放置帧（与 setDefaults placeStyle*36 一致）
  const ps = def?.placeStyle ?? 0;
  const fx = ps * 36;
  st.setTile(tx, ty, (await import('/src/data/tiles.ts')).TILE_BY_KEY['chest'], fx, 0);
  st.setTile(tx + 1, ty, (await import('/src/data/tiles.ts')).TILE_BY_KEY['chest'], fx + 18, 0);
  st.setTile(tx, ty + 1, (await import('/src/data/tiles.ts')).TILE_BY_KEY['chest'], fx, 18);
  st.setTile(tx + 1, ty + 1, (await import('/src/data/tiles.ts')).TILE_BY_KEY['chest'], fx + 18, 18);
  const readFx = st.frameX[st.idx(tx, ty)];
  const sheet = TILE_DEFS[st.type[st.idx(tx, ty)]]?.vanilla?.sheet;
  return { placeApi: placeRet, placeStyle: ps, frameX: readFx, style: Math.floor(readFx / 36), sheet };
});

// ---- S3：真实 UI 链：UI.openChest → 箱槽写入 → closeChest → 每拍自动关箱拍 ----
out.S3 = await page.evaluate(async () => {
  const g = window.__swGame;
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const st = g.world.store;
  const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) + 10;
  const fx = 28 * 36;
  st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0);
  st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
  st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18);
  st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
  const chestData = { x: tx, y: ty, items: new Array(10).fill(null) };
  g.world.chests.push(chestData);
  // 真实 UI 链：找 UI 实例（window 上一般挂 __swUI / 经 game.ui）——遍历常见挂点
  const ui = window.__swUI ?? window.__swUi ?? g.ui ?? null;
  if (!ui) return { error: 'no-ui-handle' };
  // 开箱面板（等同 tryOpenChest 调 game.openChest(c)）
  const gameOpen = window.__swUIOpenChest ?? null;
  // 直接调 UI 注入的 game.openChest 闭包不可反查 → 走 UI 公开方法名探测
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(ui)).filter((m) => /chest/i.test(m));
  return { uiMethods: methods };
});

await browser.close();
console.log(JSON.stringify(out, null, 1));
console.log('pageerrors:', JSON.stringify(errors));
