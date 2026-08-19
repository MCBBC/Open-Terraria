// 2026-08-19 台账 D「飞行/水生全量」修复回归（原型直调法,同 ai-parity-batch）:
//  蜂群 #4/#5/#8/#10/#11/#12、蝙蝠 #2/#3/#4/#5、眼睛族猪龙相位/116 档、
//  幽灵移动核/驱散门、地牢之魂 rotation 基向、骷髅王手五态机、charger 重瞄门/620 陆地段。
import { describe, expect, it } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { skeletronHandAI } from '../src/entities/bossAI';
import type { GameHooks } from '../src/entities/types';
import type { Player } from '../src/entities/Player';

interface MockGame extends GameHooks {
  __projectiles: { projId: number; vx: number; vy: number; x: number; y: number }[];
}

function makeGame(day = false): MockGame {
  const world = new World(96, 48, 7, 'flyer-ai-parity');
  world.groundLevel = 16;
  world.rockLevel = 32;
  // 0.5 = 正午（DAWN 0.1875 / DUSK 0.8125）;0.95 = 深夜
  world.clock.timeOfDay = day ? 0.5 : 0.95;
  const projectiles: MockGame['__projectiles'] = [];
  return {
    world,
    player: null,
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfxWav: () => {},
    onEnemyKilled: () => {},
    entities: { add: (p: unknown) => { projectiles.push(p as MockGame['__projectiles'][number]); } },
    __projectiles: projectiles,
  } as unknown as MockGame;
}

/** 直调私有 AI 方法（原型直调法） */
const drive = (e: Enemy, fn: string, g: GameHooks, p?: unknown) =>
  (e as unknown as Record<string, (g: GameHooks, p?: unknown) => void>)[fn].call(e, g, p ?? null);

function mkPlayer(x: number, y: number, extra: Partial<Player> = {}): Player {
  return {
    x, y, w: 20, h: 42, cx: x + 10, cy: y + 21, dead: false,
    inWater: false, itemAnimTicks: 0, useTime: 0, aggro: 0, stealth: 0, vx: 0, vy: 0,
    ...extra,
  } as unknown as Player;
}

function mkEnemy(id: number, tx = 40, ty = 20): Enemy {
  const e = Enemy.fromVanilla(id, tx * 16, ty * 16);
  if (!e) throw new Error(`npc ${id} 构造失败`);
  return e;
}

describe('AI_005 蜂群（swarmerAI）', () => {
  it('#4 619 白天 EncourageDespawn(60) + 出生 α255 → −15/t 渐显', () => {
    const g = makeGame(true);   // 白天
    const squid = mkEnemy(619);
    drive(squid, 'swarmerAI', g, mkPlayer(squid.x + 300, squid.y));
    expect(squid.despawnTimer).toBe(60);       // EncourageDespawn(60)（非通用表的 10）
    expect(squid.despawnEncouraged).toBe(true);
    expect(squid.spawnAlpha).toBe(240);        // 255 − 15
    expect(squid.alphaFade).toBe(false);       // 通用 -1/t 渐显已退役
    expect(squid.vy).toBeLessThanOrEqual(-6);  // 首帧 vy=−6（再叠加白天 −0.3）
  });

  it('#4 619 撤退+BloodShot：≥120 计数、<400px、有视线 → 背向 (目标X,自身Y) 5 速 + 811×15', () => {
    const g = makeGame(false);
    const squid = mkEnemy(619);
    const p = mkPlayer(squid.x + 300, squid.y - 50);
    squid.lai0 = 119;
    drive(squid, 'swarmerAI', g, p);
    expect(squid.lai0).toBe(0);                       // 发射后清零
    expect(g.__projectiles).toHaveLength(1);
    expect(g.__projectiles[0].projId).toBe(811);      // BloodShot
    const spd = Math.hypot(g.__projectiles[0].vx, g.__projectiles[0].vy);
    expect(spd).toBeGreaterThan(13);                  // 15 ± 散布 2.5×√2
    expect(spd).toBeLessThan(17);
    // 撤退速度:背向 (p.cx, p.y) 方向 5 速
    expect(Math.hypot(squid.vx, squid.vy)).toBeCloseTo(5, 5);
    expect(squid.vx).toBeLessThan(0);                 // 玩家在右 → 向左退
  });

  it('#5 139 远距(>600) 增速：同向 |vx|<12 → ×1.05（非 mech 档,曾误限 mechQueenUp）', () => {
    const g = makeGame(false);
    const probe = mkEnemy(139, 10, 20);
    const p = mkPlayer(probe.x + 640, probe.y);      // 8px 量化后距离 632 >600
    probe.vx = 11;
    probe.ai0 = 0;
    drive(probe, 'swarmerAI', g, p);
    // 步进 −0.05、摆动 −0.023 后 ×1.05：(11−0.05−0.023)×1.05 ≈ 11.47
    expect(probe.vx).toBeCloseTo((11 - 0.05 - 0.023) * 1.05, 2);
  });

  it('#8 噬魂怪近距(<100) 不归零 ai[0]（曾自造 ai0=0 → 相位突跳）', () => {
    const g = makeGame(false);
    const eater = mkEnemy(6, 40, 20);
    eater.ai0 = 50;
    const p = mkPlayer(eater.x + 40, eater.y);       // 量化距离 <100
    drive(eater, 'swarmerAI', g, p);
    expect(eater.ai0).toBe(50);                      // 不重置也不步进（门内无操作）
  });

  it('#10/#11 陨石头 23/探针 139 朝向基座 + 黄蜂失视清零', () => {
    const g = makeGame(false);
    // 139 探针:玩家在左 → facing=-1、visAngle=atan2(sy,sx)+π（无 −1.57）
    const probe = mkEnemy(139, 50, 20);
    drive(probe, 'swarmerAI', g, mkPlayer(probe.x - 300, probe.y));
    expect(probe.facing).toBe(-1);
    expect(probe.visAngle).toBeCloseTo(Math.atan2(0, -1) + Math.PI, 5);
    // 黄蜂:失视线 → ai[1]=0（曾只在上分支清 = 满蓄力毒刺）
    const g2 = makeGame(false);
    const hornet = mkEnemy(42, 40, 20);
    hornet.ai1 = 129;
    // 立一堵墙挡视线
    for (let y = 0; y < 48; y++) g2.world.store.setTileSilent(46, y, 1, 0, 0);
    drive(hornet, 'swarmerAI', g2, mkPlayer(hornet.x + 200, hornet.y));
    expect(hornet.ai1).toBe(0);
  });

  it('#12 白天驱散表:表外 5 仆从 Despawn10;豁免 6 噬魂怪不驱散', () => {
    const g = makeGame(true);
    const servant = mkEnemy(5, 40, 20);
    drive(servant, 'swarmerAI', g, mkPlayer(servant.x + 100, servant.y));
    expect(servant.despawnTimer).toBe(10);
    const g2 = makeGame(true);
    const eater = mkEnemy(6, 40, 20);
    drive(eater, 'swarmerAI', g2, mkPlayer(eater.x + 100, eater.y));
    expect(eater.despawnTimer).toBe(750);            // 默认未动
  });
});

describe('AI_014 蝙蝠（batAI）', () => {
  it('#2/#3 158 二档阈值 4（非帽 7）:vx=6、dir=-1 → −0.2−0.1', () => {
    const g = makeGame(false);
    const bat = mkEnemy(158, 40, 20);
    bat.vx = 6;
    drive(bat, 'batAI', g, mkPlayer(bat.x - 300, bat.y));
    expect(bat.vx).toBeCloseTo(5.7, 6);
  });

  it('#3 660 Y 修正 0.225（num231×0.75）:vy=1、dirY=-1 → −0.3+0.225', () => {
    const g = makeGame(false);
    const minion = mkEnemy(660, 40, 20);
    minion.vy = 1;
    drive(minion, 'batAI', g, mkPlayer(minion.x + 100, minion.y - 200));
    expect(minion.vy).toBeCloseTo(1 - 0.3 + 0.225, 6);
  });

  it('#4 226 飞蛇失视线保向（重瞄前速度符号）', () => {
    const g = makeGame(false);
    const snake = mkEnemy(226, 40, 20);
    snake.vx = -3;
    for (let y = 0; y < 48; y++) g.world.store.setTileSilent(46, y, 1, 0, 0);
    drive(snake, 'batAI', g, mkPlayer(snake.x + 200, snake.y));   // 玩家在右、无视线
    expect(snake.facing).toBe(-1);                  // 保持向左（失视保向）
  });

  it('#5 失视 200t 振荡:ai[1]>200 无视线 → ai[2] 推进 + 双轴步进;有视线 → ai[1] 归零', () => {
    const g = makeGame(false);
    const bat = mkEnemy(49, 40, 20);               // 双步族、通用振荡参数
    bat.ai1 = 250;
    bat.ai2 = 0;
    bat.vx = 0; bat.vy = 0;
    drive(bat, 'batAI', g, null);                  // 无玩家:不重置
    expect(bat.ai1).toBe(251);                     // 49 非 158 → +1
    expect(bat.ai2).toBe(1);
    // 组成:双步 Y(+0.04×2) + 振荡 vy+0.1 = 0.18;双步 X(+0.1×2) + 振荡 vx−0.2 = 0
    expect(bat.vy).toBeCloseTo(0.04 * 2 + 0.1, 6);
    expect(bat.vx).toBeCloseTo(0.1 * 2 - 0.2, 6);
    const g2 = makeGame(false);
    const bat2 = mkEnemy(49, 40, 20);
    bat2.ai1 = 250;
    drive(bat2, 'batAI', g2, mkPlayer(bat2.x + 100, bat2.y));   // 有视线
    expect(bat2.ai1).toBe(0);
  });

  it('#7 红魔 156 出生点含速度前置（中心+velocity×5+弹向×100）', () => {
    const g = makeGame(false);
    const demon = mkEnemy(156, 40, 20);
    demon.vx = 4; demon.vy = 0;
    demon.ai0 = 19;                                // 自增后 ==20 → 第一发齐射帧
    const p = mkPlayer(demon.x + 200, demon.y);
    drive(demon, 'batAI', g, p);
    expect(g.__projectiles).toHaveLength(1);
    const proj = g.__projectiles[0];
    const dx = p.cx - demon.cx, dy = p.cy - demon.cy;
    const d = Math.hypot(dx, dy);
    expect(proj.x).toBeCloseTo(demon.cx + demon.vx * 5 + dx / d * 100, 3);
    expect(proj.y).toBeCloseTo(demon.cy + demon.vy * 5 + dy / d * 100, 3);
  });
});

describe('AI_002 眼睛族（floatEyeAI）', () => {
  it('猪龙 170 失视累计 300t → ai[1]=1 相位态（α200 穿墙）;复视+脱实心 → 清回', () => {
    const g = makeGame(false);
    const pig = mkEnemy(170, 40, 20);
    pig.ai0 = 299;                                 // 失视计数 299
    for (let y = 0; y < 48; y++) g.world.store.setTileSilent(46, y, 1, 0, 0);
    drive(pig, 'floatEyeAI', g, mkPlayer(pig.x + 200, pig.y));   // 仍无视线
    expect(pig.ai1).toBe(1);                       // ≥300 → 入相
    expect(pig.spawnAlpha).toBe(200);
    // 相位态幽灵位移（无碰撞):vy 制动后仍直积分
    expect(pig.hitWall).toBe(false);
    const g2 = makeGame(false);
    const pig2 = mkEnemy(170, 40, 20);
    pig2.ai1 = 1;                                  // 已在相位
    drive(pig2, 'floatEyeAI', g2, mkPlayer(pig2.x + 200, pig2.y));  // 有视线且空中(非嵌实心)
    expect(pig2.ai1).toBe(0);
    expect(pig2.spawnAlpha).toBe(0);
  });

  it('116 饿魂 II 专属档:逆向修正 0.2（vx=6,dir=-1 → 5.7）;下行门 1.5', () => {
    const g = makeGame(false);
    const hung = mkEnemy(116, 40, 20);
    hung.vx = 6;
    drive(hung, 'floatEyeAI', g, mkPlayer(hung.x - 300, hung.y));
    expect(hung.vx).toBeCloseTo(5.7, 6);
    expect(hung.lightRGB).toEqual([0.3, 0.2, 0.1]);
  });
});

describe('AI_022 幽灵（ghostAI）', () => {
  it('移动核:75 小精灵无目标 → 悬浮缓降（flag31 +0.2 + Y 步 0.04,非 7/0.0125 追踪）', () => {
    const g = makeGame(false);
    const pixie = mkEnemy(75, 40, 20);
    pixie.vy = 0;
    drive(pixie, 'ghostAI', g, null);
    expect(pixie.vy).toBeCloseTo(0.2 + 0.04, 6);   // 悬浮段 +0.2（cs:25092）+ 垂直步进 0.04
  });

  it('锚点游荡:82 幽魂在锚内 → ai[2] 步进 + 朝玩家;离锚 → 重锚归零', () => {
    const g = makeGame(false);
    const wraith = mkEnemy(82, 40, 20);
    wraith.ai0 = wraith.x; wraith.ai1 = wraith.y; wraith.ai2 = 0;
    drive(wraith, 'ghostAI', g, mkPlayer(wraith.x + 300, wraith.y));
    expect(wraith.ai2).toBe(1);
    expect(wraith.facing).toBe(1);                 // TargetClosest 朝玩家
    wraith.x += 100;                               // 出 ±16 锚窗
    drive(wraith, 'ghostAI', g, mkPlayer(wraith.x + 300, wraith.y));
    expect(wraith.ai2).toBe(0);
    expect(Math.abs(wraith.ai0 - wraith.x)).toBeLessThan(1);   // 重锚（积分位移误差内）
  });

  it('驱散门:253 非日食 / 490 白天 / 330 非南瓜月 → flag28 游荡（不走锚点/漂离状态机）', () => {
    const g = makeGame(false);                     // 夜、无日食、无南瓜月
    const reaper = mkEnemy(253, 40, 20);
    reaper.vx = 0;
    reaper.ai2 = 7;                                // flag28 分支不触 ai[2]（锚点/漂离分支才会 +1/+2）
    drive(reaper, 'ghostAI', g, null);
    expect(reaper.ai2).toBe(7);
    expect(reaper.vx).not.toBe(0);                 // 停住 → rand(-1,2)×1.5 再经水平步进
    const drippler = mkEnemy(490, 40, 20);
    drippler.vx = 0;
    drippler.ai2 = 7;
    drive(drippler, 'ghostAI', makeGame(true), null);   // 白天
    expect(drippler.ai2).toBe(7);
    expect(drippler.vx).not.toBe(0);
    const polter = mkEnemy(330, 40, 20);
    polter.ai2 = 7;
    drive(polter, 'ghostAI', g, null);
    expect(polter.ai2).toBe(7);
    expect(polter.spawnAlpha).toBe(0);             // 330 恒 α0（json 静态 100 被覆写）
    expect(polter.despawnTimer).toBe(10);          // flag28 → EncourageDespawn(10)
  });

  it('漂离期背向玩家（cs:24806-24810）:ai[2]<0 → facing 背向', () => {
    const g = makeGame(false);
    const wraith = mkEnemy(82, 40, 20);
    wraith.ai2 = -100;                             // 漂离期
    drive(wraith, 'ghostAI', g, mkPlayer(wraith.x + 300, wraith.y));
    expect(wraith.facing).toBe(-1);                // 玩家在右 → 向左漂
  });
});

describe('AI_056 地牢之魂 rotation 基向', () => {
  it('rotation = 目标方向角 −π/2（非速度角）', () => {
    const g = makeGame(false);
    const spirit = mkEnemy(484, 40, 20);
    spirit.vx = 5; spirit.vy = -5;                 // 与目标方向不同的当前速度
    const p = mkPlayer(spirit.x + 300, spirit.y);
    drive(spirit, 'dungeonSpiritAI', g, p);
    expect(spirit.visAngle)
      .toBeCloseTo(Math.atan2(p.cy - spirit.cy, p.cx - spirit.cx) - Math.PI / 2, 5);
  });
});

describe('AI_012 骷髅王手五态机（bossAI.skeletronHandAI）', () => {
  function mkFight() {
    const g = makeGame(false);
    const head = mkEnemy(35, 40, 20);
    head.id = 1;
    const hand = mkEnemy(36, 42, 22);
    hand.id = 2;
    hand.ai0 = 1;                                  // 右手
    hand.ai1 = head.id;                            // 锚定头
    hand.bInit = true;
    (g as unknown as { enemies: () => unknown[] }).enemies = () => [head, hand];
    return { g, head, hand };
  }
  const handAI = (e: Enemy, g: GameHooks, p: unknown) => skeletronHandAI(e, g, p as Player);

  it('头悬浮态:ai[3] 300t 计满 → ai[2]=1（蓄升）', () => {
    const { g, head, hand } = mkFight();
    head.ai1 = 0;                                  // 头悬浮
    hand.ai3 = 299;
    const p = mkPlayer(hand.x - 300, hand.y);
    handAI(hand, g, p);
    expect(hand.ai3).toBe(300);
    handAI(hand, g, p);
    expect(hand.ai2).toBe(1);
    expect(hand.ai3).toBe(0);
  });

  it('蓄升:vy −0.1/t 钳 −8;升到头上方 200 → 直冲初速 18 朝玩家', () => {
    const { g, head, hand } = mkFight();
    hand.ai2 = 1;
    hand.vy = 0;
    const p = mkPlayer(hand.x - 300, hand.y + 100);
    handAI(hand, g, p);
    expect(hand.vy).toBeCloseTo(-0.1, 6);
    // 直接摆到头上方 200 → 触发直冲
    hand.y = head.y - 201;
    hand.vx = 0; hand.vy = 0;
    handAI(hand, g, p);
    expect(hand.ai2).toBe(2);
    expect(Math.hypot(hand.vx, hand.vy)).toBeCloseTo(18, 5);
  });

  it('直冲收尾:越过玩家 Y → ai[2]=3;头死 → 即灭', () => {
    const { g, head, hand } = mkFight();
    hand.ai2 = 2;
    hand.vx = 5; hand.vy = 3;                      // 朝右下冲
    const p = mkPlayer(hand.x + 300, hand.y + 50);
    handAI(hand, g, p);
    expect(hand.ai2).toBe(2);                      // 未越线、点积>0、<2000、vy>0 → 续冲
    hand.y = p.y + 1;                              // 越过玩家 Y
    handAI(hand, g, p);
    expect(hand.ai2).toBe(3);
    // 头死亡 → 自灭（netMode!=2 即灭语义）
    head.dead = true;
    handAI(hand, g, p);
    expect(hand.dead).toBe(true);
  });

  it('侧浮:离心 500px → 回冲初速 17;回冲越玩家 X → ai[2]=0', () => {
    const { g, head, hand } = mkFight();
    hand.ai2 = 4;
    hand.vx = 0;
    const p = mkPlayer(head.x - 200, head.y + 100);
    hand.x = head.x - 600;                         // 离头心 >500px
    handAI(hand, g, p);
    expect(hand.ai2).toBe(5);
    expect(Math.hypot(hand.vx, hand.vy)).toBeCloseTo(17, 5);
    // 回冲越过玩家 X → 收尾回悬停
    hand.ai2 = 5;
    hand.vx = -10;                                 // 向左冲、玩家在左更远处? → 未越
    hand.x = p.x + 500;
    handAI(hand, g, p);
    expect(hand.ai2).toBe(0);
  });
});

describe('AI_026 charger + 620 陆地段', () => {
  it('重瞄门:非卡墙态远距(>200px)也每帧朝玩家（独角兽冲过头必回头）', () => {
    const g = makeGame(false);
    const wolf = mkEnemy(155, 40, 20);
    wolf.facing = -1;
    drive(wolf, 'chargerAI', g, mkPlayer(wolf.x + 1000, wolf.y));
    expect(wolf.facing).toBe(1);                   // 1000px 仍重瞄（曾 200px 门）
  });

  it('卡墙态:完全静止 2t 才折返;近身 <200px 清卡墙', () => {
    const g = makeGame(false);
    const wolf = mkEnemy(155, 40, 20);
    wolf.stuckT = 30; wolf.ai0 = 1; wolf.vx = 0; wolf.vy = 0;
    const p = mkPlayer(wolf.x + 1000, wolf.y);
    drive(wolf, 'chargerAI', g, p);
    expect(wolf.facing).toBe(-1);                  // 折返（初始 1）
    wolf.stuckT = 5;
    drive(wolf, 'chargerAI', g, mkPlayer(wolf.x + 100, wolf.y));
    expect(wolf.stuckT).toBe(0);                   // 近身清零
  });

  it('620 陆地:夜 + 落地 + <600px 有视线 → 蓄力 60;20t 后 40 帧发 811（13 速）', () => {
    const g = makeGame(false);
    // 铺地板让鲨鱼落地（vy==0 起手门）
    for (let x = 30; x < 60; x++) g.world.store.setTileSilent(x, 30, 1, 0, 0);
    const shark = mkEnemy(620, 40, 28);
    shark.y = 30 * 16 - shark.h;
    shark.vy = 0; shark.vx = 0; shark.ai1 = 0; shark.ai0 = 0;
    const p = mkPlayer(shark.x + 300, shark.y);
    // 首 tick α255 出生跳（vy=−6）——落回地板后起手门（vy==0）才开
    let guard = 0;
    do { drive(shark, 'chargerAI', g, p); guard++; } while (shark.ai1 !== 60 && guard < 200);
    expect(shark.ai1).toBe(60);                    // 起手:num8=60
    expect(shark.ai0).toBeGreaterThan(0);
    for (let t = 0; t < 21; t++) drive(shark, 'chargerAI', g, p);
    expect(g.__projectiles.filter((x) => x.projId === 811)).toHaveLength(1);
    const shot = g.__projectiles[0];
    const spd = Math.hypot(shot.vx, shot.vy);
    expect(spd).toBeGreaterThan(11);
    expect(spd).toBeLessThan(16);                  // 13 ± 散布
  });

  it('620 陆地:白天 → EncourageDespawn(10)（停射离场）', () => {
    const g = makeGame(true);
    for (let x = 30; x < 60; x++) g.world.store.setTileSilent(x, 30, 1, 0, 0);
    const shark = mkEnemy(620, 40, 28);
    shark.y = 30 * 16 - shark.h;
    shark.vy = 0;
    drive(shark, 'chargerAI', g, mkPlayer(shark.x + 300, shark.y));
    expect(shark.despawnTimer).toBe(10);
    expect(shark.ai1).toBe(0);                     // 白天不起手射链
  });
});
