// 一次性:列表行内部矩形测量——info/sub/btns 实际位置 vs 预期分区。
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
await new Promise((r) => setTimeout(r, 1200));
await new Promise((r) => setTimeout(r, 1500));
const clouds = await page.evaluate(() => {
  const sky = window.__swMenuBg.sky;
  const v = sky.vclouds;
  return {
    count: v.length,
    scales: v.slice(0, 8).map((c) => +c.scale.toFixed(2)),
    ys: v.slice(0, 8).map((c) => Math.round(c.y)),
    xs: v.slice(0, 8).map((c) => Math.round(c.x)),
    alphas: v.slice(0, 4).map((c) => +c.alpha.toFixed(2)),
    surfaceY: sky.fx.surfaceY,
    weatherRef: !!sky.weatherRef,
  };
});
console.log('CLOUDS:', JSON.stringify(clouds));
await page.evaluate(() => {
  const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim() === '单人模式');
  el?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); el?.click();
});
await new Promise((r) => setTimeout(r, 1500));
// 现建一个角色(默认外观)再量
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.sw-vsel-footer .sw-vbtn')].find((x) => !x.textContent.includes('返回'));
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => {
  const b = document.querySelector('.sw-char-panel [data-act=create]');
  b?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); b?.click();
});
await new Promise((r) => setTimeout(r, 1500));
const out = await page.evaluate(() => {
  const item = document.querySelector('.sw-vitem');
  if (!item) return { err: 'no item' };
  const ir = item.getBoundingClientRect();
  const q = (sel) => {
    const e = item.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { sel, x: +(r.x - ir.x).toFixed(0), y: +(r.y - ir.y).toFixed(0), w: +r.width.toFixed(0), h: +r.height.toFixed(0), text: e.textContent.trim().slice(0, 12) };
  };
  return {
    item: { w: +ir.width.toFixed(0), h: +ir.height.toFixed(0) },
    parts: ['.sw-vitem-doll', '.sw-vitem-info', '.sw-vitem-info .name', '.sw-vitem-info .sub', '.sw-vitem-btns', '.sw-vitem-del'].map(q),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
