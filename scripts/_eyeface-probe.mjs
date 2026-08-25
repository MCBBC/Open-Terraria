// 眼族朝向 E2E:生成恶魔眼5/游荡眼133,左右移动各截屏,验证倾斜与镜像
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

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  // 夜晚(恶魔眼生成条件)+清场
  g.world.clock.timeOfDay = 0;   // 夜
  const pl = g.player;
  pl.x = 2095 * 16; pl.y = 232 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  // 直接实例化两只眼:5=恶魔眼 133=游荡眼
  const mk = (vid, dx, dy) => g.spawnNpcByVanilla(vid, pl.x + dx, pl.y + dy);
  const e5 = mk(5, -160, -80);
  const e133 = mk(133, 160, -80);
  // 给它们稳定速度:5 向右上飞(vy<0),133 向左飞
  if (e5) { e5.vx = 3; e5.vy = -2; }
  if (e133) { e133.vx = -3; e133.vy = -1; }
  return { e5: !!e5, e133: !!e133 };
});
console.log('SPAWN', JSON.stringify(out));
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => {
  const g = window.__swGame;
  for (const e of [...(g.entities?.critters ?? []), ...(g.entities?.enemies ?? [])]) {
    if (e.vanillaId === 5) { e.vx = 3; e.vy = -2; }
    if (e.vanillaId === 133) { e.vx = -3; e.vy = -1; }
  }
});
await new Promise((r) => setTimeout(r, 100));
const st = await page.evaluate(() => {
  const g = window.__swGame;
  return [...(g.entities?.critters ?? []), ...(g.entities?.enemies ?? [])]
    .filter((e) => e.vanillaId === 5 || e.vanillaId === 133)
    .map((e) => ({ vid: e.vanillaId, vx: Math.round(e.vx * 10) / 10, vy: Math.round(e.vy * 10) / 10, vis: Math.round((e.visAngle ?? 0) * 100) / 100, facing: e.facing }));
});
console.log('STATE', JSON.stringify(st));
await page.screenshot({ path: '/tmp/eyeface.png' });
await browser.close();
