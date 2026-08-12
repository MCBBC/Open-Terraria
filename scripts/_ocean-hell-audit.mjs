// 一次性诊断：海洋"单体沙"分布 + 地狱建筑横坐标分布（seed 123456, 4200x1200，纯浏览器内 generateWorld）
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_ocean-hell-audit.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0', timeout: 60000 });

const report = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => { BK[d.key] = i; });
  const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: '123456', name: 'audit' });
  const st = world.store;
  const w = st.w, h = st.h;
  const ids = {
    sand: BK['sand'],
    hellBrick: BK['v_76_hellstone_brick'],
    hellBrickAnc: BK['v_684_ancient_hellstone_brick'],
    hellstone: BK['ore_hellstone'],
    forge: BK['v_17_furnace'],
  };
  const lavaLine = world.lavaLine;
  const idx = st.idx.bind(st);

  // ---- 1. 海洋单体沙：海盆范围内，四周(4邻)无沙且带水的沙格 = 孤立沙粒 ----
  const oceanW = 400;
  const isolated = { left: [], right: [] };
  const sandInOcean = { left: 0, right: 0 };
  for (const side of ['left', 'right']) {
    const x0 = side === 'left' ? 0 : w - oceanW;
    for (let y = 1; y < h - 1; y++) {
      for (let dx = 0; dx < oceanW; dx++) {
        const x = x0 + dx;
        const i = idx(x, y);
        if (st.type[i] !== ids.sand) continue;
        sandInOcean[side]++;
        const sandNbr =
          (st.type[idx(x - 1, y)] === ids.sand ? 1 : 0) + (st.type[idx(x + 1, y)] === ids.sand ? 1 : 0) +
          (st.type[idx(x, y - 1)] === ids.sand ? 1 : 0) + (st.type[idx(x, y + 1)] === ids.sand ? 1 : 0);
        const wet = st.liquid[i] > 0 || st.liquid[idx(x, y - 1)] > 0;
        if (sandNbr === 0 && wet && isolated[side].length < 60) {
          isolated[side].push([x, y, st.liquid[i]]);
        }
      }
    }
  }

  // ---- 2. 地狱建筑：y >= lavaLine 的地狱砖按 100 列宽分桶 ----
  const bin = 100;
  const bins = new Array(Math.ceil(w / bin)).fill(0);
  let hellBrickTotal = 0;
  for (let x = 0; x < w; x++) {
    for (let y = lavaLine; y < h; y++) {
      const t = st.type[idx(x, y)];
      if (t === ids.hellBrick || t === ids.hellBrickAnc) { bins[Math.floor(x / bin)]++; hellBrickTotal++; }
    }
  }
  const third = [0, 1, 2].map((k) => bins.slice(Math.floor(k * bins.length / 3), Math.floor((k + 1) * bins.length / 3)).reduce((a, b) => a + b, 0));

  // ---- 3. 地狱熔炉列分布 ----
  const forgeBins = new Array(Math.ceil(w / bin)).fill(0);
  for (let x = 0; x < w; x++) for (let y = lavaLine; y < h; y++) {
    if (st.type[idx(x, y)] === ids.forge) { forgeBins[Math.floor(x / bin)]++; }
  }

  // ---- 4. 贝壳堆落点分布（验证锚点回到水线浅滩）----
  const shell = BK['v_495_shell_pile_block'];
  const shellPts = [];
  for (let x = 0; x < w; x++) {
    for (let y = Math.max(0, Math.floor(world.worldSurface) - 80); y < Math.min(h, Math.floor(world.worldSurface) + 160); y++) {
      if (st.type[idx(x, y)] === shell) { shellPts.push([x, y]); break; }
    }
  }
  // ---- 5. 孤立沙 5x5 邻域快照 ----
  const nb = (px, py) => {
    const out = [];
    for (let dy = -2; dy <= 2; dy++) {
      const row = [];
      for (let dx = -2; dx <= 2; dx++) {
        const j = idx(px + dx, py + dy);
        row.push([st.type[j], st.flags[j], st.liquid[j]]);
      }
      out.push(row);
    }
    return out;
  };
  const isoNb = [...isolated.left, ...isolated.right].slice(0, 5).map(([x, y]) => ({ x, y, nb: nb(x, y) }));

  return {
    w, h, lavaLine, ids,
    sandInOcean,
    isolatedLeft: isolated.left, isolatedRight: isolated.right,
    isoNb,
    shellPts: { left: shellPts.filter(([x]) => x < w / 2), right: shellPts.filter(([x]) => x >= w / 2), total: shellPts.length },
    hellBrickTotal, third,
    binsPer100: bins,
    forgeBinsPer100: forgeBins,
    hellstoneTotal: (() => { let n = 0; for (let x = 0; x < w; x++) for (let y = lavaLine; y < h; y++) if (st.type[idx(x, y)] === ids.hellstone) n++; return n; })(),
  };
});
console.log(JSON.stringify(report));
console.log('pageerrors:', errors.slice(0, 5));
await browser.close();
