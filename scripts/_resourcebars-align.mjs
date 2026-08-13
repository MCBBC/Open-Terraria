// 一次性验证:华丽资源条填充与边框对齐(像素级:红心/蓝星质心 vs 面板格中心)
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=500000 scripts/_resourcebars-align.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await new Promise((r) => setTimeout(r, 3000));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const cv = g.renderer.canvas ?? document.querySelector('canvas');
  const ctx2 = cv.getContext('2d');
  const dpr = cv.width / cv.clientWidth || 1;
  // 心条面板:第一行 10 格,vx=1280-296, vy=15;星列 sx=1240, sy=22
  // 面板格几何(按 vanilla 推进复算):L28 M24... 末格
  const slots = [];
  let ax = 1280 - 296, widths = [28, 24, 24, 24, 24, 24, 24, 24, 24, 26];
  for (let i = 0; i < 10; i++) { slots.push({ x0: ax, x1: ax + widths[i] }); ax += widths[i]; }
  // 每格:红色像素质心(填充) vs 格中心
  const heartRows = [];
  for (let s = 0; s < slots.length; s++) {
    const sl = slots[s];
    let sx = 0, sy = 0, n = 0;
    for (let y = 15; y < 45; y++) for (let x = sl.x0; x < sl.x1; x++) {
      const i4 = ((y * dpr | 0) * cv.width + (x * dpr | 0)) * 4;
      const d = ctx2.getImageData(x * dpr | 0, y * dpr | 0, 1, 1).data;
      if (d[3] > 60 && d[0] > 120 && d[0] > d[1] * 1.6 && d[0] > d[2] * 1.6) { sx += x; sy += y; n++; }
    }
    heartRows.push({ slot: s, cx: +(sl.x0 + sl.x1 / 2).toFixed(1), fillN: n, fillCx: n ? +(sx / n).toFixed(1) : null, fillCy: n ? +(sy / n).toFixed(1) : null });
  }
  // 星列:蓝像素质心 vs 星格中心(Star_A 26 高 → 中心 22+13=35,推进 -2+24)
  const starRows = [];
  for (let i = 0; i < 5; i++) {
    const cy0 = 22 + 24 * i;
    let sx = 0, sy = 0, n = 0;
    for (let y = cy0 - 4; y < cy0 + 30; y++) for (let x = 1240; x < 1272; x++) {
      const d = ctx2.getImageData(x * dpr | 0, y * dpr | 0, 1, 1).data;
      if (d[3] > 60 && d[2] > 120 && d[2] > d[0] * 1.5 && d[2] > d[1] * 1.2) { sx += x; sy += y; n++; }
    }
    starRows.push({ star: i, slotCy: cy0 + 11, fillN: n, fillCx: n ? +(sx / n).toFixed(1) : null, fillCy: n ? +(sy / n).toFixed(1) : null });
  }
  return { dpr, heartRows, starRows };
});
console.log(JSON.stringify(out));
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
