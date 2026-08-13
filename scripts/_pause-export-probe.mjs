// 暂停面板像素化(IngameOptions.DrawInvBG 1:1)+ 导出存档 探针:
//   1) Esc → .sw-pause-panel 存在,背景为 dataURL 九宫(角像素 ≠ 中心像素,蓝紫色系)
//   2) 导出按钮存在(导出存档);点击 → <a download> 文件名 *.sbw.json 捕获
//   3) 再按 Esc → 面板关闭
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- 1) Esc 打开暂停面板 ----
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 300));

const pixel = await page.evaluate(async () => {
  const panel = document.querySelector('.sw-pause-panel');
  if (!panel) return { exists: false };
  const bg = getComputedStyle(panel).backgroundImage;
  const m = /data:image\/png;base64,([^")]+)/.exec(bg);
  const btns = [...panel.querySelectorAll('.sw-pause-btn')].map((b) => b.textContent);
  const hasExport = btns.some((t) => t.includes('导出') || t.includes('Export'));
  if (!m) return { exists: true, hasBg: false, btns, hasExport };
  // 采样九宫:角 (5,5) vs 中心;断言角≠心且色系偏蓝紫(b 最大)
  const img = new Image();
  img.src = 'data:image/png;base64,' + m[1];
  await new Promise((res) => { img.onload = res; img.onerror = res; setTimeout(res, 1500); });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  const corner = x.getImageData(5, 5, 1, 1).data;
  const center = x.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
  return {
    exists: true, hasBg: true, btns, hasExport,
    w: c.width, h: c.height,
    corner: [...corner].slice(0, 4), center: [...center].slice(0, 4),
  };
});
console.log(JSON.stringify(pixel));
check('Esc 打开暂停面板', pixel.exists === true);
check('面板为像素九宫 dataURL', pixel.hasBg === true, `${pixel.w}×${pixel.h}`);
check('九宫结构(角≠中心像素)', pixel.hasBg && JSON.stringify(pixel.corner) !== JSON.stringify(pixel.center),
  `corner=${JSON.stringify(pixel.corner)} center=${JSON.stringify(pixel.center)}`);
check('面板色系偏蓝紫(b>r)', pixel.corner ? pixel.corner[2] > pixel.corner[0] : false, `rgb=${pixel.corner?.slice(0, 3)}`);
check('导出存档按钮存在', pixel.hasExport === true, `按钮=[${pixel.btns?.join('|')}]`);

// ---- 2) 点击导出 → 捕获 <a download> 文件名 ----
const dlName = await page.evaluate(async () => {
  let captured = null;
  const origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) captured = this.download; return origClick.call(this); };
  const btns = [...document.querySelectorAll('.sw-pause-btn')];
  const exp = btns.find((b) => (b.textContent || '').includes('导出') || (b.textContent || '').includes('Export'));
  if (!exp) return null;
  exp.click();
  // 序列化在 worker,轮询至多 8s
  for (let i = 0; i < 40 && !captured; i++) await new Promise((r) => setTimeout(r, 200));
  HTMLAnchorElement.prototype.click = origClick;
  return captured;
});
check('导出触发下载(*.sbw.json)', !!dlName && /\.sbw\.json$/.test(dlName), `filename=${dlName}`);

// ---- 3) 再按 Esc 关闭 ----
await page.keyboard.press('Escape');
await new Promise((r) => setTimeout(r, 200));
const closed = await page.evaluate(() => !document.querySelector('.sw-pause-panel'));
check('再按 Esc 关闭面板', closed === true);
check('无 page error', errors.length === 0, errors.join('; '));

console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
