// tooltip 实态追踪仪 v2(真实 CDP 鼠标):进世界→开背包→搜索注入木材→
// 真鼠标移到首个有物槽位。记录:
//  1) 所有 .tooltip 的 display 赋值(SHOW/HIDE + JS 栈前 3 帧)
//  2) Element.addEventListener 对 mouse*/pointer* hover 类型的绑定清单
//  3) document 捕获段收到并命中 .sw-slot 的 mouseenter 实际派发
// 用法:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_tooltip-live-diag.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
  userDataDir: '/tmp/sw-pptr-profile',
});
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 900 });
await page.evaluateOnNewDocument(() => {
  window.__evLog = [];
  const orig = Element.prototype.addEventListener;
  window.__binds = [];
  Element.prototype.addEventListener = function (type, fn, opts) {
    try {
      if (/^(mouse|pointer)(enter|leave|over|out)$/.test(type))
        window.__binds.push([type, String(this.className || this.tagName).slice(0, 28)]);
    } catch { /* 忽略 */ }
    return orig.call(this, type, fn, opts);
  };
});
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swUI && window.__swGame?.renderer && window.__swGame.world)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent === '我已知晓')?.click(); });
await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('KeyE');
  await new Promise((r) => setTimeout(r, 500));
  if (await page.evaluate(() => window.__swUI.inventoryOpen).catch(() => false)) break;
}
await page.evaluate(() => { window.__swUI.openItemSearch(); });
await new Promise((r) => setTimeout(r, 400));
await page.type('input[placeholder*="名称"]', '木材');
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div')].filter((d) => /width:\s*170px/.test(d.style.cssText));
  rows[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.evaluate(() => { window.__swUI.closeItemSearch(); });
await new Promise((r) => setTimeout(r, 300));
// 挂钩 tooltip.style + document 捕获监听
await page.evaluate(() => {
  const tip = window.__swUI.tooltip;
  const proxy = new Proxy(tip.style, {
    set(tgt, prop, val) {
      if (prop === 'display') {
        try { throw new Error('t'); } catch (e) {
          window.__evLog.push([val === 'none' ? 'HIDE' : 'SHOW', e.stack.split('\n').slice(1, 4).join('|').slice(0, 220)]);
        }
      }
      tgt[prop] = val;
      return true;
    },
    get(tgt, prop) { return typeof tgt[prop] === 'function' ? tgt[prop].bind(tgt) : tgt[prop]; },
  });
  Object.defineProperty(tip, 'style', { get() { return proxy; }, configurable: true });
  document.addEventListener('mouseenter', (e) => {
    if (e.target?.classList?.contains('sw-slot'))
      window.__evLog.push(['FIRED-enter', (e.target.textContent || '').slice(0, 12)]);
  }, true);
  document.addEventListener('mousemove', () => {
    window.__evLog.push(['mm']);
  }, true);
});
const slot = await page.evaluate(() => {
  const s = [...window.__swUI.invPanel.querySelectorAll('.sw-slot')].find((x) => x.querySelector('img'));
  if (!s) return null;
  const r = s.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
if (!slot) { console.log(JSON.stringify({ fatal: '无物品槽位' })); process.exit(1); }
const before = await page.evaluate(() => window.__evLog.filter((x) => x[0] !== 'mm').length);
await page.mouse.move(slot.x - 60, slot.y + 60);
await new Promise((r) => setTimeout(r, 150));
await page.mouse.move(slot.x, slot.y);
await new Promise((r) => setTimeout(r, 900));
const out = await page.evaluate((sx, sy) => {
  const ev = window.__evLog;
  const mmCount = ev.filter((x) => x[0] === 'mm').length;
  const rest = ev.filter((x) => x[0] !== 'mm');
  const el = document.elementFromPoint(sx, sy);
  return {
    mousemoveFired: mmCount,
    events: rest.slice(-10),
    binds: window.__binds.slice(-8),
    hitAtSlot: el ? el.tagName + '.' + String(el.className).slice(0, 40) : null,
  };
}, slot.x, slot.y);
console.log(JSON.stringify(out, null, 1));
void before;
await browser.close();
process.exit(0);
