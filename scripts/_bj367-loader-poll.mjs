// ★BJ367 加载器隔离——直调 projSprite(404) 轮询缓存落地
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
page.on('console', (m) => console.log('CONSOLE', m.text().slice(0, 220)));
page.on('pageerror', (e) => console.log('PAGE_ERROR', String(e.message).slice(0, 220)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { } });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5203', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const s = document.querySelector('select'); s.selectedIndex = 0; s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const { projSprite, projSpriteHealth } = await import('/src/entities/Arrow.ts');
  const { SpriteAtlas } = await import('/src/assets/SpriteAtlas.ts');
  const poll = [];
  const first = projSprite(404);
  poll.push({ at: 0, first: first ? { w: first.width, ctor: first.constructor.name } : null });
  const t0 = Date.now();
  while (Date.now() - t0 < 4000) {
    await new Promise((r) => setTimeout(r, 500));
    const s = projSprite(404);
    poll.push({ at: Date.now() - t0, s: s ? { w: s.width, h: s.height, ctor: s.constructor.name } : null });
    if (s) break;
  }
  return { useBitmap: SpriteAtlas.USE_BITMAP, poll, health: projSpriteHealth([404]) };
});
console.log('POLL=' + JSON.stringify(out, null, 1));
await browser.close();
