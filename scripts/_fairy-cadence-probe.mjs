// 仙灵帧速终验:直接量 animT 速率(采样窗 4s=240t → ΔanimT≈240,帧号应前进 60 次)
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('pageerror:', e.message));
await page.goto(`${ORIGIN}/?play=small&beh=${Date.now()}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 90 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
await new Promise((r) => setTimeout(r, 1200));
const r = await page.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { vanillaFrameIdx } = await import('/src/render/Renderer.ts');
  g.entities.enemies.length = 0;
  const f = Enemy.fromVanilla(583, g.player.cx, g.player.cy - 80);
  f.id = g.entities.nextId++;
  g.entities.enemies.push(f);
  await new Promise((r2) => setTimeout(r2, 300));
  const a1 = f.animT, i1 = vanillaFrameIdx(f, 4);
  await new Promise((r2) => setTimeout(r2, 4000));
  const a2 = f.animT, i2 = vanillaFrameIdx(f, 4);
  return { dAnimT: a2 - a1, dFrame: (i2 - i1 + 240) % 4, expectedAdvance: Math.floor((a2 - a1) / 4) % 4 };
});
console.log('帧速终验:', JSON.stringify(r), '→', r.dFrame === r.expectedAdvance ? 'PASS(4t/帧)' : 'FAIL');
await browser.close();
