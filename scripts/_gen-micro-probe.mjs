// 诊断:微群系/沙丘/微光/大理石花岗岩/神庙 种子落地探针(纯浏览器内 generateWorld)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  const seeds = ['micro-a', 'micro-b', 'micro-c'];
  const results = [];
  for (const seed of seeds) {
    const t0 = Date.now();
    let snapshot = null;   // 微群系 pass 完成时(index 21)的起爆器计数
    let shimSnapshot = null; // 微光 pass 完成时(index 7)的微光液体计数
    const cnt = (st) => {
      let shim = 0, det = 0;
      for (let i = 0; i < st.liquidType.length; i++) if (st.liquidType[i] === 4 && st.liquid[i] > 0) shim++;
      for (let i = 0; i < st.type.length; i++) if (st.type[i] === BK['v_411_detonator']) det++;
      return { shim, det };
    };
    const world = await mod.generateWorld({
      width: 4200, height: 1200, seedText: seed, name: 'probe',
      onWorldPartial: (w, idx) => {
        if (idx === 7) shimSnapshot = cnt(w.store).shim;
        if (idx === 21) snapshot = cnt(w.store);
      },
    });
    const st = world.store;
    const gs = mod.lastGenState();
    const c = (k) => { const id = BK[k] ?? -1; let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] === id) n++; return n; };
    // 微光液体统计
    let shimmerCells = 0; let shimmerX = -1, shimmerY = -1;
    for (let i = 0; i < st.liquidType.length; i++) {
      if (st.liquidType[i] === 4 && st.liquid[i] > 0) { shimmerCells++; if (shimmerX < 0) { shimmerX = i % st.w; shimmerY = Math.floor(i / st.w); } }
    }
    // 沙丘:非海滩带的沙列数
    let duneCols = 0;
    for (let x = 450; x < st.w - 450; x++) {
      let sy = -1;
      for (let y = 0; y < Math.floor(1200 * 0.3); y++) if (st.flags[st.idx(x, y)]) { sy = y; break; }
      if (sy >= 0 && st.type[st.idx(x, sy)] === tiles.T.SAND) duneCols++;
    }
    // 露营地标:篝火+金币堆+硬化沙
    const campsites = Math.min(c('v_215_campfires') / 6 | 0, c('v_332_gold_coin_pile') / 3 | 0);
    results.push({
      seed, ms: Date.now() - t0,
      marble: c('v_367_marble_block'), granite: c('v_368_granite_block'),
      templeBrick: c('v_226_lihzahrd_brick'), templeAltar: c('v_237_lihzahrd_altar'),
      shimmerCells, shimmerX, shimmerY, gsShimmer: gs ? [gs.shimmerX, gs.shimmerY] : null,
      pyramidSpots: gs ? gs.pyramidSpots.length : -1,
      pyramidBrick: c('v_151_sandstone_brick'),
      duneCols, campsites,
      campfireTiles: c('v_215_campfires'), coinPiles: c('v_332_gold_coin_pile'),
      explosives: c('v_141_explosives'), detonators: c('v_411_detonator'),
      atMicroPass: snapshot, shimmerRightAfterPass: shimSnapshot,
      rerun: await (async () => {
        // 在成品世界上重跑一次微群系(新 RNG),统计各 tile 写入次数定位失败点
        const mb = await import('/src/world/gen/vanilla/MicroBiomesPass.ts');
        const { RNG } = await import('/src/core/rng.ts');
        const writes = {};
        const orig = world.store.setTileSilent.bind(world.store);
        world.store.setTileSilent = (x, y, t, fx, fy) => {
          const key = tiles.TILE_DEFS[t]?.key ?? String(t);
          writes[key] = (writes[key] ?? 0) + 1;
          return orig(x, y, t, fx, fy);
        };
        mb.runMicroBiomesPass(world.store, new RNG(987654321), mod.lastGenState());
        world.store.setTileSilent = orig;
        return writes;
      })(),
      spawn: [world.spawnX, world.spawnY],
    });
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 5));
await browser.close();
