// 区域像素色 dump:半砖带 + 上方格的实际像素构成(判断 20% 非水像素是什么)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/regiondump-profile',
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
const setup = await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.42;
  const dirt = window.__swTileByKey('dirt');
  const stone = window.__swTileByKey('stone');
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 1; x < sx + 29; x++) for (let y = sy - 1; y < sy + 13; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  for (let x = sx - 1; x < sx + 29; x++) st.setTile(x, sy + 12, stone, 0);
  for (let y = sy; y < sy + 12; y++) { st.setTile(sx - 1, y, stone, 0); st.setTile(sx + 28, y, stone, 0); }
  for (let x = sx; x < sx + 28; x++) for (let y = sy; y < sy + 12; y++) { st.setWall(x, y, 1); st.setLiquid(x, y, 255, 1); }
  for (let k = 0; k < 4; k++) {
    st.setTile(sx + 12 + k, sy + 4, dirt, 0);
    st.setHalfBrick(sx + 12 + k, sy + 4, true);
    st.setLiquid(sx + 12 + k, sy + 4, 200, 1);
    st.setLiquid(sx + 12 + k, sy + 3, 255, 1);
  }
  g.player.x = (sx + 14) * 16; g.player.y = (sy + 2) * 16;
  window.__sx = sx; window.__sy = sy;
  return { ok: true };
});
console.log('场景:', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 9000));
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 1.73; g.camera.zoomTarget = 1.73; });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const sx = window.__sx, sy = window.__sy;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 上方整格水 tile (sx+13, sy+3) 逐行主色
  const dump = (tx, ty, label) => {
    const [x0, y0] = w2s(tx * 16, ty * 16);
    const [x1, y1] = w2s(tx * 16 + 16, ty * 16 + 16);
    const W = Math.round(x1 - x0), H = Math.round(y1 - y0);
    const d = ctx.getImageData(Math.round(x0), Math.round(y0), W, H).data;
    const rows = [];
    for (let y = 0; y < H; y += Math.max(1, Math.floor(H / 16))) {
      const rowPx = [];
      for (let x = 2; x < W - 2; x += Math.max(1, Math.floor(W / 8))) {
        const i = (y * W + x) * 4;
        rowPx.push([d[i], d[i+1], d[i+2]]);
      }
      rows.push(rowPx.map(p => p.join(',')).join(' | '));
    }
    return { label, W, H, rows };
  };
  return [
    dump(sx + 13, sy + 3, 'aboveHalf(full water)'),
    dump(sx + 13, sy + 4, 'halfBrick cell'),
    dump(sx + 13, sy + 5, 'belowHalf(water)'),
  ];
});
for (const r of out) {
  console.log(`--- ${r.label} (${r.W}x${r.H})`);
  r.rows.forEach((row, i) => console.log(`  r${i}: ${row}`));
}
await browser.close();
