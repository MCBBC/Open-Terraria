import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('console', m => console.log('[pg]', m.type(), m.text().slice(0, 150)));
p.on('pageerror', e => console.log('[err]', String(e).slice(0, 200)));
await p.goto('http://localhost:5202/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 12; i++) {
  await new Promise(r => setTimeout(r, 5000));
  const s = await p.evaluate(() => ({
    hasG: !!window.__swGame, hasP: !!(window.__swGame && window.__swGame.player),
    body: document.body.innerText.slice(0, 80),
  }));
  console.log(i * 5 + 's', JSON.stringify(s));
  if (s.hasP) break;
}
await b.close();
