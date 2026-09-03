import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 110000 });
const out = await page.evaluate(async () => {
  const res = {};
  for (const n of [191, 189, 190, 192]) {
    const im = new Image();
    im.src = `sprites/vanilla/Extra_${n}.png`;
    await new Promise((r) => { im.onload = r; im.onerror = r; });
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(im, 0, 0);
    const d = cx.getImageData(0, 0, im.width, im.height).data;
    let aPos = 0, rgbPos = 0, lit = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 0) aPos++;
      if (d[i] + d[i + 1] + d[i + 2] > 0) rgbPos++;
      if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    }
    res[n] = { w: im.width, h: im.height, aPosPct: +(aPos / (d.length / 4) * 100).toFixed(1), rgbPosPct: +(rgbPos / (d.length / 4) * 100).toFixed(1), litPct: +(lit / (d.length / 4) * 100).toFixed(1) };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
