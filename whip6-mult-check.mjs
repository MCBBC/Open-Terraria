// 双乘区修复验证：游侠徽章(+15% ranged) 不得影响随从伤害（原版 minionDamage 独立乘区）。
// 靶 hp 掉落应 = 基伤 10（mult=1）；修复前会是 10×1.15≈12
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  // 游侠徽章 491 → 配饰槽
  g.player.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[491]], stack: 1 };
  const r = {};
  r.rangedMult = Math.round(g.player.damageMult('ranged') * 100) / 100; // 1.15
  r.summonMult = Math.round(g.player.summonDamageMult * 100) / 100;     // 仍 1.0
  // 靶 + 随从（基伤 10）
  const tgt = Enemy.fromVanilla(3, g.player.cx + 150, g.player.cy);
  tgt.id = g.entities.nextId++;
  tgt.maxHp = 1e9; tgt.hp = 1e9; tgt.def.defense = 0;
  g.entities.add(tgt, 'enemies');
  const m = new MinionProj(tgt.cx + 14, tgt.cy, 266, 10, 1, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  await sleep(500);
  r.hpDrop = Math.round(1e9 - tgt.hp);
  tgt.dead = true; m.dead = true;
  return r;
});
console.log(JSON.stringify(out));
const ok = Math.abs(out.rangedMult - 1.15) < 0.01 && Math.abs(out.summonMult - 1) < 0.01 && out.hpDrop === 20;  // 500ms=2 跳×基伤10（修复前=24）
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
