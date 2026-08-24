import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5213';
const browser = await puppeteer.launch({ protocolTimeout: 500000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'warn' || m.type() === 'error') logs.push(m.type() + ':' + m.text().slice(0, 100)); });
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise(r => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('晕门');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise(r => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await page.evaluate(() => { const o = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')]; o[0]?.click(); });
  await new Promise(r => setTimeout(r, 300));
  await page.click('[data-act=create]');
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: `/tmp/wc-${i}.png` });
    const g = await page.evaluate(() => !!window.__swGame?.world?.store?.w);
    if (g) break;
  }
}
console.log('console:', logs.slice(0, 6));
await browser.close();
