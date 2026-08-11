// 雨天生怪验证：强制下雨+白天草地，采样生成 → 飞鱼224/雨伞史莱姆225（敌怪）+
// 上岸金鱼230/蚯蚓357（小动物，无 1/15 门高频）
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
    w.weather.raining = true;
    w.weather.cloudAlpha = 0.8;
    w.weather.windSpeedTarget = 0;
    w.clock.timeOfDay = 0.5; // 白天
    g.enemySpawnEnabled = true;
    const tally = {};
    const bump = (id) => { tally[id] = (tally[id] ?? 0) + 1; };
    for (let i = 0; i < 4000; i++) {
      g.trySpawnEnemy();
      g['spawnCritter']();
      for (const e of g.entities.enemies) if (e.vanillaId != null && ![1, 2, 3].includes(e.vanillaId)) bump(e.vanillaId);
      for (const c of g.entities.critters) bump((c.vanillaId ?? 0));
      g.entities.enemies.length = 0;  // 清场防占额（普通地表怪保留判定已过）
      g.entities.critters.length = 0;
    }
    return { tally: Object.fromEntries(Object.entries(tally).sort((a, b2) => b2[1] - a[1]).slice(0, 12)) };
  });
};
let out = null;
for (let i = 0; i < 4 && !out; i++) { try { out = await run(); } catch (e) { await new Promise(r => setTimeout(r, 2000)); } }
if (!out) { console.log('PROBE FAIL (reloads)'); process.exit(1); }
console.log(JSON.stringify(out, null, 1));
const t = out.tally;
const ok = (t['224'] ?? 0) > 0 && (t['225'] ?? 0) > 0 && (t['230'] ?? 0) > 0 && (t['357'] ?? 0) > 0;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
