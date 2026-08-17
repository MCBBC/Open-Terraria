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
  const { TILE_BY_KEY, TILE_DEFS } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const wc = TILE_BY_KEY['water_candle'];
  const dx = g.world.dungeonX, dy = g.world.dungeonY;
  // 地牢区扫生成端水蜡烛(带其残留帧)
  const found = [];
  for (let y = Math.max(2, dy - 60); y < Math.min(st.h - 200, dy + 500) && found.length < 6; y++) {
    for (let x = Math.max(2, dx - 220); x < Math.min(st.w - 2, dx + 220); x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === wc) found.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
    }
  }
  if (!found.length) return { none: true };
  const t = found[0];
  g.player.x = t.x * 16 + 8; g.player.y = t.y * 16 - 32;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  g.world.clock.timeOfDay = 0; g.world.clock.isDay = false;   // 夜间(用户场景)
  return { list: found.slice(0, 6), first: t };
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
  if (!pl.first) return [{ label: '无水蜡烛', op: 0 }];
  return [grab(pl.first.x, pl.first.y, '地牢生成水蜡烛@' + pl.first.fx + ',' + pl.first.fy), pl.list];
}, placed);
console.log(JSON.stringify(px, null, 1));
console.log('errors:', errors.length ? errors.slice(0, 2) : 0);
await browser.close();
