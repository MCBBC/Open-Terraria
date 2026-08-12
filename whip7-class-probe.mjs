// 职业数值实装验证：①箭袋分道 ②蘑菇矿弹头 ③磨刀 ④狼人 ⑤BOC ⑥星云 ⑦甲虫球 ⑧潜行
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
  const r = {};
  const giveAcc = (vid) => { g.player.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]], stack: 1 }; };
  const wear = (vids) => { vids.forEach((v, i) => { g.player.inv.armor[i] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[v]], stack: 1 }; }); };
  const M = (x) => Math.round(x * 100) / 100;
  const pl = g.player;
  // ① 箭袋 1321：箭 +0.1 加算，弹不动
  giveAcc(1321);
  r.quiver = { arrow: M(pl.rangedDamageMult('arrow')), bullet: M(pl.rangedDamageMult('bullet')) };
  g.player.inv.armor[3] = null;
  // ② 蘑菇矿弹头 1547：弹 ×1.12 + 远程暴 +5
  wear([1547]);
  r.shroomite = { bullet: M(pl.rangedDamageMult('bullet')), arrow: M(pl.rangedDamageMult('arrow')), crit: pl.critChance('ranged') };
  // ③ 磨刀：meleeArmorPen=12（召唤/远程不吃）
  pl.buffs.apply(24, 2);
  r.sharpened = { pen: pl.meleeArmorPen };
  pl.buffs.remove(24);
  // ⑧ 潜行（蘑菇矿全套 1546/1549/1550 + 满潜行）：远程伤 ×1.6 暴 +10
  wear([1546, 1549, 1550]);
  pl.stealth = 1;
  r.stealthFull = { arrow: M(pl.rangedDamageMult('arrow')), crit: pl.critChance('ranged') };
  pl.stealth = 0;
  r.stealthNone = { arrow: M(pl.rangedDamageMult('arrow')), crit: pl.critChance('ranged') };
  pl.buffs.remove(14); pl.buffs.remove(40);
  // ④ 狼人：月亮符 485 + 夜间
  wear([0, 0, 0]);
  giveAcc(485);
  g.world.clock.isDay = false;
  await new Promise(s => setTimeout(s, 300));
  r.werewolf = { melee: M(pl.damageMult('melee')), magic: M(pl.damageMult('magic')) };
  g.world.clock.isDay = true;
  g.player.inv.armor[3] = null;
  // ⑤ BOC：受击 1/6 → buff 321 → 三系暴+10 / 召唤伤+10%
  giveAcc(3223);
  for (let i = 0; i < 30 && !pl.buffs.has(72); i++) pl.damage(5, pl.cx + 10, pl.cy);
  r.boc = { critMelee: pl.critChance('melee'), summon: M(pl.summonDamageMult) };
  g.player.inv.armor[3] = null;
  pl.buffs.remove(72);
  // ⑥ 星云套 2760/2761/2762：耗魔叠层 ≤3（每层四系+15%）
  wear([2760, 2761, 2762]);
  for (let i = 0; i < 60; i++) pl.onManaSpent();
  r.nebula = { stacks: pl.nebulaStacks, summon: M(pl.summonDamageMult), melee: M(pl.damageMult('melee')) };
  // ⑦ 甲虫进攻套 2199/2200/2202：命中蓄能 → 球（每球近战+10%）
  wear([2199, 2200, 2202]);
  for (let i = 0; i < 100; i++) pl.onMeleeHit();
  r.beetle = { orbs: pl.beetleOrbs, melee: M(pl.damageMult('melee')) };
  return r;
});
console.log(JSON.stringify(out, null, 1));
const ok = Math.abs(out.quiver.arrow - 1.1) < 0.01 && Math.abs(out.quiver.bullet - 1) < 0.01
  && Math.abs(out.shroomite.bullet - 1.12) < 0.01 && Math.abs(out.shroomite.arrow - 1) < 0.01 && out.shroomite.crit === 5
  && out.sharpened.pen === 12
  && out.werewolf.melee === 1.05 && Math.abs(out.werewolf.magic - 1) < 0.01
  && out.boc.critMelee === 10 && Math.abs(out.boc.summon - 1.1) < 0.01
  && out.nebula.stacks === 3 && Math.abs(out.nebula.summon - 1.45) < 0.01
  && out.beetle.orbs === 3 && Math.abs(out.beetle.melee - 1.3) < 0.01;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
