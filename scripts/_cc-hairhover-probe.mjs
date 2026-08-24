// 一次性：发型格悬停态复检（元素级截图 + 像素统计，经 tools/run-diag.mjs 运行）
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_cc-hairhover-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const OUT = '/tmp/sw-cc-hairsel';
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1280, height: 860 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForSelector('#sw-splash', { hidden: true, timeout: 90000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 800));
await page.click('.sw-title-menu [data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 15000 });
await new Promise((r) => setTimeout(r, 600));
await page.click('.sw-vsel [data-act=new]');
await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1500));
await page.click('.sw-cc-tab[data-tab=hair]');
await new Promise((r) => setTimeout(r, 1600));

// 真实鼠标悬停第 2 格（非选中格）
const target = (await page.$$('.sw-cc-hairbtn'))[1];
const bb = await target.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
await new Promise((r) => setTimeout(r, 300));

const hoverState = await page.evaluate(() => {
  const b = document.querySelectorAll('.sw-cc-hairbtn')[1];
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const cs = getComputedStyle(b, '::before');
  const bd = getComputedStyle(b, '::after');
  return {
    matchesHover: b.matches(':hover'),
    elementAtCenter: el ? el.className : null,
    beforeOpacity: cs.opacity, beforeZ: cs.zIndex,
    borderOpacity: bd.opacity, borderZ: bd.zIndex,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    scrollY: window.scrollY,
  };
});

// 元素级截图（不受 clip 坐标系影响）+ 像素统计：悬停底板应全亮(73,85,186)、黄框(255,231,69)应现
const b64 = await target.screenshot({ encoding: 'base64' });
const pix = await page.evaluate(async (d) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + d;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const c = cv.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  const { data, width: w, height: h } = c.getImageData(0, 0, cv.width, cv.height);
  const near = (i, r, g, b, tol) => Math.abs(data[i] - r) < tol && Math.abs(data[i + 1] - g) < tol && Math.abs(data[i + 2] - b) < tol && data[i + 3] > 200;
  let baseBright = 0, yellow = 0, head = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (near(i, 73, 85, 186, 30)) baseBright++;
    if (near(i, 255, 231, 69, 40)) yellow++;
    if (data[i + 3] > 200 && !near(i, 73, 85, 186, 30) && !near(i, 255, 231, 69, 40)) head++;
  }
  return { w, h, baseBrightPx: baseBright, yellowBorderPx: yellow, otherPx: head };
});
await page.screenshot({ path: `${OUT}/hair-hover2.png`, clip: { x: bb.x - 8, y: bb.y - 8, width: bb.width + 16, height: bb.height + 16 } });
console.log(JSON.stringify({ errs: errs.slice(0, 5), hoverState, pix }, null, 1));
await browser.close();
