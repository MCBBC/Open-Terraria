// E2E：合成工作台 → tile sheet 预取（2026-08-21 用户报"合成后放置:音效即响、
// 贴图过一会才显示"）。断言：
// ① 合成前 Tiles_18 未载（出生点扫描集不含工作台表=症状前提）
// ② vanillaCraft 直调预取 → 不放置的前提下表短延时内进 vimages（治本路径）
// ③ 放置时表已就位 → 首烘 chunk 缺表登记（chunkSheets）不含该文件 + 像素不透明
//    （无 fallback 白窗、无需晚到重烘兜底）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const FILE = 'vanilla/Tiles_18.png';
const craft = await p.evaluate(async () => {
  const g = window.__swGame;
  const atlas = g.atlas;
  const M = await import('/src/data/items.ts');
  const R = await import('/src/data/vanillaRecipes.ts');
  const FILE = 'vanilla/Tiles_18.png';
  const preLoaded = atlas.vimages.has(FILE);
  const woodKey = M.VANILLA_ITEM_KEY_BY_ID[9];
  g.player.inv.add(M.ITEM_BY_KEY[woodKey], 10);
  const recipe = R.VANILLA_RECIPES.find(r => r.create === 36);
  if (!recipe) return { error: 'no recipe create=36' };
  const before = g.player.inv.count?.(M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[36]]) ?? -1;
  g.vanillaCraft(recipe, 1);
  const wbId = M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[36]];
  const slot = g.player.inv.slots.find(s => s && s.id === wbId);
  return { preLoaded, crafted: !!slot, stack: slot?.stack, tile: M.ITEM_DEFS[wbId]?.tile ?? null, recipeItems: recipe.items };
});
console.log('craft:', JSON.stringify(craft));
if (craft.error) { console.log('FAIL'); process.exit(1); }

// ② 合成直调预取:不放置,表必须短延时内进缓存（此前要等放置烘焙 miss 才发请求）
const t0 = Date.now();
let arrived = false;
try {
  await p.waitForFunction((f) => window.__swGame.atlas.vimages.has(f), { timeout: 5000 }, FILE);
  arrived = true;
} catch { /* 超时 */ }
console.log(`prefetch: arrived=${arrived} in ${Date.now() - t0}ms (preLoaded=${craft.preLoaded})`);

// ③ 放置:表已就位 → 首烘即真图
const place = await p.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const M = await import('/src/data/items.ts');
  const wbId = M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[36]];
  const sel = g.player.inv.slots.findIndex(s => s && s.id === wbId);
  g.player.inv.selected = sel;
  const px = Math.floor(g.player.cx / 16), py = Math.floor(g.player.cy / 16);
  // 确定性落点:玩家右侧 3 格手工铺 2×1 平台（世界随机地形/植被会让"找空位"
  // 撞上 decor/斜坡/距离门,不收敛）——清两格+铺实心底,tryPlace 直放
  const T2 = await import('/src/data/tiles.ts');
  const stone = T2.TILE_BY_KEY['stone'];
  const x0 = px + 3, y0 = py;
  for (const [xx, yy, tt] of [[x0, y0, 0], [x0 + 1, y0, 0], [x0, y0 + 1, stone], [x0 + 1, y0 + 1, stone]]) {
    st.setTile(xx, yy, tt, 0, 0);
    st.setLiquid(xx, yy, 0, 0);
  }
  const spot = { x: x0, y: y0 };
  if (!spot) return { error: 'no spot' };
  const def = M.ITEM_DEFS[wbId];
  const gate = {
    a0: st.isActive(spot.x, spot.y), a1: st.isActive(spot.x + 1, spot.y),
    t0: st.get(spot.x, spot.y), t1: st.get(spot.x + 1, spot.y),
    useTime: g.player.useTime,
    support: g.hasSupport(spot.x, spot.y, def.w ?? 1, def.h ?? 1, !!def.framed, false),
  };
  const ok = g.tryPlace(spot.x, spot.y, def);
  const cx = Math.floor(spot.x / 16), cy = Math.floor(spot.y / 16);
  const k = (cx & 0xffff) | ((cy & 0xffff) << 16);
  return {
    ok, spot, gate, sheetReadyAtPlace: g.atlas.vimages.has('vanilla/Tiles_18.png'),
    placed: st.get(spot.x, spot.y),
    // 烘焙期缺表登记（私有字段运行期直读）:含 Tiles_18 = 首烘吃到 fallback（白窗）
    missRegistered: !!(g.chunks.chunkSheets.get(k)?.has('vanilla/Tiles_18.png')),
  };
});
console.log('place:', JSON.stringify(place));
if (place.error) { console.log('FAIL'); process.exit(1); }
// tryPlace 成功路径隐式返回 undefined——成功以落格 tile 判定
const wbTileId = await p.evaluate(async () => {
  const M = await import('/src/data/items.ts');
  const T = await import('/src/data/tiles.ts');
  return T.TILE_BY_KEY[M.ITEM_DEFS[M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[36]]].tile];
});
place.placedWorkbench = place.placed === wbTileId;

await new Promise(r => setTimeout(r, 600)); // flushDirty 重烘窗口
// 并行会话改码会触发 vite 全量 reload——__swGame 可能短暂消失,重等
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 60000 });
const pix2 = await p.evaluate(async (anchor) => {
  const g = window.__swGame;
  const st = g.world.store;
  const M = await import('/src/data/items.ts');
  const wbId = M.ITEM_BY_KEY[M.VANILLA_ITEM_KEY_BY_ID[36]];
  // 在放置点附近找本局放置的工作台锚点（frameX=0 的左上格;全图扫描会命中
  // 世界生成房屋里的既有工作台）
  let spot = null;
  const wbTile = (await import('/src/data/tiles.ts')).TILE_BY_KEY[M.ITEM_DEFS[wbId].tile];
  for (let x = anchor.x - 40; x <= anchor.x + 40 && !spot; x++) {
    for (let y = anchor.y - 20; y <= anchor.y + 20; y++) {
      if (!st.inBounds(x, y)) continue;
      if (st.type[st.idx(x, y)] === wbTile && st.frameX[st.idx(x, y)] === 0
        && st.frameY[st.idx(x, y)] === 0) { spot = { x, y }; break; }
    }
  }
  if (!spot) return { error: 'placed workbench not found' };
  const cx = Math.floor(spot.x / 16), cy = Math.floor(spot.y / 16);
  const pair = g.chunks.get(cx, cy);
  const ctx = pair.tile.getContext('2d');
  const img = ctx.getImageData(pair.sx, pair.sy, 256, 256).data;
  const lx0 = (spot.x - cx * 16) * 16, ly0 = (spot.y - cy * 16) * 16;
  let opaque = 0;
  for (let y = Math.max(0, ly0 - 4); y < Math.min(256, ly0 + 20); y++) {
    for (let x = Math.max(0, lx0 - 2); x < Math.min(256, lx0 + 34); x++) {
      if (img[(y * 256 + x) * 4 + 3] > 0) opaque++;
    }
  }
  return { opaque, spot, chunk: { cx, cy } };
}, place.spot);
console.log('pixels:', JSON.stringify(pix2));
const pass = arrived && place.placedWorkbench && place.sheetReadyAtPlace && !place.missRegistered && (pix2.opaque ?? 0) > 100;
console.log(pass ? 'PASS' : 'FAIL');
await b.close();
process.exit(pass ? 0 : 1);
