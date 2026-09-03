// 猪龙鱼公爵 370 全链专项（2026-09-03 补全立项批验收）：
//   AI_069 状态机（出生 -1 → 一阶段 0/1/2/3 → 半血变身 4 → 二阶段 5/6/7/8 →
//   expert 15% 血 flag2 → 9 二段变身 → 10-13 狂暴段）/伤害防御相位修正/狂暴界
//   /鲨鱼 AI_071（372/373 蓄力 90t→16 速扑咬→撞块即死;373 摆头 spriteDirection
//   与 rotation 耦合——direction/spriteDirection 双字段,2026-09-03 批4 校正）
//   /泡泡弹 371 生成节拍/掉落药水面/音乐槽位。
//   ★悬浮时长口径：num3 基值 60,但 flag5&&!flag3&&flag4 档覆写 30（:49183-49186,
//     一阶段 ai3<10 时=30t/二阶段 flag3&&flag5=20t/其余回 60t）——曾按基值 60 驱动。
// 参照：NPC.cs:49143-50127(AI_069) / :35196-35328(AI_071) / :80345-80370(药水心)
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { dukeFishronAI, sharkronAI } from '../src/entities/bossAI_duke_moonlord';
import { rollBossPotionsAndHearts } from '../src/drops/NpcDrops';
import { BOSS_MUSIC, MUSIC_SLOT, bossMusicFor } from '../src/data/Music';
import type { RNG } from '../src/core/rng';
import type { GameHooks } from '../src/entities/types';

// 悬浮窗（非狂暴）条件：800 ≤ player.y(px) ≤ worldSurface px、玩家在两侧 400 格
// 海洋带内（W=120 格=1920px < 6400px → 第三条件恒假）。groundLevel=60 格。
const W = 120, H = 260;

function makeWorld(difficulty = 0): World {
  const w = new World(W, H, 7, 'duke-test');
  w.groundLevel = 60;
  w.difficulty = difficulty;
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const projectiles: unknown[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: { has: () => false } as unknown as never,
  };
  const hooks = {
    world, player,
    scene: {},
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: typeof em }).entities = em;
  return { hooks, enemies, projectiles, player };
}

/** 逐 tick 驱动猪鲨 AI */
function tickDuke(e: Enemy, hooks: GameHooks, n: number): void {
  const p = (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player;
  for (let i = 0; i < n; i++) dukeFishronAI(e, hooks, p);
}
function tickShark(e: Enemy, hooks: GameHooks, n: number): void {
  const p = (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player;
  for (let i = 0; i < n; i++) sharkronAI(e, hooks, p);
}

/** 出生段（75t）驱动完毕 */
function pastSpawn(e: Enemy, hooks: GameHooks): void {
  tickDuke(e, hooks, 75);
}

describe('AI_069 猪鲨状态机', () => {
  it('出生段 -1：无敌真旗标,75t 后进入一阶段悬浮', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    tickDuke(e, hooks, 1);
    expect(e.ai0).toBe(-1);
    expect(e.dontTakeDamage).toBe(true);        // :49365 invuln(台账①真旗标)
    tickDuke(e, hooks, 30);
    expect(e.ai0).toBe(-1);                     // 出生未完
    tickDuke(e, hooks, 44);                     // 累计 75t
    expect(e.ai0).toBe(0);                      // :49412 → 悬浮
    tickDuke(e, hooks, 1);                      // 转换拍尾句仍赋出生态 invuln,下一拍清
    expect(e.dontTakeDamage).toBe(false);       // 悬浮态可受击
  });

  it('一阶段悬浮 30t(flag5&&!flag3 档) → 冲撞 16 速 → 30t 回悬浮且 ai3+2', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    pastSpawn(e, hooks);
    expect(e.ai3).toBe(0);
    tickDuke(e, hooks, 30);                     // 悬浮计时满(:49183 num3=30)
    expect(e.ai0).toBe(1);                      // 冲撞(:49503 dukeCharge)
    const spd = Math.hypot(e.vx, e.vy);
    expect(Math.abs(spd - 16)).toBeLessThan(0.01);  // num7=16
    tickDuke(e, hooks, 30);
    expect(e.ai0).toBe(0);                      // :49564 回悬浮
    expect(e.ai3).toBe(2);                      // :49565 ai3 += 2
    expect(e.def.damage).toBe(100);             // 经典一阶段无相位修正
    expect(e.def.defense).toBe(50);
  });

  it('五次冲撞后(a3=10)转泡泡弹幕：80t 每 4t 吐一颗 371(共 20)', () => {
    const { hooks, enemies } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    pastSpawn(e, hooks);
    for (let i = 0; i < 5; i++) tickDuke(e, hooks, 60);   // 悬浮30+冲撞30,ai3→10
    expect(e.ai3).toBe(10);
    tickDuke(e, hooks, 60);                     // 悬浮满(flag5 假 → num3=60)→ pick 泡泡
    expect(e.ai0).toBe(2);
    expect(e.ai3).toBe(1);                      // :49481 e.ai3 = 1
    tickDuke(e, hooks, 80);                     // 泡泡段走完
    expect(e.ai0).toBe(0);
    const bubbles = enemies.filter((n) => n.vanillaId === 371);
    expect(bubbles.length).toBe(20);            // ai2=0,4,…,76
  });

  it('鲨鱼龙卷(3)：ai2==60 发两发 385 斜落弹,90t 后回悬浮', () => {
    const { hooks, projectiles } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    pastSpawn(e, hooks);
    e.ai3 = 11;                                  // 测试捷径:置于龙卷 pick 档(a3=11 → pick3)
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0;
    tickDuke(e, hooks, 60);                      // 悬浮满(a3=11 flag5 假 → 60t)→ ai0=3,ai3=0
    expect(e.ai0).toBe(3);
    expect(e.ai3).toBe(0);                       // :49484 e.ai3 = 0
    tickDuke(e, hooks, 61);                      // 越过 ai2==60 发射窗
    expect(projectiles.length).toBe(2);          // :49646-49651 左右两发 385
    tickDuke(e, hooks, 30);                      // ai2 累计 91 ≥ 90
    expect(e.ai0).toBe(0);                       // :49657 90t 满回悬浮
  });

  it('半血变身(4)：无敌 180t → 二阶段(5);相位修正 dmg×1.2/def×0.8', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    pastSpawn(e, hooks);
    e.hp = e.maxHp * 0.5;                        // :49499 ≤50% → pick 4
    tickDuke(e, hooks, 30);                      // 悬浮满 → 变身态
    expect(e.ai0).toBe(4);
    tickDuke(e, hooks, 1);                       // dontTakeDamage=!flag7 在 AI 尾句、态 4 首拍置位
    expect(e.dontTakeDamage).toBe(true);         // :49661 invuln
    tickDuke(e, hooks, 180);
    expect(e.ai0).toBe(5);                       // :49677 → 二阶段
    expect(e.def.damage).toBe(120);              // flag3 ×1.2(:49153-49156)
    expect(e.def.defense).toBe(40);              // flag3 ×0.8
  });

  it('expert flag2（血≤15%）→ 二段变身(9) 180t → 狂暴段(10) def=0/dmg×1.1', () => {
    const { hooks } = makeHooks(makeWorld(1), { x: 20, y: 55 });   // difficulty=1 expert
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    pastSpawn(e, hooks);
    e.hp = e.maxHp * 0.5;
    tickDuke(e, hooks, 30 + 180);                // 变身 → 二阶段悬浮
    expect(e.ai0).toBe(5);
    e.hp = e.maxHp * 0.15;                       // flag2 血线(:49300)
    tickDuke(e, hooks, 20);                      // 二阶段悬浮(hoverT=20)
    expect(e.ai0).toBe(9);                       // :49908-49910 flag2 → num33=4 → 9
    tickDuke(e, hooks, 1);                       // 态 9 首拍置 invuln(尾句赋值)
    expect(e.dontTakeDamage).toBe(true);
    tickDuke(e, hooks, 180);                     // 二段变身(:49886-49931)
    expect(e.ai0).toBe(10);                      // 狂暴段悬浮
    expect(e.def.defense).toBe(0);               // flag4 def=0(:49153-49155)
    expect(e.def.damage).toBe(110);              // flag4 ×1.1
  });

  it('狂暴界（太空/地下/离海洋带）伤害防御 ×2', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 3 });     // y=3 格=太空
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    tickDuke(e, hooks, 76);                      // 出生完(狂暴不缩短出生)
    expect(e.def.damage).toBe(200);              // :49161-49164 enraged ×2
    expect(e.def.defense).toBe(100);
  });

  it('相位修正按首 tick 基值派生（WeakMap 基值不被膨胀）', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    tickDuke(e, hooks, 1);                       // 首 tick 固化基值(真实流程=SetDefaults 后)
    e.ai0 = 5; e.bInit = true;                   // 强置二阶段
    tickDuke(e, hooks, 2);
    expect(e.def.damage).toBe(120);              // round(100×1.2)
    tickDuke(e, hooks, 20);
    expect(e.def.damage).toBe(120);              // 幂等(基值缓存,非逐帧复乘)
  });
});

describe('AI_071 鲨鱼龙卷 372/373', () => {
  it('蓄力 90t → 16 速扑咬,扑咬窗解除无敌', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 30, y: 55 });
    const e = Enemy.fromVanilla(372, 20 * TILE, 52 * TILE)!;
    tickShark(e, hooks, 1);
    expect(e.ai0).toBe(0);
    expect(e.dontTakeDamage).toBe(true);         // 蓄力段无敌(:35211)
    tickShark(e, hooks, 90);
    expect(e.ai0).toBe(1);                       // :35242 蓄力期满
    const spd = Math.hypot(e.vx, e.vy);
    expect(Math.abs(spd - 16)).toBeLessThan(0.01);   // :35255 ×16
    expect(e.dontTakeDamage).toBe(false);        // :35381 起扑生效拍解除
  });

  it('撞实心块即死（DeathSound 后消散）', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w, { x: 30, y: 55 });
    const e = Enemy.fromVanilla(372, 30 * TILE, 52 * TILE)!;
    // 直接置扑咬态 ai0=1,ai1=1（扑咬窗生效）并卡进实心块
    e.bInit = true; e.ai0 = 1; e.ai1 = 1; e.spawnAlpha = 150;
    w.store.setTile(30, 52, 1);                  // dirt 墙
    tickShark(e, hooks, 1);
    expect(e.dead).toBe(true);                   // :35295-35303 life=0 即散
  });

  it('373 蓄力摆头：spriteDirection 按 cos 符号翻转,rotation=vy·sdir·0.1 钳 ±0.2', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 30, y: 55 });
    const e = Enemy.fromVanilla(373, 20 * TILE, 52 * TILE)!;
    e.ai2 = 100; e.ai3 = -1.5;                   // 出鲨参数(:29982-29985 幅宽+升速)
    tickShark(e, hooks, 1);
    // l1=1: cos(π/30)−0.5 ≈ 0.4945 > 0.25 → sdir=−1(:35219-35221)
    expect(e.sharkronSdir).toBe(-1);
    expect(Math.abs(e.spin - 0.15)).toBeLessThan(1e-9);  // vy·sdir·0.1 = −1.5·−1·0.1
    // l1=13: cos(13π/30)−0.5 ≈ −0.291 → |c|>0.25 → sdir=1
    tickShark(e, hooks, 12);
    expect(e.sharkronSdir).toBe(1);
    expect(Math.abs(e.spin - (-0.15))).toBeLessThan(1e-9); // −1.5·1·0.1 = −0.15
    // 钳位:vy·sdir·0.1 = 0.15 < 0.2 恒不触钳——改大升速验证钳
    const e2 = Enemy.fromVanilla(373, 20 * TILE, 52 * TILE)!;
    e2.ai2 = 100; e2.ai3 = -4;                   // −4·−1·0.1 = 0.4 → 钳 0.2
    tickShark(e2, hooks, 1);
    expect(Math.abs(e2.spin - 0.2)).toBeLessThan(1e-9);
  });

  it('372 蓄力段无摆头无旋转:sdir 恒 -1、spin 恒 0', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 30, y: 55 });
    const e = Enemy.fromVanilla(372, 20 * TILE, 52 * TILE)!;
    tickShark(e, hooks, 40);
    expect(e.sharkronSdir).toBe(-1);             // 字段缺省,372 不写(:35219 仅 373)
    expect(e.spin).toBe(0);                      // :35222 rotation 写在 373 块内
  });

  it('373 蓄力段横游位移差 = [cos(l1)−cos(l1−1)]·ai2·(−direction)', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 30, y: 55 });
    const e = Enemy.fromVanilla(373, 20 * TILE, 52 * TILE)!;
    e.ai2 = 100; e.ai3 = -1.5;
    const x0 = e.x;
    tickShark(e, hooks, 3);
    // 三 tick 累计:l1 0→3 的位移差和(方向乘子 −facing,facing 出生 1)
    const k = Math.PI / 30;
    let want = 0;
    for (let l1 = 1; l1 <= 3; l1++) {
      want += ((Math.cos(k * l1) - 0.5) - (Math.cos(k * (l1 - 1)) - 0.5)) * 100 * -1;
    }
    expect(Math.abs(e.x - x0 - want)).toBeLessThan(1e-9);
  });

  it('扑咬态入块渐显：in-solid −15(钳150) 与扑咬窗 −60 同拍叠加', () => {
    const w = makeWorld();
    const { hooks } = makeHooks(w, { x: 30, y: 55 });
    const e = Enemy.fromVanilla(372, 31 * TILE, 52 * TILE)!;
    w.store.setTile(31, 52, 1);                  // 出生即在实心块
    tickShark(e, hooks, 1);
    expect(e.spawnAlpha).toBe(255);              // 蓄力段 372 无 alpha 写
    e.ai0 = 1; e.ai1 = 1;                        // 强置扑咬生效
    tickShark(e, hooks, 1);
    // 原版同拍双写(:35280-35284 −=15 → :35285+ −=60)：255−15−60=180
    // （极性校正回归:曾 min(150,+15) 直接跳 150）
    expect(e.spawnAlpha).toBe(180);
    tickShark(e, hooks, 1);
    expect(e.spawnAlpha).toBe(105);              // max(150,180−15)=165 −60
    tickShark(e, hooks, 1);
    expect(e.spawnAlpha).toBe(90);               // 钳 150 后 −60
  });
});

describe('掉落/音乐外围', () => {
  it('boss 药水+心（DoDeathEvents_DropBossPotionsAndHearts :79790 case 370 → 强效治疗 499）', () => {
    const drops: Array<{ id: number; n: number }> = [];
    for (let i = 0; i < 40; i++) {
      drops.push(...rollBossPotionsAndHearts({
        rng: { int: (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1)) } as unknown as RNG,
        type: 370, netId: 370,
      } as Parameters<typeof rollBossPotionsAndHearts>[0]));
    }
    const potions = drops.filter((d) => d.id === 499);
    expect(potions.length).toBe(40);             // 每杀必掉
    for (const p of potions) expect(p.n).toBeGreaterThanOrEqual(5);
    const hearts = drops.filter((d) => d.id === 58);
    expect(hearts.length).toBeGreaterThanOrEqual(40 * 5);   // 5-9 颗
  });

  it('boss 音乐槽位：370 → DukeFishron 58（Main.cs:12371-12508 槽 15）', () => {
    expect(BOSS_MUSIC[370]).toBe(58);
    expect(MUSIC_SLOT[370]).toBe(15);
    expect(bossMusicFor(370)).toBe(58);
  });
});
