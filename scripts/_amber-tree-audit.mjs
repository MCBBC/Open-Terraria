// 一次性诊断：琥珀宝石树(tile 589)落点与帧状态 + 与六宝石兄弟对比
// 运行：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_amber-tree-audit.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199'), { waitUntil: 'networkidle0', timeout: 60000 });

const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const BK = {}; tiles.TILE_DEFS.forEach((d, i) => { BK[d.key] = i; });
  const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: '12345', name: 'audit' });
  const st = world.store;
  const idx = st.idx.bind(st);
  const trees = {};
  for (const k of ['v_583_topaz_tree', 'v_584_amethyst_tree', 'v_585_sapphire_tree', 'v_586_emerald_tree', 'v_587_ruby_tree', 'v_588_diamond_tree', 'v_589_amber_tree']) {
    trees[k] = { id: BK[k], count: 0, fx: new Set(), fy: new Set(), samples: [] };
  }
  for (let y = 0; y < st.h; y++) {
    for (let x = 0; x < st.w; x++) {
      const i = idx(x, y);
      for (const k in trees) {
        if (st.type[i] !== trees[k].id) continue;
        const o = trees[k];
        o.count++;
        o.fx.add(st.frameX[i]); o.fy.add(st.frameY[i]);
        if (o.samples.length < 6) o.samples.push({ x, y, fx: st.frameX[i], fy: st.frameY[i], flags: st.flags[i] });
      }
    }
  }
  for (const k in trees) { trees[k].fx = [...trees[k].fx]; trees[k].fy = [...trees[k].fy]; }
  // 相机附近(2195,1022)±60 有什么
  const near = [];
  for (let y = 1022 - 60; y <= 1022 + 60; y++) {
    for (let x = 2195 - 60; x <= 2195 + 60; x++) {
      const i = idx(x, y);
      if (st.flags[i] && st.type[i] !== 0) near.push({ x, y, t: st.type[i], key: tiles.TILE_DEFS[st.type[i]]?.key, fx: st.frameX[i], fy: st.frameY[i] });
    }
  }
  const nearTree = near.filter((c) => String(c.key).includes('tree'));
  return { trees, nearCount: near.length, nearTree, nearSample: near.slice(0, 40) };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 5));
await browser.close();
