// flare1/flare2(横向光晕贴图)像素形状采样
import puppeteer from 'puppeteer-core';
const B = process.env.T || 'http://localhost:4173';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 300, height: 200 },
});
const page = await browser.newPage();
await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
const r = await page.evaluate(async () => {
  const out = {};
  for (const name of ['Misc_Sunflare_flare1', 'Misc_Sunflare_flare2']) {
    const im = new Image();
    im.src = `/sprites/vanilla/${name}.png`;
    await new Promise((ok, e2) => { im.onload = ok; im.onerror = e2; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    // 中行 alpha 轮廓
    const midY = Math.floor(im.height / 2);
    let leftEdge = -1, rightEdge = -1, maxA = 0;
    for (let px = 0; px < im.width; px++) {
      const a = x.getImageData(px, midY, 1, 1).data[3];
      if (a > 10 && leftEdge === -1) leftEdge = px;
      if (a > 10) rightEdge = px;
      if (a > maxA) maxA = a;
    }
    // 中心色
    const cd = x.getImageData(Math.floor(im.width/2), midY, 1, 1).data;
    out[name] = { w: im.width, h: im.height, aspect: (im.width/im.height).toFixed(2),
      midRowAlphaRange: [leftEdge, rightEdge], width: rightEdge - leftEdge + 1,
      centerRGBA: [cd[0], cd[1], cd[2], cd[3]], maxAlpha: maxA };
  }
  return out;
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
