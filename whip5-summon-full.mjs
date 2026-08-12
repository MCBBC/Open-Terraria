// 召唤师系统全量验证：①数值链(俾格米项链+星尘套→maxMinions/守护者)
// ②星尘龙链体+延伸 ③沙漠虎计数器+档位 ④阿比盖尔计数器+本体
// ⑤酷鞭雪花 917 ⑥火鞭 proc ⑦鞭射程倍率
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e.stack ?? e).slice(0, 600)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  g.enemySpawnEnabled = false;
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID } = await import('/src/data/items.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { MinionProj } = await import('/src/entities/MinionProj.ts');
  const { WhipProj } = await import('/src/entities/WhipProj.ts');
  const res = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const give = (vid) => {
    g.player.inv.slots[0] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[vid]], stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
  };
  const use = async (ms = 600) => {
    g.input.mouseX = g.renderer.canvas.width / 2 + 100;
    g.input.mouseY = g.renderer.canvas.height / 2;
    g.input.mouseDown = true;
    await sleep(ms);
    g.input.mouseDown = false;
    await sleep(400);
  };
  const ids = () => g.entities.projectiles.filter((e) => e?.constructor?.name === 'MinionProj' && !e.dead).map((m) => m.projId);
  const count = (id) => ids().filter((x) => x === id).length;

  // ① 数值链：裸装 maxMinions=1
  res.maxMinions0 = g.player.maxMinions;
  // 俾格米项链 1158 → 2
  g.player.inv.armor[3] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[1158]], stack: 1 };
  res.maxMinionsNecklace = g.player.maxMinions;
  // 星尘套 3381/3382/3383 → +1+2+2 = 6；守护者 623
  g.player.inv.armor[0] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3381]], stack: 1 };
  g.player.inv.armor[1] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3382]], stack: 1 };
  g.player.inv.armor[2] = { id: ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[3383]], stack: 1 };
  res.maxMinionsStardust = g.player.maxMinions;
  res.summonDmg = Math.round(g.player.summonDamageMult * 100) / 100; // 1×(1+0.66)=1.66
  await sleep(300);
  res.guardian = count(623) === 1;

  // ② 星尘龙：首召唤 625+626+627+628；再召唤 +2 段
  give(3531); await use();
  res.dragon1 = { head: count(625), seg626: count(626), seg627: count(627), tail: count(628) };
  await use();
  res.dragon2 = { seg626: count(626), seg627: count(627), head: count(625) };
  // 清场
  for (const e of [...g.entities.projectiles]) e.dead = true;
  await sleep(400);

  // ③ 沙漠虎：1 颗宝石 → 833；4 颗 → 834
  give(4607); await use();
  res.tiger1 = { gem: count(831), tiger: ids().find((x) => x >= 833 && x <= 835) ?? 0 };
  for (let i = 0; i < 3; i++) await use();
  res.tiger4 = { gem: count(831), tiger: ids().find((x) => x >= 833 && x <= 835) ?? 0 };
  for (const e of [...g.entities.projectiles]) e.dead = true;
  await sleep(400);

  // ④ 阿比盖尔：计数器 970 + 本体 963
  give(5114); await use();
  res.abigail = { counter: count(970), body: count(963) };
  for (const e of [...g.entities.projectiles]) e.dead = true;
  await sleep(400);

  // ⑤ 酷鞭 4911 → 命中出雪花 917 + buff 312（需靶在场）
  const tgt = Enemy.fromVanilla(3, g.player.cx + 120, g.player.cy);
  tgt.id = g.entities.nextId++;
  tgt.maxHp = 1e9; tgt.hp = 1e9; tgt.def.defense = 0;
  g.entities.add(tgt, 'enemies');
  give(4911); await use();
  res.coolWhip = { snow: count(917), buff312: g.player.whipBuffs[312] ?? 0 };
  tgt.whipProcT = 0;

  // ⑥ 火鞭 4912 命中 → proc 挂上（清光随从防守护者抢消费）；随从命中 → proc 消费
  for (const e of [...g.entities.projectiles]) e.dead = true;
  await sleep(300);
  g.input.mouseX = g.renderer.canvas.width / 2 + 100;
  g.input.mouseY = g.renderer.canvas.height / 2;
  give(4912); await use(400);
  res.fireProcSet = { procT: tgt.whipProcT ?? 0, procItem: tgt.whipProcItem ?? 0 };
  // 随从命中消费 proc
  const m = new MinionProj(tgt.cx + 12, tgt.cy, 266, 9, 1, false, 0, false, () => g.player);
  g.entities.add(m, 'projectiles');
  await sleep(300);
  res.fireProcConsumed = tgt.whipProcT === 0;
  tgt.dead = true; m.dead = true;
  for (const e of [...g.entities.projectiles]) e.dead = true;
  await sleep(300);

  // ⑦ 鞭射程倍率：皮鞭 841(0.75) vs 杜兰达尔 847(1.75)，anim 同 30/28、speed 同 4
  const owner = g.player;
  const w1 = new WhipProj(0, 0, 0, 841, 4672, 14, 1, 30, 4, () => owner);
  const w2 = new WhipProj(0, 0, 0, 847, 4678, 55, 2, 28, 4, () => owner);
  res.whipRange = { leather: w1.maxLen, durendal: w2.maxLen };
  return res;
});
console.log(JSON.stringify(out, null, 1));
const ok = out.maxMinions0 === 1 && out.maxMinionsNecklace === 2 && out.maxMinionsStardust === 7
  && Math.abs(out.summonDmg - 1.66) < 0.01 && out.guardian
  && out.dragon1.head === 1 && out.dragon1.seg626 === 1 && out.dragon1.seg627 === 1 && out.dragon1.tail === 1
  && out.dragon2.seg626 === 2 && out.dragon2.seg627 === 2 && out.dragon2.head === 1
  && out.tiger1.gem === 1 && out.tiger1.tiger === 833
  && out.tiger4.gem === 4 && out.tiger4.tiger === 834
  && out.abigail.counter === 1 && out.abigail.body === 1
  && out.coolWhip.snow === 1 && out.coolWhip.buff312 > 0
  && out.fireProcSet.procItem === 4912 && out.fireProcConsumed  // proc 设置→随从命中消费（守护者可抢先）
  && out.whipRange.leather > 0 && out.whipRange.durendal / out.whipRange.leather > 2.2;
console.log(ok ? 'PROBE OK' : 'PROBE FAIL');
await b.close();
process.exit(ok ? 0 : 1);
