import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const page = await browser.newPage();
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch {} });
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 120000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.renderer; }, { timeout: 300000, polling: 1500 });
await new Promise(r => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const slots = (g.player.inv.slots ?? []).slice(0, 10).map(s => s ? { id: s.id, stack: s.stack, keys: Object.keys(s).join(',') } : null);
  return { slots, selectedSlot: g.player.selectedSlot };
});
console.log('INV=' + JSON.stringify(out));
await browser.close();
