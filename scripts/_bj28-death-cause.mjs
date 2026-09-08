import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 240000, defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('console', (m) => { const t = m.text(); if (t.includes('[sw]')) console.log('PAGE:', t.slice(0, 300)); });
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5215') + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
await new Promise((r) => setTimeout(r, 1000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'deathcause');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
});
await page.evaluate(() => window.__swFlow.newWorld('deathcause', 300, 180));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const log = [];
  const origRec = g.recLog?.bind(g);
  g.recLog = (kind, data) => { log.push({ kind, ...data }); origRec?.(kind, data); };
  for (let x = 40; x <= 80; x++) st.setTileSilent(x, 130, 3, 0, 0);
  g.world.spawnX = 62; g.world.spawnY = 128; g.world.spawnX0 = 62; g.world.spawnY0 = 128;
  const p = g.player;
  p.maxHp = 999999; p.hp = 999999; p.dead = false; p.respawnTimer = 0; p._deathHandled = false;
  p.x = 68 * 16 + 8; p.y = 130 * 16 - p.h; p.vx = 0; p.vy = 0;
  const trace = [];
  for (let i = 0; i < 240; i++) {
    g.fixedUpdate(1 / 60);
    if (i % 20 === 0 || (p.dead && trace[trace.length - 1]?.dead !== true)) {
      trace.push({ i, dead: p.dead, hp: p.hp, y: +p.y.toFixed(1), vy: +p.vy.toFixed(2),
        fallStart: p.fallStart ?? null, onGround: p.onGround });
    }
    if (p.dead && i > 5) break;
  }
  return { trace, log: log.slice(-12), pfields: { fallStart: p.fallStart, ghost: p.ghost, deadTime: p.deadTime } };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
