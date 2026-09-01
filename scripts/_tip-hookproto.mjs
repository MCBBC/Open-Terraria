// 原型级钩子直证链路:hover→showSlotHintTouch→showTooltipFor→display 结果
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], userDataDir: '/tmp/sw-pptr-profile' });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
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
// 原型钩子
const hooked = await page.evaluate(() => {
  try {
    const proto = Object.getPrototypeOf(window.__swUI);
    const o1 = proto.showSlotHintTouch, o2 = proto.showTooltipFor;
    if (!o1 || !o2) return { err: 'no-proto-methods' };
    proto.showSlotHintTouch = function (...a) { window.__L = window.__L ?? []; window.__L.push(['hintTouch', a[0], a[1]]); return o1.apply(this, a); };
    proto.showTooltipFor = function (...a) {
      window.__L.push(['showFor', a[0], a[1]]);
      const r = o2.apply(this, a);
      window.__L.push(['dispAfter=' + this.tooltip.style.display]);
      return r;
    };
    return { ok: true };
  } catch (e) { return { err: String(e).slice(0, 100) }; }
});
// 放固定物到主格 idx12 + 取其坐标
const pos = await page.evaluate(() => {
  const items = window.__swITEMS ?? [];
  let tid = 1;
  for (let id = 0; id < items.length; id++) if (/^torch/.test(items[id]?.key ?? '')) { tid = id; break; }
  window.__swGame.player.inv.slots[12] = { id: tid, stack: 50 };
  window.__swUI.refreshAllNow();
  // 找 idx12 的元素坐标(第十一个 sw-slot:0-9 热键栏行在面板内复制?直接按顺序取)
  const s = [...window.__swUI.invPanel.querySelectorAll('.sw-slot')];
  let idxInPanel = -1;
  // 主格从面板第 11 个开始未必可靠——用位置猜第二行第一列(x≈54,y≈182 起)
  return { count: s.length };
});
void pos;
// 直接扫第二行前几列找有 cnt 文本(torch stack 50 会显示 "50")
const found = await page.evaluate(() => {
  for (const s of [...window.__swUI.invPanel.querySelectorAll('.sw-slot')]) {
    const c = s.querySelector('.cnt');
    if (c && c.textContent === '50') {
      const r = s.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
  }
  return null;
});
console.log('hook=', JSON.stringify(hooked), 'slotCnt50=', JSON.stringify(found));
if (found) {
  await page.mouse.move(found.x - 60, found.y - 60);
  await new Promise((r) => setTimeout(r, 150));
  await page.mouse.move(found.x, found.y);
  await new Promise((r) => setTimeout(r, 700));
  const res = await page.evaluate(() => ({
    L: window.__L ?? null,
    disp: getComputedStyle(window.__swUI.tooltip).display,
    text: (window.__swUI.tooltip.textContent ?? '').slice(0, 30),
  }));
  console.log(JSON.stringify(res, null, 1));
}
await browser.close();
process.exit(0);
