import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 240000, defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5215') + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'inputtrace');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
});
await page.evaluate(() => window.__swFlow.newWorld('inputtrace', 300, 180));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  for (let x = 40; x <= 80; x++) st.setTileSilent(x, 130, 3, 0, 0);
  const p = g.player;
  p.x = 60 * 16 + 8; p.y = 130 * 16 - p.h; p.vx = 0; p.vy = 0; p.dead = false;
  g.input.keys.add('Space'); g.input.keys.add('KeyD');
  const trace = [];
  for (let i = 0; i < 40; i++) {
    g.fixedUpdate(1 / 60);
    if (i % 6 === 0) trace.push({
      i, inputJump: p.inputJump, inputX: p.inputX, y: +p.y.toFixed(1), x: +p.x.toFixed(1),
      vy: +p.vy.toFixed(2), vx: +p.vx.toFixed(2), onGround: p.onGround,
      spectate: g.spectatingSlot, dead: p.dead, jumpField: p.jump, jumpHold: p.jumpHold,
    });
  }
  return { trace, inpAction: g.input.downAction('Jump'), binds: g.input.keys.has('Space') };
});
console.log(JSON.stringify(out));
await browser.close();
