// 一次性:月亮命中区地图(2026-08-27 用户报"不灵敏/有时要点月亮上方才有效")——
//  夜间固定月亮,以 moonScreen 为中心 9 宫格扫描:elementFromPoint(谁在吃点击)
//  + 真实鼠标按下验闩,输出有效命中区相对可见月亮的偏移。另测两处动态 suspect:
//  ①拖拽残留 modY(先拖太阳再抓月)②点击瞬间月亮水平瞬移幅度。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 60000 });
await page.waitForFunction(() => !document.getElementById('sw-splash'), { timeout: 60000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 600));

await page.evaluate(() => { window.__swMenuBg.setClockT(0.05); });   // 子夜,月亮屏顶中央
await new Promise((r) => setTimeout(r, 400));

const grid = await page.evaluate(() => {
  const bg = window.__swMenuBg;
  const m = bg.sky.moonScreen;
  const el = document.querySelector('.sw-title-celestial');
  const dr = el.getBoundingClientRect();
  const step = 16;
  const pts = [];
  for (let dy = -48; dy <= 48; dy += step) {
    for (let dx = -48; dx <= 48; dx += step) {
      const x = m.x + dx, y = m.y + dy;
      const hit = document.elementFromPoint(x, y);
      pts.push({ dx, dy, top: hit === el ? 'cel' : (hit?.className || hit?.tagName) });
    }
  }
  return { moon: { x: +m.x.toFixed(1), y: +m.y.toFixed(1), r: +m.r.toFixed(1) },
    domRect: { x: dr.x, y: dr.y, w: dr.width, h: dr.height }, modY: null, pts };
});
// 真实按下网格点验闩
const latch = [];
for (const p of grid.pts) {
  const x = grid.moon.x + p.dx, y = grid.moon.y + p.dy;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 40));
  const ok = await page.evaluate(() => document.querySelector('.sw-title-celestial').classList.contains('grabbing'));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 40));
  latch.push({ dx: p.dx, dy: p.dy, ok, top: p.top });
}
// 视图矩阵:行=dy(-48..48),列=dx(-48..48)
const rows = {};
for (const l of latch) {
  rows[l.dy] = rows[l.dy] || {};
  rows[l.dy][l.dx] = (l.ok ? '█' : '·') + (l.top === 'cel' ? '' : '!');
}
console.log(JSON.stringify({ moon: grid.moon, domRect: grid.domRect, map: rows }, null, 1));
await browser.close();
