// BJ310 续刀（2026-09-23，用户追问"猪鲨二阶段形态的贴图、行为正确移植了吗"）：
// 视觉面判谳=旧残影实现结构性偏差（贴图整换≠原版叠层/burst 状态表自造/num335 态表
//   缺/蓝冲刺残影缺）→ drawDukeAfterimages 已逐值重写（Main.cs :24674-24856），本文件
//   钉导出 helper 逐值 + 帧机二阶段面；行为面判谳=参数面 1:1（件 2 已核），本文件补钉
//   ①二阶段 6/7/8 转移序全驱动 ②变身拍一次性面（吼叫×1/无敌 180t/零尘/ai3 归零）
//   ③expert 终怒 10-13 循环序 ④态7 甩泡 ai3 缩放变体。
// 反编译锚：Main.cs :24674-24856（case 370/372/373 绘制）/ NPC.cs :49295-50279（AI_069）
//   / :72937-73031（FindFrame case 370）/ npcFrameCount[370]=8（Main.cs :67493 表）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { dukeFishronAI } from '../src/entities/bossAI_duke_moonlord';
import { dukePhaseTint, dukeTrailCount, dukeBurstParams } from '../src/render/npcExtraParts';
import type { GameHooks } from '../src/entities/types';

const W = 120, H = 260;

function makeWorld(difficulty = 0): World {
  const w = new World(W, H, 7, 'duke-bj310b');
  w.groundLevel = 60;
  w.difficulty = difficulty;
  return w;
}

function makeHooks(world: World, playerAt: { x: number; y: number }) {
  const enemies: Enemy[] = [];
  const sfx: string[] = [];
  const dusts: number[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
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
    spawnDust: (x: number, y: number, w: number, h: number, type: number) => {
      dusts.push(type);
      return null;
    },
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    playSfxWav: (name: string) => { sfx.push(name); },
    showPickupLabel: () => {},
  } as unknown as GameHooks;
  (hooks as unknown as { entities: typeof em }).entities = em;
  return { hooks, enemies, player, sfx, dusts };
}

function tickDuke(e: Enemy, hooks: GameHooks, n: number): void {
  const p = (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player;
  for (let i = 0; i < n; i++) dukeFishronAI(e, hooks, p);
}

describe('BJ310续刀 视觉面：相位染色/拖影段数/圆周脉冲 helper 逐值', () => {
  it('dukePhaseTint：一阶段 null/二阶段 (0.5,0.7,0.5)/终怒 (0.4,0.8,0.4)/变身窗 ramp（Main.cs:24686-24699）', () => {
    const mk = (ai0: number, ai2 = 0) => {
      const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
      e.ai0 = ai0; e.ai2 = ai2;
      return e;
    };
    expect(dukePhaseTint(mk(1))).toBeNull();                        // 一阶段无染色
    expect(dukePhaseTint(mk(0))).toBeNull();
    expect(dukePhaseTint(mk(6))).toEqual([0.5, 0.7, 0.5]);          // flag12 ai0>4
    expect(dukePhaseTint(mk(8))).toEqual([0.5, 0.7, 0.5]);
    expect(dukePhaseTint(mk(11))).toEqual([0.4, 0.8, 0.4]);         // num331 ai0>9 优先
    // 变身窗 ramp：k=(ai2−120)/60；k=0.5 → (0.75,0.85,0.75)（:24696-24698）
    expect(dukePhaseTint(mk(4, 150))).toEqual([0.75, 0.85, 0.75]);
    expect(dukePhaseTint(mk(4, 121))).toEqual([1 - 0.5 / 60, 1 - 0.3 / 60, 1 - 0.5 / 60]);
    expect(dukePhaseTint(mk(4, 100))).toBeNull();                    // 窗前无染色
    expect(dukePhaseTint(mk(5))).toEqual([0.5, 0.7, 0.5]);           // 变身完仍染色
  });

  it('dukeTrailCount：−1 态 0/悬浮 0·5·10 态 7/其余 10（Main.cs:24704-24712）', () => {
    const mk = (vid: number, ai0: number) => {
      const e = Enemy.fromVanilla(vid, 20 * TILE, 52 * TILE)!;
      e.ai0 = ai0;
      return e;
    };
    expect(dukeTrailCount(mk(370, -1))).toBe(0);     // 出生无拖影
    expect(dukeTrailCount(mk(370, 0))).toBe(7);      // 悬浮
    expect(dukeTrailCount(mk(370, 5))).toBe(7);
    expect(dukeTrailCount(mk(370, 10))).toBe(7);     // 终怒悬浮
    expect(dukeTrailCount(mk(370, 1))).toBe(10);     // 冲撞
    expect(dukeTrailCount(mk(370, 6))).toBe(10);
    expect(dukeTrailCount(mk(370, 12))).toBe(10);
    expect(dukeTrailCount(mk(372, 1))).toBe(10);     // 鲨龙无态表
    expect(dukeTrailCount(mk(373, 0))).toBe(10);
  });

  it('dukeBurstParams：四窗（3/8 R40、4/9 R60、12 R20）amp=(1−cos)/3，他态零（:24747-24786）', () => {
    const mk = (ai0: number, ai2 = 0) => {
      const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
      e.ai0 = ai0; e.ai2 = ai2;
      return e;
    };
    expect(dukeBurstParams(mk(0))).toEqual([0, 0, 0]);           // 悬浮无
    expect(dukeBurstParams(mk(1))).toEqual([0, 0, 0]);           // 冲撞无
    expect(dukeBurstParams(mk(5))).toEqual([0, 0, 0]);
    expect(dukeBurstParams(mk(3, 50))).toEqual([0, 0, 0]);       // ai2≤60 未起
    expect(dukeBurstParams(mk(3, 90))[0]).toBe(6);
    expect(dukeBurstParams(mk(3, 90))[2]).toBe(40);
    expect(dukeBurstParams(mk(3, 90))[1]).toBeCloseTo(0, 12);    // (90−60)/30=1 整周→幅 0
    expect(dukeBurstParams(mk(8, 75))[1]).toBeCloseTo((1 - Math.cos(Math.PI)) / 3, 12);   // 半周幅峰 2/3
    expect(dukeBurstParams(mk(4, 150))[2]).toBe(60);
    expect(dukeBurstParams(mk(4, 150))[1]).toBeCloseTo((1 - Math.cos(Math.PI)) / 3, 12);
    expect(dukeBurstParams(mk(4, 100))).toEqual([0, 0, 0]);      // 变身窗前
    expect(dukeBurstParams(mk(9, 150))[2]).toBe(60);             // 终怒变身同窗
    expect(dukeBurstParams(mk(12, 15))[2]).toBe(20);
    expect(dukeBurstParams(mk(12, 15))[1]).toBeCloseTo((1 - Math.cos(Math.PI)) / 3, 12);
    expect(dukeBurstParams(mk(12, 30))[1]).toBeCloseTo(0, 12);   // 满周幅 0
    expect(dukeBurstParams(mk(12, 0))[1]).toBeCloseTo(0, 12);
  });
});

describe('BJ310续刀 视觉面：帧机二阶段差异（FindFrame case 370 :72937-73031）', () => {
  it('态5 游动 5t/帧 vs 态0 6t/帧（num47 4 vs 5）', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e0 = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e0.bInit = true; e0.ai0 = 0; e0.ai1 = 300; e0.ai2 = 0; e0.customFrameIdx = 0; e0.npcFrameT = 0;
    tickDuke(e0, hooks, 18);                       // 6t/帧 → 18t 恰进 3 帧
    expect(e0.customFrameIdx).toBe(3);
    const e5 = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e5.bInit = true; e5.ai0 = 5; e5.ai1 = 300; e5.ai2 = 0; e5.customFrameIdx = 0; e5.npcFrameT = 0;
    tickDuke(e5, hooks, 18);                       // 5t/帧 → 18t 进 3 帧余 3
    expect(e5.customFrameIdx).toBe(3);
    expect(e5.npcFrameT).toBe(3);
  });

  it('态6 冲撞帧 6/7（ai2<10/>=10）与态10-13 帧保持不变（原版无分支）', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true; e.ai0 = 6; e.ai1 = 0; e.ai2 = 5; e.vx = 16; e.vy = 0;
    tickDuke(e, hooks, 1);
    expect(e.customFrameIdx).toBe(6);              // ai2=5<10
    e.ai2 = 10;
    tickDuke(e, hooks, 1);
    expect(e.customFrameIdx).toBe(7);              // ai2≥10
    // 态 12：帧不推进（保持原值）
    e.ai0 = 12; e.ai1 = -300; e.ai2 = 0; e.customFrameIdx = 4;
    tickDuke(e, hooks, 5);
    expect(e.customFrameIdx).toBe(4);
  });
});

describe('BJ310续刀 行为面：二阶段 6/7/8 转移序全驱动（:49886-49915 表逐边）', () => {
  it('二阶段循环 = 冲撞×3 → 旋转冲(7) → 冲撞×3 → 龙卷(8) → 循环；6 尾 ai3+=2、7/8 尾 ai3 不动', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });   // 海洋带内=非狂暴
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 5; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.hp = e.maxHp;   // 二阶段悬浮起
    const attacks: number[] = [];
    const a3AtAttack: number[] = [];
    let lastAi0 = 5;
    for (let t = 0; t < 3000 && attacks.length < 8; t++) {
      dukeFishronAI(e, hooks, (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player as never);
      const a = Math.floor(e.ai0);
      if (a >= 6 && a <= 8 && lastAi0 === 5) { attacks.push(a); a3AtAttack.push(Math.floor(e.ai3)); }
      lastAi0 = a;
    }
    // pick2 表：a3 0-5→6、6→7（ai3=1）、7→8（ai3=0）；6 尾 ai3+=2。
    // a3AtAttack 录【pick 后】值（原版 :49899/:49904 在转态前先改写 ai3——6→1/7→0）
    expect(attacks).toEqual([6, 6, 6, 7, 6, 6, 6, 8]);
    expect(a3AtAttack).toEqual([0, 2, 4, 1, 1, 3, 5, 0]);
    expect(Math.floor(e.ai0)).toBe(8);              // 第 8 招记录点=龙卷起手
    tickDuke(e, hooks, 90);                         // nadoT=90 走完
    expect(e.ai0).toBe(5);                          // 8 尾回二阶段悬浮
    expect(e.ai3).toBe(0);                          // 8 尾 ai3 不动（=0）
  });

  it('一阶段对照循环 = 冲撞×5 → 泡泡(2) → 冲撞×5 → 龙卷(3)（pick1 表）', () => {
    const { hooks } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    // ★fromVanilla ai0=-1120 哨兵缺省（bbb 家族）——须显式置出生后态,否则 AI switch
    //  落 default 永动悬浮（本文件首次运行实锚）
    e.ai0 = 0; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.hp = e.maxHp;                                  // 压住半血变身门
    const attacks: number[] = [];
    let lastAi0 = 0;
    for (let t = 0; t < 4000 && attacks.length < 12; t++) {
      dukeFishronAI(e, hooks, (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player as never);
      const a = Math.floor(e.ai0);
      if (a >= 1 && a <= 3 && lastAi0 === 0) attacks.push(a);
      lastAi0 = a;
    }
    expect(attacks).toEqual([1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 3]);
  });

  it('变身拍一次性面（态4）：无敌 180t、吼叫恰 1 次@ai2=120、零尘、转 5 时 ai1/ai2/ai3 归零', () => {
    const { hooks, sfx, dusts } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 0; e.ai1 = 300; e.ai2 = 0; e.ai3 = 0; e.hp = e.maxHp * 0.4;   // ≤50% → pick4
    tickDuke(e, hooks, 30);                          // 悬浮满 → 态4
    expect(e.ai0).toBe(4);
    const sfxBefore = sfx.filter((n) => n === 'Zombie_20').length;
    const dustBefore = dusts.length;
    let trueTicks = 0;
    let transitionTickInvuln = false;
    for (let t = 0; t < 180; t++) {
      dukeFishronAI(e, hooks, (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player as never);
      if (Math.floor(e.ai0) === 4) {
        expect(e.dontTakeDamage).toBe(true);   // :49815 flag7=false → 尾句真旗
        trueTicks++;
      } else {
        transitionTickInvuln = e.dontTakeDamage;   // 转换拍：case4 内置 invuln 后尾句仍赋真
      }
    }
    expect(trueTicks).toBe(179);                   // 180 拍中 179 拍留态 4
    expect(transitionTickInvuln).toBe(true);       // 转换拍尾句 :50278 = !flag7（case4 已置假）=真
    expect(sfx.filter((n) => n === 'Zombie_20').length - sfxBefore).toBe(1);   // :49820 仅 ai2==120 一声
    expect(dusts.length - dustBefore).toBe(0);             // 原版变身拍无尘（对照态 -1/冲刺均有）
    expect(e.ai0).toBe(5);
    expect(e.ai1).toBe(0); expect(e.ai2).toBe(0); expect(e.ai3).toBe(0);   // :49826-49828 归零
    tickDuke(e, hooks, 1);
    expect(e.dontTakeDamage).toBe(false);                  // 态5 首拍清无敌
  });

  it('expert 终怒循环（10-13）：0冲1瞬2冲3冲4瞬5冲6冲7冲8瞬→ai3 回绕 0（:50122-50138 表）', () => {
    const { hooks } = makeHooks(makeWorld(1), { x: 20, y: 55 });   // expert
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 10; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0; e.spawnAlpha = 255;
    const attacks: number[] = [];
    const a3AtAttack: number[] = [];
    let lastAi0 = 10;
    for (let t = 0; t < 4000 && attacks.length < 9; t++) {
      dukeFishronAI(e, hooks, (hooks as unknown as { player: NonNullable<GameHooks['player']> }).player as never);
      const a = Math.floor(e.ai0);
      if ((a === 11 || a === 12) && lastAi0 === 10) { attacks.push(a); a3AtAttack.push(Math.floor(e.ai3)); }
      lastAi0 = a;
    }
    expect(attacks).toEqual([11, 12, 11, 11, 12, 11, 11, 11, 12]);
    expect(a3AtAttack).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    // 第 9 招（瞬移 ai3=8）记录后循环即出——补驱动 30t 使态 12 走完：ai3≥9 回绕 0（:50253-50256）
    tickDuke(e, hooks, 30);
    expect(Math.floor(e.ai0)).toBe(10);
    expect(e.ai3).toBe(0);
  });

  it('二阶段泡泡变体：态2 泡泡无 ai3（缺省）/态7 甩泡 ai3∈[0.8,1.2] 垂直速 6（:49751/:49950）', () => {
    const { hooks, enemies } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e.bInit = true;
    e.ai0 = 5; e.ai1 = 300; e.ai2 = 0; e.ai3 = 6; e.hp = e.maxHp;
    tickDuke(e, hooks, 60);                          // 悬浮满 → 态7 旋转冲
    expect(e.ai0).toBe(7);
    tickDuke(e, hooks, 1);                           // ai2=0 首拍甩泡
    const spin = enemies.filter((n) => n.vanillaId === 371);
    expect(spin.length).toBe(1);
    const b7 = spin[0];
    expect(b7.ai3).toBeGreaterThanOrEqual(0.8);      // Main.rand.Next(80,121)/100
    expect(b7.ai3).toBeLessThanOrEqual(1.2);
    expect(Math.abs(Math.hypot(b7.vx, b7.vy) - 6)).toBeLessThan(0.01);   // num18=6 垂直甩出
    // 态2 对照：ai3 缺省 0（scale=1 漂移泡,无预置速度/缩放）
    const { hooks: h2, enemies: en2 } = makeHooks(makeWorld(), { x: 20, y: 55 });
    const e2 = Enemy.fromVanilla(370, 20 * TILE, 52 * TILE)!;
    e2.bInit = true;
    e2.ai0 = 0; e2.ai1 = 300; e2.ai2 = 0; e2.ai3 = 10; e2.hp = e2.maxHp;
    tickDuke(e2, h2, 60);                            // a3=10 → flag5 假 → 悬浮基值 60t
    expect(e2.ai0).toBe(2);
    tickDuke(e2, h2, 1);
    const b2 = en2.filter((n) => n.vanillaId === 371);
    expect(b2.length).toBe(1);
    expect(b2[0].ai3).toBe(0);
  });
});
