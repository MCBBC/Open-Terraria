import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 150)));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { document.querySelector('select').selectedIndex = 0; });
await page.click('button');
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 2500));
const out = await page.evaluate(async () => {
  const g = window.__swGame, pl = g.player;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const dummy = Enemy.fromVanilla(488, pl.x + 100, pl.y);
  dummy.id = g.entities.nextId++; g.entities.add(dummy, 'enemies');
  await new Promise((r) => setTimeout(r, 300));
  const a = new Arrow(dummy.cx, dummy.cy, 0, 0, 7, 0, 14, null, { grav: 0, pierce: 1, hostile: false });
  a.id = g.entities.nextId++; g.entities.add(a, 'projectiles');
  await new Promise((r) => setTimeout(r, 200));
  // 手动复刻命中循环:
  const trace = { enemiesBucket: g.enemies().length, dummyInBucket: g.enemies().includes(dummy), aabb: false, canHit: null, hitSet: a.hitSet ? [...a.hitSet] : null, localImmune: a.localImmune ?? null };
  for (const ent of g.enemies()) {
    if (ent.dead) continue;
    if (ent === dummy) {
      const pt = await import('/src/entities/projTargets.ts');
      trace.canHit = pt.playerCanHitEnemy(dummy, g, 14);
      trace.aabb = a.x < dummy.x + dummy.w && a.x + a.w > dummy.x && a.y < dummy.y + dummy.h && a.y + a.h > dummy.y;
      trace.hitSetHas = a.hitSet ? a.hitSet.has(dummy.id) : 'n/a';
      trace.localImmuneCd = a.localImmuneCd ? [...(a.localImmuneCd?.entries?.() || [])] : 'n/a';
    }
  }
  a.dead = true; dummy.dead = true;
  return trace;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
