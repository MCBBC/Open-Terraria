// 箭伤害调试：拦截 hurt 调用栈 + def.friendly 检查
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  g.enemySpawnEnabled = false;
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const { playerCanHitEnemy } = await import('/src/entities/projTargets.ts');
  const res = {};
  const angler = g.entities.enemies.find(e => e.vanillaId === 376 && !e.dead);
  if (!angler) { res.error = 'no 376'; return res; }
  res.defFriendly = angler.def?.friendly;
  res.canHit = playerCanHitEnemy(angler, g, 1);
  // 拦截 hurt
  const orig = angler.hurt.bind(angler);
  res.hurtCalls = [];
  angler.hurt = function (...a) {
    res.hurtCalls.push({ dmg: a[0], stack: (new Error()).stack?.split('\n').slice(1, 4).join(' | ') });
    return orig(...a);
  };
  g.player.x = angler.x - g.player.w - 200;
  g.player.y = angler.y + angler.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  await sleep(300);
  const arrow = new Arrow(angler.x - 20, angler.cy - 3, 8, 0, 25, 3, 1);
  arrow.id = g.entities.nextId++;
  g.entities.add(arrow, 'projectiles');
  await sleep(600);
  res.hpAfter = angler.hp;
  res.arrowDead = !!arrow.dead;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
