import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('console', m => { if (m.text().includes('GLAurora') || includes('AuroraGL')) console.log('[CC]', m.text()); });
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 220000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const { AuroraSky } = await import('/src/render/AuroraSky.ts');
  const aur = new AuroraSky();
  aur.setActive(true);
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 500;
  const ctx = cv.getContext('2d');
  for (let f = 0; f < 60; f++) {
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, 1280, 500);
    aur.draw(ctx, 1280, 500, {
      nightTicks: 9000, isDay: false, moonPhase: 0,
      camTopTiles: -5, surfaceTiles: 20,
      moonFrac: { x: 0.25, y: 0.05 }, dtSec: 1 / 60, globalTime: 500 + f,
    });
    if (f % 20 === 19) await new Promise(r => setTimeout(r, 50));
  }
  return { shot: cv.toDataURL('image/png').split(',', 2)[1] };
});
const fs = await import('fs');
fs.writeFileSync('/tmp/aur_final.png', Buffer.from(out.shot, 'base64'));
console.log('saved');
await browser.close();
