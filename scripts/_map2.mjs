// 反色修复+卷轴冒烟
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('地图2');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 3000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const r = g.renderer;
  const lut = r.minimap._mapLUT;
  const abgr = (v) => [(v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  // LUT 存储形（bits16=B）→ 取显示 RGB 需 [bits0, bits8, bits16]
  const dispRgb = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];
  // 校验：泥土(内部 id=TILE_BY_KEY.dirt) 应显示 (151,107,75) 而非 (75,107,151)
  return {
    water: dispRgb(lut.liq[1]),
    lava: dispRgb(lut.liq[2]),
    honey: dispRgb(lut.liq[3]),
    wall1: dispRgb(lut.walls[1]),
    dirtBg: dispRgb(lut.dirtBg),
    bgIdx: r.fullMapBgIndex(g.world),
  };
});
console.log('MAP2', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
