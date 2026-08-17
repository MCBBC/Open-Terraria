// 水蜡烛火焰探针②:开阔空中平台隔离放置(背景=天空,红像素只能来自火苗)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const placed = await page.evaluate(async () => {
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const cx = Math.floor(p.cx / 16), cy = Math.floor(p.cy / 16) - 10;
  for (let dx = -2; dx <= 1; dx++) st.setTile(cx + dx, cy, 2, 0, 0);
  // ★骷髅灯在左(先画→缓存先占),水蜡烛在右(后画→命中缓存?)
  const skull = TILE_BY_KEY['v_98_skull_lantern'];
  st.setTile(cx - 2, cy - 2, skull, 0, 0);   // 2x2 顶格 cy-2
  const wc = TILE_BY_KEY['water_candle'];
  st.setTile(cx, cy - 1, wc, 0, 0);
  g.chunks.invalidateAll();
  g.camera.x = cx * 16; g.camera.y = cy * 16 - 16;
  return { wcX: cx, wcY: cy - 1 };
});
await new Promise((r) => setTimeout(r, 1200));
const px = await page.evaluate((pl) => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx2 = c.getContext('2d');
  const sc = c.width / 1280;
  const grab = (tx, ty, label) => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    const img = ctx2.getImageData(Math.round((sx - 16) * sc), Math.round((sy - 34) * sc), Math.round(32 * sc), Math.round(44 * sc)).data;
    const buckets = {};
    let red = 0, blue = 0, op = 0, warm = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 80) continue;
      const [r, gg, b] = [img[i], img[i + 1], img[i + 2]];
      op++;
      if (r > 130 && r > gg + 25 && r > b + 25) { red++; if (gg > 90) warm++; }
      else if (b > 130 && b > r + 25) blue++;
      const k = `${r >> 5},${gg >> 5},${b >> 5}`;
      buckets[k] = (buckets[k] || 0) + 1;
    }
    const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, n]) => `(${k.split(',').map(v => (Number(v) << 5) + 16).join(',')})×${n}`);
    return { label, op, red, warm, blue, top };
  };
  return [grab(pl.wcX, pl.wcY, '水蜡烛(同屏有骷髅灯)')];
}, placed);
console.log(JSON.stringify(px, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 2) : 0);
await browser.close();
