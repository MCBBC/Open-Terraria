import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true, args: ['--no-sandbox'], defaultViewport: { width: 988, height: 862 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 500)));
page.on('console', m => { if (m.type() === 'error') console.log('CONERR:', m.text().slice(0, 400)); });
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 25000));
const state = await page.evaluate(() => ({
  menu: !!document.querySelector('.sw-title-menu'),
  splash: !!document.querySelector('#sw-splash'),
  bodyCls: document.body.className,
  root: document.querySelector('.sw-root')?.children.length ?? 0,
}));
console.log('state:', JSON.stringify(state));
await browser.close();
