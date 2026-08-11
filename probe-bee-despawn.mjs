// 蜂后玩家死亡→离场消散验证：玩家被蜂后杀死后，蜂后应 EncourageDespawn 离屏即消，
// game.boss 清空（血条随之消失）
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const res = {};
  const bee = Enemy.fromVanilla(222, g.player.cx + 200, g.player.cy);
  bee.id = g.entities.nextId++;
  g.entities.add(bee, 'enemies');
  g.boss = bee; // spawnEnemy 才会登记 boss，直加需手动
  res.bossSet = g.boss === bee;
  // 玩家被蜂后杀死
  g.damagePlayer(99999, bee.cx, bee.cy, bee);
  res.playerDead = g.player.dead;
  await sleep(6000); // 足够离场 despawn + 180t 重生计时
  res.beeDead = bee.dead;
  res.bossCleared = g.boss === null;
  res.playerRespawned = !g.player.dead;
  return res;
});
console.log(JSON.stringify(out));
const ok = out.bossSet && out.playerDead && out.beeDead && out.bossCleared && out.playerRespawned;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
