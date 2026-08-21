// 隔离测试:①直接 hurt() ②Arrow 手动放置在假人盒内 ③真射。
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
  const idOf = (re) => { const k = Object.keys(window.__swItems).find((k) => re.test(k)); return k ? window.__swItems[k] : -1; };
  const dummy = Enemy.fromVanilla(488, pl.x + 120, pl.y - 10);
  dummy.id = g.entities.nextId++; g.entities.add(dummy, 'enemies');
  await new Promise((r) => setTimeout(r, 300));
  const r1 = { shakeBefore: dummy.dummyShake, dont: dummy.dontTakeDamage, defFriendly: dummy.def?.friendly };
  // ①直接 hurt:
  dummy.hurt(7, 1, 0, g);
  const r2 = { shakeAfterDirectHurt: dummy.dummyShake, ret: 'called' };
  // ②手动放 Arrow 在假人盒中心,跑一 tick:
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const a = new Arrow(dummy.cx - 2, dummy.cy - 2, 3, 0, 7, 0, 14, null, { grav: 0, pierce: 1, hostile: false });
  a.id = g.entities.nextId++; g.entities.add(a, 'projectiles');
  await new Promise((r) => setTimeout(r, 200));
  const r3 = { arrowDead: a.dead, arrowX: Math.round(a.x - dummy.x), shakeAfterArrow: dummy.dummyShake };
  // ③查 playerCanHitEnemy(488):
  const pt = await import('/src/entities/projTargets.ts');
  const canHit = pt.playerCanHitEnemy(dummy, g, 14);
  const r4 = { canHit };
  a.dead = true; dummy.dead = true;
  return { r1, r2, r3, r4 };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
