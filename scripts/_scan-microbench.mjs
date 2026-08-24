// Scan/Blur 微基准(A/B 用,负载噪声下取 min-of-N):
// 确定性生成 158×116 仿真世界(地表/洞穴/水/岩浆/火把蜡烛/墙),直接计时
// scanner.exportTo 与 LightMap.blur,报告 min/p50。用法:
//   SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_scan-microbench.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await p.waitForFunction(() => window.__swGame?.world?.store, { timeout: 300_000 });

const out = await p.evaluate(async () => {
  const { TileLightScanner } = await import('/src/lighting/TileLightScanner');
  const { LightMap } = await import('/src/lighting/LightMap');
  const { TileStore } = await import('/src/world/TileStore');
  const { TILE_DEFS } = await import('/src/data/tiles');
  const { FlickerClock } = await import('/src/lighting/SkyColor');
  const { updateLightDecay } = await import('/src/lighting/lightTables');

  const W = 158, H = 116, GROUND = 40, LAVA = 108;
  const bySheet = (s) => TILE_DEFS.findIndex((d) => d?.vanilla?.sheet === s);
  const DIRT = bySheet(0), STONE = bySheet(1), GRASS = bySheet(2), TORCH = bySheet(4), CANDLE = bySheet(33), WOOD = bySheet(9);
  const st = new TileStore(W, H);
  // 确定性 LCG(避免 Math.random)
  let seed = 0x2545F491;
  const rnd = () => { seed = (Math.imul(seed, 1597334677) + 123456789) | 0; return ((seed >>> 8) & 0x7fffffff) / 0x80000000; };
  // 地形:正弦高度图 + 洞穴阈值
  const hmap = [];
  for (let x = 0; x < W; x++) hmap.push(GROUND + Math.round(Math.sin(x * 0.11) * 6 + Math.sin(x * 0.031) * 9));
  for (let x = 0; x < W; x++) {
    for (let y = hmap[x]; y < H; y++) {
      const depth = y - hmap[x];
      const cave = Math.sin(x * 0.19 + y * 0.07) * Math.sin(x * 0.05 - y * 0.13);
      let t = depth < 3 ? DIRT : depth < 14 ? DIRT : STONE;
      if (y > LAVA) t = STONE;
      if (cave > 0.62 && y > hmap[x] + 4 && y < LAVA - 4) t = 0;
      st.setTile(x, y, t);
      if (y >= hmap[x] + 2) st.wall[st.idx(x, y)] = 1;
    }
    if (rnd() < 0.12) st.setTile(x, hmap[x] - 1, TORCH, 0, (x % 24) * 22);
    if (rnd() < 0.06) st.setTile(x, hmap[x] - 2, CANDLE, 0, (x % 40) * 22);
    if (rnd() < 0.05) st.setTile(x, hmap[x] - 1, WOOD, 0, 0);
  }
  // 水池(地表凹处)与岩浆(底部)
  for (let k = 0; k < 5; k++) {
    const cx = 12 + k * 30;
    for (let x = cx; x < cx + 8; x++) for (let y = hmap[x]; y < hmap[x] + 3; y++) {
      const i = st.idx(x, y);
      st.setTile(x, y, 0);
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  for (let x = 0; x < W; x++) for (let y = LAVA + 2; y < H; y++) {
    const i = st.idx(x, y);
    if (st.type[i] === 0) { st.liquid[i] = 255; st.liquidType[i] = 2; }
  }
  for (let k = 0; k < 4; k++) {   // 微光液斑
    const x = 20 + k * 37, y = 60 + k * 9, i = st.idx(x, y);
    st.setTile(x, y, 0); st.liquid[i] = 255; st.liquidType[i] = 4;
  }

  for (let k = 0; k < 6; k++) updateLightDecay(13, false);
  const flicker = new FlickerClock();
  Object.defineProperty(flicker, 'globalTimeWrappedHourly', { value: 987.654, configurable: true });
  const world = { store: st, groundLevel: GROUND, lavaLine: LAVA, clock: { timeOfDay: 0.3, dayCount: 7, eclipse: false, isDay: true } };
  const map = new LightMap();
  map.setSize(W, H);
  map.nonVisiblePadding = 18;

  const bench = (fn, warm, n) => {
    for (let i = 0; i < warm; i++) fn();
    const ts = [];
    for (let i = 0; i < n; i++) {
      const t0 = performance.now();
      fn();
      ts.push(performance.now() - t0);
    }
    ts.sort((a, b) => a - b);
    return { min: +ts[0].toFixed(3), p50: +ts[n >> 1].toFixed(3), mean: +(ts.reduce((s, x) => s + x, 0) / n).toFixed(3) };
  };
  const scanner = new TileLightScanner(flicker);
  const perFrame = [{ x: 40, y: 30, r: 1, g: 0.6, b: 0.3 }, { x: 100, y: 80, r: 0.4, g: 0.9, b: 0.2 }];
  return {
    cells: W * H,
    scan: bench(() => scanner.exportTo(world, map, 0, 0, perFrame), 20, 300),
    blur: bench(() => map.blur(), 20, 300),
  };
});
console.log(JSON.stringify(out));
await b.close();
process.exit(0);
