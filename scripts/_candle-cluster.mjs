// 群集场景复现:黑暗石室+多枚水蜡烛+火把+蜡烛+骷髅灯(用户基地典型陈设)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const placed = await page.evaluate(async () => {
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const cx = Math.floor(p.cx / 16), cy = Math.floor(p.cy / 16) - 12;
  // 石室:7x5 空腔+石墙
  for (let x = cx - 4; x <= cx + 4; x++) {
    for (let y = cy - 2; y <= cy + 3; y++) {
      const edge = x === cx - 4 || x === cx + 4 || y === cy - 2 || y === cy + 3;
      st.setTile(x, y, edge ? 2 : 0, 0, 0);
    }
  }
  const wc = TILE_BY_KEY['water_candle'];
  const torch = TILE_BY_KEY['torch'];
  const candle = TILE_BY_KEY['candle'];
  const skull = TILE_BY_KEY['v_98_skull_lantern'];
  // 地面行 cy+2:火把 | 水蜡 | 水蜡 | 蜡烛 | 骷髅灯(2x2 cy+1)
  st.setTile(cx, cy + 1, wc, 0, 0);
  st.setTile(cx + 1, cy + 1, candle, 0, 0);   // 右邻 1 格普通蜡烛(用户场景)
  g.chunks.invalidateAll();
  g.world.clock.timeOfDay = 0; g.world.clock.isDay = false;
  g.camera.x = cx * 16; g.camera.y = cy * 16;
  return { wcA: [cx, cy + 1] };
});
await new Promise((r) => setTimeout(r, 1500));
const px = await page.evaluate((pl) => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx2 = c.getContext('2d');
  const sc = c.width / 1280;
  const grab = (tx, ty, label) => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    const img = ctx2.getImageData(Math.round((sx - 14) * sc), Math.round((sy - 32) * sc), Math.round(28 * sc), Math.round(42 * sc)).data;
    let red = 0, warm = 0, blue = 0, op = 0;
    const buckets = {};
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 80) continue;
      const [r, gg, b] = [img[i], img[i + 1], img[i + 2]];
      op++;
      if (r > 110 && r > gg + 18 && r > b + 18) { red++; if (gg > 70) warm++; }
      else if (b > 110 && b > r + 18) blue++;
      const k = `${r >> 5},${gg >> 5},${b >> 5}`;
      buckets[k] = (buckets[k] || 0) + 1;
    }
    const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([k, n]) => `(${k.split(',').map(v => (Number(v) << 5) + 16).join(',')})×${n}`);
    return { label, op, red, warm, blue, top };
  };
  // 输出空间分布:红/蓝像素的 x 列直方图(判重叠还是采样伪影)
  const g2 = window.__swGame;
  const c2 = g2.renderer.canvas;
  const ctx3 = c2.getContext('2d');
  const sc2 = c2.width / 1280;
  const [sx, sy] = g2.camera.worldToScreen(pl.wcA[0] * 16 + 8, pl.wcA[1] * 16 + 8);
  const W = Math.round(64 * sc2), H = Math.round(42 * sc2);
  const img2 = ctx3.getImageData(Math.round((sx - 28) * sc2), Math.round((sy - 32) * sc2), W, H).data;
  const redCol = new Array(64).fill(0), blueCol = new Array(64).fill(0);
  for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < 64; xx++) {
    const i = (yy * W + Math.round(xx * sc2)) * 4;
    if (i + 3 >= img2.length) continue;
    if (img2[i + 3] < 80) continue;
    const r = img2[i], gg = img2[i + 1], b = img2[i + 2];
    if (r > 110 && r > gg + 18 && r > b + 18) redCol[xx]++;
    else if (b > 110 && b > r + 18) blueCol[xx]++;
  }
  // 水蜡烛 tile 范围 = 相对中心 ±8px → 列 28-43(0-63 域,中心 36)
  return { redCol: redCol.map((v, i) => v ? `${i}:${v}` : '').filter(Boolean).join(' '),
           blueCol: blueCol.map((v, i) => v ? `${i}:${v}` : '').filter(Boolean).join(' '),
           candleAt: (pl.wcA[0] + 1) + ',' + (pl.wcA[1]) };
}, placed);
console.log(JSON.stringify(px, null, 1));
await browser.close();
