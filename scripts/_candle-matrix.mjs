// 终极矩阵:玩家真实可造成的所有水蜡烛状态 × 有无火把邻位 × 昼夜
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));
const setup = await page.evaluate(async () => {
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  const cx = Math.floor(p.cx / 16), cy = Math.floor(p.cy / 16) - 14;
  const wc = TILE_BY_KEY['water_candle'];
  const torch = TILE_BY_KEY['torch'];
  const candle = TILE_BY_KEY['candle'];
  const platform = TILE_BY_KEY['platform'];
  const table = TILE_BY_KEY['table'];
  // 大石室
  for (let x = cx - 8; x <= cx + 8; x++) for (let y = cy - 3; y <= cy + 4; y++) {
    st.setTile(x, y, (x <= cx - 8 || x >= cx + 8 || y <= cy - 3 || y >= cy + 4) ? 2 : 0, 0, 0);
  }
  // 平台行 + 桌子(下方支撑)
  for (let x = cx - 4; x <= cx - 2; x++) st.setTile(x, cy + 1, platform, 0, 0);
  for (let x = cx + 1; x <= cx + 3; x++) st.setTile(x, cy + 2, table, 0, 0);
  // 状态矩阵(间隔≥3 格防互染):
  // A 地板 fx=0 | B 平台上 fx=36? | C 桌上 fx=18 | D 地板+左侧1格火把 | E 桌上+右邻桌上火把
  const F = cy + 2;
  st.setTile(cx - 6, F, wc, 0, 0);                    // A 地板
  st.setTile(cx - 3, cy, wc, 0, 0);                   // B 平台上(平台 cy+1 上方)
  st.setTile(cx + 2, cy + 1, wc, 0, 0);               // C 桌上(桌 cy+2 上方)
  st.setTile(cx + 5, F, wc, 0, 0); st.setTile(cx + 4, F, candle, 0, 0);  // D 水蜡+左普通蜡烛(修复主场景)
  st.setTile(cx + 7, cy + 1, wc, 0, 0); st.setTile(cx + 8, cy + 1, torch, 0, 0); // E 桌上水蜡+右火把
  g.chunks.invalidateAll();
  g.camera.x = cx * 16; g.camera.y = cy * 16 - 8;
  return { A: [cx - 6, F], B: [cx - 3, cy], C: [cx + 2, cy + 1], D: [cx + 5, F], E: [cx + 7, cy + 1], night: false };
});
const sample = async () => page.evaluate((sp) => {
  const g = window.__swGame;
  const c = g.renderer.canvas;
  const ctx2 = c.getContext('2d');
  const sc = c.width / 1280;
  const grab = (t, label) => {
    const [sx, sy] = g.camera.worldToScreen(t[0] * 16 + 8, t[1] * 16 + 8);
    const img = ctx2.getImageData(Math.round((sx - 8) * sc), Math.round((sy - 26) * sc), Math.round(16 * sc), Math.round(34 * sc)).data;
    let red = 0, blue = 0, op = 0;
    for (let i = 0; i < img.length; i += 4) {
      if (img[i + 3] < 80) continue;
      const [r, gg, b] = [img[i], img[i + 1], img[i + 2]];
      op++;
      if (r > 110 && r > gg + 18 && r > b + 18) red++;
      else if (b > 110 && b > r + 18) blue++;
    }
    return `${label}:red${red}/blue${blue}`;
  };
  return [grab(sp.A, 'A地板'), grab(sp.B, 'B平台'), grab(sp.C, 'C桌上'), grab(sp.D, 'D+左蜡烛'), grab(sp.E, 'E桌上+右火把')];
}, setup);
await new Promise((r) => setTimeout(r, 1500));
const dayRes = await sample();
await page.evaluate(() => { const w = window.__swGame.world; w.clock.timeOfDay = 0; w.clock.isDay = false; });
await new Promise((r) => setTimeout(r, 900));
const nightRes = await sample();
console.log('白天:', dayRes.join(' | '));
console.log('夜晚:', nightRes.join(' | '));
console.log('errors:', errors.length ? errors.slice(0, 2).join('|').slice(0, 150) : 0);
await browser.close();
