import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], protocolTimeout: 120000 });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 200)));
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log('CON:', m.type(), m.text().slice(0, 200)); });
await p.goto(`http://localhost:5289/?play=small&lc=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 90; i++) {
  const s = await p.evaluate(() => {
    const g = window.__swGame;
    return g ? (g.world && g.world.store ? 'INGAME' : 'game-no-world') : 'no-game';
  }).catch((e) => 'eval-err:' + String(e).slice(0, 120));
  if (s === 'INGAME') { console.log('LOADED at', i * 2, 's'); break; }
  if (i % 5 === 0) console.log(i * 2, 's:', s);
  await new Promise((r) => setTimeout(r, 2000));
}
await b.close();
