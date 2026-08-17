import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const stats = await page.evaluate(() => {
  const g = window.__swGame;
  const sp = g.vanillaSpawner ?? { spawn: () => null };
  const s = { spawnCalls: 0, friendly: 0, picked: 0, nulls: 0, friendlyNull: 0, byType: {}, spawnEnabled: g.enemySpawnEnabled };
  const orig = sp.spawn.bind(sp);
  sp.spawn = (...a) => {
    s.spawnCalls++;
    const f = sp.spawnFriendlyCycle;
    if (f) s.friendly++;
    const r = orig(...a);
    if (r) { s.picked++; s.byType[r.vanillaId] = (s.byType[r.vanillaId] ?? 0) + 1; }
    else { s.nulls++; if (f) s.friendlyNull++; }
    return r;
  };
  for (let i = 0; i < 3600; i++) g.fixedUpdate(1 / 60);
  s.critters = g.entities.critters.length;
  s.critterVids = g.entities.critters.map((c) => c.vanillaId);
  s.enemies = g.entities.enemies.length;
  s.tick = g.tickCount;
  sp.spawn = orig;
  return s;
});
console.log(JSON.stringify(stats, null, 1));
await browser.close();
