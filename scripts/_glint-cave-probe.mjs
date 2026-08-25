// 地底水面发白修复验证：挖地底池塘（暗光），隔帧截两图对比水面带是否稳定；
// 另截地表水面确认亮处波光仍在。
// 运行:SW_ORIGIN=http://localhost:5232 node tools/run-diag.mjs scripts/_glint-cave-probe.mjs --timeout=120000
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 640, height: 420 }, protocolTimeout: 300000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 120)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5232', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 地底池塘：rock 层下挖洞灌水，玩家站旁边（火把照亮场景）
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.x / 16);
  const py = Math.floor(g.world.rockLevel) + 40;   // 地底
  // 挖腔 8×5
  for (let x = px - 4; x <= px + 4; x++) {
    for (let y = py; y <= py + 4; y++) st.setTile(x, y, 0);
  }
  // 灌水（下半 3 行）
  for (let x = px - 4; x <= px + 4; x++) {
    for (let y = py + 2; y <= py + 4; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;
    }
  }
  // 封底
  for (let x = px - 4; x <= px + 4; x++) st.setTile(x, py + 5, 1);
  // 火把照明（池塘两侧壁上）
  const torch = window.__swTileByKey ? window.__swTileByKey('torch') : 4;
  st.setTile(px - 5, py + 1, torch);
  st.setTile(px + 5, py + 1, torch);
  g.player.x = (px - 7) * 16;
  g.player.y = (py + 1) * 16;
  g.player.vx = 0; g.player.vy = 0;
  window.__cave = { px, py };
});
// 相机对准池塘+等待光照引擎刷新区域
await page.evaluate((s) => {
  const g = window.__swGame;
  g.camera.x = s.px * 16;
  g.camera.y = (s.py + 2) * 16;
}, await page.evaluate(() => window.__cave));
await new Promise((r) => setTimeout(r, 1200));
// fullbright 看结构（glint 亮度因子仍走 lighting.lightAt=暗处受抑，可验证结构层）
await page.evaluate(() => { window.__swGame.renderer.fullbright = true; });
await new Promise((r) => setTimeout(r, 200));
await page.screenshot({ path: '/tmp/cave-water-1.png' });
await new Promise((r) => setTimeout(r, 450));
await page.screenshot({ path: '/tmp/cave-water-2.png' });
await page.evaluate(() => { window.__swGame.renderer.fullbright = false; });
console.log('cave shots done');

// 地表水面（对照：亮处波光应保留）——玩家旁边+正午
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  g.world.clock.timeOfDay = 0.5;
  const px = Math.floor(g.player.x / 16) + 6;
  const gy = Math.floor(g.player.y / 16) + 3;
  for (let x = px - 3; x <= px + 3; x++) {
    for (let y = gy; y <= gy + 2; y++) st.setTile(x, y, 0);
    for (let y = gy + 1; y <= gy + 2; y++) {
      const i = st.idx(x, y);
      st.liquid[i] = 255;
      st.liquidType[i] = 1;
    }
    st.setTile(x, gy + 3, 1);
  }
  for (let y = gy; y <= gy + 3; y++) { st.setTile(px - 4, y, 1); st.setTile(px + 4, y, 1); }
  g.camera.x = px * 16;
  g.camera.y = (gy + 1) * 16;
  window.__surf = { px, gy };
});
await new Promise((r) => setTimeout(r, 1000));
await page.screenshot({ path: '/tmp/surface-water.png' });
console.log('surface shot done');
await browser.close();
