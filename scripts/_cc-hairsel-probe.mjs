// 一次性：角色创建发型网格选中效果探针——z 序断言 + 像素实证（经 tools/run-diag.mjs 运行）
// 用法：SW_ORIGIN=http://localhost:5203 node tools/run-diag.mjs scripts/_cc-hairsel-probe.mjs
// 断言目标（对齐 UIHairStyleButton.DrawSelf :56-76）：
//   层序 = 底板 < 选中亮底(CategoryPanelHighlight 36×36 不透明) < 悬停框 < 头像缩略图（最上）
//   → 选中格内 36×36 亮蓝块必须被头像像素盖住中心（蓝像素占比显著 < 1），头像完整可见。
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
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
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

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

// ---- 发型页 ----
await page.click('.sw-cc-tab[data-tab=hair]');
await new Promise((r) => setTimeout(r, 1600));   // 等 sheet 烘焙 + 缩略图就位

// z 序 / DOM 序断言（选中格）
const zinfo = await page.evaluate(() => {
  const btn = document.querySelector('.sw-cc-hairbtn.active');
  if (!btn) return { active: false };
  const hl = btn.querySelector('.hl');
  const thumb = btn.querySelector('.sw-cc-thumb');
  const z = (e) => getComputedStyle(e).zIndex;
  const before = getComputedStyle(btn, '::before');
  const after = getComputedStyle(btn, '::after');
  return {
    active: true,
    hairId: btn.dataset.hair,
    domOrder: [...btn.children].map((c) => c.className),
    hlZ: z(hl), thumbZ: z(thumb),
    hlUnderThumb: Number(z(hl)) < Number(z(thumb)),
    baseZ: before.zIndex, borderZ: after.zIndex,
    hlSize: [hl.offsetWidth, hl.offsetHeight],
    thumbHasSheet: (thumb.style.backgroundImage || '').startsWith('url('),
    activeCount: document.querySelectorAll('.sw-cc-hairbtn.active').length,
  };
});

// 像素实证：截选中格 → 页内 canvas 解码 → 统计亮蓝(156,164,229±24)覆盖与中心非蓝占比
const shotCell = async (sel) => {
  const elm = await page.$(sel);
  const b64 = await elm.screenshot({ encoding: 'base64' });
  return page.evaluate(async (d) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + d;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const c = cv.getContext('2d', { willReadFrequently: true });
    c.drawImage(img, 0, 0);
    const { data, width: w, height: h } = c.getImageData(0, 0, cv.width, cv.height);
    const isBlue = (i) => Math.abs(data[i] - 156) < 26 && Math.abs(data[i + 1] - 164) < 26 && Math.abs(data[i + 2] - 229) < 26 && data[i + 3] > 200;
    let blue = 0, opaque = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i + 3] > 200) opaque++; if (isBlue(i)) blue++; }
    // 中心 20×20（头像躯干区）：非蓝不透明像素 = 头像透出
    let cx0 = Math.floor(w / 2 - 10), cy0 = Math.floor(h / 2 - 10), center = 0, centerOpaque = 0;
    for (let y = cy0; y < cy0 + 20; y++) for (let x = cx0; x < cx0 + 20; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 200) { centerOpaque++; if (!isBlue(i)) center++; }
    }
    return { w, h, bluePx: blue, opaquePx: opaque, blueRatioInBox: +(blue / (w * h)).toFixed(3),
      centerNonBlue: center, centerOpaque, centerHeadVisibleRatio: +(center / 400).toFixed(3) };
  }, b64);
};
const cellPix = await shotCell('.sw-cc-hairbtn.active');

// 截图：全页 + 选中格 4x 放大 + 悬停他格
await page.screenshot({ path: `${OUT}/hair-page.png` });
const activeBox = await (await page.$('.sw-cc-hairbtn.active')).boundingBox();
await page.screenshot({ path: `${OUT}/hair-sel-1x.png`, clip: { x: activeBox.x - 6, y: activeBox.y - 6, width: activeBox.width + 12, height: activeBox.height + 12 } });
// 悬停第二格（悬停框层序实证）
const second = (await page.$$('.sw-cc-hairbtn'))[1];
const sb = await second.boundingBox();
await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
await new Promise((r) => setTimeout(r, 250));
await page.screenshot({ path: `${OUT}/hair-hover.png`, clip: { x: sb.x - 6, y: sb.y - 6, width: sb.width + 12, height: sb.height + 12 } });
const hoverZ = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-cc-hairbtn')];
  const b = btns[1];
  const r = b.getBoundingClientRect();
  b.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  return { borderZ: getComputedStyle(b, '::after').zIndex, thumbZ: getComputedStyle(b.querySelector('.sw-cc-thumb')).zIndex };
});
await page.mouse.move(10, 10);

// 点击切换选中（setHair 路径 → active 迁移 + 新选中格同样不被盖）
await page.evaluate(() => { [...document.querySelectorAll('.sw-cc-hairbtn')][5].click(); });
await new Promise((r) => setTimeout(r, 200));
const zinfo2 = await page.evaluate(() => {
  const btn = document.querySelector('.sw-cc-hairbtn.active');
  return { hairId: btn?.dataset.hair, hlUnderThumb: Number(getComputedStyle(btn.querySelector('.hl')).zIndex) < Number(getComputedStyle(btn.querySelector('.sw-cc-thumb')).zIndex) };
});
const cellPix2 = await shotCell('.sw-cc-hairbtn.active');
const box2 = await (await page.$('.sw-cc-hairbtn.active')).boundingBox();
await page.screenshot({ path: `${OUT}/hair-sel2-1x.png`, clip: { x: box2.x - 6, y: box2.y - 6, width: box2.width + 12, height: box2.height + 12 } });

// ---- 外观页（服装样式格）同款断言 ----
await page.click('.sw-cc-tab[data-tab=look]');
await new Promise((r) => setTimeout(r, 1200));
const lookZ = await page.evaluate(() => {
  const btn = document.querySelector('.sw-cc-stylebtn.active');
  if (!btn) return { active: false };
  const hl = btn.querySelector('.hl'), thumb = btn.querySelector('.sw-cc-thumb');
  return { active: true, domOrder: [...btn.children].map((c) => c.className),
    hlZ: getComputedStyle(hl).zIndex, thumbZ: getComputedStyle(thumb).zIndex,
    hlUnderThumb: Number(getComputedStyle(hl).zIndex) < Number(getComputedStyle(thumb).zIndex) };
});
const lookBtn = await page.$('.sw-cc-stylebtn.active');
const lb = await lookBtn.boundingBox();
await page.screenshot({ path: `${OUT}/look-sel-1x.png`, clip: { x: lb.x - 6, y: lb.y - 6, width: lb.width + 12, height: lb.height + 12 } });
await page.screenshot({ path: `${OUT}/look-page.png` });

// 4x 放大报告图
const upscale4 = (f, out) => {
  try {
    const w = +execSync(`sips -g pixelWidth ${f}`).toString().match(/pixelWidth: (\d+)/)[1];
    const h = +execSync(`sips -g pixelHeight ${f}`).toString().match(/pixelHeight: (\d+)/)[1];
    execSync(`sips -z ${h * 4} ${w * 4} ${f} --out ${out}`);
  } catch { /* 放大失败不阻断断言 */ }
};
upscale4(`${OUT}/hair-sel-1x.png`, `${OUT}/hair-sel-4x.png`);
upscale4(`${OUT}/hair-sel2-1x.png`, `${OUT}/hair-sel2-4x.png`);
upscale4(`${OUT}/hair-hover.png`, `${OUT}/hair-hover-4x.png`);
upscale4(`${OUT}/look-sel-1x.png`, `${OUT}/look-sel-4x.png`);

const pass = zinfo.hlUnderThumb && zinfo2.hlUnderThumb
  && cellPix.centerHeadVisibleRatio > 0.3 && cellPix.blueRatioInBox < 0.8
  && lookZ.hlUnderThumb;
console.log(JSON.stringify({ errs: errs.slice(0, 8), zinfo, cellPix, zinfo2, cellPix2, hoverZ, lookZ, PASS: pass }, null, 1));
await browser.close();
process.exit(pass ? 0 : 3);
