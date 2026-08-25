// 远景眼球(EOCSkyEntity)朝向 E2E:注入左/右飞两只,截图验证虹膜朝前
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
await page.evaluateOnNewDocument(() => {
  window.btnByText2 = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(t));
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => { window.btnByText2?.('单人模式')?.click(); });
await new Promise((r) => setTimeout(r, 1000));
await page.evaluate(() => {
  const inp = document.querySelector('.sw-panel input');
  if (inp) { inp.value = '12345'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
});
await page.evaluate(() => { window.btnByText2?.('创建新世界')?.click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2000));

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer.sky;
  g.world.clock.timeOfDay = 0;   // 夜
  const pl = g.player;
  pl.x = 2095 * 16; pl.y = (232 - 6) * 16; pl.vx = 0; pl.vy = 0;
  // 清既有环境实体,注入两只:右飞(dir=1)/左飞(dir=-1),state=1 折线
  sky.ambEntities.length = 0;
  const mk = (dir) => ({
    kind: 'eyeball', x: pl.x + dir * 200, y: pl.y - 120, depth: 5,
    dir, life: 3600, bornAt: g.world.clock.tick ?? 0,
    fadeIn: 0.1, fadeOut: 0.9, frame: 0, rows: 3, framingSpeed: 5, frameOffset: 0,
    opacity: 1, vx: dir * 3, vy: 0, rotation: dir > 0 ? 0 : Math.PI,
    brightness: 0.2, depthScaleAdj: 0, grayDepthFade: false,
    texKey: 'Ambience_EOC', variant: 0,
    magAccX: 0, magAccY: 0, magTX: 0, magTY: 0, magPX: 0, magPY: 0, magVX: 0, magVY: 0,
    state: 1, waviness: 0.5, dead: false,
  });
  sky.ambEntities.push(mk(1), mk(-1));
  return { injected: sky.ambEntities.length };
});
console.log('INJECT', JSON.stringify(out));
await new Promise((r) => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/bgeye.png' });
await browser.close();
