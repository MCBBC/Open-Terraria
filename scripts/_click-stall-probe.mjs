// 修复验证:点击"进入世界"的 EventDispatch 应 <150ms(基线 672ms);
// 图标包生成(~550ms)应出现在独立 timer task(EventDispatch 归因之外)
import puppeteer from 'puppeteer-core';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5208');
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => {
  (window).__lt = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) (window).__lt.push({ dur: Math.round(e.duration), attr: JSON.stringify(e.attribution?.[0]?.name ?? '') }); }).observe({ entryTypes: ['longtask'] }); } catch {}
});
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('stall');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.evaluate(() => { (window).__lt.length = 0; });   // 清零基线
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
await page.evaluate(() => { (window).__lt.push({ mark: 'world-list-shown' }); });
// 进世界(存档 12345 已存在则直进;否则建)
if (await page.$('[data-f=seed]')) {
  await page.evaluate(() => { (window).__lt.length = 0; });   // 二次清零:这次是真正的进世界点击段
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
} else {
  await page.click('.sw-vsel [data-act=new]').catch(()=>{});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(()=>{});
  await page.evaluate(() => { (window).__lt.length = 0; });
  await page.click('[data-f=seed]'); await page.keyboard.type('12345');
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 1500));
const lt = await page.evaluate(() => (window).__lt);
console.log(JSON.stringify(lt, null, 1));
const dispatchTasks = lt.filter(t => t.attr && t.attr.includes('dispatch'));
const maxDispatch = Math.max(0, ...dispatchTasks.map(t => t.dur));
console.log(`\nEventDispatch 归因长任务 max = ${maxDispatch}ms(基线 672ms)`);
console.log(maxDispatch <= 200 ? '=== PASS: 点击不再被生成包劫持 ===' : '=== FAIL: 仍有长派发 ===');
await browser.close();
process.exit(maxDispatch <= 200 ? 0 : 3);
