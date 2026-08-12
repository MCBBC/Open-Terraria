// 阶段2 冒烟:直接调用 generateWorld(经 vite 模块加载)验证原版地形输出
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const t0 = Date.now();
const out = await page.evaluate(async (tStart) => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: 'phase2', name: 'test' });
  const st = world.store;
  // 每列首个实心行 → surface 统计
  const surf = new Float32Array(st.w);
  let badCols = 0, minS = 1e9, maxS = -1e9;
  for (let x = 0; x < st.w; x++) {
    let y = -1;
    for (let yy = 0; yy < st.h; yy++) if (st.flags[st.idx(x, yy)]) { y = yy; break; }
    surf[x] = y;
    if (y < 0) badCols++;
    else { minS = Math.min(minS, y); maxS = Math.max(maxS, y); }
  }
  // tile 计数
  const count = (pred) => { let n = 0; for (let i = 0; i < st.type.length; i++) if (pred(st.type[i])) n++; return n; };
  const tiles = await import('/src/data/tiles.ts');
  const T = tiles.T;
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => BK[d.key] = i);
  // 地表样本(每 100 列)
  const samples = [];
  for (let x = 0; x < st.w; x += 100) samples.push(surf[x]);
  return {
    genMs: Date.now() - tStart,
    badCols, minSurf: minS, maxSurf: maxS,
    h: st.h, w: st.w,
    groundLevel: world.groundLevel, rockLevel: world.rockLevel,
    crimson: world.crimson, dungeonX: world.dungeonX, jungleX: world.jungleX,
    dirt: count(t => t === T.DIRT), stone: count(t => t === T.STONE),
    air: count(t => t === 0),
    caves: (() => { // 岩石层洞穴率采样
      let cave = 0, total = 0;
      for (let x = 0; x < st.w; x += 3) for (let y = 300; y < 380; y += 2) { total++; if (st.type[st.idx(x, y)] === 0) cave++; }
      return total ? Math.round(cave / total * 100) : -1;
    })(),
    spawn: [world.spawnX, world.spawnY],
    spawnSolid: (() => { const x = world.spawnX; for (let dy = -2; dy < 6; dy++) { const i = st.idx(x, world.spawnY + dy); if (st.flags[i]) return world.spawnY + dy; } return -1; })(),
    surfaceSamples: samples,
    // 海洋验证:左右边缘 y 60-160 内水体格数 + 沙滩
    oceanL: (() => { let n = 0; for (let x = 5; x < 60; x++) for (let y = 60; y < 160; y++) if (st.liquid[st.idx(x, y)] > 0) n++; return n; })(),
    oceanR: (() => { let n = 0; for (let x = st.w - 60; x < st.w - 5; x++) for (let y = 60; y < 160; y++) if (st.liquid[st.idx(x, y)] > 0) n++; return n; })(),
    sandL: (() => { let n = 0; for (let x = 0; x < 80; x++) { const sy = surf[x]; if (sy >= 0 && st.type[st.idx(x, sy)] === T.SAND) n++; } return n; })(),
    sandR: (() => { let n = 0; for (let x = st.w - 80; x < st.w; x++) { const sy = surf[x]; if (sy >= 0 && st.type[st.idx(x, sy)] === T.SAND) n++; } return n; })(),
    // 生物群系存在性(阶段3)
    biomes: (() => {
      const c = (k) => { const id = BK[k] ?? -1; let n = 0; for (let i = 0; i < st.type.length; i++) if (st.type[i] === id) n++; return n; };
      return {
        snow: c('snow'), ice: c('ice'),
        mud: c('mud'), jungleGrass: c('v_60_jungle_grass_block'),
        hardsand: c('hardened_sand'), sandstone: c('sandstone'), fossil: c('desert_fossil'),
        mushGrass: c('v_70_mushroom_grass_block'),
        marble: c('v_367_marble_block'), granite: c('v_368_granite_block'),
        evil: c('v_25_ebonstone_block') + c('v_203_crimstone_block'),
        evilGrass: c('v_23_corrupt_grass_block') + c('v_199_crimson_grass_block'),
        altars: c('v_26_altars'), orbs: c('v_31_orb_heart'),
      };
    })(),
  };
}, t0);
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors:', errs.slice(0, 5));
await page.screenshot({path: '/tmp/gen-phase2.png'});
await browser.close();
