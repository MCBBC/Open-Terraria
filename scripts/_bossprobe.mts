// Boss AI 冒烟:骷髅王(双手)/史莱姆王/克脑(爬行者)核心行为采样
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';

const st = new TileStore(80, 200);
const world = new World(80, 200, 1, 't');
world.store = st;
for (let x = 0; x < 80; x++) st.setTileSilent(x, 150, 1); // 地板
const enemies: Enemy[] = [];
const game = {
  world,
  player: { cx: 40 * 16, cy: 140 * 16, x: 40 * 16 - 10, y: 140 * 16, w: 20, h: 42, dead: false } as never,
  spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {}, cutTile: () => {},
  onEnemyKilled: () => {}, spawnEnemy: () => {}, enemies: () => enemies,
  spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {}, playSfxFiles: () => {},
  showPickupLabel: () => {}, add: (e: Enemy) => { e.id = enemies.length + 1; enemies.push(e); },
} as never;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, x?: unknown) => { if (c) { ok++; console.log('  ✓ ' + n); } else { bad++; console.log('  ✗ ' + n, x ?? ''); } };

// 1) 骷髅王 + 双手
console.log('== Skeletron 35 ==');
{
  enemies.length = 0;
  const head = Enemy.fromVanilla(35, 40 * 16, 60 * 16)!;
  head.despawnTimer = -1; // 触发初始化标记
  head.id = 1; enemies.push(head);
  world.clock.timeOfDay = 0.0; // 夜晚(白天会切守卫态)
  head.fixedUpdate(1 / 60, game); // 初始化 tick → 应生成 2 手
  check('初始化生成 2 双手', enemies.filter((e) => e.vanillaId === 36).length === 2, enemies.length);
  const hands = enemies.filter((e) => e.vanillaId === 36);
  // 跑 300t:悬浮态,头应移向玩家上方
  for (let i = 0; i < 300; i++) for (const e of enemies) e.fixedUpdate(1 / 60, game);
  check('悬浮态 ai1=0', head.ai1 === 0, head.ai1);
  check('头向玩家靠拢', Math.abs(head.cx - 40 * 16) < 600, Math.round(head.cx / 16));
  // 手锚定存活
  check('双手跟随存活', hands.every((h) => !h.dead));
  // ai2>=800 → 冲撞
  head.ai2 = 799; head.fixedUpdate(1 / 60, game);
  check('800t 后切冲撞态', head.ai1 === 1, head.ai1);
  // 白天 → 守卫
  world.clock.timeOfDay = 0.5;
  head.fixedUpdate(1 / 60, game);
  check('白天切守卫态(离场)', head.ai1 === 2, head.ai1);
}
// 2) 史莱姆王
console.log('== King Slime 50 ==');
{
  enemies.length = 0;
  const ks = Enemy.fromVanilla(50, 40 * 16, 140 * 16)!;
  ks.id = 1; enemies.push(ks);
  ks.y = 148 * 16;
  let minY = ks.y, maxY = ks.y;
  for (let i = 0; i < 240; i++) {
    for (const e of enemies) e.fixedUpdate(1 / 60, game);
    minY = Math.min(minY, ks.y); maxY = Math.max(maxY, ks.y);
  }
  check('大跳起伏(峰值差 > 80px)', maxY - minY > 80, Math.round(maxY - minY));
  const slimeSpawned = enemies.some((e) => e !== ks && e.vanillaId === 16);
  check('落地刷小史莱姆(概率性,240t 内)', slimeSpawned, enemies.length);
}
// 3) 克脑
console.log('== Brain 266 ==');
{
  enemies.length = 0;
  const b = Enemy.fromVanilla(266, 40 * 16, 100 * 16)!;
  b.despawnTimer = -1;
  b.id = 1; enemies.push(b);
  b.fixedUpdate(1 / 60, game); // 初始 → 应补 8 爬行者
  check('初始生成爬行者环', enemies.filter((e) => e.vanillaId === 267).length === 8, enemies.length);
  for (let i = 0; i < 100; i++) for (const e of enemies) e.fixedUpdate(1 / 60, game);
  check('一阶段脑体无敌帧', b.iframes > 0, b.iframes);
  // 清爬行者 → 二阶段
  for (const c of enemies.filter((e) => e.vanillaId === 267)) c.dead = true;
  enemies.splice(0, enemies.length, b);
  for (let i = 0; i < 120; i++) b.fixedUpdate(1 / 60, game);
  check('二阶段冲刺移动', Math.abs(b.vx) > 1 || Math.abs(b.vy) > 1, [Math.round(b.vx), Math.round(b.vy)]);
}
console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
