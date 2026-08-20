// 半砖 sprite 渲染对照:空气中 dirt 全块 vs 半砖 vs 水中半砖
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/halfdump-profile',
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
  // A: 空气中全块 dirt(sy-1 上排,盆上方)
  for (let k = 0; k < 3; k++) st.setTile(sx + 2 + k, sy - 1, dirt, 0);
  // B: 空气中半砖 dirt
  for (let k = 0; k < 3; k++) { st.setTile(sx + 6 + k, sy - 1, dirt, 0); st.setHalfBrick(sx + 6 + k, sy - 1, true); }
  // C: 水中半砖(sy+4, 液 255)
  for (let k = 0; k < 3; k++) { st.setTile(sx + 12 + k, sy + 4, dirt, 0); st.setHalfBrick(sx + 12 + k, sy + 4, true); st.setLiquid(sx + 12 + k, sy + 4, 255, 1); }
  g.player.x = (sx + 14) * 16; g.player.y = (sy + 2) * 16;
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
    for (let y = 0; y < H; y += 2) {
      const mids = [];
      for (let x = 4; x < W - 4; x += 8) { const i = (y * W + x) * 4; mids.push(`${d[i]},${d[i+1]},${d[i+2]}`); }
      rows.push(mids.join(' '));
    }
    return { label, rows };
  };
  return [
    dump(sx + 2, sy - 1, 'air full dirt'),
    dump(sx + 6, sy - 1, 'air half dirt'),
    dump(sx + 12, sy + 4, 'water half dirt'),
  ];
});
for (const r of out) {
  console.log(`--- ${r.label}`);
  r.rows.forEach((row, i) => console.log(`  r${i * 2}: ${row}`));
}
await browser.close();
