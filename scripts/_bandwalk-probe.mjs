// 带层交界复现:火把照明下垂直走查,逐格采样背景带颜色
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  // 挖竖井(清墙清块)+放火把照明
  const cx = 341, cy = 422;
  for (let y = cy - 14; y <= cy + 12; y++)
    for (let x = cx - 3; x <= cx + 3; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); }
  const TORCH = window.__swTileByKey?.('torch') ?? 4;
  for (const y of [cy - 12, cy - 6, cy, cy + 5, cy + 10]) st.setTileSilent(cx + 3, y, TORCH);
  const samples = [];
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  const sampleAt = (ty) => {
    // 采样玩家上方 8 格处的背景带颜色(避开火把直射)
    const wx = cx * 16 + 8, wy = (ty - 8) * 16 + 8;
    const [sx, sy] = g.camera.worldToScreen(wx, wy);
    ctx2.drawImage(cv, 0, 0);
    const d = ctx2.getImageData(Math.max(0, Math.round(sx)), Math.max(0, Math.round(sy)), 1, 1).data;
    return [d[0], d[1], d[2]];
  };
});
// 两风格各截一张(Node 侧截图)
const out2 = await page.evaluate(() => ({ cy: 422 }));
for (const pair of [["beach", out2.cy - 4], ["corrupt", out2.cy + 10]]) {
  await page.evaluate((ty) => {
    const g = window.__swGame, pl = g.player;
    pl.x = 341 * 16 + 8 - pl.w / 2; pl.y = ty * 16 - pl.h / 2; pl.vx = 0; pl.vy = 0;
  }, pair[1]);
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: '/tmp/band-' + pair[0] + '.png' });
}
await browser.close();