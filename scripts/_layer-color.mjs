// 一次性:菜单层发白诊断——渲染画布山体像素 vs 原始贴图对应像素 vs tint 预期。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
let menuReady = false;
for (let i = 0; i < 100 && !menuReady; i++) {
  menuReady = await page.evaluate(() => !!window.__swMenuBg).catch(() => false);
  if (!menuReady) await new Promise((r) => setTimeout(r, 1000));
}
for (let i = 0; i < 120; i++) {
  const gone = await page.evaluate(() => !document.querySelector('.layer.back')).catch(() => true);
  if (gone) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await new Promise((r) => setTimeout(r, 1500));
// 正午锁定(排除晨昏灰 tint)
await page.evaluate(() => {
  const mb = window.__swMenuBg;
  mb.dayTime = true;
  mb.vTime = 27000 / 0.625 * 0.625;   // time 27000 = 正午
  mb.vTime = 27000;
});
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(() => {
  const mb = window.__swMenuBg;
  const cv = mb.canvas;
  const g = cv.getContext('2d');
  // 找山体:扫描 y=300-500 行,取饱和度最高的深色像素簇(山体非天空)
  let best = null, bestSat = -1;
  const d = g.getImageData(0, 250, cv.width, 300).data;
  for (let y = 0; y < 300; y += 6) {
    for (let x = 0; x < cv.width; x += 6) {
      const i = ((250 + y) * cv.width + x) * 4;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const sat = Math.max(r, gg, b) - Math.min(r, gg, b);
      const lum = (r + gg + b) / 3;
      if (lum > 40 && lum < 200 && sat > bestSat) { bestSat = sat; best = { x, y: 250 + y, r, g: gg, b }; }
    }
  }
  // 当前 tint 与样式
  const tint = mb['layerTint'] ? null : null;
  return {
    sample: best,
    cots: mb.sky.cots,
    style: mb.style,
    mnt: (mb['FOREST_STYLES'] ? null : null),
  };
});
// 原始贴图对应色:加载 93/94 采样山体行
const raw = await page.evaluate(async () => {
  const load = (n) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.src = `sprites/vanilla/Background_${n}.png`;
  });
  const out = {};
  for (const n of [93, 94, 7, 8]) {
    const im = await load(n);
    const g = im.width ? document.createElement('canvas').getContext('2d') : null;
    const cv = document.createElement('canvas');
    cv.width = im.width; cv.height = im.height;
    const c2 = cv.getContext('2d');
    c2.drawImage(im, 0, 0);
    // 山体行(上部 1/3 处)取平均色
    const d = c2.getImageData(0, Math.floor(im.height * 0.35), im.width, 40).data;
    let r = 0, gg = 0, b = 0, n2 = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n2++; }
    }
    out[n] = n2 ? [Math.round(r / n2), Math.round(gg / n2), Math.round(b / n2)] : null;
  }
  return out;
});
console.log(JSON.stringify({ rendered: out, rawAvg: raw }, null, 1));
await browser.close();
