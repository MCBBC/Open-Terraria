// 消息列验证：天气/日夜公告走 ChatMonitor 而非 toast（scripts/_msg-smoke.mjs）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 860 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
if (!(await page.evaluate(() => !!document.querySelector('.sw-item')))) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('消息测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
await page.click('.sw-list-footer [data-act=new]');
await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 500));
await page.click('[data-g=size] .sw-wc-opt');
await new Promise(r => setTimeout(r, 200));
await page.click('[data-act=create]');
await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2000));
const res = await page.evaluate(() => {
  const g = window.__swGame;
  const out = {};
  // 1. 天气预设 → 消息列
  g.applyWeatherPreset('storm');
  out.afterPreset = Array.from(document.querySelectorAll('.sw-chat-line')).map((n) => n.textContent).slice(-1)[0];
  // 2. 史莱姆雨延迟公告（420t——手动快进倒计时）
  g.slimeWarningTime = 1;
  g.applyWeatherPreset('clear'); // 触发 stop → 延迟公告会播 gen75
  // 手动跑 updateWeather（私有，直接调）
  try { g.updateWeather(); } catch (e) { out.uwErr = String(e).slice(0, 80); }
  out.afterSlimeStop = Array.from(document.querySelectorAll('.sw-chat-line')).map((n) => n.textContent).slice(-1)[0];
  // 3. 金币雨
  g.world.weather.coinRainPending = true;
  try { g.updateWeather(); } catch (e) { out.uwErr2 = String(e).slice(0, 80); }
  out.afterCoinRain = Array.from(document.querySelectorAll('.sw-chat-line')).map((n) => n.textContent).slice(-1)[0];
  // 4. toast 元素此刻不应有新内容
  out.toastExists = !!document.querySelector('.sw-toast');
  return out;
});
console.log('MSG', JSON.stringify(res));
console.log('ERRORS', JSON.stringify(errs.slice(0, 4)));
await browser.close();
