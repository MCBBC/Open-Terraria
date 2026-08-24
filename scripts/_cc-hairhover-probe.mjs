// 一次性：发型格悬停态复检（元素级截图 + pngjs 像素统计，经 tools/run-diag.mjs 运行）
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_cc-hairhover-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
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
console.log(JSON.stringify({ errs: errs.slice(0, 5), hoverState }, null, 1));

// 元素级截图落盘 + pngjs 像素统计：
//   悬停底板应全亮(73,85,186)、黄框(255,231,69)应现、头像像素(其余)应盖在最上
const file = `${OUT}/hair-hover-el.png`;
await target.screenshot({ path: file });
const png = PNG.sync.read(await (await import('node:fs')).promises.readFile(file));
const { width: w, height: h, data } = png;
const near = (i, r, g, b, tol) => Math.abs(data[i] - r) < tol && Math.abs(data[i + 1] - g) < tol && Math.abs(data[i + 2] - b) < tol && data[i + 3] > 200;
let baseBright = 0, yellow = 0, head = 0;
for (let i = 0; i < data.length; i += 4) {
  if (near(i, 73, 85, 186, 30)) baseBright++;
  else if (near(i, 255, 231, 69, 40)) yellow++;
  else if (data[i + 3] > 200) head++;
}
console.log(JSON.stringify({ pix: { w, h, baseBrightPx: baseBright, yellowBorderPx: yellow, headPx: head } }, null, 1));

// 4x 放大供报告
const { execSync } = await import('node:child_process');
execSync(`sips -z ${h * 4} ${w * 4} ${file} --out ${OUT}/hair-hover-el-4x.png`);
await browser.close();
