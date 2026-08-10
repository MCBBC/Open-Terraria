// 猪鲨鱼龙 370(AI_069)+ 月亮领主 398/397/396(aiStyle 77/78/79)冒烟探针
// 直接驱动 bossAI_duke_moonlord 的导出 AI(Enemy.ts 分发由主会话统一接线,此处不依赖)
import { Enemy } from '../src/entities/Enemy.ts';
import { TileStore } from '../src/world/TileStore.ts';
import { World } from '../src/world/World.ts';
import { dukeFishronAI, dukeBubbleAI, moonLordCoreAI, moonLordHandAI, moonLordHeadAI } from '../src/entities/bossAI_duke_moonlord.ts';

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
  player: null as never,
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

/** 玩家桩(x/y tile 坐标可变) */
const mkPlayer = (tx: number, ty: number) => ({
  x: tx * 16, y: ty * 16, w: 20, h: 42,
  cx: tx * 16 + 10, cy: ty * 16 + 21, vx: 0, vy: 0, dead: false,
});
let player: ReturnType<typeof mkPlayer> = mkPlayer(100, 140);
(game as unknown as { player: unknown }).player = player;

/** aiStyle 局部分发(等同主会话将接入 Enemy.fixedUpdate 的映射) */
const aiByStyle: Record<number, (e: Enemy, g: never, p: unknown) => void> = {
  69: (e, g, p) => dukeFishronAI(e, g as never, p as never),
  70: (e, g, p) => dukeBubbleAI(e, g as never, p as never),
  77: (e, g, p) => moonLordCoreAI(e, g as never, p as never),
  78: (e, g, p) => moonLordHandAI(e, g as never, p as never),
  79: (e, g, p) => moonLordHeadAI(e, g as never, p as never),
};
const run = (ticks: number) => {
  for (let i = 0; i < ticks; i++) {
    for (const e of [...enemies]) {
      if (e.dead) continue;
      // 模拟 Enemy.fixedUpdate 头段:每 tick 先递减 iframes(直接调 AI 不会走共享尾段)
      if (e.iframes > 0) e.iframes--;
      const fn = aiByStyle[e.vanilla?.aiStyle ?? -1];
      if (fn) fn(e, game as never, player);
    }
  }
};
const movePlayer = (tx: number, ty: number) => {
  player = mkPlayer(tx, ty);
  (game as unknown as { player: unknown }).player = player;
};
world.clock.timeOfDay = 0.0; // 夜晚
const DUKE_T = { spawnPlus: 80 } as const; // 出生 75t + 余量(与源文件 DUKE.spawnT 一致)

// =============== 1) 猪鲨 370 ===============
console.log('== Duke Fishron 370 ==');
{
  movePlayer(100, 55); // 地表上方(非狂暴:不在太空/地下/海洋带外)
  enemies.length = 0; projectiles.length = 0;
  const duke = Enemy.fromVanilla(370, 100 * 16, 30 * 16)!;
  duke.id = 1; enemies.push(duke);
  run(1);
  check('首帧 ai0=-1 出生态', duke.ai0 === -1, duke.ai0);
  run(DUKE_T.spawnPlus); // 出生 75t + 余量
  check('出生后进入悬浮 ai0=0', duke.ai0 === 0, duke.ai0);
  const startProj = projectiles.length;
  const startBub = enemies.filter((e) => e.vanillaId === 371).length;
  run(1400); // 一阶段整循环:5 连冲→泡泡弹→4 冲→鲨鱼龙卷
  check('发生位移', Math.abs(duke.cx - 100 * 16) > 8 || Math.abs(duke.cy - 30 * 16) > 8,
    [Math.round(duke.cx / 16), Math.round(duke.cy / 16)]);
  check('发射过弹幕(385/407)', projectiles.length > startProj, projectiles.length - startProj);
  check('吐过爆裂泡泡(371)', enemies.filter((e) => e.vanillaId === 371).length > startBub,
    enemies.filter((e) => e.vanillaId === 371).length - startBub);
  check('身体旋转角有值', Math.abs(duke.spin) > 0.01, duke.spin.toFixed(2));

  // ② 半血 → 二阶段(4 变身 → 5 循环;伤害 1.2×/防御 0.8×)
  const baseDmg = Enemy.fromVanilla(370, 0, 0)!.def.damage;
  const baseDef = Enemy.fromVanilla(370, 0, 0)!.def.defense ?? 0;
  duke.hp = Math.floor(duke.maxHp * 0.4);
  let entered = false;
  for (let i = 0; i < 400 && !entered; i++) { run(1); if (duke.ai0 === 4 || duke.ai0 >= 5) entered = true; }
  check('半血触发变身(ai0=4/5)', entered, duke.ai0);
  for (let i = 0; i < 400 && duke.ai0 !== 5; i++) run(1);
  check('进入二阶段 ai0=5', duke.ai0 === 5, duke.ai0);
  run(1); // 修正值在状态切换的下一 tick 生效(原版 damage/defense 置顶计算)
  check('二阶段伤害×1.2', duke.def.damage === Math.round(baseDmg * 1.2), [duke.def.damage, baseDmg]);
  check('二阶段防御×0.8', duke.def.defense === Math.round(baseDef * 0.8), [duke.def.defense, baseDef]);
  const p2 = projectiles.length;
  run(1200); // 二阶段循环:3 连冲→旋转泡泡冲刺→龙卷
  check('二阶段持续发射', projectiles.length > p2, projectiles.length - p2);
  const phases = new Set<number>();
  for (let i = 0; i < 1600; i++) { run(1); phases.add(duke.ai0); }
  check('二阶段状态集含 6/7/8', [6, 7, 8].every((s) => phases.has(s)), [...phases].sort().join(','));
}

// =============== 2) 月亮领主 398 核心 + 397 手 + 396 头 ===============
console.log('== Moon Lord 398 ==');
{
  movePlayer(100, 140);
  enemies.length = 0; projectiles.length = 0;
  const core = Enemy.fromVanilla(398, 100 * 16, 80 * 16)!;
  core.id = 1; enemies.push(core);
  run(1);
  check('首帧 ai0=-1 出生演出', core.ai0 === -1, core.ai0);
  run(60); // 60t 演出结束 → 生成部件
  const hands = enemies.filter((e) => e.vanillaId === 397);
  const heads = enemies.filter((e) => e.vanillaId === 396);
  check('生成双手 397×2', hands.length === 2, hands.length);
  check('生成头 396', heads.length === 1, heads.length);
  check('部件锚定核心(ai3=core.id)', [...hands, ...heads].every((p) => p.ai3 === core.id));
  check('双手侧别 ±1(ai2=0/1)', hands.some((h) => h.ai2 === 0) && hands.some((h) => h.ai2 === 1));
  check('核心转 ai0=0 一阶段', core.ai0 === 0, core.ai0);
  const c0 = { x: core.x, y: core.y };
  run(120);
  // ④ 双手+头存活期间核心无敌
  check('部件存活时核心无敌(iframes>0)', core.iframes > 0, core.iframes);
  check('核心向玩家+(0,130)悬停移动', Math.hypot(core.x - c0.x, core.y - c0.y) > 4,
    [Math.round(core.cx / 16), Math.round(core.cy / 16)]);
  // 手部攻击调度:90t 内至少出现一个攻击态(1/2/3)
  const handAtk = new Set<number>();
  for (let i = 0; i < 600; i++) { run(1); for (const h of hands) if (!h.dead) handAtk.add(h.ai0); }
  check('手部进入过攻击态', [1, 2, 3].some((a) => handAtk.has(a)), [...handAtk].join(','));
  const projBefore = projectiles.length;
  run(900);
  check('手/头发射过弹幕(452/454/462)', projectiles.length > projBefore, projectiles.length - projBefore);

  // ⑤ 三部件全部闭眼(ai0=-2)→ 核心解除无敌自主移动
  for (const p of [...hands, ...heads]) { p.hp = 0; }
  run(2);
  check('部件血尽转闭眼残肢 ai0=-2', [...hands, ...heads].every((p) => p.ai0 === -2),
    [...hands, ...heads].map((p) => p.ai0).join(','));
  for (let i = 0; i < 200 && core.ai0 !== 1; i++) run(1);
  check('三部件皆死→核心 ai0=1 二阶段', core.ai0 === 1, core.ai0);
  const c1 = { x: core.x, y: core.y };
  run(300);
  check('二阶段核心自主移动', Math.hypot(core.x - c1.x, core.y - c1.y) > 8,
    [Math.round(core.cx / 16), Math.round(core.cy / 16)]);
  const pb2 = projectiles.length;
  run(700); // 二阶段弹幕表 10 槽(90+90+90+135+90+200+90+375+90+135)
  check('二阶段核心弹幕循环发射', projectiles.length > pb2, projectiles.length - pb2);
  check('二阶段核心可受击(iframes==0)', core.iframes === 0, core.iframes);

  // ⑥ 核心血尽 → ai0=2 死亡演出(600t)→ 真死 → 全族自毁
  core.hp = 0;
  run(1);
  check('核心血尽转 ai0=2 死亡演出', core.ai0 === 2, core.ai0);
  run(601);
  check('600t 演出后核心真死', core.dead === true);
  const family = [...hands, ...heads].filter((p) => !p.dead);
  run(2);
  check('核心死→手/头全数自毁', family.every((p) => p.dead),
    family.filter((p) => !p.dead).map((p) => p.vanillaId).join(','));
}

console.log(`\n结果: ${ok} 通过, ${bad} 失败`);
process.exit(bad ? 1 : 0);
