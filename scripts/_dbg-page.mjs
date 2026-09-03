import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const p = await b.newPage();
const logs = [];
p.on('console', m => logs.push(`[${m.type()}] ${m.text().slice(0,200)}`));
p.on('pageerror', e => logs.push(`[pageerror] ${String(e).slice(0,300)}`));
await p.goto('http://localhost:5202/?play=small', { waitUntil: 'domcontentloaded', timeout: 90000 });
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 1000));
  const st = await p.evaluate(() => ({
    game: !!window.__swGame, world: !!window.__swGame?.world,
    flow: !!window.__swFlow,
  })).catch(e => ({ err: String(e).slice(0,100) }));
  if (st.game) { console.log('game ready at', i, 's'); break; }
  if (i % 10 === 9) console.log(i, JSON.stringify(st));
}
console.log(logs.slice(-25).join('\n'));
await b.close();
