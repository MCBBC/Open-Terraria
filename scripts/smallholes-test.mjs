// 决定性实验:实心石世界(2100×700)跑原版 Small Holes 参数,测挖空率
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
  const W = 2100, H = 700;
  const gs = newGenState(W, H);
  gs.worldSurface = 180; gs.worldSurfaceLow = 150; gs.worldSurfaceHigh = 210; gs.rockLevel = 282;
  gs.rockLevelLow = 260; gs.rockLevelHigh = 310; gs.waterLine = 400; gs.lavaLine = 470;
  const rng = new RNG(7);
  const mk = () => { const st = new TileStore(W, H); st.type.fill(2); st.flags.fill(1); return st; };
  const airPct = (st, y0, y1) => {
    let air = 0, tot = 0;
    for (let x = 0; x < W; x += 2) for (let y = y0; y < y1; y++) { tot++; if (!st.flags[st.idx(x, y)]) air++; }
    return +(air / tot * 100).toFixed(1);
  };
  // Small Holes: count = area×0.0015 = 2205 轮,每轮两个 runner
  const st = mk();
  for (let n = 0; n < W * H * 0.0015; n++) {
    const type = -1;
    tileRunner(st, rng, gs, rng.int(0, W - 1), rng.int(gs.worldSurfaceHigh, H - 1), { strength: rng.int(2, 4), steps: rng.int(2, 19), type });
    tileRunner(st, rng, gs, rng.int(0, W - 1), rng.int(gs.worldSurfaceHigh, H - 1), { strength: rng.int(8, 14), steps: rng.int(7, 29), type });
  }
  const smallHoles = { deep: airPct(st, 350, 650), mid: airPct(st, 250, 350) };
  // Rock Layer Caves: count = area×0.00013 = 191
  const st2 = mk();
  for (let n = 0; n < W * H * 0.00013; n++) {
    tileRunner(st2, rng, gs, rng.int(0, W - 1), rng.int(gs.rockLevelHigh, H - 1), { strength: rng.int(6, 19), steps: rng.int(50, 299), type: -1 });
  }
  const rockCaves = { deep: airPct(st2, 350, 650), mid: airPct(st2, 250, 350) };
  // Dirt Layer Caves: count = area×3e-5 = 44
  const st3 = mk();
  for (let n = 0; n < W * H * 0.00003; n++) {
    tileRunner(st3, rng, gs, rng.int(0, W - 1), rng.int(gs.worldSurfaceLow, gs.rockLevelHigh), { strength: rng.int(5, 14), steps: rng.int(30, 199), type: -1 });
  }
  const dirtCaves = { band: airPct(st3, 200, 300) };
  return { smallHoles, rockCaves, dirtCaves };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
