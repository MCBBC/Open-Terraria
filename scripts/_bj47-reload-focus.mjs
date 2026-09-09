// SW-BJ47 聚焦：loadJson 重载是否回填 bannerKills（console 捕获+状态轮询）
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_bj47-reload-focus.mjs
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'], protocolTimeout: 600000,
});
const p = await b.newPage();
const logs = [], errs = [];
p.on('console', m => { const t = m.text(); if (t.includes('[load]') || t.includes('error') || t.includes('Error')) logs.push(t.slice(0, 220)); });
p.on('pageerror', e => errs.push(String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
const seed = await p.evaluate(async () => {
  const g = window.__swGame;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  g.enemySpawnEnabled = false;
  const pl = g.player, w = g.world;
  for (let i = 0; i < 5; i++) {
    const e = Enemy.fromVanilla(3, pl.x + 200, pl.y - 100);
    e.id = g.entities.nextId++;
    g.entities.add(e, 'enemies');
    e.hurt(99999, 0, 0, g, 0, false, 0, true);
  }
  const { bannerOfNpc } = await import('/src/world/Banners.ts');
  await new Promise(r => setTimeout(r, 300));
  const m = await import('/src/save/SaveFile.ts');
  const text = m.saveGame(w, pl, 1000, g.townNpcsForSave(), g.eventsForSave());
  return { text, zb: bannerOfNpc(3) };
});
console.log('[pre]', JSON.stringify({ zb: seed.zb, count: JSON.parse(seed.text).bannerKills }));
const kick = await p.evaluate((t) => {
  window.__bj47kicked = false;
  window.__swFlow.loadJson(t).then(() => { window.__bj47kicked = true; }).catch((e) => { window.__bj47kicked = 'err:' + String(e).slice(0, 160); });
  return 'kicked';
}, seed.text);
console.log('[kick]', kick, 'href=', p.url());
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 2000));
  const st = await p.evaluate(() => ({
    game: !!window.__swGame, player: !!window.__swGame?.player,
    world: !!window.__swGame?.world?.store,
  })).catch(() => 'eval-fail');
  console.log('[poll]', i, JSON.stringify(st));
  if (st && st.player && st.world) break;
}
const post = await p.evaluate(async (zb) => {
  const g = window.__swGame;
  const w = g.world;
  const loaded = JSON.stringify(w.bannerKills);
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const pl = g.player;
  const e = Enemy.fromVanilla(3, pl.x + 200, pl.y - 100);
  e.id = g.entities.nextId++;
  g.entities.add(e, 'enemies');
  e.hurt(99999, 0, 0, g, 0, false, 0, true);
  await new Promise(r => setTimeout(r, 300));
  return { loaded, after: w.bannerKills[zb] ?? 0, lastCreatureHit: pl.lastCreatureHit };
}, seed.zb).catch(e => 'post-eval-fail: ' + String(e).slice(0, 200));
console.log('[post]', JSON.stringify(post));
console.log('[logs]', JSON.stringify(logs.slice(0, 12)));
console.log('[errs]', JSON.stringify(errs.slice(0, 6)));
await b.close();
