import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const w = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'final3', name: 't' });
  const st = w.store;
  const c = (k) => { const id = BK[k] ?? -1; let n = 0; for (let i = 0; i < st.type.length; i += 2) if (st.type[i] === id && st.flags[i]) n++; return n * 2; };
  const wallC = (id) => { let n = 0; for (let i = 0; i < st.wall.length; i += 2) if (st.wall[i] === id) n++; return n * 2; };
  return {
    // 群系
    snow: c('snow'), ice: c('ice'), jungleGrass: c('v_60_jungle_grass_block'), mushGrass: c('v_70_mushroom_grass_block'),
    // 结构
    dungeonBrick: c('v_41_blue_brick') + c('v_43_green_brick') + c('v_44_pink_brick'),
    temple: c('v_226_lihzahrd_brick'), hive: c('v_225_hive_block'),
    floating: c('v_189_cloud_block'), altar: c('v_26_altars'), orbs: c('v_31_orb_heart'),
    // 沙漠场强
    sandstoneWall: wallC(187), hardsandWall: wallC(216),
    // 地狱
    ash: c('ash'), hellstone: c('ore_hellstone'),
    chests: w.chests.length,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
