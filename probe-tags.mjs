import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(() => {
  const g = window.__swGame;
  return {
    player: g.formatDialogTags('嗨，{PlayerName}。有什么可以帮你？'),
    evil: g.formatDialogTags('想穿过那些{WorldEvilStone}，嗯？'),
    npc: g.formatDialogTags('把{ArmsDealer}的枪给我拿过来！'),
  };
});
console.log(JSON.stringify(out));
await b.close();
