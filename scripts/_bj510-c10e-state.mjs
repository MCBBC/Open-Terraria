// 一次性:BJ510 c10e 状态面测量（帧尾 _c10eFrame/_c10eComposited/HUD α/世界落面）
// SW_ORIGIN=http://localhost:5207 node tools/run-diag.mjs scripts/_bj510-c10e-state.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏'); process.exit(1); }
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
const out = await page.evaluate(() => new Promise((resolve) => {
  const g = window.__swGame;
  const R = g.renderer;
  // 等 3 帧后（帧尾=下一个 rAF 前）读状态
  requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    const cv = R.canvas;
    // HUD 采样：天空中远离 UI 的一点 + 画布四角
    const c2 = document.createElement('canvas');
    c2.width = cv.width; c2.height = cv.height;
    const cx2 = c2.getContext('2d');
    cx2.drawImage(cv, 0, 0);
    const px = (x, y) => {
      const d = cx2.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    resolve({
      c10eFlag: !!R.constructor.c10e,
      c10eFrame: R._c10eFrame,
      c10eComposited: R._c10eComposited,
      worldLayerEnabled: R.worldLayerEnabled,
      worldLayerActive: R.worldLayerActive,
      accMode: R._accMode,
      glCanvasEl: !!R.glCanvasEl,
      glVisible: R.glCanvasEl ? R.glCanvasEl.style.display !== 'none' : null,
      pipeAlive: !!(R.swPipe && !R.swPipe.unavailable),
      hudSamples: { sky: px(200, 600), ground: px(640, 700), topLeft: px(5, 5) },
      stack: [...document.querySelectorAll('canvas')].map((c) => ({
        id: c.id || c.className || '(anon)', w: c.width, h: c.height,
        z: c.style.zIndex, pos: c.style.position,
      })),
    });
  })));
}));
console.log(JSON.stringify(out, null, 1));
await browser.close();
