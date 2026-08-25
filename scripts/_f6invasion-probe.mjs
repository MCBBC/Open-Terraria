// F6 召唤面板入侵触发探针:低血点哥布林 → toast 文案不再误提史莱姆王 + 面板失败
// 文案不再虚构「Boss 在场」;满血 → 入侵正常开启。
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
  await page.keyboard.type('入侵门');
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

// 1) 低血:触发哥布林 → 返回失败文案(无「Boss 在场」)+ toast 无「史莱姆王」
const low = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.statLifeMax = 100; g.player.maxHp = 100;
  g.player.hp = 100;
  const toasts = [];
  const orig = g.cb.onToast;
  g.cb.onToast = (m) => { toasts.push(m); };
  const err = g.debugTriggerEvent('goblin');
  g.cb.onToast = orig;
  return { err, toasts, hp: g.player.maxHp };
});
check('低血触发失败文案无「Boss 在场」', low.err && !low.err.includes('Boss'), low.err);
check('toast 不再误提史莱姆王', low.toasts.length === 1 && !low.toasts[0].includes('史莱姆王'), JSON.stringify(low.toasts));
check('toast 提及 200 生命上限', low.toasts[0]?.includes('200'), low.toasts[0]);

// 2) 满血:入侵正常开启
const high = await page.evaluate(() => {
  const g = window.__swGame;
  g.player.baseMaxHp = 400; g.player.statLifeMax = 400; g.player.hp = 400;
  const err = g.debugTriggerEvent('goblin');
  return { err, type: g.world.invasionType };
});
check('满血入侵正常开启', high.err === null && high.type !== 0, JSON.stringify(high));

// 3) 已有入侵时再触发 → 「已有入侵或入侵冷却中」
const again = await page.evaluate(() => {
  const g = window.__swGame;
  const toasts = [];
  const orig = g.cb.onToast;
  g.cb.onToast = (m) => { toasts.push(m); };
  const err = g.debugTriggerEvent('goblin');
  g.cb.onToast = orig;
  return { err, toasts };
});
check('重复触发提示已有入侵(toast 不再误报 Boss)', again.err?.includes('已有入侵') && again.toasts.some((t) => t.includes('入侵')), JSON.stringify(again));

check('无页面错误', errors.length === 0, errors.join('|').slice(0, 160));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
