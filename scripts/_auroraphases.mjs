// 逐月相极光渲染：moonPhase 0/1/2/4/5/7 各截一帧 → 找出图5条纹对应的模式
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5203') + '/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 220000 });
await new Promise(r => setTimeout(r, 1500));
const out = await page.evaluate(async () => {
  const { AuroraSky } = await import('/src/render/AuroraSky.ts');
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 200;
  const ctx = cv.getContext('2d');
  const phases = [0, 1, 2, 4, 5, 7];
  const shots = [];
  for (const ph of phases) {
    const aur = new AuroraSky();
    aur.setActive(true);
    for (let f = 0; f < 120; f++) {
      ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, 640, 200);
      aur.draw(ctx, 640, 200, {
        nightTicks: 9000, isDay: false, moonPhase: ph,
        camTopTiles: -5, surfaceTiles: 20,
        moonFrac: { x: 0.3, y: 0.15 }, dtSec: 1 / 60,
        globalTime: 1000 + f,
      });
      if (f % 30 === 29) await new Promise(r => setTimeout(r, 30));
    }
    shots.push({ ph, data: cv.toDataURL('image/png').split(',', 2)[1] });
  }
  return { shots };
});
const fs = await import('fs');
for (const s of out.shots) fs.writeFileSync(`/tmp/aur_ph${s.ph}.png`, Buffer.from(s.data, 'base64'));
console.log('saved', out.shots.map(s => s.ph).join(','));
await browser.close();
