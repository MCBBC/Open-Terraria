import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('dialog', async (d) => { console.log('DIALOG:', d.message().slice(0, 150)); await d.dismiss(); });
await page.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise((r) => setTimeout(r, 500));
// 劫持 console.error 抓堆栈
await page.evaluate(() => {
  window.__captured = [];
  const oe = console.error.bind(console);
  console.error = (...a) => {
    for (const x of a) window.__captured.push(typeof x === 'string' ? x : (x?.stack ?? (() => { try { return JSON.stringify(x); } catch { return String(x); } })()));
    oe(...a);
  };
});
await page.click('[data-act=set]');
await page.waitForSelector('.sw-set-panel', { timeout: 5000 });
console.log('panel open');
await page.click('[data-cat=data]');
await new Promise((r) => setTimeout(r, 200));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.sw-set-content button')];
  const b = btns.find((x) => x.textContent.includes('wld'));
  b?.click();
});
await new Promise((r) => setTimeout(r, 300));
const input = await page.$('input[accept=".wld"]');
await input.uploadFile('/Users/vinlic/Downloads/Starter_World Master.wld');
await new Promise((r) => setTimeout(r, 25000));
const stacks = await page.evaluate(() => window.__captured ?? []);
for (const s of stacks) console.log('STACK:\n' + s.split('\n').slice(0, 12).join('\n'));
console.log('probe done');
await browser.close();
