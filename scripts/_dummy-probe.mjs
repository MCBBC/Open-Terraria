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
  // 放假人:先放 tile 378(放置路径会连带 spawnDummyAt)——直接 spawnDummyAt 不放 tile
  // 会被 dummyAI 首帧杀掉(锚 tile 不存在)。用 placeTile 入口? 简化:手动放 tile + spawnDummy
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  const tid = TILE_BY_KEY['v_378_target_dummy'];
  st.setTileSilent(px + 4, gy - 1, tid, 0, 0);
  g.spawnDummyAt(px + 4, gy - 1);
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'no dummy', tid };
  const r = { tid, dummyX: Math.round(dummy.cx), hp: dummy.hp };
  const okHurt = dummy.hurt(25, 2, 0, g, 0, false, 0, true);
  r.hurtReturned = okHurt;
  r.shake = dummy.dummyShake;
  r.dmgNums0 = g.dmgNumbers.length;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const a = new Arrow(dummy.cx - 2, dummy.cy - 40, 0, 5, 15, 2, 1, null, {});
  g.entities.add(a, 'projectiles');
  for (let t = 0; t < 30 && !a.dead; t++) g.fixedUpdate(1 / 60);
  r.arrowShake = dummy.dummyShake;
  r.dmgNums1 = g.dmgNumbers.length;
  return r;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
