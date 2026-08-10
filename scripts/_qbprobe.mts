// 蜂后 222 + 世纪之花 262/261/263/265 冒烟(模板照抄 _mechprobe.mts)
// aiStyle 43/50/51/52 尚未接入 Enemy.fixedUpdate(主会话统一接线)→ 此处手工分发
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { queenBeeAI, planteraHookAI, planteraAI, planteraTentacleAI } from '../src/entities/bossAI_queenbee_plantera.ts';
import type { GameHooks } from '../src/entities/types.ts';

const st = new TileStore(200, 300);
const world = new World(200, 300, 1, 't');
world.store = st;
world.groundLevel = 60;
world.rockLevel = 190;
for (let x = 0; x < 200; x++) st.setTileSilent(x, 150, 1); // 地板
const enemies: Enemy[] = [];
const projectiles: Array<{ projId: number }> = [];
const P = { cx: 100 * 16, cy: 140 * 16, x: 100 * 16 - 10, y: 140 * 16, w: 20, h: 42, dead: false };
const game = {
  world,
  player: P as never,
  enemies: () => enemies,
  spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
  onEnemyKilled: () => {}, spawnEnemy: () => {}, notifyInventoryChanged: () => {}, showPickupLabel: () => {},
  spawnParticles: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  entities: (() => {
    const wrap = {
      nextId: 2,
      add: (e: Enemy, b?: string) => {
        e.id = wrap.nextId++;
        if (b === 'projectiles') projectiles.push(e as unknown as { projId: number }); else enemies.push(e);
      },
    };
    return wrap;
  })(),
} as never;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };
/** 手工分发(aiStyle 43/50/51/52 → 新核;其余走 Enemy.fixedUpdate) */
const run = (ticks: number) => {
  for (let i = 0; i < ticks; i++) {
    for (const e of [...enemies]) {
      const style = e.vanilla?.aiStyle;
      const p = (game as unknown as { player: never }).player;
      if (style === 43) queenBeeAI(e, game as unknown as GameHooks, p);
      else if (style === 50) planteraHookAI(e, game as unknown as GameHooks, p);
      else if (style === 51) planteraAI(e, game as unknown as GameHooks, p);
      else if (style === 52) planteraTentacleAI(e, game as unknown as GameHooks, p);
      else e.fixedUpdate(1 / 60, game);
    }
  }
};
world.clock.timeOfDay = 0.0; // 夜晚

// 1) 蜂后 222:状态循环(悬浮→俯冲→减速)
console.log('== QueenBee 222 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const qb = Enemy.fromVanilla(222, 100 * 16 - 300, 140 * 16)!;
  qb.id = 1; enemies.push(qb);
  run(1);
  check('首帧 ai0 复位 0', qb.ai0 === 0, qb.ai0);
  check('悬浮判定后俯冲(ai1 奇)', qb.ai1 === 1, qb.ai1);
  check('俯冲速度 ≈12', Math.hypot(qb.vx, qb.vy) > 10, Math.hypot(qb.vx, qb.vy).toFixed(2));
  const states = new Set<number>();
  const parity = new Set<number>();
  let maxSpd = 0;
  for (let i = 0; i < 700; i++) {
    run(1);
    states.add(qb.ai0);
    if (qb.ai0 === 0) parity.add(qb.ai1 % 2);
    maxSpd = Math.max(maxSpd, Math.hypot(qb.vx, qb.vy));
  }
  check('悬浮(偶)/冲撞后(奇)循环', parity.has(0) && parity.has(1), [...parity]);
  check('状态机离开悬浮进入下一招', states.has(2) || states.has(3) || states.has(1), [...states]);
  check('存活且持续机动', !qb.dead && maxSpd > 10, maxSpd.toFixed(2));
  run(2500);
  const bees = enemies.filter((e) => e.vanillaId === 210 || e.vanillaId === 211);
  const stingers = projectiles.filter((p) => p.projId === 719);
  check('生成过蜜蜂或毒刺弹幕', bees.length > 0 || stingers.length > 0, [bees.length, stingers.length]);
  // 强制毒刺弹幕态:位于玩家上方,40t 一发 719
  qb.ai0 = 3; qb.ai1 = 0;
  qb.x = 100 * 16 - qb.w / 2; qb.y = 140 * 16 - 400;
  const before = projectiles.length;
  run(200);
  check('毒刺弹幕 719', projectiles.length > before && projectiles.slice(before).some((p) => p.projId === 719),
    projectiles.slice(before).map((p) => p.projId));
}
// 2) 孢子漂移族 aiStyle 50:261 撞墙即碎 / 265 穿墙存活
console.log('== Spore 261/265 (aiStyle 50) ==');
{
  enemies.length = 0; projectiles.length = 0;
  const fungi = Enemy.fromVanilla(261, 90 * 16, 145 * 16)!;
  fungi.id = 1; enemies.push(fungi);
  run(30);
  check('261 朝玩家 X 漂移', fungi.vx > 0.05, fungi.vx.toFixed(2));
  run(600);
  check('261 落地即碎', fungi.dead, Math.round(fungi.y / 16));
  const spore = Enemy.fromVanilla(265, 90 * 16, 145 * 16)!;
  spore.id = 2; enemies.push(spore);
  run(400);
  check('265 穿墙不碎且持续漂移', !spore.dead && spore.y > 145 * 16, Math.round(spore.y / 16));
  check('265 旋转 = vx*0.2', Math.abs(spore.spin) > 0.001, spore.spin.toFixed(3));
}
// 3) 世纪之花 262 + 钩蔓 263:牵引位移 / 一阶段弹幕 / 二阶段
console.log('== Plantera 262 + Hook 263 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const pt = Enemy.fromVanilla(262, 100 * 16 - 600, 100 * 16)!;
  pt.id = 1; enemies.push(pt);
  run(1);
  const hooks = enemies.filter((e) => e.vanillaId === 263);
  check('生成 3 钩蔓 263', hooks.length === 3, hooks.length);
  run(20);
  check('钩蔓抓到锚点 tile', hooks.every((h) => h.ai0 > 0 && h.ai1 > 0),
    hooks.map((h) => [h.ai0, h.ai1]));
  check('钩蔓朝锚点移动', hooks.every((h) => Math.hypot(h.vx, h.vy) > 0.1),
    hooks.map((h) => Math.hypot(h.vx, h.vy).toFixed(1)));
  const sx = pt.cx, sy = pt.cy;
  run(240);
  check('本体被钩蔓牵引位移', Math.hypot(pt.cx - sx, pt.cy - sy) > 40,
    [Math.round(pt.cx - sx), Math.round(pt.cy - sy)]);
  check('钩蔓锚定本体存活', hooks.every((h) => !h.dead && h.hp === h.maxHp));
  check('钩蔓朝本体旋转', hooks.every((h) => Math.abs(h.spin) > 0.01),
    hooks.map((h) => h.spin.toFixed(2)));
  check('一阶段防 36 伤 50', pt.def.defense === 36 && pt.def.damage === 50, [pt.def.defense, pt.def.damage]);
  const before = projectiles.length;
  run(400);
  check('一阶段种子弹幕 275/276/277', projectiles.length > before,
    projectiles.slice(before).map((p) => p.projId));
  // 4) 半血以下 → 二阶段
  pt.hp = pt.maxHp * 0.4;
  run(2);
  check('二阶段防 10 伤 70', pt.def.defense === 10 && pt.def.damage === 70, [pt.def.defense, pt.def.damage]);
  const tents = enemies.filter((e) => e.vanillaId === 264 && !e.dead);
  check('生成 8 触须 264', tents.length === 8, tents.length);
  let path = 0, lx = pt.cx, ly = pt.cy;
  // 玩家静立时本体贴住目标点会 idle(原版同语义)→ 移动玩家验证二阶段自主追击
  P.cx = 130 * 16; P.x = 130 * 16 - 10;
  for (let i = 0; i < 240; i++) {
    run(1);
    path += Math.hypot(pt.cx - lx, pt.cy - ly);
    lx = pt.cx; ly = pt.cy;
  }
  check('二阶段自主移动(提速 5/7)', path > 100, Math.round(path));
  run(1200);
  check('二阶段孢子 265 生成', enemies.some((e) => e.vanillaId === 265 && !e.dead),
    enemies.filter((e) => e.vanillaId === 265).length);
  // 5) 本体消失 → 钩蔓自毁(原版 StrikeNPCNoInteraction 9999)
  pt.dead = true;
  run(2);
  check('本体消失钩蔓自毁', enemies.filter((e) => e.vanillaId === 263).every((h) => h.dead));
}
console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
