// 一次性:日落盘在屏内的时刻(t=46000/47400/48800)截图+光斑链状态——问题②观感取证
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const T of [46000, 47400, 48800]) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
  const p = await b.newPage();
  await p.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world; }, { timeout: 150000 });
  await p.evaluate((t) => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.1875 + (t / 54000) * 0.625;
    const pl = g.player;
    pl.x = g.world.store.w * 16 / 2;
    pl.vx = 0;
  }, T);
  // 等到恰好目标时刻再截(时钟在走,回设后立刻截,漂移最小化)
  await sleep(1200);
  await p.evaluate((t) => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.1875 + (t / 54000) * 0.625;
  }, T);
  const st = await p.evaluate(() => {
    const s = window.__swGame.renderer.sky;
    const v = s.horizonVisCache;
    return {
      sun: s.sunScreen,
      vis: v ? { sunset: +v.sunset.toFixed(3), sunrise: +v.sunrise.toFixed(3), celestial: +v.celestial.toFixed(3) } : null,
      occ: +s.sunVisibility.toFixed(3),
      sampled: s.sunVisSampled
    };
  });
  await p.screenshot({ path: `${OUT}/sunset-${T}.png` });
  console.log(`T=${T}:`, JSON.stringify(st));
  await b.close();
}
console.log('DONE');
