// 一次性探针:月总 30% 白斜坡夜间验收(scripts/_mlfloor-probe.mjs)
// 夜战召唤月总 → 截图 + 量测部件区亮度(应 ≥30% 底亮,不再近乎全黑)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1512, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('斜坡验收');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const worldItem = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (worldItem) {
  await page.click('.sw-list-panel .sw-item');
} else {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 240000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  g.world.clock.timeOfDay = 0.95;   // 深夜
  g.toggleDebugGod();
  const spawned = g.summonBoss('moon_lord', { onPlayer: true });
  for (let i = 0; i < 12; i++) { await wait(1000); g.world.clock.timeOfDay = 0.95; }
  const parts = g.entities.enemies.filter(e => [396, 397, 398].includes(e.vanillaId)).map(e => ({
    vid: e.vanillaId, cx: Math.round(e.cx), cy: Math.round(e.cy), dead: e.dead,
  }));
  return { spawned, isDay: g.world.clock.isDay, cam: { x: g.camera.x, y: g.camera.y, zoom: g.camera.zoom }, parts };
});
console.log(JSON.stringify(out));
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/ml_night_floor.png', type: 'png' });
console.log('errs:', JSON.stringify(errs.slice(0, 5)));
await browser.close();
