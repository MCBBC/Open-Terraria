// 6152 视觉验证 v2:旗标驱动发射 + 按玩家→准星区截屏
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300_000 });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player && window.__swItems, { timeout: 300000 });
const pos = await page.evaluate((key) => {
  const g = window.__swGame;
  const p = g.player;
  const itemId = (window.__swItems ?? {})[key];
  p.inv.slots[0] = { id: itemId, stack: 1 };
  p.inv.selected = 0;
  p.mana = 100; p.maxMana = 100;
  const [sx, sy] = g.camera.worldToScreen(p.cx + 6 * 16, p.cy);
  g.input.mouseX = Math.round(sx); g.input.mouseY = Math.round(sy);
  return { sx, sy, px: p.cx, py: p.cy };
}, 'vi_6152_DaybloomStaff');
// 旗标驱动 26 帧发射
await page.evaluate(() => {
  const g = window.__swGame;
  let n = 0;
  const step = () => {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    if (++n < 26) requestAnimationFrame(step); else { g.input.mouseDown = false; g.input.mouseHeld = false; }
  };
  requestAnimationFrame(step);
});
await new Promise((r) => setTimeout(r, 400));
const cam = await page.evaluate(() => {
  const g = window.__swGame;
  const p = g.player;
  const [sx, sy] = g.camera.worldToScreen(p.cx, p.cy);
  return { sx, sy, count: g.entities.projectiles.length };
});
await page.screenshot({ path: '/tmp/dbloom-shot.png', clip: { x: Math.min(1000, cam.sx - 200), y: Math.max(0, cam.sy - 200), width: 420, height: 300 } });
console.log('saved', JSON.stringify(cam));
process.exit(0);
