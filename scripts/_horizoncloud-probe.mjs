// HorizonClouds 染色视觉验证:黎明窗(sunrise 高可见)下云应朝阳侧染暖色。
// 用法:SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs --timeout=300000 scripts/_horizoncloud-probe.mjs
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/hc-profile',
  args: ['--no-first-run'], defaultViewport: { width: 1512, height: 862 }, protocolTimeout: 240000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'warning' && /shader|GL/i.test(m.text())) console.log('[warn]', m.text().slice(0, 160)); });
page.setDefaultTimeout(300000);
await page.goto(process.env.SW_ORIGIN || 'http://localhost:5204', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 60000 });
await page.evaluate(() => window.__swFlow.newWorld('', 4200, 1200));
await page.waitForFunction(() => !!window.__swGame, { timeout: 120000 });
await page.evaluate(() => {
  const g = window.__swGame;
  // 黎明 +5000 tick:sunrise = Remap(5000,0,2700,0,1)=1 · Remap(5000,3600,10800,1,0)=0.6875
  // celestial = Remap(5000,0,3600,0,1)=1 → num = max(sunset≈0, 0.6875)×1 ≈ 0.69
  g.world.clock.timeOfDay = 0.25 + (5000 / 54000) * 0.5;
  g.player.x = 33500; g.player.y = 3000;
});
await new Promise((r) => setTimeout(r, 8000));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const sky = g.renderer ? g.renderer.sky : g.sky;
  const cel = sky ? (sky.cloudCelestial ?? null) : null;
  return {
    cel: cel ? { ...cel } : null,
    sunScreen: sky?.sunScreen ?? null,
    horizonVis: sky?.horizonVisCache ?? null,
    timeOfDay: g.world.clock.timeOfDay,
  };
});
console.log('天体态:', JSON.stringify(out));
await page.screenshot({ path: '/Users/vinlic/.claude/jobs/8405c930/tmp/horizoncloud.png' });
await browser.close();
// 第二段:GL 云层状态 + 太阳近旁云像素采样
