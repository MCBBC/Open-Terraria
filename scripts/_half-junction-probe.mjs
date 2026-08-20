// 半砖衔接覆盖审计(2026-08-20 用户实报:地表上方半砖衔接处透远景背景亮光):
// 场景=地表上方(无墙)实心行,交替 full/half;逐列统计 tile 顶 8px 的透亮(天空)像素
// ——vanilla :1609-1652 drawHalfBrickSeam 应盖住衔接列;泄漏=天空直透。
// 用法:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=300000 scripts/_half-junction-probe.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/halfjn-profile',
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
  const K = window.__swTileByKey;
  const dirt = K('dirt'), sand = K('sand');
  const dbrick = K('v_41_blue_brick');
  const sx = 2080, sy = Math.floor(g.world.groundLevel) - 26;
  // 清空一大片空中区域(无墙无 tile)——背景=天空,泄漏可见
  for (let x = sx - 2; x < sx + 34; x++) for (let y = sy - 4; y < sy + 2; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  // A 行(sy-2): dirt 交替 full/half: F H F F H F
  const put = (x, y, t, half) => { st.setTile(x, y, t, 0); if (half) st.setHalfBrick(x, y, true); };
  const pat = [false, true, false, false, true, false];
  pat.forEach((h, k) => put(sx + k, sy - 2, dirt, h));
  // B 行(sy-1): sand full + dungeon brick half 交替(群系交界混合)
  for (let k = 0; k < 6; k++) put(sx + k, sy - 1, k % 2 === 0 ? sand : dbrick, k % 2 === 1);
  // C 行(sy): 全 sand 半砖行 + 两端 dungeon full
  put(sx, sy, dbrick, false);
  for (let k = 1; k < 5; k++) put(sx + k, sy, sand, true);
  put(sx + 5, sy, dbrick, false);
  g.player.x = (sx + 3) * 16; g.player.y = (sy - 6) * 16;
  window.__sx = sx; window.__sy = sy;
  return { ok: true, dbrick, sand, dirt };
});
console.log('场景:', JSON.stringify(setup));
await new Promise((r) => setTimeout(r, 6000));
await page.evaluate(() => { const g = window.__swGame; g.camera.zoom = 1.25; g.camera.zoomTarget = 1.25; });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cam = g.camera, cv = g.renderer.canvas, ctx = cv.getContext('2d');
  const z = cam.zoom;
  const sx = window.__sx, sy = window.__sy;
  const w2s = (wx, wy) => [cv.width / 2 + (wx - cam.x) * z, cv.height / 2 + (wy - cam.y) * z];
  // 逐 tile 列扫描:每行(3 行)每 tile 顶 10px 带内"天空色"像素占比(天空=高亮 B/R 亮)
  const rows = [['A dirt 交替', sy - 2], ['B sand|dbrick', sy - 1], ['C sand半+端full', sy]];
  const res = [];
  for (const [label, ty] of rows) {
    const tiles = [];
    for (let k = 0; k < 6; k++) {
      const [x0, y0] = w2s((sx + k) * 16, ty * 16);
      const W = Math.round(16 * z), H = Math.round(10 * z);
      const d = ctx.getImageData(Math.round(x0), Math.round(y0), W, H).data;
      let sky = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        n++;
        const r = d[i], g2 = d[i + 1], b = d[i + 2];
        if (r > 100 && b > 140 && b > r) sky++;   // 天空蓝亮
      }
      tiles.push(+(sky / n).toFixed(3));
    }
    res.push({ label, skyTop10: tiles });
  }
  // 全列泄漏定位:C 行逐 4px 列段
  const cols = [];
  for (let k = 0; k < 6; k++) {
    const [x0, y0] = w2s((sx + k) * 16, sy * 16);
    const W = Math.round(16 * z), H = Math.round(16 * z);
    const d = ctx.getImageData(Math.round(x0), Math.round(y0), W, H).data;
    // 每 2 设备列段
    const seg = [];
    for (let sxg = 0; sxg < W; sxg += Math.max(1, Math.round(W / 8))) {
      let sky = 0, n = 0;
      for (let y = 0; y < H; y++) {
        const i = (y * W + Math.min(W - 1, sxg)) * 4;
        n++;
        if (d[i] > 100 && d[i + 2] > 140 && d[i + 2] > d[i]) sky++;
      }
      seg.push(+(sky / n).toFixed(2));
    }
    cols.push(seg);
  }
  return { rows: res, cRowColSegs: cols, cam: [cam.x, cam.y, z] };
});
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/halfjn.png' });
await browser.close();
