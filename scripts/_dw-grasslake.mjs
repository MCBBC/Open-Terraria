// 自然湖边(草顶+泥土壁+水)在 OUR 引擎的漏光量化:水面线行逐泥土/草格统计
// tile 层透明像素中【浸润带覆盖不到】的部分(=漏背景像素)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dw6-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.38;
  const K = window.__swTileByKey;
  const dirt = K('dirt'), grass = K('grass');
  const sx = 2082, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 16; x < sx + 34; x++) for (let y = sy - 12; y < sy + 10; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  // 自然湖左岸: x=sx..sx+6 岸(草顶 sy+2,泥土 sy+3..sy+7),水面 sy+3(满),水 sx+7..sx+16 到 sy+7,底 sy+8 泥土
  for (let x = sx; x <= sx + 6; x++) {
    st.setTile(x, sy + 2, grass, 0);
    for (let y = sy + 3; y <= sy + 8; y++) st.setTile(x, y, dirt, 0);
  }
  for (let x = sx + 7; x <= sx + 16; x++) {
    for (let y = sy + 3; y <= sy + 7; y++) st.setLiquid(x, y, 255, 1);
    st.setTile(x, sy + 8, dirt, 0);
  }
  g.player.x = (sx + 8) * 16; g.player.y = (sy - 5) * 16;
  window.__sx = sx; window.__sy = sy;
});
await new Promise((r) => setTimeout(r, 6000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sx = window.__sx, sy = window.__sy;
  const S = 256;
  const alphaPts = (tx, ty) => {
    const cx = Math.floor(tx * 16 / S), cy = Math.floor(ty * 16 / S);
    const p = g.chunks.get(cx, cy);
    const c2 = p.tile.getContext('2d');
    const lx = tx * 16 - cx * S + p.sx, ly = ty * 16 - cy * S + p.sy;
    const d = c2.getImageData(lx, ly, 16, 16).data;
    const pts = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++)
      if (d[(y * 16 + x) * 4 + 3] < 16) pts.push([x, y]);
    return pts;
  };
  const fmt = (pts) => {
    const rows = {};
    for (const [x, y] of pts) rows.setdefault ?? 0;
    const m = new Map();
    for (const [x, y] of pts) { if (!m.has(y)) m.set(y, []); m.get(y).push(x); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([y, xs]) => {
      xs.sort((a, b) => a - b);
      const segs = []; let s = xs[0], prev = xs[0];
      for (const x of xs.slice(1)) { if (x === prev + 1) { prev = x; continue; } segs.push([s, prev]); s = prev = x; }
      segs.push([s, prev]);
      return `y${y}:` + segs.map(([a, b]) => a === b ? `${a}` : `${a}-${b}`).join(',');
    }).join('  ');
  };
  const res = {};
  // 岸边列(靠水): 草(sx+6, sy+2) 与 泥土(sx+6, sy+3..sy+5);水在右
  res.grass_water = { pts: alphaPts(sx + 6, sy + 2).length, map: fmt(alphaPts(sx + 6, sy + 2)) };
  res.dirt_water_top = { pts: alphaPts(sx + 6, sy + 3).length, map: fmt(alphaPts(sx + 6, sy + 3)) };
  res.dirt_water_mid = { pts: alphaPts(sx + 6, sy + 4).length, map: fmt(alphaPts(sx + 6, sy + 4)) };
  // 岸内列(草被草夹): 无水
  res.grass_inland = { pts: alphaPts(sx + 2, sy + 2).length, map: fmt(alphaPts(sx + 2, sy + 2)) };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 3; g.camera.zoomTarget = 3; });
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/grasslake-z3.png' });
await browser.close();
