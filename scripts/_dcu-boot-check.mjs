import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto(ORIGIN, { waitUntil: 'networkidle2', timeout: 90000 });
await new Promise(r => setTimeout(r, 3000));
console.log(await page.evaluate(() => ({
  selects: [...document.querySelectorAll('select')].map(s => ({ id: s.id, opts: [...s.options].map(o => o.value).slice(0, 8) })),
  buttons: [...document.querySelectorAll('button')].map(b => ({ id: b.id, text: b.textContent.slice(0, 20) })),
})));
await browser.close();
