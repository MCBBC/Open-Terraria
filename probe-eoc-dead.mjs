// EoC 玩家死亡路径验证：冲刺中杀死玩家 → 应冻结 aiT + vy 上漂(cs:20020-20030)；
// 复活后冲刺从冻结处继续。对照 vanilla: dead → velocity.Y -= 0.04 + EncourageDespawn + return
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
p.on('framenavigated', f => { if (f === p.mainFrame()) console.log('NAV ->', f.url()); });
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 1500));

const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  g.world.clock.timeOfDay = 0.9;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const boss = Enemy.fromVanilla(4, g.player.cx + 300, g.player.cy - 200);
  boss.id = g.entities.nextId++;
  g.entities.add(boss, 'enemies');
  g.boss = boss;

  const samples = [];
  const orig = Enemy.prototype.fixedUpdate;
  let tick = 0;
  boss.fixedUpdate = function (...args) {
    const r = orig.apply(this, args);
    tick++;
    if (tick % 25 === 0 || samples.length < 2) {
      samples.push({ t: tick, s: boss.state, aiT: boss.aiT, vy: +boss.vy.toFixed(2) });
    }
    return r;
  };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // 等进冲刺
  while (boss.state !== 2 && tick < 3000) await sleep(20);
  await sleep(500); // 冲刺中段
  // 直接置死亡标记(eocAI 判定字段;避免触发真实死亡/重生流程导致页面跳转)
  g.player.dead = true;
  samples.push({ t: tick, mark: 'kill-player', s: boss.state, aiT: boss.aiT });
  const frozenAiT = boss.aiT;
  await sleep(1500); // 死亡期 ~90 ticks
  const during = { t: tick, s: boss.state, aiT: boss.aiT, vy: +boss.vy.toFixed(2), pd: g.player.dead };
  // 复活
  g.player.dead = false;
  samples.push({ t: tick, mark: 'revive' });
  // 等回悬浮
  const t0 = Date.now();
  while (boss.state !== 0 && Date.now() - t0 < 15000) await sleep(50);
  const after = { t: tick, s: boss.state, aiT: boss.aiT, c: boss.chargesLeft };
  boss.fixedUpdate = orig;
  return { samples, frozenAiT, during, after };
});
console.log(JSON.stringify(out));
await b.close();
