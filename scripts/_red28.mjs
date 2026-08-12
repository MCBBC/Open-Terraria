// 决定性实验:红色标记图替换 sheet 28 全部取帧 → 强制重烘焙 → 陶罐区域是否变红
// 红 = 绘制管线到达 drawImage(问题在贴图/帧内容);非红 = 中途早退(问题在管线)
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), readFileSync('/Users/vinlic/Downloads/map-12345世界 (2).json', 'utf8'));
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000, polling: 2000 });
await new Promise((r) => setTimeout(r, 3000));

await page.evaluate(() => {
  const g = window.__swGame;
  const atlas = g.renderer.atlas;
  const red = document.createElement('canvas');
  red.width = 108; red.height = 1332;
  const rc = red.getContext('2d');
  rc.fillStyle = '#ff0000';
  rc.fillRect(0, 0, 108, 1332);
  const orig = atlas.vframeAt.bind(atlas);
  atlas.vframeAt = (sheet, fx, fy) => {
    if (sheet !== 28) return orig(sheet, fx, fy);
    return { img: red, sx: fx, sy: fy, sw: 16, sh: 16 };
  };
  g.player.x = 3385 * 16 - 200; g.player.y = 186 * 16; g.player.vx = 0; g.player.vy = 0;
  g.chunks.invalidateAll();
});
await new Promise((r) => setTimeout(r, 5000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const key = (Math.floor(3385 / 16) & 0xffff) | ((Math.floor(189 / 16) & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  if (!pair) return [{ err: 'no chunk' }];
  const ctx = pair.tile.getContext('2d');
  return [[3385, 189], [3386, 189], [3385, 190], [3386, 190]].map(([x, y]) => {
    const d = ctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
    let red = 0, other = 0;
    for (let k = 0; k < d.length; k += 4) {
      if (d[k + 3] > 40) { if (d[k] > 200 && d[k + 1] < 60) red++; else other++; }
    }
    return { x, y, red, other };
  });
});
console.log(JSON.stringify(out));
await browser.close();
