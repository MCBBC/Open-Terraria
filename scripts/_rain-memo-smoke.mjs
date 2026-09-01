// 雨天 memo 冒烟（PR#2 雨条烘焙去重）：进世界 → 强制雨 → rAF 分布 + 错误/警告捕获。
// 启动段移植自 _ctx-storm-probe 的已验证序列(音频门(8,8)/splash 退场判定/字符面命名)。
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await puppeteer.launch({
  protocolTimeout: 500000,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'],
  defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 140)));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 140)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) {
  await page.click('[data-act=sp]').catch(() => {});
  await page.waitForSelector('.sw-vsel', { timeout: 8000 }).catch(() => {});
}
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await sleep(500);
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await sleep(400);
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('雨探针');
  await sleep(200);
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
  await sleep(600);
}
// 选第一个角色进世界列表
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 12000 }).catch(() => {});
await sleep(400);
if (!(await page.$('.sw-vsel-list .sw-vitem'))) {
  // 无世界→新建小世界
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=name]', { timeout: 10000 });
  await sleep(300);
  await page.click('[data-f=name]');
  await page.keyboard.type('RainLab');
  await sleep(120);
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await sleep(80);
  await page.click('[data-act=create]');
} else {
  const names = await page.evaluate(() => [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].map(e => e.textContent.slice(0, 20)));
  console.log('worlds:', JSON.stringify(names));
  const idx = await page.evaluate(() => Math.max(0, [...document.querySelectorAll('.sw-vsel-list .sw-vitem')].findIndex(e => /DuckLab/.test(e.textContent))));
  await page.evaluate((i) => document.querySelectorAll('.sw-vsel-list .sw-vitem')[i]?.click(), idx);
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await sleep(2500);

// 强制下雨（Weather 面 + cloudAlpha + 风）
const forced = await page.evaluate(() => {
  const g = window.__swGame;
  const w = g.world.weather;
  w.raining = true; w.rainTime = 99999999;
  if ('cloudAlpha' in w) w.cloudAlpha = 1;
  if ('windSpeedTarget' in w) w.windSpeedTarget = 0.4;
  if ('windSpeed' in w) w.windSpeed = 0.4;
  return { raining: w.raining, rainTime: w.rainTime };
});
console.log('weather-forced:', JSON.stringify(forced));
await sleep(1500);

const stats = await page.evaluate(async () => await new Promise(res => {
  const ds = []; let n = 0; let last = performance.now();
  function tick(t) {
    ds.push(t - last); last = t;
    if (++n >= 600) { res(ds); return; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}));
stats.sort((a, b) => a - b);
console.log(`rAF n=${stats.length} p50=${stats[300].toFixed(1)}ms p90=${stats[540].toFixed(1)}ms p99=${stats[594].toFixed(1)}ms max=${stats[595].toFixed(1)}ms`);

const poolInfo = await page.evaluate(() => {
  const g = window.__swGame;
  const wr = g.renderer ?? g.render;
  const fx = wr?.weatherFx ?? wr?.weather ?? null;
  if (!fx || !fx.pool) return 'no-pool';
  return { poolLen: fx.pool.length, active: fx.pool.filter(d => d.active).length };
});
console.log('pool:', JSON.stringify(poolInfo));
console.log('errs:', errs.length ? JSON.stringify(errs.slice(0, 4)) : 'none');
await browser.close();
