// 铜短剑(spear 161)投射物打假人——查 SpearProj 命中链
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERR]', String(e).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.player.cy / 16);
  while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  st.setTileSilent(px + 4, gy - 1, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  g.spawnDummyAt(px + 4, gy - 1);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'no dummy' };
  // 直接发 SpearProj 朝假人
  const { SpearProj } = await import('/src/entities/WeaponProj.ts');
  const sp = new SpearProj(1, 0, 8, 15, 25, 2, 938);
  sp.x = dummy.x - 30; sp.y = dummy.y;
  sp.critChance = 0.04;
  g.entities.add(sp, 'projectiles');
  const trace = [];
  for (let t = 0; t < 25; t++) {
    g.fixedUpdate(1 / 60);
    if (t % 5 === 0) trace.push(`t${t}: sp@${Math.round(sp.x)} shake=${dummy.dummyShake} nums=${g.dmgNumbers.length}`);
  }
  // 对照:同位置发 Arrow
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const a = new Arrow(dummy.x - 30, dummy.y, 4, 0, 25, 2, 1, null, {});
  g.entities.add(a, 'projectiles');
  for (let t = 0; t < 25; t++) g.fixedUpdate(1 / 60);
  return { trace, shakeSpear: dummy.dummyShake, numsSpear: g.dmgNumbers.length,
    playerCanHit: dummy.def?.damage, dummyFriendly: dummy.def?.friendly };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
