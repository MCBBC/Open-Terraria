import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push('[pageerror] ' + String(e.stack || e.message).slice(0, 300)));
page.on('console', m => { const t = m.text(); if (/error|失败|异常|WorldGen/i.test(t)) errs.push('[console] ' + t.slice(0, 200)); });
await page.goto('http://localhost:5210', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('bz');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 }).catch(()=>{});
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 60000, polling: 500 }).catch(()=>{});
const st = await page.evaluate(() => ({
  hasGame: !!window.__swGame,
  worldW: window.__swGame?.world?.store?.w ?? null,
}));
console.log(JSON.stringify(st));
for (const e of errs) console.log(e);
await browser.close();
