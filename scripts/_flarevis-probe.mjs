// 一次性:光斑链可见性取证——关背包,日落 t=49200(强度≈0.9)+日出 t=5200/6500,
// 另存太阳区/屏心鬼影区两张放大裁片
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = '/tmp/mooncloud-probe';
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [tag, T] of [['sunset', 49200], ['dawn', 5200], ['dawn2', 6500]]) {
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
  await sleep(600);
  await p.keyboard.press('Escape');   // 关背包(欢迎提示后背包开着,挡日落盘)
  await sleep(400);
  await p.evaluate((t) => {
    const g = window.__swGame;
    g.world.clock.timeOfDay = 0.1875 + (t / 54000) * 0.625;
  }, T);
  await sleep(120);
  const st = await p.evaluate(() => {
    const s = window.__swGame.renderer.sky;
    const v = s.horizonVisCache;
    return {
      sun: s.sunScreen ? { x: Math.round(s.sunScreen.x), y: Math.round(s.sunScreen.y) } : null,
      sunset: v ? +v.sunset.toFixed(3) : null,
      sunrise: v ? +v.sunrise.toFixed(3) : null,
      occ: +s.sunVisibility.toFixed(3)
    };
  });
  await p.screenshot({ path: `${OUT}/flare-${tag}-${T}.png` });
  console.log(`${tag} T=${T}:`, JSON.stringify(st));
  await b.close();
}
console.log('DONE');
