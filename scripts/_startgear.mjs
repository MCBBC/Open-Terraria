import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
await p.goto('http://localhost:5201/?play=small', { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => window.__swGame && window.__swGame.player, { timeout: 110000 });
await new Promise(r => setTimeout(r, 1000));
const r = await p.evaluate(() => {
  const pl = window.__swGame.player;
  const names = (arr) => arr.map(s => s ? (window.__swItems ? Object.entries(window.__swItems).find(([, id]) => id === s.id)?.[0] ?? s.id : s.id) : null);
  return { armor: names(pl.inv.armor), hotbar: names(pl.inv.slots.slice(0, 10)), dye: names(pl.inv.dye ?? []) };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
