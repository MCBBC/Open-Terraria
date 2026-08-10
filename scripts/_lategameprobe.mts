// 后期三王冒烟:拜月教邪教徒 439 / 光之女皇 636 / 史莱姆皇后 657(直接驱动 bossAI_lategame,
// 与 _mechprobe.mts 同模板:fake game + 地板 + 夜晚)。
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { lunaticCultistAI, empressOfLightAI, queenSlimeAI } from '../src/entities/bossAI_lategame.ts';

const st = new TileStore(200, 300);
const world = new World(200, 300, 1, 't');
world.store = st;
world.groundLevel = 60;
world.rockLevel = 190;
for (let x = 0; x < 200; x++) st.setTileSilent(x, 150, 1); // 地板 y=150
const FLOOR = 150 * 16;
const enemies: Enemy[] = [];
const projectiles: unknown[] = [];
const game = {
  world,
  player: { cx: 100 * 16, cy: 140 * 16, x: 100 * 16 - 10, y: 140 * 16, w: 20, h: 42, vx: 0, vy: 0, dead: false } as never,
  enemies: () => enemies,
  spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
  onEnemyKilled: () => {}, spawnEnemy: () => {}, notifyInventoryChanged: () => {}, showPickupLabel: () => {},
  spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  entities: (() => {
    const wrap = {
      nextId: 2,
      add: (e: Enemy, b?: string) => {
        e.id = wrap.nextId++;
        if (b === 'projectiles') projectiles.push(e); else enemies.push(e);
      },
    };
    return wrap;
  })(),
} as never;
const player = (game as unknown as { player: { cx: number; cy: number; vx: number; vy: number; dead: boolean } }).player;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };
world.clock.timeOfDay = 0.0; // 夜晚
const projIds = () => new Set((projectiles as Array<{ projId: number }>).map((p) => p.projId));

// 1) 拜月教邪教徒 439:瞬移循环 + 弹幕轮换
console.log('== Lunatic Cultist 439 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const cult = Enemy.fromVanilla(439, 100 * 16, 120 * 16)!;
  cult.id = 1; enemies.push(cult);
  let maxJump = 0, sawRitual = false, sawAttack = 0, maxCycle = 0;
  for (let i = 0; i < 6000; i++) {
    const px = cult.x, py = cult.y;
    lunaticCultistAI(cult, game, player as never);
    maxJump = Math.max(maxJump, Math.hypot(cult.x - px, cult.y - py));
    if (cult.ai0 === 5) sawRitual = true;
    if (cult.ai0 === 2 || cult.ai0 === 3 || cult.ai0 === 4) sawAttack++;
    maxCycle = Math.max(maxCycle, cult.ai3); // 仪式拍会临时置 -1,取观测峰值
  }
  const ids = projIds();
  check('① 发生瞬移(单拍跳变>300px)', maxJump > 300, maxJump.toFixed(1));
  check('① 进入过仪式瞬移态', sawRitual);
  check('① 发过弹幕', projectiles.length > 0, projectiles.length);
  check('① 冰雾 464/火球 467 都出现过', ids.has(464) && ids.has(467), [...ids]);
  check('选招循环推进(拍号峰值>=3)', maxCycle >= 3, maxCycle);
  // 半血 → 二阶段:防御 ×0.65
  cult.hp = cult.maxHp * 0.4;
  lunaticCultistAI(cult, game, player as never);
  check('半血防御 ×0.65', cult.def.defense === Math.floor((Enemy.fromVanilla(439, 0, 0)!.def.defense ?? 0) * 0.65), cult.def.defense);
  cult.hp = cult.maxHp;
  lunaticCultistAI(cult, game, player as never);
  check('回血恢复防御基值', cult.def.defense === Enemy.fromVanilla(439, 0, 0)!.def.defense, cult.def.defense);
}
// 2) 光之女皇 636:冲刺段 + 弹幕环
console.log('== Empress of Light 636 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const em = Enemy.fromVanilla(636, 100 * 16, 100 * 16)!;
  em.id = 1; enemies.push(em);
  let maxStep = 0, sawDash = 0;
  for (let i = 0; i < 4000; i++) {
    const px = em.x, py = em.y;
    empressOfLightAI(em, game, player as never);
    maxStep = Math.max(maxStep, Math.hypot(em.x - px, em.y - py));
    if (em.ai0 === 8 || em.ai0 === 9) sawDash++;
  }
  let ids = projIds();
  check('② 完成过冲刺段(单拍位移>40px)', maxStep > 40, maxStep.toFixed(1));
  check('② 进入过冲刺态(8/9)', sawDash > 0, sawDash);
  check('② 发过弹幕', projectiles.length > 0, projectiles.length);
  check('② 彩虹射线 873 出现', ids.has(873), [...ids]);
  check('② 光枪 919/太阳舞 923 出现', ids.has(919) || ids.has(923), [...ids]);
  // 半血 → 变身传送(10)→ 二阶段
  em.hp = em.maxHp * 0.3;
  let sawTransform = false;
  for (let i = 0; i < 800 && !sawTransform; i++) {
    empressOfLightAI(em, game, player as never);
    if (em.ai0 === 10) sawTransform = true;
  }
  for (let i = 0; i < 400; i++) empressOfLightAI(em, game, player as never);
  ids = projIds();
  check('② 半血触发变身传送', sawTransform);
  check('② 二阶段标记 ai3=1', em.ai3 === 1, em.ai3);
  check('② 二阶段防御 ×1.2', em.def.defense === Math.floor((Enemy.fromVanilla(636, 0, 0)!.vanilla!.defense ?? 0) * 1.2), em.def.defense);
}
// 3) 史莱姆皇后 657:走路大跳 → 半血飞行
console.log('== Queen Slime 657 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const qs = Enemy.fromVanilla(657, 100 * 16, 140 * 16)!;
  qs.id = 1; enemies.push(qs);
  let sawJump = false, maxAir = 0;
  for (let i = 0; i < 3600; i++) { // 选招含 1/3 随机,拉长保证连跳态必现
    queenSlimeAI(qs, game, player as never);
    if (qs.ai0 === 3) sawJump = true;
    maxAir = Math.max(maxAir, FLOOR - (qs.y + qs.h));
  }
  const p1ids = projIds();
  check('③ 走路段进入连跳态(ai0=3)', sawJump);
  check('③ 有跳跃位移(离地>40px)', maxAir > 40, Math.round(maxAir));
  check('③ 一阶段弹幕(922/926)', p1ids.has(922) || p1ids.has(926), [...p1ids]);
  // ④ 血量降半 → 二阶段飞行(脱离地面);此后持续掉血验证 2%/1.5% 阈值撒仆从
  qs.hp = qs.maxHp * 0.4;
  let airTicks = 0, groundedEnd = true, minHover = Infinity;
  for (let i = 0; i < 900; i++) {
    if (i % 60 === 0 && qs.hp > 1) qs.hp = Math.max(1, qs.hp - qs.maxHp * 0.03); // 持续掉血触发仆从阈值
    queenSlimeAI(qs, game, player as never);
    if (!qs.onGround && qs.y + qs.h < FLOOR - 100) airTicks++;
    if (i >= 600 && !qs.onGround && qs.y + qs.h < FLOOR - 100) groundedEnd = false;
    // FlyMovement 悬停锚点 = 玩家上方 250(:45500),记录最近距离验证收敛
    minHover = Math.min(minHover, Math.hypot(qs.cx - player.cx, qs.cy - (player.cy - 250)));
  }
  check('④ 半血后进飞行态(离地>100px 的 tick>100)', airTicks > 100, airTicks);
  check('④ 结束时仍在空中', !groundedEnd, [Math.round(qs.y + qs.h), FLOOR]);
  check('④ FlyMovement 收敛玩家上方 250', minHover < 200, Math.round(minHover));
  check('④ 掉血撒仆从(vanilla 658-660,数据缺→史莱姆族兜底 535/537/16)',
    enemies.some((n) => n !== qs && [658, 659, 660, 535, 537, 16].includes(n.vanillaId ?? -1)),
    enemies.filter((n) => n !== qs).map((n) => n.vanillaId));
}
// ⑤ 白天不自毁
console.log('== Daytime survival ==');
world.clock.timeOfDay = 0.5; // 白天
{
  enemies.length = 0; projectiles.length = 0;
  const cult = Enemy.fromVanilla(439, 100 * 16, 120 * 16)!; cult.id = 1; enemies.push(cult);
  const em = Enemy.fromVanilla(636, 100 * 16, 100 * 16)!; em.id = 50; enemies.push(em);
  const qs = Enemy.fromVanilla(657, 100 * 16, 140 * 16)!; qs.id = 51; enemies.push(qs);
  for (let i = 0; i < 300; i++) {
    lunaticCultistAI(cult, game, player as never);
    empressOfLightAI(em, game, player as never);
    queenSlimeAI(qs, game, player as never);
  }
  check('⑤ 邪教徒白天不自毁', !cult.dead);
  check('⑤ 光女白天不逃不毁', !em.dead && em.ai0 !== 13, em.ai0);
  check('⑤ 史后白天不自毁', !qs.dead);
}
console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
