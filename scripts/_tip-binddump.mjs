// 绑定真相:1) Element.addEventListener 捕获所有 mouseenter 绑定的宿主类名统计
//          2) document 捕获段记录扫描首行时每个 enter/out 的 target 类
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.evaluateOnNewDocument(() => {
  window.__binds = [];
  const orig = Element.prototype.addEventListener;
  Element.prototype.addEventListener = function (type) {
    try { if (/^mouse(enter|leave|over|out)$/.test(type)) window.__binds.push(type + '@' + String(this.className || this.tagName).slice(0, 26)); } catch { /* noop */ }
    return orig.apply(this, arguments);
  };
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame?.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓')?.click(); });
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 400));
  if (await page.evaluate(() => window.__swUI.inventoryOpen).catch(() => false)) break;
}
const stats = await page.evaluate(() => {
  const m = {};
  for (const b of window.__binds) m[b] = (m[b] ?? 0) + 1;
  const pick = Object.entries(m).filter(([k]) => /slot|trash/i.test(k));
  return { totalBinds: window.__binds.length, slotRelated: pick };
});
console.log(JSON.stringify(stats, null, 1));
// 实时事件流(扫一行)
await page.evaluate(() => {
  window.__flow = [];
  ['mouseenter', 'mouseover', 'mousemove'].forEach((t) =>
    document.addEventListener(t, (e) => {
      if (window.__flow.length > 40) return;
      window.__flow.push(t + '>' + String(e.target.className || e.target.tagName).slice(0, 24));
    }, true));
});
await page.mouse.move(300, 700);
await new Promise((r) => setTimeout(r, 150));
await page.mouse.move(97, 139);
await new Promise((r) => setTimeout(r, 150));
await page.mouse.move(140, 182);
await new Promise((r) => setTimeout(r, 300));
console.log('FLOW:', JSON.stringify(await page.evaluate(() => window.__flow)));
await browser.close();
process.exit(0);
