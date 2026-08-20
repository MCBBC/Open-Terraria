// 水面线墙顶角落(泥土格顶部notch)合成像素直读:确认漏光与否及覆盖层
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dw3-profile',
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
  const dirt = K('dirt');
  const sx = 2082, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 16; x < sx + 34; x++) for (let y = sy - 12; y < sy + 10; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  const T = (x, y) => st.setTile(x, y, dirt, 0);
  const L = (x, y, q) => st.setLiquid(x, y, q, 1);
  for (let j = 0; j < 5; j++) { T(sx, sy + 2 + j); T(sx + 10, sy + 2 + j); }
  for (let k = 0; k < 11; k++) T(sx + k, sy + 7);
  for (let x = sx + 1; x <= sx + 9; x++) for (let j = 0; j < 5; j++) L(x, sy + 2 + j, 255);
  g.player.x = (sx + 5) * 16; g.player.y = (sy - 6) * 16;
  window.__sx = sx; window.__sy = sy;
});
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 4; g.camera.zoomTarget = 4; });
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom, sx = window.__sx, sy = window.__sy;
  const W = cv.width, H = cv.height;
  const w2sx = (wx) => Math.round(W / 2 + (wx - cam.x) * z);
  const w2sy = (wy) => Math.round(H / 2 + (wy - cam.y) * z);
  // 墙顶格(sx, sy+2) 全 16 行 × 泥土格+邻水格前2px = 18 列,逐像素 RGB
  const rows = [];
  const ref0 = ctx.getImageData(w2sx((sx - 12) * 16), w2sy((sy + 2) * 16), 1, 1).data;
  for (let wy = 0; wy < 6; wy++) {
    const cells = [];
    for (let wx = 0; wx < 18; wx++) {
      const d = ctx.getImageData(w2sx(sx * 16 + wx), w2sy((sy + 2) * 16 + wy), 1, 1).data;
      cells.push(`${d[0]},${d[1]},${d[2]}`);
    }
    rows.push(`y${wy}: ${cells.join(' ')}`);
  }
  return { ref0: `${ref0[0]},${ref0[1]},${ref0[2]}`, rows };
});
console.log('sky-ref:', out.ref0);
console.log(out.rows.join('\n'));
await browser.close();
