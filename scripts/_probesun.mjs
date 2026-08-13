// 诊断：定位天空画布中太阳的真实像素位置，与 TitleMenu 命中层公式对账
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(async () => {
  const t0 = Date.now();
  // 等日出（白天）再测：当前若在夜里就等时钟走到白天
  const info = () => window.__swMenuBg ? null : null;
  void info;
  let mi = null;
  const getMenuT = () => {
    // menuTimeInfo 不在 window 上；经 __swMenuBg.clockTime() 读
    return window.__swMenuBg ? window.__swMenuBg.clockTime() : null;
  };
  while (Date.now() - t0 < 120000) {
    const t = getMenuT();
    if (t != null && t > 0.30 && t < 0.60) { mi = t; break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  const canvas = document.querySelector('canvas');
  const c2 = document.createElement('canvas');
  c2.width = canvas.width; c2.height = canvas.height;
  const cx = c2.getContext('2d');
  cx.drawImage(canvas, 0, 0);
  const img = cx.getImageData(0, 0, canvas.width, canvas.height).data;
  // 扫描亮黄像素（R>200 G>170 B<140）求质心
  let sx = 0, sy = 0, n = 0, minx = 1e9, maxx = -1, miny = 1e9, maxy = -1;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const i = (y * canvas.width + x) * 4;
      if (img[i] > 200 && img[i + 1] > 170 && img[i + 2] < 140) {
        sx += x; sy += y; n++;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
    }
  }
  const cel = document.querySelector('.sw-title-celestial');
  const r = cel.getBoundingClientRect();
  return {
    menuT: mi, canvas: { w: canvas.width, h: canvas.height },
    sun: n > 0 ? { cx: Math.round(sx / n), cy: Math.round(sy / n), n, minx, maxx, miny, maxy } : null,
    layer: { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), w: Math.round(r.width) },
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
