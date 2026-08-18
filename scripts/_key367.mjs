import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://localhost:5201/?play=small', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 110000 });
const r = await p.evaluate(() => {
  const all = Object.keys(window.__swItems).filter(k => k.startsWith('vi_367'));
  const first = Object.keys(window.__swItems).find(k => /^vi_367_/.test(k));
  return { all, firstMatch: first, firstId: first ? window.__swItems[first] : null,
    pwn: window.__swItems['vi_367_pwnhammer'] };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
