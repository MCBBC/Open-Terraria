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
  const rows = [];
  for (let y = 448; y <= 466; y++) {
    let line = '';
    for (let x = 214; x <= 250; x++) {
      const i = st.idx(x, y);
      const lt = st.liquidType[i];
      const lv = st.liquid[i];
      if (lv === 0) { line += (st.type[i] !== 0 ? '#' : '.'); continue; }
      line += lv === 4 ? 'S' : lv === 1 ? 'w' : lv === 2 ? 'l' : 'h';
      void lt;
    }
    rows.push(String(y).padStart(3) + '|' + line);
  }
  // 玩家传送到湖边触发渲染
  g.player.x = 230 * 16; g.player.y = 440 * 16;
  for (let i = 0; i < 30; i++) { g.player.vx = 0; g.player.vy = 0; g.fixedUpdate(1 / 60); }
  return { rows, gl: g.world.groundLevel, liquidAt: st.liquid[st.idx(230, 460)], type: st.liquidType[st.idx(230, 460)] };
});
console.log('微光湖地图（S=微光 w=水 #=固体 .=空）:');
for (const r of res.rows) console.log(r);
console.log('groundLevel:', res.gl, ' (230,460) 液量:', res.liquidAt, ' 类型:', res.type);
console.log('JS错误:', errs.length ? errs.join(' | ') : '无');
await browser.close();
