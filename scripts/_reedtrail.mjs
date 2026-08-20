// 芦苇杆摆动拖影定位：玩家附近找香蒲 519/27 → 连续两帧 canvas 差分 → 残影坐标。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5201') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  const TILE_DEFS = (await import('/src/data/tiles.ts')).TILE_DEFS;
  const { windCounters } = await import('/src/render/WindSway.ts');
  // 玩家周围 60 格找香蒲（sheet 519 或 type 键含 cattail）
  const bx = Math.floor(p.x / 16), by = Math.floor(p.y / 16);
  let cattailX = -1, cattailY = -1, cattailSheet = -1;
  // 直接种植 3 格香蒲 519（用 TILE_BY_KEY 反查内部 id）
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const ctKey = Object.keys(TILE_BY_KEY).find(k => TILE_BY_KEY[k] && TILE_DEFS[TILE_BY_KEY[k]]?.vanilla?.sheet === 519);
  if (!ctKey) return { error: 'no cattail tile def (sheet 519)' };
  const ctKey27 = Object.keys(TILE_BY_KEY).find(k => TILE_BY_KEY[k] && TILE_DEFS[TILE_BY_KEY[k]]?.vanilla?.sheet === 27);
  if (ctKey27) { /* 覆盖：本批测 27 族 */ }
  const ctId = TILE_BY_KEY[ctKey27 || ctKey];
  cattailSheet = ctKey27 ? 27 : 519;
  cattailSheet = 519;
  // 空中净空台：±20 列 × (by-32..by) 全清 + 地板 by+1；香蒲种地板上（3 格高）
  for (let dx = -20; dx <= 20; dx++) for (let dy = -32; dy <= 0; dy++) st.setTile(bx + dx, by + dy, 0);
  const dirtId = TILE_DEFS.findIndex(d => d?.vanilla?.sheet === 0);
  for (let dx = -20; dx <= 20; dx++) st.setTile(bx + dx, by + 1, dirtId > 0 ? dirtId : 1);
  for (let dx = -20; dx <= 20; dx++) { const i2 = st.idx(bx + dx, by); st.liquid[i2] = 255; st.liquidType[i2] = 1; }
  cattailX = bx; cattailY = by - 2;
  for (let dy = 0; dy < 3; dy++) st.setTile(bx, by - dy, ctId, 0, dy * 18);
  // 传送玩家到旁边（相机跟随），关天气动画噪声：直接读渲染两帧差分
  p.x = cattailX * 16 - 40; p.y = (cattailY + 2) * 16 - p.h; p.vx = 0; p.vy = 0;
  await new Promise(r => setTimeout(r, 600));
  const cv = g.renderer.canvas, cam = g.camera;
  const toScreen = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const snap = () => {
    const [sx, sy] = toScreen(cattailX * 16 + 8, cattailY * 16 + 24);
    const W = 80, H = 160;
    const d = g.renderer.ctx.getImageData(Math.max(0, sx - W / 2), Math.max(0, sy - H / 2), W, H).data;
    return { data: d, sx, sy, W, H, counter: windCounters().sunflower };
  };
  const s1 = snap();
  await new Promise(r => setTimeout(r, 500));
  const s2 = snap();
  const px1 = [], px2 = [], diff = [];
  for (let y = 0; y < s1.H; y += 4) {
    let r1 = '', r2 = '', rd = '';
    for (let x = 0; x < s1.W; x += 4) {
      const i = (y * s1.W + x) * 4;
      const a1 = s1.data, a2 = s2.data;
      const c1 = (a1[i] << 16) | (a1[i + 1] << 8) | a1[i + 2];
      const c2 = (a2[i] << 16) | (a2[i + 1] << 8) | a2[i + 2];
      const dr = Math.abs(a1[i] - a2[i]) + Math.abs(a1[i + 1] - a2[i + 1]) + Math.abs(a1[i + 2] - a2[i + 2]);
      r1 += c1.toString(36)[0]; r2 += c2.toString(36)[0];
      rd += dr > 24 ? '×' : '.';
    }
    px1.push(r1); px2.push(r2); diff.push(rd);
  }
  // 残影判定：香蒲中段一行的精确颜色剖面（80px 全宽）。天空≈蓝紫、香蒲≈深绿褐。
  // 正常=16-24px 深色段（含摆动模糊边缘）；拖影=40px+ 深色扇面。
  const [rx, ry] = toScreen(cattailX * 16 + 8, cattailY * 16 + 24);
  const row = g.renderer.ctx.getImageData(Math.max(0, rx - 40), ry, 80, 1).data;
  const prof = [];
  for (let x = 0; x < 80; x++) {
    const i = x * 4;
    prof.push(row[i + 2] > row[i] + 20 ? '.' : '#');  // 天空蓝主=.; 非天色=#
  }
  const dark = prof.filter(c => c === '#').length;
  return {
    cattail: { x: cattailX, y: cattailY, sheet: cattailSheet },
    midRowProfile: prof.join(''), darkPx: dark,
    frame1: px1, frame2: px2, diff,
    counters: windCounters(),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
