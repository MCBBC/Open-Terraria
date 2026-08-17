// 用户世界复现:seed 1814620304 8400x2400,传送玩家位 (51004,20630),
// 扫附近水蜡烛并像素采样(红焰来源)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
// 用同种子重建用户世界(大规模,慢)
// 后台等待,分步轮询避免 evaluate 长 Promise 超时
  await page.evaluate(() => { window.__mkWorld = window.__swFlow.newWorld('1814620304', 8400, 2400); });
await page.waitForFunction(() => window.__swGame?.world?.w === 8400 && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const found = await page.evaluate(async () => {
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const wc = TILE_BY_KEY['water_candle'];
  const cx = Math.floor(51004 / 16), cy = Math.floor(20630 / 16);
  const list = [];
  for (let y = Math.max(2, cy - 80); y < Math.min(st.h - 2, cy + 80); y++) {
    for (let x = Math.max(2, cx - 120); x < Math.min(st.w - 2, cx + 120); x++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === wc) list.push({ x, y, fx: st.frameX[i], fy: st.frameY[i] });
    }
  }
  if (list.length) {
    const t = list[0];
    g.player.x = t.x * 16 + 8; g.player.y = t.y * 16 - 32;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  } else {
    g.player.x = 51004; g.player.y = 20630 - 64;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
  }
  return { count: list.length, list: list.slice(0, 8), player: { x: g.player.x, y: g.player.y } };
});
console.log('水蜡烛:', JSON.stringify(found).slice(0, 400));
await new Promise((r) => setTimeout(r, 1500));
if (found.count > 0) {
  const t = found.list[0];
  const px = await page.evaluate((pl) => {
    const g = window.__swGame;
    const c = g.renderer.canvas;
    const ctx2 = c.getContext('2d');
    const sc = c.width / 1280;
    const [sx, sy] = g.camera.worldToScreen(pl.x * 16 + 8, pl.y * 16 + 8);
    const img = ctx2.getImageData(Math.round((sx - 16) * sc), Math.round((sy - 36) * sc), Math.round(32 * sc), Math.round(46 * sc)).data;
    const buckets = {};
    let red = 0, warm = 0, blue = 0, op = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 80) continue;
      const [r, gg, b] = [img[i], img[i + 1], img[i + 2]];
      op++;
      if (r > 120 && r > gg + 20 && r > b + 20) { red++; if (gg > 80) warm++; }
      else if (b > 120 && b > r + 20) blue++;
      const k = `${r >> 5},${gg >> 5},${b >> 5}`;
      buckets[k] = (buckets[k] || 0) + 1;
    }
    const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([k, n]) => `(${k.split(',').map(v => (Number(v) << 5) + 16).join(',')})×${n}`);
    return { op, red, warm, blue, top };
  }, t);
  console.log('第一枚采样:', JSON.stringify(px, null, 1));
}
console.log('errors:', errors.length ? errors.slice(0, 2).join('|') : 0);
await browser.close();
