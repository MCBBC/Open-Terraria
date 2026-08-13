// 爆炸火光视觉验证:传送玩家远离 → 原地爆一颗雷管 → 全画布截图数橙色像素
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));

// 相机中心放一颗雷管并引爆;玩家传送走
await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  p.x = g.camera.x + 600; p.y = g.camera.y + 400;   // 挪出视野
  g.explodeAt(Math.floor(g.camera.x / 16), Math.floor(g.camera.y / 16), 250, 7, true, 125, 0, 29);
});
await new Promise((r) => setTimeout(r, 250));         // 火粒子 life 30-38t≈0.5s 内
await page.screenshot({ path: '/tmp/boom-full.png' });
const stats = await page.evaluate(async () => {
  // 用页面内 canvas 自检:读 renderer.canvas 像素
  const g = window.__swGame;
  const cv = g.renderer.canvas;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const cx = c2.getContext('2d');
  cx.drawImage(cv, 0, 0);
  const d = cx.getImageData(0, 0, cv.width, cv.height).data;
  let orange = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] > 140 && d[i+1] > 50 && d[i+1] < 190 && d[i+2] < 120 && d[i] - d[i+2] > 50) orange++;
  }
  return { orange };
});
console.log('画面内橙色系(火)像素:', stats.orange);
await browser.close();
process.exit(stats.orange > 50 ? 0 : 1);
