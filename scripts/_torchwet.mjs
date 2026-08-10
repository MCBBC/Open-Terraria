// E2E:手持火把 入水熄灭/出水复亮(原版 ItemCheck_EmitHeldItemLight !wet 门)
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 420000 });
await new Promise((r) => setTimeout(r, 2000));
const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 手持火把(槽 0)
  const torch = g.itemId ? g.itemId('torch') : null;
  const p = g.player;
  // 找出生点附近一处旱地,再造一个 2 格深水池(玩家正下)
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  // 清出竖井并注水(玩家站位下方一格起)
  for (let y = py; y <= py + 1; y++) for (let x = px - 1; x <= px + 1; x++) st.setTile(x, y, 0);
  for (let x = px - 1; x <= px + 1; x++) { st.setLiquid(x, py, 255, 1); st.setLiquid(x, py + 1, 255, 1); }
  p.x = px * 16; p.y = py * 16 - 20; p.vx = 0; p.vy = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sample = () => ({
    heldLight: g.lighting.heldLight,
    inWater: p.inWater,
  });
  // 旱地(等水未及):先把玩家抬到井口上方
  p.y = (py - 3) * 16;
  await wait(500);
  const dry = sample();
  // 落入水中
  p.x = px * 16; p.y = py * 16 + 4;
  await wait(800);
  const wet = sample();
  return { torchId: torch, dry, wet };
});
console.log(JSON.stringify(res, null, 1));
await browser.close();
