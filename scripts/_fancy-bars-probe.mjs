import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('FancyBars');
  await new Promise(r => setTimeout(r, 150));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 150));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const res = {};
  // 资源条区域采样：右上 (sw-296..sw-40, 10..70) 的金色像素（r>150 g>110 b<110）
  const cv = g.renderer.canvas;
  const ctx = cv.getContext('2d');
  const sw = cv.width;
  const goldIn = (x0, x1, y0, y1) => {
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let gold = 0, total = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i+3] < 100) continue;
      total++;
      if (d[i] > 140 && d[i+1] > 100 && d[i+2] < 120) gold++;
    }
    return { gold, total };
  };
  res.fancyDefault = g.options?.data ? g.options.data.resourceBarStyle : (await import('/src/core/Options.ts')).options.data.resourceBarStyle;
  // 全屏金像素扫描（找金框条实际位置）
  const full = ctx.getImageData(0, 0, cv.width, cv.height).data;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0;
  for (let i = 0; i < full.length; i += 4) {
    if (full[i] > 140 && full[i+1] > 100 && full[i+2] < 120 && full[i+3] > 100) {
      const pi = i / 4;
      const px = pi % cv.width, py = Math.floor(pi / cv.width);
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
      n++;
    }
  }
  res.goldScan = { n, minX, maxX, minY, maxY, canvasW: cv.width, canvasH: cv.height };
  res.heartRegion = goldIn(sw - 310, sw - 250, 10, 55);
  res.starRegion = goldIn(sw - 60, sw - 10, 15, 75);
  // 直查渲染器状态：fancy 贴图就绪 + 目标区域实色
  const fr = g.renderer.fancyBars;
  if (fr) {
    const t = fr.t ?? fr;
    const imgs = Object.entries(t).filter(([, v]) => v instanceof Image);
    res.fancyReady = imgs.every(([, v]) => v.complete && v.naturalWidth > 0);
    res.fancyCount = imgs.length;
  } else res.fancyReady = 'no-field';
  res.optInRenderer = (await import('/src/render/Renderer.ts'), null);
  // 区域色彩直方图（判断画的是心还是天空）
  const hd = ctx.getImageData(sw - 300, 12, 60, 44).data;
  const colors = {};
  for (let i = 0; i < hd.length; i += 4) {
    if (hd[i+3] < 100) continue;
    const k = (hd[i] >> 5) + ',' + (hd[i+1] >> 5) + ',' + (hd[i+2] >> 5);
    colors[k] = (colors[k] ?? 0) + 1;
  }
  res.heartColors = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 5);
  // 切到 classic 验证回退（无金）
  const { options } = await import('/src/core/Options.ts');
  options.data.resourceBarStyle = 'classic';
  await new Promise(r => setTimeout(r, 300));
  res.classicHeart = goldIn(sw - 310, sw - 250, 10, 55);
  options.data.resourceBarStyle = 'fancy';
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
