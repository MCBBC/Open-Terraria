import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('console', m => { const t = m.text(); if (/error|Error|warn/i.test(t)) console.log('CONSOLE:', t.slice(0, 300)); });
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 400)));
try {
  await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5377') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const r = await page.evaluate(() => new Promise((res) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window.__swGame?.player) { clearInterval(iv); res('player OK at ' + Math.round((Date.now()-t0)/1000) + 's'); }
      else if (Date.now() - t0 > 90000) { clearInterval(iv); res('NO player; swGame=' + !!window.__swGame + ' keys=' + (window.__swGame ? Object.keys(window.__swGame).slice(0,8).join(',') : '-')); }
    }, 500);
  }));
  console.log(r);
} catch (e) { console.log('GOTO ERR:', String(e).slice(0, 200)); }
await browser.close();
