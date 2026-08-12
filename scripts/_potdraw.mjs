// 终极定位:patch ctx.drawImage → 记录陶罐 4 帧的绘制调用(源/目标矩形)+ 重建后画布状态
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const SAVE_TEXT = readFileSync('/Users/vinlic/Downloads/map-12345世界 (2).json', 'utf8');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swLoadJson, { timeout: 60000 });
await page.evaluate((t) => window.__swLoadJson(t), SAVE_TEXT);
await page.waitForFunction(() => window.__swGame && window.__swGame.renderer && window.__swGame.chunks, { timeout: 600000, polling: 2000 });
await page.evaluate(() => {
  const g = window.__swGame;
  g.player.x = 3385 * 16 - 100; g.player.y = 185 * 16; g.player.vx = 0; g.player.vy = 0;
});
await page.waitForFunction(() => !!window.__swGame.renderer.atlas.ensureVImage('vanilla/Tiles_28.png'), { timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));

// patch drawImage:只记录画到 chunk(211,11) tile 画布上、源矩形命中陶罐 4 帧的调用
await page.evaluate(() => {
  window.__potDraws = [];
  const origDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) {
    if (args.length === 9) {
      const [, sx, sy, sw, sh, dx, dy] = args;
      if ((sy === 432 || sy === 450) && sw === 16) {
        if (!this.canvas.__tag) this.canvas.__tag = 'c' + window.__potDraws.length + '_' + Math.floor(Math.random() * 1e6);
        window.__potDraws.push({ tag: this.canvas.__tag, sx, sy, dx: Math.round(dx), dy: Math.round(dy) });
      }
    }
    return origDraw.apply(this, args);
  };
});

await page.evaluate(() => window.__swGame.chunks.invalidateAll());
await new Promise((r) => setTimeout(r, 2500));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const key = (211 & 0xffff) | ((11 & 0xffff) << 16);
  const pair = g.chunks.chunks.get(key);
  let cells = [];
  let cellsPair = pair;
  if (pair) {
    const ctx = pair.tile.getContext('2d');
    for (const [x, y] of [[3385,189],[3386,189],[3385,190],[3386,190]]) {
      const d = ctx.getImageData((x % 16) * 16, (y % 16) * 16, 16, 16).data;
      let op = 0;
      for (let k = 3; k < d.length; k += 4) if (d[k] > 40) op++;
      cells.push(op);
    }
  }
  void cellsPair;
  const finalTag = pair ? pair.tile.__tag ?? '(新画布无绘制记录!)' : 'no pair';
  return {
    cells,
    finalTag,
    draws: window.__potDraws.slice(0, 14),
    drawCount: window.__potDraws.length,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
