// 画布太阳是否存在(菜单):拨正午,采样太阳理论位置的实际像素颜色分布
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const origin = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(origin, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 3500));

const res = await page.evaluate(async () => {
  const out = {};
  if (!window.__swMenuBg) return { noHandle: true };
  window.__swMenuBg.setClockT(0.5);
  await new Promise((s) => setTimeout(s, 600));
  out.menuT = window.__swMenuBg.clockTime();
  const cv = [...document.querySelectorAll('canvas')].find((c) => getComputedStyle(c).zIndex === '0');
  const cx = cv.getContext('2d');
  const probe = (x, y, label) => {
    const d = cx.getImageData(x, y, 1, 1).data;
    out[label] = [d[0], d[1], d[2]];
  };
  probe(640, 180, 'sunCenter(640,180)');
  probe(640, 200, 'sun(640,200)');
  probe(640, 160, 'sun(640,160)');
  probe(620, 180, 'sun(620,180)');
  probe(660, 180, 'sun(660,180)');
  probe(640, 100, 'sky(640,100)');
  probe(640, 500, 'lower(640,500)');
  // 横扫 y=180 行找最亮块的中心
  const row = cx.getImageData(0, 178, cv.width, 5).data;
  let bestX = -1, bestLum = -1;
  for (let x = 0; x < cv.width; x++) {
    let lum = 0;
    for (let k = 0; k < 5; k++) { const i = ((k * cv.width + x) * 4); lum += row[i] + row[i + 1] + row[i + 2]; }
    if (lum > bestLum) { bestLum = lum; bestX = x; }
  }
  out.brightestXatY180 = bestX;
  return out;
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
