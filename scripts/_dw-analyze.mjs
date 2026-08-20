import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/dw2-profile',
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
// 场景族: A=满水brim; B=半水(液位~120); C=水贴单格泥土柱左; D=水面行泥土(顶暴露+侧水)
await page.evaluate(() => {
  const g = window.__swGame, st = g.world.store;
  const c = g.world.clock; if (c && 'timeOfDay' in c) c.timeOfDay = 0.38;
  const K = window.__swTileByKey;
  const dirt = K('dirt');
  const sx = 2082, sy = Math.floor(g.world.groundLevel) - 26;
  for (let x = sx - 16; x < sx + 44; x++) for (let y = sy - 12; y < sy + 10; y++) { st.setTile(x, y, 0, 0); st.setWall(x, y, 0); }
  const T = (x, y) => st.setTile(x, y, dirt, 0);
  const L = (x, y, q) => st.setLiquid(x, y, q, 1);
  // A: 壁高=水面(sy+2 顶行即水面行): 左右壁 sy+2..6,底 sy+6,水 sy+2..5 满格
  for (let j = 0; j < 5; j++) { T(sx, sy + 2 + j); T(sx + 10, sy + 2 + j); }
  for (let k = 0; k < 11; k++) T(sx + k, sy + 7);
  for (let x = sx + 1; x <= sx + 9; x++) for (let j = 0; j < 5; j++) L(x, sy + 2 + j, 255);
  // B: 半水: 壁 sy+12..16 底 sy+17,水仅底两格+半格液面
  for (let j = 0; j < 5; j++) { T(sx + 14, sy + 12 + j); T(sx + 24, sy + 12 + j); }
  for (let k = 0; k < 11; k++) T(sx + 14 + k, sy + 17);
  for (let x = sx + 15; x <= sx + 23; x++) { L(x, sy + 16, 255); L(x, sy + 15, 120); }
  // C: 独柱+右侧满水两格: 柱 (sx+28, sy+2..5) 水在 (sx+29..30, sy+2..5)
  for (let j = 0; j < 4; j++) T(sx + 28, sy + 2 + j);
  for (let x = sx + 29; x <= sx + 31; x++) for (let j = 0; j < 4; j++) L(x, sy + 2 + j, 255);
  for (let k = 0; k < 4; k++) T(sx + 28 + k, sy + 6);
  g.player.x = (sx + 16) * 16; g.player.y = (sy - 6) * 16;
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
  // 泥土格逐行透明审计(tile 层直读): 每个泥土格 16x16 的 alpha<16 像素坐标列表
  const S = 256;
  const auditTile = (tx, ty) => {
    const cx = Math.floor(tx * 16 / S), cy = Math.floor(ty * 16 / S);
    const p = g.chunks.get(cx, cy);
    const c2 = p.tile.getContext('2d');
    const lx = tx * 16 - cx * S + p.sx, ly = ty * 16 - cy * S + p.sy;
    const d = c2.getImageData(lx, ly, 16, 16).data;
    const pts = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (d[(y * 16 + x) * 4 + 3] < 16) pts.push(`${x},${y}`);
    }
    return pts;
  };
  const res = {};
  // A 壁顶格 (sx, sy+2)(水面行): 侧水+上空
  res.A_walltop_left = auditTile(sx, sy + 2);
  res.A_walltop_right = auditTile(sx + 10, sy + 2);
  // A 壁中格 (sx, sy+4): 侧水双侧邻无
  res.A_wallmid_left = auditTile(sx, sy + 4);
  // B 半水壁顶 (sx+14, sy+12): 上空,右侧无水(水面在 sy+15)
  res.B_walltop_left = auditTile(sx + 14, sy + 12);
  res.B_wall_surface_row = auditTile(sx + 14, sy + 15); // 右邻半格水120
  // C 柱顶 (sx+28, sy+2): 上空+右水满
  res.C_pillar_top = auditTile(sx + 28, sy + 2);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
