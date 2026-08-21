// 活体检探：种子 12345 世界微光湖（tile 217-246, y449-464）每格 fx/fy/isSurface/srcY
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 120)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('微光查');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 400));
  await page.click('.sw-wc-panel input[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    (opts.find((o) => o.textContent.includes('小')) ?? opts[0]).click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 2500));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 液体类型：本仓 liquidType 4=微光。找湖：x217-246, y449-464 的 liquid
  // 白斑区 (292,428) 附近墙/tile 取证
  const cells = [];
  for (let y = 420; y <= 436; y++) for (let x = 284; x <= 300; x++) {
    const i = st.idx(x, y);
    if (st.wall[i] !== 0 || st.type[i] !== 0) {
      cells.push({ x, y, wall: st.wall[i], type: st.type[i], fx: st.frameX[i], fy: st.frameY[i] });
    }
  }
  const walls = new Map();
  for (const c of cells) walls.set('wall' + c.wall, (walls.get('wall' + c.wall) ?? 0) + 1);
  const types = new Map();
  for (const c of cells) types.set('type' + c.type, (types.get('type' + c.type) ?? 0) + 1);
  return { cells: cells.slice(0, 40), walls: [...walls.entries()], types: [...types.entries()] };
});
console.log('白斑区墙分布:', JSON.stringify(res.walls));
console.log('白斑区 tile 分布:', JSON.stringify(res.types));
for (const c of (res.cells ?? []).slice(0, 20)) console.log('  (' + c.x + ',' + c.y + ') wall=' + c.wall + ' type=' + c.type + ' f=' + c.fx + ',' + c.fy);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
