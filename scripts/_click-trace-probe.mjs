// 录制点击→进世界的 DevTools trace 供 1509ms 任务归因
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = (process.env.SW_ORIGIN || 'http://localhost:5208');
const browser = await puppeteer.launch({ protocolTimeout: 400000, executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862, deviceScaleFactor: 2 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 150000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await page.mouse.click(8, 8);
for (let i = 0; i < 4 && !(await page.$('.sw-vsel')); i++) { await page.click('[data-act=sp]').catch(()=>{}); await page.waitForSelector('.sw-vsel',{timeout:8000}).catch(()=>{}); }
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]'); await page.waitForSelector('.sw-char-row input[type=text]');
  await page.click('.sw-char-row input[type=text]'); await page.keyboard.type('ctr');
  await page.click('[data-act=create]'); await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 15000 });
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 }).catch(()=>{});
await page.tracing.start({ path: '/tmp/click-trace.json', categories: ['devtools.timeline', 'v8.execute', 'disabled-by-default-devtools.timeline', 'disabled-by-default-v8.cpu_profiler'] });
if (await page.$('[data-f=seed]')) {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img').catch(()=>{});
} else {
  await page.click('.sw-vsel [data-act=new]').catch(()=>{});
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 }).catch(()=>{});
  await page.click('[data-f=seed]'); await page.keyboard.type('12345');
  await page.evaluate(() => [...document.querySelectorAll('[data-g=size] .sw-wc-opt')][0]?.click());
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame?.world?.store?.w, { timeout: 300000, polling: 1000 });
await new Promise(r => setTimeout(r, 1200));
await page.tracing.stop();
console.log('trace saved /tmp/click-trace.json', fs.statSync('/tmp/click-trace.json').size);
await browser.close();
