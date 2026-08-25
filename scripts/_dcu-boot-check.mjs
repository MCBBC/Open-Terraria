import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 4000));
await page.click('[data-act=sp]');
await new Promise(r => setTimeout(r, 2500));
console.log(await page.evaluate(() => ({
  listPanel: !!document.querySelector('.sw-list-panel'),
  items: document.querySelectorAll('.sw-item').length,
  allDivs: [...document.querySelectorAll('div')].map(d => d.className).filter(c => c).slice(0, 40),
  roots: [...document.body.children].map(d => d.className || d.tagName),
})));
await browser.close();
