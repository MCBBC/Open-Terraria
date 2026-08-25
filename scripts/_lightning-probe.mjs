// 强制雷暴态:雨 0.9+风 0.7+newLightning(instant) → 截闪电白闪帧
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));
// 强制雷暴+闪电
const st1 = await page.evaluate(() => {
  const g = window.__swGame, w = g.world.weather;
  g.world.clock.timeOfDay = 0.9;   // 夜:闪电最显著
  w.cloudAlpha = 0.9; w.maxRaining = 0.9; w.raining = true;
  w.windSpeedTarget = 0.7; w.windSpeedCurrent = 0.7;
  w.shouldUseStormMusic = true; w.storming = true;
  const trace = [];
  window.__ltr = trace;
  const orig = w.newLightning.bind(w);
  w.newLightning(true);   // instant:闪电立即满亮
  return { lightning: w.lightning, speed: w.lightningSpeed, delay: w.thunderDelay };
});
console.log('FORCE', JSON.stringify(st1));
// 峰值追踪:每 50ms 采样 lightning,抓峰值帧
let peak = 0;
for (let i = 0; i < 10; i++) {
  await new Promise((r) => setTimeout(r, 50));
  const v = await page.evaluate(() => window.__swGame.world.weather.lightning);
  if (v > peak) {
    peak = v;
    await page.screenshot({ path: '/tmp/lightning-flash.png' });
  }
}
console.log('PEAK', peak);
// 2 秒后衰减态对照
await new Promise((r) => setTimeout(r, 2000));
const st2 = await page.evaluate(() => {
  const w = window.__swGame.world.weather;
  return { lightning: Math.round(w.lightning * 100) / 100 };
});
console.log('DECAY', JSON.stringify(st2));
await page.screenshot({ path: '/tmp/lightning-after.png' });
await browser.close();
