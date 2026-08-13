// 诊断：列出标题屏全部 canvas 与其内容特征
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5202', { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
const out = await page.evaluate(() => {
  return [...document.querySelectorAll('canvas')].map((c, i) => {
    const cs = getComputedStyle(c);
    let yellow = 0;
    try {
      const c2 = document.createElement('canvas');
      c2.width = c.width; c2.height = c.height;
      const cx = c2.getContext('2d');
      cx.drawImage(c, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      for (let p = 0; p < d.length; p += 16) {
        if (d[p] > 200 && d[p + 1] > 170 && d[p + 2] < 140) yellow++;
      }
    } catch { /* tainted */ }
    return {
      i, w: c.width, h: c.height, z: cs.zIndex, pos: cs.position,
      opacity: cs.opacity, display: cs.display, yellowSamples: yellow,
      cls: c.className, parentCls: c.parentElement ? c.parentElement.className : '',
    };
  });
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
