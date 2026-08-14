import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto('http://localhost:5206/?play=small', { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(() => {
  const g = window.__swGame;
  g.world.clock.timeOfDay = 0;
  for (const e of [...g.entities.enemies]) e.dead = true;
  g.debugSpawnNpc(35, 1, false);
  const e = g.entities.enemies.find((n) => n.vanillaId === 35);
  const p = g.player;
  p.iframes = 0; p.hp = p.maxHp;
  const log = [];
  e.ai1 = 1; e.ai2 = 0;
  let prev = +e.spin;
  for (let k = 1; k <= 44; k++) {
    g.fixedUpdate(1 / 60);
    const s = +e.spin;
    if (s - prev < 0.29) {
      log.push(`t${k}: spin=${s.toFixed(2)}(+${(s - prev).toFixed(2)}) ai2=${e.ai2} facing=${e.facing} vx=${(+e.vx).toFixed(1)} dist=${Math.round(Math.hypot(e.cx - p.cx, e.cy - p.cy))} hp=${p.hp} dead=${e.dead} stun=${e.stun ?? '-'}`);
    }
    prev = s;
  }
  return { ok: !!e, log: log.slice(0, 14) };
});
console.log((out.log.length ? out.log : ['全 44t 均 +0.3 正常增长']).join('\n'));
await browser.close();
