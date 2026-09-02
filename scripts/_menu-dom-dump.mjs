import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 1000));
const html = await page.evaluate(() => {
  const root = document.querySelector('#game-root') ?? document.body;
  const walk = (e, d) => {
    if (d > 4) return '';
    let s = '  '.repeat(d) + '<' + e.tagName.toLowerCase() + (e.className ? ' class="' + String(e.className).slice(0, 80) + '"' : '') + (e.id ? ' id=' + e.id : '') + '>\n';
    if (e.children.length === 0) { const t = (e.textContent || '').trim(); if (t) s += '  '.repeat(d + 1) + t.slice(0, 50) + '\n'; }
    for (const c of e.children) s += walk(c, d + 1);
    return s;
  };
  return walk(root, 0).slice(0, 5000);
});
console.log(html);
await browser.close();
