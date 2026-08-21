// 间歇方片捕获器:刷新进世界 N 次,每帧检测屏幕硬边暗矩形;命中即 dump
// 引擎数组行剖面(数组内 vs 合成后)+GL/2D 路径+lightCanvas 尺寸
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5311';
let caught = null;
for (let round = 0; round < 20 && !caught; round++) {
  await page.goto(origin + '/?play=small&r=' + round, { waitUntil: 'domcontentloaded', timeout: 120000 });
  caught = await page.evaluate(async () => {
    const t0 = Date.now();
    while (!(window.__swGame?.player && window.__swGame.world)) {
      if (Date.now() - t0 > 120000) return null;
      await new Promise((res) => setTimeout(res, 300));
    }
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.5 + (round % 8) * 0.06;   // 时间扫 0.5..0.92(黄昏→夜)
    g.player.x = 2254 * 16; g.player.y = 235 * 16; g.player.vx = 0; g.player.vy = 0;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;
    await new Promise((res) => setTimeout(res, 1200));
    const cv = g.renderer.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    for (let f = 0; f < 240; f++) {
      g.frame(performance.now());
      const img = ctx.getImageData(0, 0, W, H).data;
      const lum = (x, y) => { const o = (y * W + x) * 4; return (img[o] + img[o + 1] + img[o + 2]) / 3; };
      // 硬边暗矩形检测:同一行上,存在 >240px 的水平段,其内部亮度均匀(±6),
      // 且与段外左右邻(各 60px 外)差 >25,且段边界为垂直直线(上下 80px 同 x 处同样有阶跃)
      for (let y = 120; y < H - 200; y += 24) {
        for (let x = 80; x < W - 420; x += 24) {
          const a = lum(x, y), in1 = lum(x + 260, y), in2 = lum(x + 380, y), b = lum(x + 440, y);
          if (Math.abs(in1 - in2) < 6 && Math.abs(in1 - a) > 20 && Math.abs(in1 - b) > 20) {   // 提亮或压暗都算
            // 垂直验证:同 x 边界上下 80px 也有阶跃
            const eL = Math.abs(lum(x + 130, y + 80) - lum(x + 130, y)) < 8
              && Math.abs(lum(x + 129, y) - a) < 10 ? false : true;
            const stepDown = lum(x + 200, y + 80);
            if (Math.abs(stepDown - in1) < 8 && stepDown < lum(x + 200, y - 80) - 20) {
              return {
                frame: f, x, y, inner: Math.round(in1), outerL: Math.round(a),
                le: !!g.renderer.worldLightLayer?.(),
                win: { rx: g.lighting.rx, ry: g.lighting.ry, rw: g.lighting.rw, rh: g.lighting.rh },
                shot: (() => { const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').drawImage(cv, 0, 0); return c.toDataURL('image/png'); })(),
              };
            }
          }
        }
      }
    }
    return null;
  }, { timeout: 240000 }).catch(() => null);
  if (caught) break;
  await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); }).catch(() => {});
}
if (!caught) { console.log('NOT-REPRODUCED in 8 rounds'); process.exit(0); }
const fs = await import('node:fs');
fs.writeFileSync('/tmp/halo-caught.png', Buffer.from(caught.shot.split(',')[1], 'base64'));
delete caught.shot;
// 命中帧的引擎行剖面:暗块中心行,导出面 r 值沿 x 全采样
const profile = await page.evaluate((win) => {
  const g = window.__swGame;
  const le = g.lighting;
  const y = win.ry + Math.floor(win.rh / 2);
  const row = [];
  for (let x = win.rx; x < win.rx + win.rw; x += 2) {
    row.push(le.r[(y - win.ry) * win.rw + (x - win.rx)]);
  }
  return { y, row };
}, caught.win);
console.log('CAUGHT:', JSON.stringify(caught));
console.log('ROW y=' + profile.y + ':', profile.row.join(','));
await browser.close();
