// 一次性:晨昏径向耀斑视觉验证——时钟拨黄昏窗,截画面右上太阳区
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 2000, height: 1174 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.renderer, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
await page.evaluate(() => {
  const g = window.__swGame;
  // 黄昏窗:t≈0.78 → dayTimeTicks≈51192,sunset vis≈0.61(remap 峰值附近)
  g.world.clock.timeOfDay = 0.78125;   // ft=0.95,2000 宽窗下太阳在 x≈1902 屏内
  g.world.weather.cloudAlpha = 0;
});
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: 'shots/sun-flare-check.png' });
const meta = await page.evaluate(() => {
  const g = window.__swGame;
  return {
    timeOfDay: g.world.clock.timeOfDay,
    vis: g.renderer.sky?.horizonVis ?? null,
    flare1W: g.renderer.sky ? (g.renderer.sky.sunflareTex?.flare1?.width ?? 'lazy') : 'no-sky',
  };
});
console.log(JSON.stringify(meta));
await browser.close();
