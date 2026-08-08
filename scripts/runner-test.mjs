// 隔离测试:全石世界里跑巨型泥 runner,统计转换量与分布
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('pageerror', e => console.log('ERR:', e.message));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const { TileStore } = await import('/src/world/TileStore.ts');
  const { RNG } = await import('/src/core/rng.ts');
  const { tileRunner } = await import('/src/world/gen/vanilla/TileRunner.ts');
  const { newGenState } = await import('/src/world/gen/vanilla/GenState.ts');
  const tiles = await import('/src/data/tiles.ts');
  const MUD = tiles.TILE_BY_KEY['mud'];
  const st = new TileStore(600, 400);
  st.type.fill(tiles.T.STONE); st.flags.fill(1);   // 全石
  const gs = newGenState(600, 400);
  gs.worldSurface = 120; gs.rockLevel = 165; gs.waterLine = 250; gs.lavaLine = 320;
  const rng = new RNG(42);
  tileRunner(st, rng, gs, 300, 300, { strength: 300, steps: 10000, type: MUD, speedY: -20, mudWall: true });
  let n = 0, yMin = 1e9, yMax = -1, xMin = 1e9, xMax = -1;
  for (let x = 0; x < 600; x++) for (let y = 0; y < 400; y++) {
    if (st.type[st.idx(x, y)] === MUD && st.flags[st.idx(x, y)]) {
      n++;
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x);
      yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
    }
  }
  // 列剖面:x=300 处每 25 行的泥占比
  const colProfile = [];
  for (let y = 0; y < 400; y += 25) {
    let c = 0; for (let x = 260; x < 340; x++) if (st.type[st.idx(x, y)] === MUD) c++;
    colProfile.push(`${y}:${c}/80`);
  }
  return { converted: n, bbox: [xMin, xMax, yMin, yMax], colProfile };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
