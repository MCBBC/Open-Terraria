// 风日生物验证：①大风天下风侧生成 594 风气球（挂史莱姆 ai0=-999）/628 蒲公英
// ②气球被打爆 → 史莱姆解冻落地 ③蒲公英下风玩家触发喷籽
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
const run = async () => {
  await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
  await new Promise(r => setTimeout(r, 1200));
  return p.evaluate(async () => {
    const g = window.__swGame;
    const w = g.world;
    g.enemySpawnEnabled = true;
    // 风日条件：无云 + 正午 + 大风（updateMusicGates 语义手搓）
    w.weather.cloudAlpha = 0;
    w.weather.raining = false;
    w.weather.windSpeedTarget = 0.8;
    w.clock.timeOfDay = 0.5;
    w.weather.shouldUseWindyDayMusic = true;
    const res = {};
    const tally = {};
    for (let i = 0; i < 3000; i++) {
      g.trySpawnEnemy();
      for (const e of g.entities.enemies) {
        if (e.vanillaId != null && ![1, 2, 3].includes(e.vanillaId)) tally[e.vanillaId] = (tally[e.vanillaId] ?? 0) + 1;
      }
      g.entities.enemies.length = 0;
    }
    res.spawnTally = tally;
    // ① 气球 + 奴隶
    const { Enemy } = await import('/src/entities/Enemy.ts');
    const balloon = Enemy.fromVanilla(594, g.player.cx + 200, g.player.cy - 150);
    if (balloon) {
      balloon.id = g.entities.nextId++;
      g.entities.add(balloon, 'enemies');
      balloon['windyBalloonAI'](g, g.player);   // 手动跑一帧触发挂载
      await new Promise(r => setTimeout(r, 600));
      const slave = g.entities.enemies.find((e) => e.ai0 === -999);
      res.balloon = { spawned: !!balloon, slaveSpawned: !!slave, slaveAi0: slave ? slave.ai0 : null };
      // ② 打爆气球 → 奴隶解冻
      balloon.hurt(1e9, 0, 0, g);
      res.pop = { balloonDead: balloon.dead, slaveFreed: slave ? slave.ai0 === 0 : false };
    }
    // ③ 蒲公英喷籽：放到玩家下风（wind>0 → 玩家在东侧）
    const dand = Enemy.fromVanilla(628, g.player.cx - 100, g.player.cy);
    if (dand) {
      dand.id = g.entities.nextId++;
      g.entities.add(dand, 'enemies');
      dand.ai0 = 1; dand.ai1 = 39;
      dand['dandelionAI'](g, g.player);
      dand['dandelionAI'](g, g.player); // ai1→41 越过 40 发籽
      res.dandelion = { projectiles: g.entities.projectiles.length, ai1: dand.ai1 };
    }
    return res;
  });
};
let out = null;
for (let i = 0; i < 4 && !out; i++) { try { out = await run(); } catch (e) { await new Promise(r => setTimeout(r, 2000)); } }
if (!out) { console.log('PROBE FAIL (reloads)'); process.exit(1); }
console.log(JSON.stringify(out, null, 1));
const ok = (out.spawnTally['594'] ?? 0) > 0 && (out.spawnTally['628'] ?? 0) > 0
  && out.balloon && out.balloon.slaveSpawned
  && out.pop && out.pop.slaveFreed
  && out.dandelion && out.dandelion.projectiles > 0;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
