// FX26 垃圾桶图标居中探针(2026-09-14 用户实报:vinv 垃圾桶 Trash.png 偏移)。
// 运行:SW_ORIGIN=http://localhost:5209 node tools/run-diag.mjs --timeout=480000 scripts/_fx26-trash.mjs
// 金标 = ItemSlot.cs:2747-2751:空槽 Trash.png(32×32) 画在 position + 52s/2 − 32s/2
// = 盒坐标 (10,10)/32px(s=0.85/0.755 均经盒 transform 缩放)→ 图标中心 = 盒中心。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 1000, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
await page.bringToFront();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });

let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(async () => { await window.__swGame.newWorld('05162020', 4200, 1200, () => {}); });
let ready = false;
for (let i = 0; i < 150 && !ready; i++) {
  ready = await page.evaluate(() => !!(window.__swGame?.world?.store)).catch(() => false);
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
if (!ready) { console.error('世界未建'); process.exit(1); }

// 清场:欢迎公告卡(WelcomeAnnounce)会盖住垃圾桶槽区 → 点掉再测/截图
await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let t = 0; t < 30; t++) {
    const btn = [...document.querySelectorAll('button')].find((b) => /我已知晓|知道了|确定|OK/.test(b.textContent || ''));
    if (btn) { btn.click(); break; }
    await sleep(500);
  }
  await sleep(300);
});

const fails = [];
const chk = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${detail ?? ''}`); if (!ok) fails.push(name); };

// 截图清场:点不掉的欢迎公告卡直接 display:none(只影响截图,几何断言不受影响)
const clearCover = () => page.evaluate(() => {
  const box = document.querySelector('.sw-vinv .sw-trash');
  const b = box.getBoundingClientRect();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  let n = 0;
  for (const e of document.elementsFromPoint(cx, cy)) {
    if (e.tagName === 'CANVAS' || e === document.body || e === document.documentElement) continue;
    if (e === box || e.contains(box) || box.contains(e)) continue;   // 槽自身/祖先(HUD 根)/后代不动
    e.style.display = 'none'; n++;
  }
  return n;
});

const measure = () => page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI;
  ui.openInventory(true);
  await ui.refreshAllAsync();
  await sleep(300);
  const box = document.querySelector('.sw-vinv .sw-trash');
  if (!box || box.offsetParent === null) return { missing: true };
  await sleep(200);   // Trash.png img 载入
  const icon = box.querySelector('img.sw-trash-icon');
  const b = box.getBoundingClientRect();
  const out = {
    missing: false,
    box: { x: b.x, y: b.y, w: b.width, h: b.height },
    transform: getComputedStyle(box).transform,
  };
  if (icon) {
    const i = icon.getBoundingClientRect();
    out.icon = { x: i.x, y: i.y, w: i.width, h: i.height };
    out.rel = { dx: i.x - b.x, dy: i.y - b.y };                                  // 盒内偏移
    out.centerErr = { dx: (i.x + i.width / 2) - (b.x + b.width / 2), dy: (i.y + i.height / 2) - (b.y + b.height / 2) };
    out.iconSrc = icon.getAttribute('src');
  }
  return out;
});

// ---- A. 常态 0.85 @(448,258) ----
const a = await measure();
if (a.missing) { console.error('FAIL vinv 垃圾桶槽未出现'); await browser.close(); process.exit(2); }
chk('A1 槽位 (448,258) 52×0.85=44.2', Math.abs(a.box.x - 448) < 0.5 && Math.abs(a.box.y - 258) < 0.5
  && Math.abs(a.box.w - 44.2) < 0.3 && Math.abs(a.box.h - 44.2) < 0.3, JSON.stringify(a.box));
chk('A2 盒 transform=scale(0.85)', /matrix\(0\.85.*0\.85/.test(a.transform), a.transform);
chk('A3 Trash.png 图标在(空槽)', !!a.icon && /Trash\.png/.test(a.iconSrc ?? ''), a.iconSrc);
// 原版盒坐标 (10,10)/32px → 视觉 10×0.85=8.5 / 32×0.85=27.2
chk('A4 图标盒内偏移 =10s/视觉8.5', a.icon && Math.abs(a.rel.dx - 8.5) < 0.3 && Math.abs(a.rel.dy - 8.5) < 0.3, JSON.stringify(a.rel));
chk('A5 图标视觉 32×0.85=27.2', a.icon && Math.abs(a.icon.w - 27.2) < 0.4 && Math.abs(a.icon.h - 27.2) < 0.4, JSON.stringify(a.icon));
chk('A6 图标中心=盒中心(±0.5px)', a.icon && Math.abs(a.centerErr.dx) <= 0.5 && Math.abs(a.centerErr.dy) <= 0.5, JSON.stringify(a.centerErr));
console.log('清场隐藏覆盖层', await clearCover());
await page.screenshot({ path: '/tmp/fx26-trash.png', clip: {
  x: Math.max(0, a.box.x - 58), y: Math.max(0, a.box.y - 58),
  width: a.box.w + 116, height: a.box.h + 116 } });
console.log('截图 /tmp/fx26-trash.png');

// ---- B. 开箱/商店态 0.755(盒坐标不变 (10,10)/32px) ----
const b = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ui = window.__swUI, g = window.__swGame;
  g.npcShopOpen = true;
  ui.showNpcShop('商人', [{ vanillaId: 8, price: 50, prefix: 0, stack: 1, buyback: false }], 10000, 1);
  await ui.refreshAllAsync();
  await sleep(300);
  const box = document.querySelector('.sw-vinv .sw-trash');
  const icon = box?.querySelector('img.sw-trash-icon');
  if (!box || box.offsetParent === null || !icon) return { missing: true };
  const bb = box.getBoundingClientRect();
  const ib = icon.getBoundingClientRect();
  const out = {
    missing: false,
    box: { x: bb.x, y: bb.y, w: bb.width, h: bb.height },
    rel: { dx: ib.x - bb.x, dy: ib.y - bb.y },
    centerErr: { dx: (ib.x + ib.width / 2) - (bb.x + bb.width / 2), dy: (ib.y + ib.height / 2) - (bb.y + bb.height / 2) },
  };
  return out;   // 关店挪到截图后(B 段尾),否则截到回位后的空地形
});
if (!b.missing) {
  chk('B1 商店态槽 52×0.755=39.26 @x+5', Math.abs(b.box.w - 39.26) < 0.3 && Math.abs(b.box.x - 453) < 0.8, JSON.stringify(b.box));
  chk('B2 图标盒内偏移 =10s/视觉7.55', Math.abs(b.rel.dx - 7.55) < 0.3 && Math.abs(b.rel.dy - 7.55) < 0.3, JSON.stringify(b.rel));
  chk('B3 图标中心=盒中心(±0.5px)', Math.abs(b.centerErr.dx) <= 0.5 && Math.abs(b.centerErr.dy) <= 0.5, JSON.stringify(b.centerErr));
  await clearCover();
  await page.screenshot({ path: '/tmp/fx26-trash-shop.png', clip: {
    x: Math.max(0, b.box.x - 55), y: Math.max(0, b.box.y - 55),
    width: b.box.w + 110, height: b.box.h + 110 } });
  console.log('截图 /tmp/fx26-trash-shop.png');
  await page.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    g.npcShopOpen = false;
    await ui.closeChest();
    await ui.refreshAllAsync();
  });
} else { console.log('FAIL B0 商店态垃圾桶槽未出现'); fails.push('B0'); }

chk('A7 零页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
await page.evaluate(() => window.__swUI?.closeInventory?.());
await browser.close();
console.log(fails.length ? `FAILS: ${fails.join(' | ')}` : 'ALL PASS');
process.exit(fails.length ? 2 : 0);
