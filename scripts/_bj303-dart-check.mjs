import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForSelector('[data-act=sp]', { timeout: 120000 });
await page.click('[data-act=sp]');
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { void window.__swFlow.newWorld('0522', 4200, 1200); });
for (let i = 0; i < 400; i++) {
  const ok = await page.evaluate(() => !!(window.__swGame?.player && window.__swGame?.world));
  if (ok) break;
  await new Promise((r) => setTimeout(r, 300));
}
const verdict = await page.evaluate(() => {
  const g = window.__swGame;
  const out = {};
  try { g.spawnBurst(100, 100, '#fff', 2, 3, 0, 1); out.boundCall = 'ok'; } catch (e) { out.boundCall = String(e); }
  const burst = g.spawnBurst;
  try { burst(100, 100, '#fff', 2, 3, 0, 1); out.detachedCall = 'no-throw'; }
  catch (e) { out.detachedCall = String(e); out.detachedStack = String(e.stack ?? '').split('\n').slice(0, 5).join('\n'); }
  return out;
});
console.log(JSON.stringify(verdict, null, 2));
await browser.close();
