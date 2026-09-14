// BJ76 一次性诊断:水线带像素内容 dump(水位在哪/是否可见/是否有纹理)
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
  const tx = ptx + 6, ty = solidY, W = 10, H = 6;
  for (let x = tx; x < tx + W; x++) {
    for (let y = ty; y < ty + H; y++) {
      st.setTile(x, y, 0);
      st.setWall(x, y, 1);
      const i = st.idx(x, y);
      st.liquid[i] = 255; st.liquidType[i] = 1;
    }
  }
  g.player.x = (tx - 5) * 16 + 8 - g.player.w / 2;
  g.player.vx = 0; g.player.vy = 0;
  return { tx, ty, W, H, surfaceWorldY: ty * 16 };
});
await new Promise((r) => setTimeout(r, 1200));
const dump = await page.evaluate(async (setup) => {
  const g = window.__swGame;
  const cv = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const off = document.createElement('canvas');
  off.width = cv.width; off.height = cv.height;
  const c2 = off.getContext('2d', { willReadFrequently: true });
  c2.drawImage(cv, 0, 0);
  const img = c2.getImageData(0, 0, cv.width, cv.height).data;
  const camL = g.camera.x - cv.width / 2, camT = g.camera.y - cv.height / 2;
  const sx = (wx) => Math.round((wx - camL));
  const sy = (wy) => Math.round((wy - camT));
  const px = (x, y) => { const o = (y * cv.width + x) * 4; return [img[o], img[o + 1], img[o + 2]]; };
  // 坑区域逐行均值（surfaceWorldY−8 .. +104 每 4 行）
  const lines = [];
  for (let wy = setup.surfaceWorldY - 8; wy <= setup.surfaceWorldY + 104; wy += 4) {
    const y = sy(wy); if (y < 0 || y >= cv.height) continue;
    let r = 0, gg = 0, b = 0, n = 0;
    for (let wx = (setup.tx + 1) * 16; wx < (setup.tx + 9) * 16; wx += 4) {
      const x = sx(wx); if (x < 0 || x >= cv.width) continue;
      const p = px(x, y); r += p[0]; gg += p[1]; b += p[2]; n++;
    }
    lines.push(`y=${y} (wy=${wy}) rgb=${(r / n).toFixed(0)},${(gg / n).toFixed(0)},${(b / n).toFixed(0)}`);
  }
  // 坑中心列 x 方向采样 8 行间隔
  const colSamples = [];
  for (let wy = setup.surfaceWorldY + 8; wy < setup.surfaceWorldY + 96; wy += 16) {
    const y = sy(wy);
    const row = [];
    for (let wx = (setup.tx) * 16; wx < (setup.tx + 10) * 16; wx += 16) {
      const p = px(sx(wx), y); row.push(p.join(','));
    }
    colSamples.push(`wy=${wy}: ${row.join(' | ')}`);
  }
  const WW = await import('/src/render/WaterWaves.ts');
  const LR = await import('/src/render/VanillaLiquidRenderer.ts');
  return { lines, colSamples, cam: [g.camera.x, g.camera.y], warp: LR.liquidDebugState().warp,
    liq: (() => { const st = g.world.store; const i = st.idx(setup.tx + 5, setup.ty + 3); return [st.liquid[i], st.liquidType[i]]; })() };
}, setup);
console.log('cam:', JSON.stringify(dump.cam), 'warp:', JSON.stringify(dump.warp), 'liq(center):', JSON.stringify(dump.liq));
console.log('--- 逐行均值(坑中段) ---');
for (const l of dump.lines) console.log(l);
console.log('--- 中心列逐格采样 ---');
for (const l of dump.colSamples) console.log(l);
await browser.close();
