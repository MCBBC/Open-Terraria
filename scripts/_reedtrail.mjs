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
  const ctId = TILE_BY_KEY[ctKey];
  cattailSheet = 519;
  cattailX = bx; cattailY = by - 2;
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 6; dy++) st.setTile(bx + 3 + dx, by - 6 + dy, 0);
  for (let dy = 0; dy < 3; dy++) st.setTile(bx, by - dy, ctId, 0, dy * 18);
  // 传送玩家到旁边（相机跟随），关天气动画噪声：直接读渲染两帧差分
  p.x = cattailX * 16 - 40; p.y = (cattailY + 2) * 16 - p.h; p.vx = 0; p.vy = 0;
  await new Promise(r => setTimeout(r, 600));
  const cv = g.renderer.canvas, cam = g.camera;
  const toScreen = (wx, wy) => [Math.round((wx - cam.x) * cam.zoom + cv.width / 2), Math.round((wy - cam.y) * cam.zoom + cv.height / 2)];
  const snap = () => {
    const [sx, sy] = toScreen(cattailX * 16, (cattailY - 4) * 16);
    const W = 80, H = 160;
    const d = g.renderer.ctx.getImageData(Math.max(0, sx - W / 2), Math.max(0, sy - H / 2), W, H).data;
    return { data: d, sx, sy, W, H, counter: windCounters().sunflower };
  };
  const snapPx = (s) => {
    // 压缩存证：每 4px 一采
    const rows = [];
    for (let y = 0; y < s.H; y += 4) {
      let row = '';
      for (let x = 0; x < s.W; x += 4) {
        const i = (y * s.W + x) * 4;
        row += s.data[i + 3] > 60 ? '#' : '.';
      }
      rows.push(row);
    }
    return rows;
  };
  const s1 = snap();
  const px1 = snapPx(s1);
  await new Promise(r => setTimeout(r, 500));
  const s2 = snap();
  const px2 = snapPx(s2);
  // 差分：同位置两帧后仍亮的像素群（残影=上一帧位置不清）
  const diff = [];
  for (let y = 0; y < px1.length; y++) {
    let d = '';
    for (let x = 0; x < px1[y].length; x++) d += px1[y][x] !== px2[y][x] ? '×' : px1[y][x];
    diff.push(d);
  }
  return {
    cattail: { x: cattailX, y: cattailY, sheet: cattailSheet },
    frame1: px1, frame2: px2, diff,
    counters: windCounters(),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
