// 水蜡烛火焰探针:放一枚 v_49,截取火苗区像素,按色桶分解(找红色来源)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const ptx = Math.floor(p.cx / 16), pty = Math.floor(p.cy / 16);
  // 玩家脚下地面行
  let gy = pty;
  while (gy < st.h - 2 && !st.flags[st.idx(ptx, gy)]) gy++;
  // 地面上放水蜡烛(取 TILE_BY_KEY['water_candle'])
  return { ptx, gy };
});
// 需要内部 id:页面里 import tiles
const placed = await page.evaluate(async (pos) => {
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const wc = TILE_BY_KEY['water_candle'];
  const { ptx, gy } = pos;
  st.setTile(ptx, gy - 1, wc, 0, 0);
  g.chunks.invalidateAll();
  return { ptx, gy: gy - 1, wc };
}, out);
await new Promise((r) => setTimeout(r, 1200));
const px = await page.evaluate((pl) => {
  const g = window.__swGame;
  const [sx, sy] = g.camera.worldToScreen(pl.ptx * 16 + 8, pl.gy * 16 + 8);
  const c = g.renderer.canvas;
  const ctx2 = c.getContext('2d');
  const sc = c.width / 1280;
  // 取火苗上方 36x36 区域(蜡烛顶向上)
  const px0 = Math.round((sx - 18) * sc), py0 = Math.round((sy - 40) * sc);
  const img = ctx2.getImageData(px0, py0, Math.round(36 * sc), Math.round(48 * sc)).data;
  const buckets = {};
  let red = 0, blue = 0, op = 0;
  for (let i = 0; i < img.length; i += 4) {
    if (img[i + 3] < 80) continue;
    const [r, gg, b] = [img[i], img[i + 1], img[i + 2]];
    op++;
    if (r > 130 && r > gg + 30 && r > b + 30) red++;
    else if (b > 130 && b > r + 30) blue++;
    const k = `${r >> 5},${gg >> 5},${b >> 5}`;
    buckets[k] = (buckets[k] || 0) + 1;
  }
  const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, n]) => `(${k.split(',').map(v => (Number(v) << 5) + 16).join(',')})×${n}`);
  return { op, red, blue, top };
}, placed);
console.log(JSON.stringify({ placed, px }, null, 1));
await browser.close();
