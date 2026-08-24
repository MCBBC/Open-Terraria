// 深地下无墙洞透亮远景复现+逐层定位
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
await page.evaluate(() => { void 0; });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
    const inp = document.querySelector('.sw-panel input');
    if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await new Promise((r) => setTimeout(r, 1200));
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const st = g.world.store;
  // 用户报障位置(tile 341,422 蜂窝区):带层交界复现
  const cx = 341, cy = 422;
  const x0 = cx - 12, y0 = cy - 7;
  for (let y = y0; y < y0 + 14; y++)
    for (let x = x0; x < x0 + 24; x++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); }
  // 玩家传到洞中央
  pl.x = (x0 + 12) * 16; pl.y = (y0 + 7) * 16 - pl.h / 2; pl.vx = 0; pl.vy = 0;
  await new Promise((r) => setTimeout(r, 1500));
  // 亮度采样:主画布洞区 vs 周边实心区
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const [sx, sy] = g.camera.worldToScreen((x0 + 12) * 16, (y0 + 7) * 16);
  window.__lastSx = sx; window.__lastSy = sy;
  const d = ctx2.getImageData(Math.max(0, sx - 60), Math.max(0, sy - 40), 120, 80).data;
  let rs = 0, gs = 0, bs = 0, n = 0, blue = 0;
  for (let p = 0; p < d.length; p += 4) {
    rs += d[p]; gs += d[p + 1]; bs += d[p + 2]; n++;
    if (d[p + 2] > 150 && d[p + 2] > d[p] + 40) blue++;
  }
  return { avg: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)], bluePx: blue, at: [x0 + 12, y0 + 7], depth: cy };
});
console.log(JSON.stringify(out));
await page.screenshot({ path: '/tmp/ugbg-cave.png' });
// monkey-patch 天空绘制关闭,再截一张
await page.evaluate(() => { window.__swGame.renderer.sky.draw = () => {}; });
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/ugbg-nosky.png' });
const out2 = await page.evaluate(() => {
  const cv = window.__swGame.renderer.canvas;
  const c2 = document.createElement('canvas'); c2.width = cv.width; c2.height = cv.height;
  const ctx2 = c2.getContext('2d');
  ctx2.drawImage(cv, 0, 0);
  const d = ctx2.getImageData(Math.max(0, window.__lastSx - 60), Math.max(0, window.__lastSy - 40), 120, 80).data;
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let p = 0; p < d.length; p += 4) { rs += d[p]; gs += d[p + 1]; bs += d[p + 2]; n++; }
  return { avg: [Math.round(rs / n), Math.round(gs / n), Math.round(bs / n)] };
});
console.log(JSON.stringify(out2));
await browser.close();
