// 首页背景接缝验证：截主菜单，检查各背景层水平接缝处是否有 1px 竖直异色线
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?t=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
// 等背景图加载 + 变体就绪
for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); }
// 连续采 5 帧（动画滚动中），每帧扫描中部水平带找"竖直细线"：
// 与左右邻居都显著不同的 1px 列（接缝特征）
const scans = [];
for (let f = 0; f < 5; f++) {
  const r = await page.evaluate(() => {
    const src = document.querySelector('.sw-title-menu canvas, #game-root > canvas');
    if (!src) return { err: 'no canvas' };
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    // 检查两条水平带（树层/远山常见 y 带）：y = 55% 和 75% 高度
    let seamCols = 0;
    for (const band of [Math.floor(H * 0.55), Math.floor(H * 0.75)]) {
      for (let x = 1; x < W - 1; x++) {
        const px = (band * W + x) * 4, pl = px - 4, pr = px + 4;
        const dL = Math.abs(d[px] - d[pl]) + Math.abs(d[px + 1] - d[pl + 1]) + Math.abs(d[px + 2] - d[pl + 2]);
        const dR = Math.abs(d[px] - d[pr]) + Math.abs(d[px + 1] - d[pr + 1]) + Math.abs(d[px + 2] - d[pr + 2]);
        if (dL > 60 && dR > 60) seamCols++;
      }
    }
    return { seamCols, W, H };
  });
  scans.push(r);
  await new Promise(r2 => setTimeout(r2, 400));
}
console.log(JSON.stringify({ scans, errors: errors.slice(0, 3) }, null, 1));
await browser.close();
