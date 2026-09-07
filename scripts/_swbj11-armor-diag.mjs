import puppeteer from 'puppeteer-core';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-first-run'], defaultViewport: { width: 1280, height: 900 } });
const p = await b.newPage();
await p.goto('http://localhost:5210/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 180000 });
await sleep(1500);
const out = await p.evaluate(() => {
  const pl = window.__swGame.player;
  const inv = pl.inv;
  const before = inv.armor.slice(0, 3).map((x) => x?.id ?? null);
  inv.armor[0] = { id: 1386, stack: 1 };
  const after0 = inv.armor[0]?.id;
  const disp = inv.displayArmor();
  return { before, after0, disp, armorLen: inv.armor.length, invCtor: inv.constructor.name,
    isProxy: typeof Proxy !== 'undefined' && JSON.stringify(inv.armor).length < 0 };
});
console.log(JSON.stringify(out));
await sleep(1200);
const out2 = await p.evaluate(() => {
  const inv = window.__swGame.player.inv;
  return { later0: inv.armor[0]?.id ?? null, slots0: inv.slots?.[0]?.id ?? null };
});
console.log(JSON.stringify(out2));
await b.close();
