// 一次性（IIIII232）：Game 音乐链 creditsRoll 接线实机验证——事件置位后步进两个
// 15t 选曲门,g_lastMusic 应即时切 89（isEventMusic 豁免滞回）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5288') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
for (let i = 0; i < 150; i++) {
  if (await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 2000));
}
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { creditsRoll } = await import('/src/world/CreditsRoll.ts');
  const before = { lastMusic: g.lastMusic ?? null, tick: g.tickCount };
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
  const mid = { lastMusic: g.lastMusic ?? null, tick: g.tickCount };
  creditsRoll.tryStarting(1000);
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
  const after = { lastMusic: g.lastMusic ?? null, tick: g.tickCount, ongoing: creditsRoll.isEventOngoing };
  return { before, mid, after };
});
console.log(JSON.stringify(out));
await browser.close();
