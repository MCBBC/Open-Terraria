// 机械三王冒烟:双子 125/126、Prime 127+4 部件、毁灭者 134+80 段链
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';

const st = new TileStore(200, 300);
const world = new World(200, 300, 1, 't');
world.store = st;
world.groundLevel = 60;
world.rockLevel = 190;
for (let x = 0; x < 200; x++) st.setTileSilent(x, 150, 1); // 地板
const enemies: Enemy[] = [];
const projectiles: unknown[] = [];
const game = {
  world,
  player: { cx: 100 * 16, cy: 140 * 16, x: 100 * 16 - 10, y: 140 * 16, w: 20, h: 42, dead: false } as never,
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
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };
const run = (ticks: number) => { for (let i = 0; i < ticks; i++) for (const e of [...enemies]) e.fixedUpdate(1 / 60, game); };
world.clock.timeOfDay = 0.0; // 夜晚

// 1) 双子 125(雷神之眼)
console.log('== Twins 125 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const twin = Enemy.fromVanilla(125, 100 * 16, 80 * 16)!;
  twin.id = 1; enemies.push(twin);
  run(1);
  check('初始化 ai0=0', twin.ai0 === 0, twin.ai0);
  run(300);
  check('悬浮靠拢玩家上方', Math.abs(twin.cx - 100 * 16) < 500 && twin.cy < 140 * 16, [Math.round(twin.cx / 16), Math.round(twin.cy / 16)]);
  check('悬浮态 ai1=0', twin.ai1 === 0, twin.ai1);
  twin.ai2 = 599;
  run(1);
  check('600t 切冲撞', twin.ai1 === 1, twin.ai1);
  run(300); // 一阶段 4 连冲(每轮 1+70t),300t 后应回悬浮
  check('4 连冲后回悬浮', twin.ai1 === 0, [twin.ai1, twin.ai3]); // ai3=悬浮弹幕计数(原版 ai[3] 双用,合法)
  check('旋转角有值', Math.abs(twin.spin) > 0.01, twin.spin.toFixed(2));
  // 打到 40% 以下 → 变身(各 100t)→ 三阶段
  twin.hp = twin.maxHp * 0.3;
  run(220);
  check('变身进三阶段 ai0=3', twin.ai0 === 3, twin.ai0);
  check('三阶段伤害×1.5', twin.def.damage === Math.round(Enemy.fromVanilla(125, 0, 0)!.def.damage * 1.5), twin.def.damage);
  const before = projectiles.length;
  run(200);
  check('三阶段发射激光', projectiles.length > before, projectiles.length);
}
// 2) 魔神之眼 126
console.log('== Twins 126 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const spaz = Enemy.fromVanilla(126, 100 * 16, 80 * 16)!;
  spaz.id = 1; enemies.push(spaz);
  run(400);
  check('悬浮移动/存活', !spaz.dead && Math.abs(spaz.vx) + Math.abs(spaz.vy) > 0.01, [spaz.vx.toFixed(2), spaz.vy.toFixed(2)]);
  spaz.hp = spaz.maxHp * 0.3;
  run(220);
  check('变身进三阶段', spaz.ai0 === 3, spaz.ai0);
  const before = projectiles.length;
  run(100);
  check('三阶段火焰弹幕', projectiles.length > before, projectiles.length);
}
// 3) Prime 127 + 部件
console.log('== Prime 127 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const head = Enemy.fromVanilla(127, 100 * 16, 100 * 16)!;
  head.id = 1; enemies.push(head);
  run(1);
  const parts = enemies.filter((e) => e.vanillaId && e.vanillaId >= 128 && e.vanillaId <= 131);
  check('生成 4 部件', parts.length === 4, parts.map((p) => p.vanillaId));
  check('部件锚定头 id', parts.every((p) => p.ai1 === head.id));
  check('部件侧别 ±1', parts.some((p) => p.ai0 === -1) && parts.some((p) => p.ai0 === 1));
  check('130/131 ai3=150 预热', enemies.filter((e) => e.vanillaId === 130 || e.vanillaId === 131).every((p) => p.ai3 === 150));
  run(300);
  check('头悬浮 ai1=0 且逼近', head.ai1 === 0 && Math.abs(head.cy - 140 * 16) < 500, [head.ai1, Math.round(head.cy / 16)]);
  head.ai2 = 599;
  run(2);
  check('600t 切旋冲', head.ai1 === 1, head.ai1);
  check('旋冲防伤×2', head.def.defense === (Enemy.fromVanilla(127, 0, 0)!.def.defense ?? 0) * 2, head.def.defense);
  // 白天 → 狂暴
  world.clock.timeOfDay = 0.5;
  run(2);
  check('白天狂暴 ai1=2', head.ai1 === 2, head.ai1);
  check('狂暴伤/防 9999', head.def.damage === 9999 && head.def.defense === 9999, [head.def.damage, head.def.defense]);
  world.clock.timeOfDay = 0.0;
  // 头死 → 部件自毁
  head.dead = true;
  run(2);
  check('头死部件自毁', enemies.filter((e) => e.vanillaId && e.vanillaId >= 128 && e.vanillaId <= 131).every((p) => p.dead));
}
// 4) 毁灭者 134 + 80 段链
console.log('== Destroyer 134 ==');
{
  enemies.length = 0; projectiles.length = 0;
  const head = Enemy.fromVanilla(134, 100 * 16, 100 * 16)!;
  head.id = 1; enemies.push(head);
  run(1);
  const segs = enemies.filter((e) => e.vanillaId === 135 || e.vanillaId === 136);
  check('生成 80 段链', segs.length === 80, segs.length);
  check('尾段 136 存在', segs.some((s) => s.vanillaId === 136));
  run(200);
  // 段链收缩跟随:每段与前段距离 ≈ 44(linkDist)~44+每tick头位移
  let maxDist = 0;
  for (const s of segs) {
    const f = s.wormFollow!;
    maxDist = Math.max(maxDist, Math.hypot(f.cx - s.cx, f.cy - s.cy));
  }
  check('链距收缩 ≤ 60px', maxDist <= 60, Math.round(maxDist));
  check('头在移动', Math.abs(head.vx) + Math.abs(head.vy) > 0.1, [head.vx.toFixed(2), head.vy.toFixed(2)]);
  // 白天下坠过岩石层 → 整链消散
  world.clock.timeOfDay = 0.5;
  head.y = 200 * 16; // 已过 rockLevel(190)
  head.vy = 0;
  run(2);
  check('白天过岩石层整链消散', enemies.every((e) => e.dead));
}
console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
