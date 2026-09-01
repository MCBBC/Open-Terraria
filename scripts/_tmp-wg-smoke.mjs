import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 120)));
await p.goto('http://localhost:5209/?nosw', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => typeof window.__swFlow === 'object', { timeout: 180000 });
for (const seed of ['', '1', 'chain2026']) {
  try {
    await p.evaluate((s) => window.__swFlow.newWorld(s, 4200, 1200), seed);
    await p.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
    console.log('seed', JSON.stringify(seed), 'OK');
    await p.evaluate(() => window.__swFlow.quitToMenu());
    await sleep(2000);
  } catch (e) { console.log('seed', JSON.stringify(seed), 'CRASH:', String(e).slice(0, 140)); }
  await sleep(1500);
}
await b.close();
