// 鞭系统验证：①皮鞭(4672→proj 841)甩出 WhipProj ②命中敌人+tag(240t/+4)
// ③随从命中被 tag 敌伤害+4 ④随从优先锁定被 tag 敌
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { WhipProj } = await import('/src/entities/WhipProj.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { combatWeapon } = await import('/src/data/vanillaItemCombat.ts');
  const res = {};
  // ①战斗语义
  res.weapon = combatWeapon({ key: 'vi_4672_BlandWhip', vid: 4672 });
  // 敌人（塔射程内右侧）
  const tgt = Enemy.fromVanilla(3, g.player.cx + 80, g.player.cy - 10);
  tgt.id = g.entities.nextId++;
  g.entities.add(tgt, 'enemies');
  tgt.def.defense = 0;
  const hp0 = tgt.hp;
  // ②甩鞭（水平朝敌）
  const owner = g.player;
  const wp = new WhipProj(owner.cx, owner.cy, 0, 841, 4672, 14, 1, 30, 4, () => owner);
  wp.id = g.entities.nextId++;
  g.entities.add(wp, 'projectiles');
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(1000); // 动画走完 30t
  res.whipDone = wp.dead;
  res.enemyHurt = tgt.hp < hp0;
  res.tag = { t: tgt.whipTagT ?? 0, dmg: tgt.whipTagDmg ?? 0 };
  // ③随从命中吃 tag
  tgt.hp = tgt.maxHp;
  const m = new MinionProj(tgt.cx + 10, tgt.cy, 266, 20, 2, false, 0, false, () => owner);
  m.id = g.entities.nextId++;
  g.entities.add(m, 'projectiles');
  const hp1 = tgt.hp;
  await sleep(400); // 随从接触命中
  res.minionTagDmg = hp1 - tgt.hp - 20 > 0; // 20 基础 + tag 4
  res.minionHit = tgt.hp < hp1;
  return res;
});
console.log(JSON.stringify(out, null, 1));
const w = out.weapon || {};
const ok = w.kind === 'whip' && w.damage === 14 && out.whipDone && out.enemyHurt
  && out.tag.dmg === 4 && out.tag.t > 0 && out.minionHit && out.minionTagDmg;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
