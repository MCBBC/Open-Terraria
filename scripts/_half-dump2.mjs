// 半砖渲染 2×2 定位:水/空气 × 有墙/无墙 —— 水中半砖下半为何不是泥土色
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/halfdump3-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 160)));
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5204', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.42;
  const dirt = window.__swTileByKey('dirt');
  const stone = window.__swTileByKey('stone');
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 1; x < sx + 29; x++) for (let y = sy - 1; y < sy + 13; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  for (let x = sx - 1; x < sx + 29; x++) st.setTile(x, sy + 12, stone, 0);
  for (let y = sy; y < sy + 12; y++) { st.setTile(sx - 1, y, stone, 0); st.setTile(sx + 28, y, stone, 0); }
  for (let x = sx; x < sx + 28; x++) for (let y = sy; y < sy + 12; y++) { st.setWall(x, y, 1); st.setLiquid(x, y, 255, 1); }
  // 左半壁只铺到 sx+13:右侧 sx+14.. 无墙
  for (let x = sx + 14; x < sx + 28; x++) for (let y = sy; y < sy + 12; y++) st.setWall(x, y, 0);
  // A(sx+3) 墙+水 半砖 | B(sx+6) 无墙+水 半砖 | C(sx+9) 墙+水 全块 | D(sx+17) 无墙+水 半砖+上方也半砖
  const put = (x, y, half, liq) => { st.setTile(x, y, dirt, 0); if (half) st.setHalfBrick(x, y, true); st.setLiquid(x, y, liq, 1); };
  put(sx + 3, sy + 4, true, 255);
  put(sx + 6, sy + 4, true, 255);
  put(sx + 9, sy + 4, false, 255);
  put(sx + 17, sy + 4, true, 255);
  put(sx + 17, sy + 5, true, 255);
  g.player.x = (sx + 10) * 16; g.player.y = (sy + 2) * 16;
  window.__sx = sx; window.__sy = sy;
});
await new Promise((r) => setTimeout(r, 9000));
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 1.73; g.camera.zoomTarget = 1.73; });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const sx = window.__sx, sy = window.__sy;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  const dump = (tx, ty, label) => {
    const [x0, y0] = w2s(tx * 16, ty * 16);
    const W = Math.round(16 * z), H = Math.round(16 * z);
    const d = ctx.getImageData(Math.round(x0), Math.round(y0), W, H).data;
    const rows = [];
    for (let y = 0; y < H; y += 3) {
      const mids = [];
      for (let x = 4; x < W - 4; x += 10) { const i = (y * W + x) * 4; mids.push(`${d[i]},${d[i+1]},${d[i+2]}`); }
      rows.push(mids.join(' '));
    }
    return { label, rows };
  };
  return [
    dump(sx + 3, sy + 4, 'A wall+water half'),
    dump(sx + 6, sy + 4, 'B nowall+water half'),
    dump(sx + 9, sy + 4, 'C wall+water FULL'),
    dump(sx + 17, sy + 4, 'D nowall+water half(top)'),
  ];
});
for (const r of out) {
  console.log(`--- ${r.label}`);
  r.rows.forEach((row, i) => console.log(`  r${i * 3}: ${row}`));
}
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/halfdump.png' }); await browser.close();
