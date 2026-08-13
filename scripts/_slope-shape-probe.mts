// LiquidSlope 斜面形状复核：slope=1 格应呈"右上湿、左下干"的对角分布
// （LiquidSlope_0 第 1 列形状）。运行同 _visual-extras-probe（私有实例 5205）。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('20260813b', 1600, 500, () => {}); });
let ready = false;
for (let i = 0; i < 200 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 1600); }).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}

const site = await page.evaluate(() => {
  const g = window.__swGame as any;
  const st = g.world.store;
  const T = (window as any).__swTiles as Record<string, number>;
  const stone = T['stone'] ?? 1;
  const cx = Math.floor(g.world.spawnX) + 40, cy = Math.floor(g.world.groundLevel) - 6;
  const floorY = cy + 2;
  for (let y = cy - 8; y <= cy + 6; y++) for (let x = cx - 11; x <= cx + 12; x++) {
    const i = st.idx(x, y); st.setTile(x, y, 0); st.setLiquid(x, y, 0, 1); st.wall[i] = 0;
  }
  // 密封水池（底 floorY+3、右墙 dx=10），水才不会在沉降里漏走
  const wy = floorY;
  for (let dx = 5; dx <= 10; dx++) st.setTile(cx + dx, wy + 3, stone);   // 池底
  for (let dy = 0; dy <= 2; dy++) st.setTile(cx + 10, wy + dy, stone);    // 右墙
  // 坡面石紧贴水面左侧（slope=1：开放侧 = 右/上）
  st.setTile(cx + 6, wy, stone); st.setSlope(cx + 6, wy, 1);
  for (let dx = 7; dx <= 9; dx++) for (let dy = 0; dy <= 2; dy++) st.setLiquid(cx + dx, wy + dy, 255, 1);
  return { cx, cy, slopeX: cx + 6, slopeY: wy };
});
await page.evaluate(([x, y]) => {
  const g = window.__swGame as any;
  g.player.x = x * 16; g.player.y = (y - 4) * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
}, [site.cx, site.cy]);
await new Promise((r) => setTimeout(r, 5000));

// 2×2 象限蓝色（水）像素分布 + 行级分布（上 8px vs 下 8px）
const quad = await page.evaluate(([x, y]) => {
  const g = window.__swGame as any;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera; const z = cam.zoom ?? 1;
  const toS = (wx: number, wy: number) => [(wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z];
  const isWater = (px: number, py: number) => {
    const [sx, sy] = toS(x * 16 + px, y * 16 + py);
    if (sx < 0 || sy < 0 || sx >= cv.width || sy >= cv.height) return -1;
    const d = ctx2.getImageData(Math.floor(sx), Math.floor(sy), 1, 1).data;
    return d[2] > 90 && d[2] > d[0] + 20 && d[1] < 160 ? 1 : 0;
  };
  const q = { tl: 0, tr: 0, bl: 0, br: 0, topLeftN: 0, topRightN: 0, botLeftN: 0, botRightN: 0 };
  const rows: string[] = [];
  for (let py = 0; py < 16; py++) {
    let row = '';
    for (let px = 0; px < 16; px++) {
      const w = isWater(px, py);
      row += w === 1 ? '#' : w === 0 ? '.' : ' ';
      if (w === -1) continue;
      if (py < 8 && px < 8) { q.tl += w; q.topLeftN++; }
      else if (py < 8) { q.tr += w; q.topRightN++; }
      else if (px < 8) { q.bl += w; q.botLeftN++; }
      else { q.br += w; q.botRightN++; }
    }
    rows.push(row);
  }
  return { q, rows };
}, [site.slopeX, site.slopeY]);
console.log('slope cell 水分布（#=水）:');
for (const r of quad.rows) console.log('  ' + r);
console.log('象限水像素:', JSON.stringify(quad.q));
const { tl, tr, bl, br } = quad.q;
console.log(`判定: 右上湿(tr=${tr}) > 左下干(bl=${bl}) → ${tr > bl ? 'PASS 斜面贴合' : 'FAIL 平面带'}`);
if (errors.length) console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
