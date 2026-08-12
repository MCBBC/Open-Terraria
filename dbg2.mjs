import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('PAGEERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(() => {
  const g = window.__swGame;
  return {
    hasEntities: !!g.entities,
    keys: Object.keys(g).filter((k) => k.toLowerCase().includes('ent') || k.toLowerCase().includes('mgr')).slice(0, 10),
    projArr: Array.isArray(g.entities?.projectiles),
    nextId: g.entities?.nextId,
  };
});
console.log(JSON.stringify(out));
await b.close();
