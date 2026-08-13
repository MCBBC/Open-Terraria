// 诊断:剑冢几何验证——洞心在种子点下方/水潭/土丘/剑位/竖井
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox'], defaultViewport:{width:1280,height:800}});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', {waitUntil:'networkidle0'});
const out = await page.evaluate(async () => {
  const mod = await import('/src/world/gen/WorldGen.ts');
  const tiles = await import('/src/data/tiles.ts');
  const K = tiles.TILE_BY_KEY;
  const results = [];
  for (const seed of ['sw-smoke-b', 'sw-smoke-c', 'sw-smoke-d']) {
    const world = await mod.generateWorld({ width: 4200, height: 1200, seedText: seed, name: 'probe' });
    const st = world.store;
    const gs = mod.lastGenState();
    // 花墙 68 连通域 → 剑冢洞腔
    const seen = new Uint8Array(st.type.length);
    const shrines = [];
    for (let i = 0; i < st.wall.length; i++) {
      if (st.wall[i] !== 68 || seen[i]) continue;
      // BFS 收集同域花墙格
      const q = [i]; seen[i] = 1;
      let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, cells = 0, water = 0, grass = 0, dirt = 0;
      while (q.length) {
        const k = q.pop(); cells++;
        const x = k % st.w, y = (k / st.w) | 0;
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
        if (st.liquid[k] > 0 && st.liquidType[k] === 1) water++;
        if (st.flags[k] && st.type[k] === K['grass']) grass++;
        if (st.flags[k] && st.type[k] === K['dirt']) dirt++;
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
          const nk = ny * st.w + nx;
          if (!seen[nk] && st.wall[nk] === 68) { seen[nk] = 1; q.push(nk); }
        }
      }
      if (cells < 200) continue;   // 滤掉零星残留
      // 域内/上方找剑(187 或 186 任意 style,3×2 上行左锚)
      let sword = null;
      const cx = (minX + maxX) >> 1;
      for (let y = minY - 20; y < maxY + 5 && !sword; y++) {
        for (let x = cx - 30; x <= cx + 30 && !sword; x++) {
          if (x < 0 || y < 0 || x >= st.w || y >= st.h) continue;
          const k = y * st.w + x;
          if (!st.flags[k]) continue;
          if (st.type[k] === K['v_187_decos_3x2_group_2'] || st.type[k] === K['v_186_decos_3x2']) {
            if (st.frameY[k] === 0 && st.frameX[k] % 54 === 0) sword = { x, y, t: st.type[k] === K['v_187_decos_3x2_group_2'] ? 187 : 186, style: st.frameX[k] / 54 };
          }
        }
      }
      // 竖井:域顶向上 1 宽开口列(连续空格)
      let shaft = 0;
      for (let y = minY - 1; y > minY - 120; y--) {
        if (y < 0) break;
        const k = y * st.w + cx;
        if (st.flags[k]) break;
        shaft++;
      }
      shrines.push({ cells, w: maxX - minX + 1, h: maxY - minY + 1, water, grass, dirt, sword, shaftTop: shaft, surf: Math.floor(gs.worldSurface) });
    }
    results.push({ seed, shrineCount: shrines.length, shrines });
  }
  return results;
});
console.log(JSON.stringify(out, null, 1));
console.log('PAGE_ERRORS:', errs.length ? errs : 'none');
await browser.close();
process.exit(errs.length ? 1 : 0);
