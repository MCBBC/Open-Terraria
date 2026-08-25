// 太阳花法杖(6152→弹 1114)照明回归:夜晚发射 → 弹体 lightRGB = 暖橙
// (scale1.2×0.5×[0.6,0.45,0.2] = [0.36,0.27,0.12])+ 缩径消亡 + 夜景截图。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?dev=1';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.keyboard.type('照明');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w > 0, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };

// 拨到夜晚 + 持太阳花法杖 + 朝右侧发射
const setup = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  g.world.clock.timeOfDay = 0.8;   // 夜
  g.world.clock.isDay = false;
  p.inv.slots[0] = { id: window.__swItems['vi_6152_daybloom_staff'] ?? window.__swItems['vi_6152_DaybloomStaff'], stack: 1 };
  p.inv.selected = 0;
  p.statManaCurrent2 = p.statManaMax2 = 200;
  return { held: p.inv.heldItem()?.id, key: Object.keys(window.__swItems).find((k) => k.includes('6152')) };
});
console.log('  setup:', JSON.stringify(setup));
await page.mouse.move(900, 380);
await page.mouse.down();
await new Promise((r) => setTimeout(r, 120));
await page.mouse.up();
await new Promise((r) => setTimeout(r, 400));
const shot = await page.evaluate(() => {
  const g = window.__swGame;
  const pr = g.entities.projectiles.find((e) => !e.dead && e.projId === 1114);
  if (!pr) return { found: false };
  return { found: true, rgb: pr.lightRGB, scale: pr.drawScale, age: pr.age };
});
check('1114 弹在场', shot.found, JSON.stringify(shot));
check('lightRGB 暖橙(≈[0.36,0.27,0.12])', shot.found && shot.rgb
  && Math.abs(shot.rgb[0] - 0.36) < 0.02 && Math.abs(shot.rgb[1] - 0.27) < 0.02 && Math.abs(shot.rgb[2] - 0.12) < 0.02,
  JSON.stringify(shot.rgb));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/daybloom-glow.png' });
// 缩径消亡:2.5s 后(130t+衰减)弹应消亡
await new Promise((r) => setTimeout(r, 2600));
const gone = await page.evaluate(() => {
  const g = window.__swGame;
  return { alive: g.entities.projectiles.some((e) => !e.dead && e.projId === 1114) };
});
check('缩径消亡(~148t 后弹亡)', !gone.alive, JSON.stringify(gone));
check('无页面错误', errors.filter((e) => !e.includes('img load fail')).length === 0, errors.join('|').slice(0, 160));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
