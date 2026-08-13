// LiquidSlope 斜面形状复核 v2：先核对 store 状态再采样（排查水池是否被沉降搬走）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MACOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(async () => { await window.__swGame.newWorld('20260813c', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 200 && !ready; i++) {
  ready = await page.evaluate(() => { const g = window.__swGame; return !!(g && g.world && g.world.store && g.world.store.w === 4200); }).catch(() => false);
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
  const wy = floorY;
  for (let dx = 5; dx <= 10; dx++) st.setTile(cx + dx, wy + 3, stone);
  for (let dy = 0; dy <= 2; dy++) st.setTile(cx + 10, wy + dy, stone);
  st.setTile(cx + 6, wy, stone); st.setSlope(cx + 6, wy, 1);
  for (let dx = 7; dx <= 9; dx++) for (let dy = 0; dy <= 2; dy++) st.setLiquid(cx + dx, wy + dy, 255, 1);
  return { cx, cy, slopeX: cx + 6, slopeY: wy };
});
await page.evaluate(([x, y]) => {
  const g = window.__swGame as any;
  g.player.x = x * 16; g.player.y = (y - 4) * 16;
  g.camera.x = g.player.x; g.camera.y = g.player.y;
}, [site.cx, site.cy]);
await new Promise((r) => setTimeout(r, 4000));

const diag = await page.evaluate(([sx, sy]) => {
  const g = window.__swGame as any;
  const st = g.world.store;
  const dump: string[] = [];
  for (let dy = -1; dy <= 4; dy++) {
    let row = '';
    for (let dx = -1; dx <= 5; dx++) {
      const i = st.idx(sx + dx, sy + dy);
      row += st.flags[i] ? 'S' : st.liquid[i] > 0 ? (st.liquid[i] > 200 ? '#' : '+') : st.slope[i] ? 's' : '.';
    }
    dump.push(row);
  }
  // 像素采样
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const cam = g.camera; const z = cam.zoom ?? 1;
  const toS = (wx: number, wy: number) => [(wx - (cam.x - cv.width / 2 / z)) * z, (wy - (cam.y - cv.height / 2 / z)) * z];
  const cellStats = (x: number, y: number) => {
    let blue = 0, tot = 0;
    const rows: string[] = [];
    for (let py = 0; py < 16; py++) {
      let row = '';
      for (let px = 0; px < 16; px++) {
        const [ssx, ssy] = toS(x * 16 + px, y * 16 + py);
        let w = ' ';
        if (ssx >= 0 && ssy >= 0 && ssx < cv.width && ssy < cv.height) {
          tot++;
          const d = ctx2.getImageData(Math.floor(ssx), Math.floor(ssy), 1, 1).data;
          const isW = d[2] > 90 && d[2] > d[0] + 20 && d[1] < 160;
          w = isW ? '#' : '.';
          if (isW) blue++;
        }
        row += w;
      }
      rows.push(row);
    }
    return { blue, tot, rows };
  };
  return {
    store: dump,
    slopeCell: cellStats(sx, sy),
    waterCell: cellStats(sx + 2, sy),
    cam: { x: cam.x, y: cam.y, z },
    player: { x: g.player.x, y: g.player.y },
  };
}, [site.slopeX, site.slopeY]);
console.log('store（S=石 #=满水 +=浅水 s=坡 .=空）:');
for (const r of diag.store) console.log('  ' + r);
console.log(`slope cell blue=${diag.slopeCell.blue}/${diag.slopeCell.tot}:`);
for (const r of diag.slopeCell.rows) console.log('  ' + r);
console.log(`water cell blue=${diag.waterCell.blue}/${diag.waterCell.tot}`);
await browser.close();
