// SW-BJ28 跳跃轨迹微探针（定位 jump 驱动问题）
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5215') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj28j');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id); if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj28j', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const stoneId = 3; // stone
  for (let x = 40; x <= 80; x++) st.setTileSilent(x, 130, stoneId, 0, 0);
  const p = g.player;
  p.maxHp = 999999; p.hp = 999999; p.dead = false;
  p.x = 68 * 16 + 8; p.y = 130 * 16 - p.h; p.vx = 0; p.vy = 0;
  const trace = [];
  for (let i = 0; i < 80; i++) {
    p.inputJump = i < 55;
    g.fixedUpdate(1 / 60);
    if (i % 8 === 0 || i === 1) trace.push({ i, y: +(p.y).toFixed(2), vy: +p.vy.toFixed(2), onGround: p.onGround, jumpHold: p.jumpHold });
  }
  p.inputJump = false;
  return { h: p.h, w: p.w, trace, flags: { frozen: p.buffs?.has?.(47), mount: !!p.mount?.active } };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
