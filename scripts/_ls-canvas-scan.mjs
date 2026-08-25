// 画布枚举:哪个 canvas 承载世界渲染(在 orb 位置采样各画布亮度)
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5238';
const browser = await puppeteer.launch({
  protocolTimeout: 300000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
const infos = await page.evaluate(() => {
  const out = [];
  for (const cv of document.querySelectorAll('canvas')) {
    let kind = '?', sample = null;
    const cx2 = cv.getContext('2d');
    if (cx2) {
      kind = '2d';
      try {
        const im = cx2.getImageData((cv.width / 2) | 0, (cv.height / 2) | 0, 8, 8).data;
        let s = 0;
        for (let i = 0; i < im.length; i += 4) s += im[i] + im[i + 1] + im[i + 2];
        sample = s / (8 * 8 * 3);
      } catch (e) { sample = 'err'; }
    } else {
      try { cv.getContext('webgl2') || cv.getContext('webgl'); kind = 'webgl'; } catch { kind = 'none'; }
    }
    out.push({ w: cv.width, h: cv.height, id: cv.id || cv.className || '(anon)', kind, midBrightness: sample });
  }
  return out;
});
console.log(JSON.stringify(infos, null, 1));
await browser.close();
