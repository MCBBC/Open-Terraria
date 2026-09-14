// BJ76 一次性诊断:腔体逐格亮度图(看清哪里亮/哪里黑/水在哪)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 3000));
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.paused = true;
  const ptx = Math.floor(g.player.x / 16);
  let solidY = Math.floor(g.player.y / 16);
  for (let y = solidY; y < solidY + 60; y++) if (st.isSolid(ptx, y)) { solidY = y; break; }
  const tx = ptx + 6, ty = solidY + 8;
  const W = 20, H = 6, WATER_COLS = 10, WATER_TOP = 2;
  for (let x = tx; x < tx + W; x++) {
    for (let y = ty; y < ty + H; y++) {
      st.setTile(x, y, 0);
      st.setWall(x, y, ((x + y) % 2 === 0) ? 1 : 0);
      if (x < tx + WATER_COLS && y >= ty + WATER_TOP) {
        const i = st.idx(x, y);
        st.liquid[i] = 255; st.liquidType[i] = 1;
      }
    }
  }
  for (const txc of [tx + 10]) st.setTile(txc, ty + 5, 4);
  st.setTile(tx + 4, ty, 4);
  st.setTile(tx + 15, ty + 1, 4);
  g.player.x = (tx - 5) * 16 + 8 - g.player.w / 2;
  g.player.vx = 0; g.player.vy = 0;
  return { tx, ty, surfaceWorldY: (ty + 2) * 16 };
});
await new Promise((r) => setTimeout(r, 1200));
const dump = await page.evaluate(async (setup) => {
  const g = window.__swGame;
  const st = g.world.store;
  const cv = [...document.querySelectorAll('canvas')].filter((c) => !c.classList.contains('sw-credits')).sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const c2 = off.getContext('2d', { willReadFrequently: true });
  c2.drawImage(cv, 0, 0);
  const img = c2.getImageData(0, 0, cv.width, cv.height).data;
  const camL = g.camera.x - cv.width / 2, camT = g.camera.y - cv.height / 2;
  const grid = [];
  for (let ty = setup.ty - 2; ty <= setup.ty + 8; ty++) {
    let row = '';
    for (let tx = setup.tx - 2; tx <= setup.tx + 22; tx++) {
      const x0 = Math.round((tx * 16 - camL)), y0 = Math.round((ty * 16 - camT));
      let s = 0, n = 0, rs = 0;
      for (let dy = 4; dy < 16; dy += 4) for (let dx = 4; dx < 16; dx += 4) {
        const px = ((y0 + dy) * cv.width + (x0 + dx)) * 4;
        if (px < 0 || px + 2 >= img.length) continue;
        s += (img[px] + img[px + 1] + img[px + 2]) / 3; rs += img[px]; n++;
      }
      const v = n ? s / n : -1;
      const tile = (() => { const i = st.idx(tx, ty); return [st.liquid[i], st.liquidType[i]]; })();
      row += (v < 8 ? '.' : v < 30 ? '-' : v < 80 ? '+' : '#') + (tile[0] ? 'W' : ' ');
    }
    grid.push(`ty=${ty}: ${row}`);
  }
  const WW = await import('/src/render/WaterWaves.ts');
  return { grid, warp: (await import('/src/render/VanillaLiquidRenderer.ts')).liquidDebugState().warp, cam: [g.camera.x, g.camera.y], zoom: g.camera.zoom };
}, setup);
console.log('warp:', JSON.stringify(dump.warp), 'cam:', JSON.stringify(dump.cam), 'zoom:', dump.zoom);
for (const r of dump.grid) console.log(r);
await browser.close();
