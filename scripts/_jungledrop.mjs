// 丛林植物帧级掉落探针（用户报"打掉丛林孢子植物没掉落"）：
// 原版 KillTile_DropItems case 61/74/703（WorldGen.cs:65017/:65660）：
//  61@fx144=孢子×2-3 / @162=玫瑰223 / @108-126=1/20 肥料208 / 其它 1/100 种子195
//  703@fx/18=8 → 孢子
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(200, 120, 777, 'jungle-drop');
  world.spawnX = 100; world.spawnY = 60;
  world.groundLevel = 40; world.rockLevel = 80; world.lavaLine = 100;
  const s0 = world.store;
  for (let x = 0; x < 200; x++) for (let y = 65; y < 120; y++) s0.setTile(x, y, 1);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame;
  const st = g.world.store;
  const t = await import('/src/data/tiles.ts');
  const { TILE_BY_KEY } = t;
  const P61 = TILE_BY_KEY['v_61_jungle_short_plants'];
  const P703 = TILE_BY_KEY['v_703_jungle_plants_echo'];
  // 打掉 = breakTile(byPlayer)；收集掉落 vid/stack
  const dropsAt = [];
  const origSpawn = g.spawnDrop.bind(g);
  g.spawnDrop = (x, y, key, stack) => {
    dropsAt.push({ key, stack });
    return origSpawn(x, y, key, stack, 0, -2);
  };
  const cut = (x, y, fx) => {
    st.setTile(x, y, P61);
    st.frameX[st.idx(x, y)] = fx;
    st.frameY[st.idx(x, y)] = 0;
    g.breakTile(x, y, true);
  };
  const dropsFor = (fx) => { dropsAt.length = 0; cut(100, 60, fx); return [...dropsAt]; };
  return {
    p61: P61, p703: P703,
    spores: dropsFor(144),      // 期望 331 ×2-3
    rose: dropsFor(162),        // 期望 223 ×1
    fertilizer10: (() => {      // fx=108 1/20——10 次取样
      const out = [];
      for (let k = 0; k < 10; k++) out.push(...dropsFor(108));
      return out;
    })(),
    large703: (() => {          // 703 fx=144(seg8) → 孢子
      if (!P703) return null;
      dropsAt.length = 0;
      st.setTile(102, 60, P703);
      st.frameX[st.idx(102, 60)] = 144;
      st.frameY[st.idx(102, 60)] = 0;
      g.breakTile(102, 60, true);
      return [...dropsAt];
    })(),
    plants: (() => {            // 植物族扩展：3/24/201/73/71/227
      const P3 = TILE_BY_KEY['v_3_forest_short_plants'];
      const P24 = TILE_BY_KEY['v_24_corruption_short_plants'];
      const P201 = TILE_BY_KEY['v_201_crimson_short_plants'];
      const P73 = TILE_BY_KEY['v_73_forest_tall_plants'];
      const P71 = TILE_BY_KEY['v_71_mushroom_plant'];
      const P227 = TILE_BY_KEY['v_227_dye_plants'];
      let kdiCalls = 0;
      const origKdi = g.killTileDropItems.bind(g);
      g.killTileDropItems = function (a, b, c) { kdiCalls++; return origKdi(a, b, c); };
      const one = (tile, fx, x) => {
        dropsAt.length = 0; kdiCalls = 0;
        st.setTile(x, 60, tile);
        st.frameX[st.idx(x, 60)] = fx;
        st.frameY[st.idx(x, 60)] = 0;
        g.breakTile(x, 60, true);
        return { keys: dropsAt.map((d) => d.key), kdiCalls };
      };
      return {
        forest144: one(P3, 144, 90),      // 期望蘑菇 vi_5_Mushroom
        forestSeeds: one(P3, 0, 91),      // 1/2 且需吹管——无吹管=空
        corrupt: one(P24, 144, 92),       // 期望腐化蘑菇 vi_60_VileMushroom
        crimson: one(P201, 270, 93),      // 期望猩红蘑菇 vi_2887
        tallSeeds: one(P73, 0, 94),       // 无吹管=空
        mush: one(P71, 0, 95),            // 1/2 发光蘑菇 vi_183
        dye: one(P227, 0, 96),            // 期望 vi_1107_TealMushroom
      };
    })(),
  };
});
console.log(JSON.stringify(r, null, 1));
const sp = r.spores[0];
const ok = sp && sp.key === 'vi_331_JungleSpores' && sp.stack >= 2 && sp.stack <= 3
  && r.rose[0] && r.rose[0].key === 'vi_223_NaturesGift'
  && (!r.large703 || (r.large703[0] && r.large703[0].key === 'vi_331_JungleSpores'));
const pl = r.plants;
const ok2 = pl.forest144[0] === 'vi_5_Mushroom' && pl.forestSeeds.length === 0
  && pl.corrupt[0] === 'vi_60_VileMushroom' && pl.crimson[0] === 'vi_2887_ViciousMushroom'
  && pl.tallSeeds.length === 0 && (pl.mush.length === 0 || ['vi_194_MushroomGrassSeeds', 'vi_183_GlowingMushroom'].includes(pl.mush[0]))
  && pl.dye[0] === 'vi_1107_TealMushroom';
const parts = {
  sp: !!sp && sp.key === 'vi_331_JungleSpores' && sp.stack >= 2 && sp.stack <= 3,
  rose: !!r.rose[0] && r.rose[0].key === 'vi_223_NaturesGift',
  l703: !r.large703 || (!!r.large703[0] && r.large703[0].key === 'vi_331_JungleSpores'),
  f144: pl.forest144.keys[0] === 'vi_5_Mushroom',
  fSeeds: pl.forestSeeds.keys.length === 0,
  corrupt: pl.corrupt.keys[0] === 'vi_60_VileMushroom',
  crimson: pl.crimson.keys[0] === 'vi_2887_ViciousMushroom',
  tSeeds: pl.tallSeeds.keys.length === 0,
  mush: pl.mush.keys.length === 0 || ['vi_194_MushroomGrassSeeds', 'vi_183_GlowingMushroom'].includes(pl.mush.keys[0]),
  dye: pl.dye.keys[0] === 'vi_1107_TealMushroom',
};
console.log(JSON.stringify(parts));
console.log(Object.values(parts).every(Boolean) ? 'PASS: 丛林+植物族帧级掉落' : 'FAIL');
await browser.close();
