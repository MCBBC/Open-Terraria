import puppeteer from 'puppeteer-core';
console.error('launching...');
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  defaultViewport: { width: 800, height: 600 },
  timeout: 45000,
});
console.error('launched ok');
const page = await browser.newPage();
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
console.error('goto ok, title =', await page.title());
await browser.close();
console.error('done');
