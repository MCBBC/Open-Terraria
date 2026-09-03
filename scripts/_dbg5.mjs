import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 400, height: 300 },
});
const p = await b.newPage();
await p.goto(process.env.SW_ORIGIN || 'http://localhost:5202/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise(r => setTimeout(r, 4000));
const out = await p.evaluate(async () => {
  const m = await import('/src/data/tiles.ts');
  const defs = m.TILE_DEFS;
  const ids = [1, 2, 25, 27, 59, 88, 89, 140, 595, 53];
  return ids.map(id => {
    const d = defs[id];
    if (!d) return { id, missing: true };
    return { id, name: d.name, solid: d.solid, platform: d.platform,
      sheet: d.vanilla?.sheet, vname: d.vanilla?.name };
  });
});
for (const d of out) console.log(JSON.stringify(d));
await b.close();
