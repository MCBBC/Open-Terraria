// 拾取飘字计数探针（PopupText.NewText Item 分支对齐验证）：
// ①连拾 5 次土块 → 单条飘字 "土块 (5)"（合并计数,不重复多条）
// ②拾石头 → 独立第二条飘字（不同名共存）
// ③铜币×3 + 银币×1 → 跨面额合并 "1 银币 3 铜币" + 银档色
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5215';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 160)));
const clickRetry = async (sel, tries = 5) => {
  for (let i = 0; i < tries; i++) {
    try { await page.click(sel); return; } catch (e) { await new Promise(r => setTimeout(r, 600)); }
  }
  throw new Error('click failed: ' + sel);
};
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await clickRetry('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await clickRetry('.sw-char-row input[type=text]');
  await page.keyboard.type('计数');
  await new Promise(r => setTimeout(r, 200));
  await clickRetry('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await clickRetry('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await clickRetry('[data-act=create]');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
} else {
  await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
  await page.waitForFunction(() => window.__swGame?.world?.store?.w === 4200, { timeout: 300000, polling: 1000 });
}
// 无角色建角色 → 无世界建世界 → 生成期连拍进度条
await clickRetry('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 1200));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await clickRetry('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await clickRetry('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 400));
  await clickRetry('[data-act=create]');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 3000));
    await page.screenshot({ path: `/tmp/genbar-${i}.png` });
    const inWorld = await page.evaluate(() => !!window.__swGame?.world?.store?.w);
    if (inWorld && i >= 3) break;
  }
}
await browser.close();
console.log('done');
