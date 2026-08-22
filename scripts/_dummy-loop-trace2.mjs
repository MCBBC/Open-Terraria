import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 900 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 200)));
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
  const pt = await import('/src/entities/projTargets.ts');
  const dummy = Enemy.fromVanilla(488, pl.x + 120, pl.y);
  dummy.id = g.entities.nextId++; g.entities.add(dummy, 'enemies');
  await new Promise((r) => setTimeout(r, 300));
  // 假人还活着吗?dummyAI 锚定失败会自灭!
  const alive = !dummy.dead;
  const a = new Arrow(dummy.cx, dummy.cy, 0, 0, 7, 0, 14, null, { grav: 0, pierce: 1, hostile: false });
  a.id = g.entities.nextId++; g.entities.add(a, 'projectiles');
  await new Promise((r) => setTimeout(r, 100));
  // 手动复刻 Arrow 命中循环的每道门:
  const trace = {
    dummyAlive: alive, dummyDeadNow: dummy.dead,
    dummyInEnemiesBucket: g.enemies().includes(dummy),
    aabb: a.x < dummy.x + dummy.w && a.x + a.w > dummy.x && a.y < dummy.y + dummy.h && a.y + a.h > dummy.y,
    canHit: pt.playerCanHitEnemy(dummy, g, 14),
    hostile: a.hostile, reflected: a.reflected, dead: a.dead,
    hitSetHas: a.hitSet ? a.hitSet.has(dummy.id) : 'no-set',
    localImmune: a.localImmune ?? 0,
    projId: a.projId, damage: a.damage,
  };
  // 关键:subStep 里敌循环前 hitCritters(this) 会不会 return true(误杀路径)?
  const critterHit = pt.hitCritters ? pt.hitCritters(a, g) : 'n/a';
  trace.hitCrittersRet = critterHit;
  a.dead = true; dummy.dead = true;
  return trace;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
