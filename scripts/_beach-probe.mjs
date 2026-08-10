import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/?play=small&beach=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
const stats = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const sheetOf = (t) => {
    // 反查 sheet：用 TILE_DEFS 不可得（未暴露）——用 g.tileByKey 反查不行（key→id）。
    // 直接在页面里重新计算等价统计：遍历全图按 type 聚合，type 语义用已知常量推断
    return null;
  };
  // 用已知内部 id 语义：T 常量不可直接取——通过 tileByKey（TILE_BY_KEY）拿 id
  const TBK = g.tileByKey; // { key: id }
  const ids = {
    tallgrass: TBK['tallgrass'], flower: TBK['flower'], mushroom: TBK['mushroom'],
    sand: TBK['sand'], shell: TBK['v_495_shell_pile_block'], seaweed: TBK['v_549_seaweed'],
    glowShroom: TBK['v_71_mushroom_plant'], mushGrass: TBK['v_70_mushroom_grass_block'],
    grass: TBK['grass'], corruptPlants: TBK['v_24_corruption_short_plants'], crimsonPlants: TBK['v_201_crimson_short_plants'],
  };
  const out = {};
  for (const [k, id] of Object.entries(ids)) out[k] = { id, count: 0 };
  let weedsOnSand = 0, weedsInWater = 0;
  const w = st.w, h = st.h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = st.type[i];
      if (t === 0) continue;
      for (const [k, o] of Object.entries(out)) if (t === o.id) { o.count++; break; }
      if ((t === ids.tallgrass || t === ids.flower || t === ids.mushroom)) {
        if (st.liquid[i] > 0) weedsInWater++;
        if (st.flags[st.idx(x, y + 1)] && st.type[st.idx(x, y + 1)] === ids.sand) weedsOnSand++;
      }
    }
  }
  return { out, weedsOnSand, weedsInWater, w, h };
});
// 传送到左海滩，等 critter 生成
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 40 * 16; g.player.y = (g.world.groundLevel - 4) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
});
await new Promise((r) => setTimeout(r, 12000));
async function pollCritters() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const r = await page.evaluate(() => {
      const g = window.__swGame;
      if (!g) return { retry: true };
      const list = {};
      for (const c of [...(g.entities.critters ?? []), ...(g.entities.enemies ?? [])]) {
        if ((g.entities.enemies ?? []).includes(c)) { const vn = c.vanillaId ?? c.def?.vanilla?.sheet; list['enemy:' + (vn ?? '?')] = (list['enemy:' + (vn ?? '?')] ?? 0) + 1; continue; }
        const k = c.def?.key ?? '?';
        list[k] = (list[k] ?? 0) + 1;
      }
      return { critterCounts: list, total: (g.entities.critters ?? []).length };
    }).catch(() => ({ retry: true }));
    if (!r.retry) return r;
    await new Promise((r2) => setTimeout(r2, 1000));
  }
  return { critterCounts: {}, total: -1 };
}
const critters = await pollCritters();
console.log(JSON.stringify({ stats, critters, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
