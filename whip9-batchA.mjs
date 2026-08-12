import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const r = {};
  r.sentries0 = pl.maxSentries;
  pl.buffs.apply(27, 10);
  r.sentriesWarTable = pl.maxSentries;
  pl.buffs.remove(27);
  r.archerySpeed = pl.buffs.arrowSpeedMult;
  pl.buffs.apply(17, 10);
  r.archerySpeedBuffed = Math.round(pl.buffs.arrowSpeedMult * 100) / 100;
  pl.buffs.remove(17);
  pl.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1321]], stack: 1 };
  r.quiverEquipped = pl.equipStats.quiver;
  pl.inv.armor[3] = null;
  r.quiverUnequipped = pl.equipStats.quiver;
  return r;
});
console.log(JSON.stringify(out));
const ok = out.sentries0 === 1 && out.sentriesWarTable === 2
  && out.archerySpeed === 1 && Math.abs(out.archerySpeedBuffed - 1.2) < 0.01
  && out.quiverEquipped === true && out.quiverUnequipped === false;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
