import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:'new', args:['--no-sandbox']});
const page = await browser.newPage();
page.on('console', m => console.log('CON:', m.type(), m.text().slice(0,200)));
page.on('pageerror', e => console.log('ERR:', String(e).slice(0,300)));
await page.goto('http://localhost:5199', {waitUntil:'networkidle0'});
await new Promise(r => setTimeout(r, 3000));
console.log('url:', page.url());
try {
  const t = await page.evaluate(() => document.title);
  console.log('title:', t);
} catch (e) { console.log('eval fail:', String(e).slice(0,150)); }
await browser.close();
