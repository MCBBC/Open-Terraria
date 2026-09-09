import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
const p = await b.newPage();
await p.goto(`http://localhost:5289/?play=small&ec=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
const k1 = await p.evaluate(() => {
  const h = window.__swEmotes;
  return JSON.stringify({ keys: h ? Object.keys(h) : null, count: h?.count?.() });
});
await new Promise((r) => setTimeout(r, 4000));
const k2 = await p.evaluate(() => {
  const h = window.__swEmotes;
  return JSON.stringify({ keys: h ? Object.keys(h) : null, count: h?.count?.() });
});
console.log('early:', k1);
console.log('late :', k2);
await b.close();
