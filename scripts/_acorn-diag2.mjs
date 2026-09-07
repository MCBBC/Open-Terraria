import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5206') + '/?play=small', { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 110; i++) { await new Promise(r => setTimeout(r, 5000)); if (await page.evaluate(() => !!(window.__swGame && window.__swGame.player))) break; }
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
const out = await page.evaluate(async () => {
  const items = await import('/src/data/items.ts');
  const keys = Object.keys(items).filter(k => /item|def/i.test(k));
  const DEFS = items.ITEM_DEFS;
  if (!DEFS) return { keys, err: 'no ITEM_DEFS export' };
  const hits = [];
  for (let i = 0; i < DEFS.length; i++) {
    const d = DEFS[i]; if (!d) continue;
    const k = String(d.key ?? '');
    if (k.includes('5629') || /acorn/i.test(k)) hits.push(`${i}:${k}:vid=${d.vid}:ammoId=${d.ammoId}`);
  }
  return { keys: keys.slice(0, 8), n: DEFS.length, hits };
});
console.log('DIAG2=' + JSON.stringify(out));
await browser.close();
