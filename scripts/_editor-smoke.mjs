// 纠错编辑器冒烟:列表渲染/选中绘制/拖改/导出
import puppeteer from 'puppeteer-core';
const CHROME = process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1500, height: 900 }, protocolTimeout: 180000 });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 140)));
await page.goto(ORIGIN + '/npc-box-editor.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => document.querySelectorAll('#list .row').length > 600, { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));   // 缩略图懒加载窗口
const t1 = await page.evaluate(() => ({
  rows: document.querySelectorAll('#list .row').length,
  thumbsPainted: [...document.querySelectorAll('#list canvas')].filter((c) => c.__done).length,
}));
// 选中僵尸 #3
await page.evaluate(() => { [...document.querySelectorAll('#list .row')].find((r) => r.dataset.id === '3').click(); });
await new Promise((r) => setTimeout(r, 800));
const t2 = await page.evaluate(() => {
  const cv = document.getElementById('stage');
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let colors = new Set();
  for (let i = 0; i < d.length; i += 4000 * 4) colors.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
  return { title: document.getElementById('title').textContent, uniqueColorSamples: colors.size };
});
// 程序化拖动盒体(+10,+6)并标记修改
const t3 = await page.evaluate(() => {
  const w = window;
  // 直接触发内部状态接口(经 DOM 事件近似):模拟 mousedown/mousemove/mouseup 于画布中心右侧
  const cv = document.getElementById('stage');
  const cx = cv.clientWidth / 2, cy = cv.clientHeight / 2;
  const md = new MouseEvent('mousedown', { clientX: cv.getBoundingClientRect().left + cx, clientY: cv.getBoundingClientRect().top + cy, bubbles: true });
  cv.dispatchEvent(md);
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: cv.getBoundingClientRect().left + cx + 13, clientY: cv.getBoundingClientRect().top + cy + 8 }));
  window.dispatchEvent(new MouseEvent('mouseup', {}));
  return localStorage.getItem('sw_npc_box_edits');
});
// 导出
await page.click('#exportBtn');
await new Promise((r) => setTimeout(r, 200));
const t4 = await page.evaluate(() => {
  const ta = document.getElementById('expTa').value;
  const j = JSON.parse(ta);
  return { edits: j.edits.length, sample: j.edits[0] };
});
console.log(JSON.stringify({ t1, t2, savedEdits: t3 && JSON.parse(t3), t4, errs }, null, 1));
await browser.close();
