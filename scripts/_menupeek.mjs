import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 2000));
const info = await page.evaluate(() => {
  const pick = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => ({
    tag: e.tagName, type: e.type || '', id: e.id || '', cls: (e.className + '').slice(0, 40), name: e.name || '',
  }));
  return { url: location.href, inputs: pick('input'), selects: pick('select'), buttons: pick('button').slice(0, 10) };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
