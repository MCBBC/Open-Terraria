// 烟囱逐帧截屏:进入世界后连拍 120 帧,保存为 PNG 序列用于肉眼检查消失帧
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || '/Users/vinlic/Downloads/map-FTW_V2 (10).json';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 480, height: 360 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate((t) => window.__swFlow.loadJson(t), fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
// 定位到烟囱旁
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 4131 * 16 + 8; g.player.y = (437 - 2) * 16;
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
});
await new Promise((r) => setTimeout(r, 2000));   // 相机收敛+资源稳定
fs.mkdirSync('/tmp/chimney-frames', { recursive: true });
for (let k = 0; k < 120; k++) {
  const buf = await page.screenshot({ type: 'png' });
  fs.writeFileSync(`/tmp/chimney-frames/f${String(k).padStart(3, '0')}.png`, buf);
  // 每 10 帧泵一次游戏 tick 加速动画周期覆盖率
  if (k % 10 === 9) {
    await page.evaluate(() => {
      const g = window.__swGame;
      for (let i = 0; i < 5; i++) { g.fixedUpdate(1 / 60); }
    });
  }
}
console.log('saved 120 frames');
await browser.close();
