// 极光离屏渲染诊断：满月模式（moonPhase=0, bands=3, full）→ 截图形态
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
  const g = window.__swGame;
  const { AuroraSky } = await import('/src/render/AuroraSky.ts');
  const aur = new AuroraSky();
  aur.setActive(true);
  // 满月模式，夜晚中段（nightTicks 大 = 完全淡入）
  const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 500;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, 1280, 500);
  // 模拟 60 帧 draw（globalTime 用 performance.now——波形随真实时间）
  let diag = {};
  const aurMod = await import('/src/render/AuroraSky.ts');
  for (let f = 0; f < 300; f++) {
    ctx.fillStyle = '#0a0a1a'; ctx.fillRect(0, 0, 1280, 500);
    aur.draw(ctx, 1280, 500, {
      nightTicks: 9000, isDay: false, moonPhase: 0,
      camTopTiles: -5, surfaceTiles: 20,
      moonFrac: { x: 0.3, y: 0.15 }, dtSec: 1 / 60,
      globalTime: 1000 + f,
    });
    if (f % 30 === 29) await new Promise(r => setTimeout(r, 50));   // 让 Image load 事件得以派发
    if (f === 299) diag = { opacity: aur._opacity, active: aur._isActive, noiseReady: aurMod.auroraNoiseReady() };
  }
  return { diag, shot: cv.toDataURL('image/png').split(',', 2)[1] };
});
const fs = await import('fs');
fs.writeFileSync('/tmp/aurora_iso.png', Buffer.from(out.shot, 'base64'));
console.log(JSON.stringify({ diag: out.diag }));
await browser.close();
