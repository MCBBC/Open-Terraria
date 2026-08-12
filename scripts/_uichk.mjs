import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 400)); });
page.on('pageerror', (e) => console.log('PAGE-ERR:', String(e).slice(0, 400)));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 5000));
await browser.close();
