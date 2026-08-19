// Boss 族 1:1 修复回归(2026-08-19 台账 E 区,对照 Terarria1456/Terraria/NPC.cs):
//   双子专家档/雷眼二阶段侧移拓扑重写 · 骷髅王专家分支+旋冲直设速度 ·
//   Prime 专家档 · 史莱姆王跳跃循环/反挂机计数/小史莱姆 · 蜂后专家分支 ·
//   世花弹伤 ×0.9 Remap · 月总核心 Lerp0.98/清弹/兜底 1↔3 ·
//   月总头 -2 残肢帧推进 · 鲨鱼龙玩家死存续+起扑/撞墙音 · 猪鲨 α150/瞬移侧翻。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { twinsAI, skeletronBossAI, skeletronPrimeAI, kingSlimeAI } from '../src/entities/bossAI';
import { queenBeeAI, planteraAI } from '../src/entities/bossAI_queenbee_plantera';
import {
  moonLordCoreAI, moonLordHeadAI, sharkronAI, dukeFishronAI,
} from '../src/entities/bossAI_duke_moonlord';
import type { GameHooks } from '../src/entities/types';

const W = 200, H = 140, FLOOR = 110;
const STONE = 1;

function makeWorld(expert = false, h = H): World {
  const w = new World(W, h, 7, 'boss-parity-a');
  w.groundLevel = 40;
  w.rockLevel = 60;
  if (expert) w.difficulty = 1;   // Main.expertMode(Main.cs:2762)
  w.clock.timeOfDay = 0;          // 深夜(白天双子走离场分支)
  const st = w.store;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, STONE);
    st.setTile(x, FLOOR + 1, STONE);
  }
  return w;
}

interface Harness {
  hooks: GameHooks;
  enemies: Enemy[];
  projectiles: Array<{ projId?: number; damage?: number; vx: number; vy: number; dead?: boolean }>;
  player: Record<string, number | boolean> & { buffs: unknown };
  sfx: string[][];
}

function makeHooks(world: World, playerAt: { x: number; y: number }): Harness {
  const enemies: Enemy[] = [];
  const projectiles: Harness['projectiles'] = [];
  const sfx: string[][] = [];
  const em = {
    nextId: 1,
    projectiles,                                  // 清弹段按 entities.projectiles 枚举
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Harness['projectiles'][number]);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player = {
    x: px, y: py, w: 20, h: 42, cx: px + 10, cy: py + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, useTime: 1,
    buffs: { has: () => false, moonLeech: false },
  };
  const hooks = {
    world, player,
    scene: { zoneJungle: true },
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sfx.push(files); },
    showPickupLabel: () => {},
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player: player as unknown as Harness['player'], sfx };
}

let nextId = 1000;
function spawn(h: Harness, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = nextId++;
  e.bInit = true;                                 // 跳过各核首帧复位,状态由测试直给
  h.enemies.push(e);
  return e;
}

const P = { x: 100, y: 100 };   // 玩家格坐标(地面 FLOOR 上 10 格)
const modTau = (a: number) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

// ===========================================================================
// 双子(NPC.cs:26497-27735)
// ===========================================================================
describe('双子专家档 + 雷眼二阶段侧移拓扑(2026-08-19 台账 E)', () => {
  it('雷眼一阶悬浮:专家 8.25 速 / 0.115 步进(:26594-26597)', () => {
    const h = makeHooks(makeWorld(true), P);
    const twin = spawn(h, 125, 75, 100);      // 玩家左侧 400px → 悬浮点 (玩家-300, 玩家-300)
    twin.ai0 = 0; twin.ai1 = 0; twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player as never, false);
    // 目标方向 (+0.8,-0.6):单轴步进 0.115(无符号翻转双步)
    expect(twin.vx).toBeCloseTo(0.115, 5);
    expect(twin.vy).toBeCloseTo(-0.115, 5);
  });

  it('雷眼一阶激光计数:专家 <70% 血(65% 血位)+0.9/t(:26693-26708)', () => {
    const h = makeHooks(makeWorld(true), P);
    const twin = spawn(h, 125, 97, 95);       // 悬浮点正上 300px,距悬浮点 300<400,顶边高于玩家
    twin.ai0 = 0; twin.ai1 = 0; twin.ai3 = 0;
    twin.hp = Math.floor(twin.maxHp * 0.65);  // <90/<80/<70 三档命中(<60 未中)
    twinsAI(twin, h.hooks, h.player as never, false);
    expect(twin.ai3).toBeCloseTo(1.9, 5);
  });

  it('雷眼一阶冲刺专家 15(:26746-26749);魔眼专家血量阶梯满档 15.8(:27349-27372)', () => {
    const h = makeHooks(makeWorld(true), P);
    const ret = spawn(h, 125, 90, 100);
    ret.ai0 = 0; ret.ai1 = 1;
    twinsAI(ret, h.hooks, h.player as never, false);
    expect(Math.hypot(ret.vx, ret.vy)).toBeCloseTo(15, 5);
    const spaz = spawn(h, 126, 90, 100);
    spaz.ai0 = 0; spaz.ai1 = 1;
    spaz.hp = Math.floor(spaz.maxHp * 0.05);  // 五档全中:+0.5+0.5+0.55+0.6+0.65
    twinsAI(spaz, h.hooks, h.player as never, true);
    expect(Math.hypot(spaz.vx, spaz.vy)).toBeCloseTo(15.8, 5);
  });

  it('雷眼二阶段(ai0=3)侧移拓扑:专家 9.5/0.25 逼近玩家侧 ±340,180t 回悬浮(:27008-27114)', () => {
    const h = makeHooks(makeWorld(true), P);
    const twin = spawn(h, 125, 75, 100);      // 玩家左侧 → num460=-1 → 目标 (玩家-340, 同高)
    twin.y = (h.player.cy as number) - twin.h / 2;   // 中心与玩家同高 → 目标 vy=0
    twin.ai0 = 3; twin.ai1 = 1; twin.ai2 = 0; twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player as never, false);
    expect(twin.vx).toBeCloseTo(0.25, 5);     // acc 0.25(专家)
    expect(twin.vy).toBe(0);
    expect(twin.ai1).toBe(1);                 // 无 ai1==2 冲刺段
    // 计满 180t 回悬浮
    twin.ai2 = 179;
    twinsAI(twin, h.hooks, h.player as never, false);
    expect(twin.ai1).toBe(0);
    expect(twin.ai2).toBe(0);
  });

  it('雷眼二阶段无 ai1==2 减速段:ai1=2 仍走侧移逼近(非 0.96 阻尼)', () => {
    const h = makeHooks(makeWorld(true), P);
    const twin = spawn(h, 125, 75, 100);
    twin.ai0 = 3; twin.ai1 = 2; twin.ai2 = 0; twin.vx = 0; twin.vy = 0;
    twinsAI(twin, h.hooks, h.player as never, false);
    expect(twin.vx).toBeCloseTo(0.25, 5);     // 旧减速分支会保持 vx=0
  });

  it('魔眼三阶段悬浮专家距离六档:>800px 时速 7.3(:27512-27537)', () => {
    const h = makeHooks(makeWorld(true), P);
    const twin = spawn(h, 126, 20, 100);      // 距悬浮点(玩家-180 同高)~1000px
    twin.ai0 = 3; twin.ai1 = 0; twin.ai2 = 0; twin.vx = 0; twin.vy = 0;
    const x0 = twin.x, y0 = twin.y;
    let vmax = 0;
    for (let t = 0; t < 120; t++) {
      twinsAI(twin, h.hooks, h.player as never, true);
      twin.x = x0; twin.y = y0;               // 钉住距离(隔离阶梯随接近衰减)
      vmax = Math.max(vmax, Math.hypot(twin.vx, twin.vy));
    }
    // 4 + 0.5+0.5+0.55+0.55+0.6+0.6 = 7.3(accelTo 0.1 步进在目标附近 ±0.1 振荡,取上包络)
    expect(vmax).toBeCloseTo(7.3, 1);
  });
});

// ===========================================================================
// 骷髅王(NPC.cs:21904-22288)
// ===========================================================================
describe('骷髅王专家分支 + 旋冲直设速度(2026-08-19 台账 E)', () => {
  it('专家防御 += 存活手×25(:21958)', () => {
    const h = makeHooks(makeWorld(true), P);
    const head = spawn(h, 35, 100, 100);
    head.ai1 = 0; head.ai2 = 0;
    skeletronBossAI(head, h.hooks, h.player as never);
    const baseDef = head.def.defense!;
    const hand1 = spawn(h, 36, 99, 100);
    const hand2 = spawn(h, 36, 101, 100);
    skeletronBossAI(head, h.hooks, h.player as never);
    expect(head.def.defense).toBe(baseDef + 50);
    hand1.dead = true; hand2.dead = true;
    skeletronBossAI(head, h.hooks, h.player as never);
    expect(head.def.defense).toBe(baseDef);
  });

  it('专家悬浮档 0.03/±4(Y)、0.07/±9.5(X)(:22034-22040)', () => {
    const h = makeHooks(makeWorld(true), P);
    const head = spawn(h, 35, 100, 100);      // 同高 → e.y > player.y-250 走 Y 上抬支
    head.ai1 = 0; head.ai2 = 0; head.vx = 0; head.vy = 0;
    skeletronBossAI(head, h.hooks, h.player as never);
    expect(head.vy).toBeCloseTo(-0.03, 5);
  });

  it('专家悬浮态发 270 追踪髅骨弹(17 伤,LOS 门,:21959-22003)', () => {
    const h = makeHooks(makeWorld(true), P);
    const head = spawn(h, 35, 100, 100);
    head.ai1 = 0; head.ai2 = 0;
    skeletronBossAI(head, h.hooks, h.player as never);
    const shots = h.projectiles.filter((p) => p.projId === 270);
    expect(shots.length).toBe(1);             // ai2=0 → 0%80==0 首发
    expect(shots[0].damage).toBe(17);
    const sp = Math.hypot(shots[0].vx, shots[0].vy);
    expect(sp).toBeGreaterThan(2).toBeLessThan(6);   // num176=5(无手 +2)
  });

  it('旋冲速度每 tick 直设 dir×num200(专家 3.5×1.05×1.1^9×1.1,:22166-22242)', () => {
    const h = makeHooks(makeWorld(true), P);
    const head = spawn(h, 35, 60, 100);       // 距玩家 40 格 = 640px → 全阶梯
    head.ai1 = 1; head.ai2 = 5; head.vx = 0; head.vy = 0;
    skeletronBossAI(head, h.hooks, h.player as never);
    const expected = 3.5 * 1.05 * Math.pow(1.1, 9) * 1.1;   // 无手 ×1.1
    expect(Math.hypot(head.vx, head.vy)).toBeCloseTo(expected, 3);
    // 经典 1.5(无 lerp 逼近)
    const hc = makeHooks(makeWorld(false), P);
    const headC = spawn(hc, 35, 60, 100);
    headC.ai1 = 1; headC.ai2 = 5; headC.vx = 0; headC.vy = 0;
    skeletronBossAI(headC, hc.hooks, hc.player as never);
    expect(Math.hypot(headC.vx, headC.vy)).toBeCloseTo(1.5, 3);
  });
});

// ===========================================================================
// 机械骷髅王(NPC.cs:27736-28054)
// ===========================================================================
describe('Prime 专家档(2026-08-19 台账 E)', () => {
  it('悬浮专家 0.03/±4(Y)(:27819-27824)', () => {
    const h = makeHooks(makeWorld(true), P);
    const head = spawn(h, 127, 100, 100);
    head.ai1 = 0; head.ai2 = 0; head.vx = 0; head.vy = 0;
    skeletronPrimeAI(head, h.hooks, h.player as never);
    expect(head.vy).toBeCloseTo(-0.03, 5);
  });

  it('旋冲专家 6 + 距离阶梯(6×1.05×1.1^9,:27905-27948)', () => {
    const h = makeHooks(makeWorld(true), P);
    const head = spawn(h, 127, 60, 100);      // 距玩家 640px → 全阶梯
    head.ai1 = 1; head.ai2 = 5; head.vx = 0; head.vy = 0;
    skeletronPrimeAI(head, h.hooks, h.player as never);
    expect(Math.hypot(head.vx, head.vy)).toBeCloseTo(6 * 1.05 * Math.pow(1.1, 9), 3);
  });
});

// ===========================================================================
// 史莱姆王(NPC.cs:43436-43735)
// ===========================================================================
describe('史莱姆王跳跃循环/反挂机计数/小史莱姆(2026-08-19 台账 E)', () => {
  const jump = (ai1: number) => {
    const h = makeHooks(makeWorld(false), P);
    const e = spawn(h, 50, 100, FLOOR - 6);   // 站地面
    e.ai0 = 0; e.ai1 = ai1; e.ai2 = 0; e.ai3 = 0;
    e.onGround = true; e.vx = 0; e.vy = 0;
    kingSlimeAI(e, h.hooks, h.player as never);
    return e;
  };

  it('跳序 -8/-8/-6/-13,vx += 4/4/4.5/3.5×dir,回充 -120/-200(:43632-43656)', () => {
    const j0 = jump(0);
    expect(j0.vy).toBeLessThan(-7.5);         // -8 + 共享重力
    expect(j0.vx).toBeCloseTo(4, 5);
    expect(j0.ai1).toBe(1);
    expect(j0.ai0).toBe(-120);
    const j1 = jump(1);
    expect(j1.ai1).toBe(2);
    expect(j1.vx).toBeCloseTo(4, 5);
    const j2 = jump(2);
    expect(j2.vy).toBeLessThan(-5.5);
    expect(j2.vx).toBeCloseTo(4.5, 5);
    expect(j2.ai1).toBe(3);
    const j3 = jump(3);
    expect(j3.vy).toBeLessThan(-12.5);
    expect(j3.vx).toBeCloseTo(3.5, 5);
    expect(j3.ai1).toBe(0);
    expect(j3.ai0).toBe(-200);
  });

  it('充能分档:濒死 +13/t(:43611-43631)', () => {
    const h = makeHooks(makeWorld(false), P);
    const e = spawn(h, 50, 100, FLOOR - 6);
    e.ai0 = -200; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.onGround = true; e.vx = 0; e.vy = 0;
    e.hp = Math.floor(e.maxHp * 0.05);        // 五档全中 +11,基础 +2
    kingSlimeAI(e, h.hooks, h.player as never);
    expect(e.ai0).toBe(-187);
  });

  it('反挂机计数:无视线 +1,有视线 −1 钳 0(:43514-43529);累计 300 落地 → 传送', () => {
    // 无视线:KS(88) 与玩家(100) 之间立墙(x=97,98;KS 宽 ~123px 不得出生即嵌墙)
    const h = makeHooks(makeWorld(false), P);
    const w = h.hooks.world;
    for (let y = FLOOR - 30; y < FLOOR; y++) { w.store.setTile(97, y, STONE); w.store.setTile(98, y, STONE); }
    const e = spawn(h, 50, 88, FLOOR - 6);
    e.ai0 = -200; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.onGround = true;
    for (let t = 0; t < 320; t++) {
      e.onGround = true;
      kingSlimeAI(e, h.hooks, h.player as never);
      if (e.ai1 === 5) break;
    }
    expect(e.ai1).toBe(5);                    // ai2 满 300 → 缩身传送态
    // 有视线:ai2 不累计
    const h2 = makeHooks(makeWorld(false), P);
    const e2 = spawn(h2, 50, 100, FLOOR - 6);
    e2.ai0 = -200; e2.ai1 = 0; e2.ai2 = 0; e2.ai3 = 0;
    for (let t = 0; t < 50; t++) {
      e2.onGround = true;
      kingSlimeAI(e2, h2.hooks, h2.player as never);
    }
    expect(e2.ai2).toBe(0);
    expect(e2.ai1).not.toBe(5);
  });

  it('掉血 5% 出 1-3 只小史莱姆(经典 1 号,专家 1/4 出 535;:43708-43734)', () => {
    for (const expert of [false, true]) {
      const h = makeHooks(makeWorld(expert), P);
      const e = spawn(h, 50, 100, FLOOR - 6);
      e.ai0 = -200; e.ai1 = 0; e.ai2 = 0; e.ai3 = e.maxHp;
      e.onGround = true;
      e.hp = Math.floor(e.maxHp * 0.9);       // 掉 10% → 越线出首批
      kingSlimeAI(e, h.hooks, h.player as never);
      const minions = h.enemies.filter((n) => n.vanillaId === 1 || n.vanillaId === 535);
      expect(minions.length).toBeGreaterThanOrEqual(1);
      expect(minions.length).toBeLessThanOrEqual(3);
      for (const m of minions) {
        if (!expert) expect(m.vanillaId).toBe(1);
        else expect([1, 535]).toContain(m.vanillaId);
        expect([0, -1000, -2000]).toContain(m.ai0);   // -1000*Next(3)
        expect(m.ai1).toBe(0);
      }
      expect(e.ai3).toBe(e.hp);               // 水位补记
    }
  });
});

// ===========================================================================
// 蜂后(NPC.cs:30312-30998)
// ===========================================================================
describe('蜂后专家分支(2026-08-19 台账 E)', () => {
  it('专家防御 +20×(1-血比)(:30313-30318)', () => {
    const h = makeHooks(makeWorld(true), P);
    const bee = spawn(h, 222, 100, 100);
    bee.ai0 = 4;                              // 远距追赶态:不依赖玩家相对位
    const base = bee.def.defense!;
    bee.hp = Math.floor(bee.maxHp / 2);
    queenBeeAI(bee, h.hooks, h.player as never);
    expect(bee.def.defense).toBe(base + 10);
  });

  it('专家俯冲速 16+8=24(:30458-30478)', () => {
    const h = makeHooks(makeWorld(true), P);
    const bee = spawn(h, 222, 100, 100);
    bee.y = (h.player.cy as number) - bee.h / 2;   // 中心同高 → |Δcy|<20 → 俯冲
    bee.ai0 = 0; bee.ai1 = 0; bee.ai2 = 0;
    bee.hp = Math.floor(bee.maxHp * 0.05);
    queenBeeAI(bee, h.hooks, h.player as never);
    expect(Math.hypot(bee.vx, bee.vy)).toBeCloseTo(24, 3);
  });

  it('专家攻式循环数 num662=5(<1/5 血):ai1=6(偶)不换招,经典 6 即换(:30422-30438)', () => {
    const he = makeHooks(makeWorld(true), P);
    const beeE = spawn(he, 222, 100, 100);
    beeE.ai0 = 0; beeE.ai1 = 6; beeE.ai2 = 0;
    beeE.hp = Math.floor(beeE.maxHp * 0.1);
    queenBeeAI(beeE, he.hooks, he.player as never);
    expect(beeE.ai0).toBe(0);                 // 6 ≤ 2×5 → 仍循环(走悬浮支)
    const hc = makeHooks(makeWorld(false), P);
    const beeC = spawn(hc, 222, 100, 100);
    beeC.ai0 = 0; beeC.ai1 = 6; beeC.ai2 = 0;
    queenBeeAI(beeC, hc.hooks, hc.player as never);
    expect(beeC.ai0).toBe(-1);                // 经典 num662=2 → 6 > 4 → 换招
  });

  it('专家毒刺间隔 15/速 13(<10% 血;:30838-30857)', () => {
    const h = makeHooks(makeWorld(true), P);
    const bee = spawn(h, 222, 100, 92);       // 玩家上方 → 满足上位发射门
    bee.ai0 = 3; bee.ai1 = 13; bee.ai2 = 0;
    bee.hp = Math.floor(bee.maxHp * 0.05);
    queenBeeAI(bee, h.hooks, h.player as never);
    expect(bee.ai1).toBe(14);                 // 14 % 15 == 14 → 触发
    const shots = h.projectiles.filter((p) => p.projId === 719);
    expect(shots.length).toBe(1);
    expect(Math.hypot(shots[0].vx, shots[0].vy)).toBeCloseTo(13, 1);   // 8+2+3
  });
});

// ===========================================================================
// 世纪之花弹伤 Remap(NPC.cs:32123)
// ===========================================================================
describe('世花弹伤专家 ×0.9 Remap(:32123)', () => {
  const fireOnce = (expert: boolean) => {
    // H=280:UnderworldLayer=(280-200)=80 格;玩家 y=70(1120px)<1280 不激怒
    const h = makeHooks(makeWorld(expert, 280), { x: 100, y: 70 });
    const e = Enemy.fromVanilla(262, 100 * TILE, 72 * TILE)!;   // 不预置 bInit:入场出 3 钩蔓
    e.id = nextId++;
    if (expert) e.difficulty = 2;            // 原版 npc.difficulty = Main.Difficulty(NPC.cs:18086,
                                              // GDL 浮点档:Classic=1/Expert=2;本仓由 ScaleStats
                                              // 在生成端写入 mainDifficulty(world)——测试直连同口径)
    h.enemies.push(e);
    e.hp = Math.floor(e.maxHp * 0.85);        // >80% → 恒种子 275(22 伤档)
    let guard = 0;
    while (h.projectiles.length === 0 && guard++ < 300) {
      planteraAI(e, h.hooks, h.player as never);
    }
    expect(h.projectiles.length).toBeGreaterThan(0);
    return h.projectiles[0];
  };
  it('经典 22 / 专家 trunc(22×0.9)=19(两级相乘:Remap × 命中端 hostile 缩放)', () => {
    expect(fireOnce(false).damage).toBe(22);
    expect(fireOnce(true).damage).toBe(19);
  });
});

// ===========================================================================
// 月亮领主(NPC.cs:36774-38128)
// ===========================================================================
describe('月总核心 Lerp/清弹/兜底 + 头 -2 帧推进(2026-08-19 台账 E)', () => {
  it('死亡演出 Lerp amount=0.98(命名参数陷阱,:36928):vx 一步收敛到 2%', () => {
    const h = makeHooks(makeWorld(false), P);
    const core = spawn(h, 398, 100, 100);
    core.ai0 = 2; core.ai1 = 0; core.vx = 5; core.vy = 0;
    moonLordCoreAI(core, h.hooks, h.player as never);
    expect(core.vx).toBeCloseTo(5 * 0.02, 5);
    expect(core.vy).toBeCloseTo(-0.49, 3);
  });

  it('死亡演出 ai1==60 清 456/462/455/452/454 + NPC 400(83 号弹保留;:36934-36952)', () => {
    const h = makeHooks(makeWorld(false), P);
    const core = spawn(h, 398, 100, 100);
    core.ai0 = 2; core.ai1 = 59;
    const eye = spawn(h, 400, 100, 100);
    for (const id of [456, 462, 455, 452, 454, 83]) {
      h.projectiles.push(new Arrow(0, 0, 0, 0, 1, 0, id));
    }
    moonLordCoreAI(core, h.hooks, h.player as never);
    expect(eye.dead).toBe(true);
    expect(h.projectiles.filter((p) => p.projId !== 83 && !p.dead)).toHaveLength(0);
    expect(h.projectiles.find((p) => p.projId === 83)!.dead).toBeFalsy();
  });

  it('玩家全灭离场 ai1==40 清弹(:37074-37099)', () => {
    const h = makeHooks(makeWorld(false), P);
    const core = spawn(h, 398, 100, 100);
    core.ai0 = 3; core.ai1 = 39;
    for (const id of [455, 462]) h.projectiles.push(new Arrow(0, 0, 0, 0, 1, 0, id));
    moonLordCoreAI(core, h.hooks, h.player as never);
    expect(h.projectiles.every((p) => p.dead)).toBe(true);
  });

  it('二阶段兜底 1↔3 归位:槽 1 = 三连 462(35 伤),槽 3 = 452 螺旋(35 伤)', () => {
    const h = makeHooks(makeWorld(false), P);
    const core = spawn(h, 398, 100, 100);
    core.ai0 = 1; core.ai1 = 165;             // 槽 1(90..179)inSlot=76=dur-14 → 首发 462
    moonLordCoreAI(core, h.hooks, h.player as never);
    expect(h.projectiles.filter((p) => p.projId === 462 && p.damage === 35).length).toBe(1);
    core.ai1 = 539;                           // 槽 5(495..694)inSlot=45 → 452 螺旋首发
    moonLordCoreAI(core, h.hooks, h.player as never);
    expect(h.projectiles.filter((p) => p.projId === 452 && p.damage === 35).length).toBe(1);
  });

  it('头 -2 残肢不提前 return:帧推进尾部照跑(spin 回落 localAI[0])', () => {
    const h = makeHooks(makeWorld(false), P);
    const core = spawn(h, 398, 100, 100);
    core.ai0 = 0; core.ai1 = 0; core.ai2 = 0;
    const head = spawn(h, 396, 100, 90);
    head.ai0 = -2; head.ai1 = 0; head.ai2 = 0; head.ai3 = core.id;
    head.spin = 5;
    moonLordHeadAI(head, h.hooks, h.player as never);
    expect(head.ai0).toBe(-2);
    expect(head.def.damage).toBe(80);
    expect(head.spin).not.toBe(5);            // = x.l0(0)——曾提前 return 冻住
    // 核心死亡演出中 → -2 转 -3(此 tick 允许 return)
    core.ai0 = 2;
    moonLordHeadAI(head, h.hooks, h.player as never);
    expect(head.ai0).toBe(-3);
  });
});

// ===========================================================================
// 鲨鱼龙 / 猪鲨(NPC.cs:35196-35328 / 49143-50127)
// ===========================================================================
describe('鲨鱼龙存续与音效 + 猪鲨 α/瞬移(2026-08-19 台账 E)', () => {
  it('玩家死后不消散:TargetClosest 重瞄存续(:35200-35205)', () => {
    const h = makeHooks(makeWorld(false), P);
    (h.player as unknown as { dead: boolean }).dead = true;
    const s = spawn(h, 372, 100, 90);
    s.ai0 = 0; s.ai1 = 0; s.ai3 = -1.5;
    sharkronAI(s, h.hooks, h.player as never);
    expect(s.dead).toBe(false);               // 曾 dead=true 即散
    expect(s.facing).toBe(1);                 // direction = 1
    expect(s.vy).toBe(-1.5);                  // 蓄力上升照跑
  });

  it('蓄力期满起扑音(NPC_Killed_19)+ 16 速扑咬(:35242-35261)', () => {
    const h = makeHooks(makeWorld(false), P);
    const s = spawn(h, 372, 90, 90);
    s.ai0 = 0; s.ai1 = 89; s.ai3 = 0;
    sharkronAI(s, h.hooks, h.player as never);
    expect(s.ai0).toBe(1);
    // PlaySound(4,…,19)=case4 死音库 NPC_Killed_19(曾误 NPC_Hit_19,2026-08-19 终审修)
    expect(h.sfx.some((f) => f.includes('NPC_Killed_19'))).toBe(true);
    expect(Math.hypot(s.vx, s.vy)).toBeCloseTo(16, 3);
  });

  it('撞墙即死播 DeathSound(NPC_Killed_1,:35295-35303)', () => {
    const h = makeHooks(makeWorld(false), P);
    const s = spawn(h, 372, 100, FLOOR + 1);  // 嵌地面实心
    s.ai0 = 1; s.ai1 = 1;
    sharkronAI(s, h.hooks, h.player as never);
    expect(s.dead).toBe(true);
    expect(h.sfx.some((f) => f.includes('NPC_Killed_1'))).toBe(true);
  });

  it('猪鲨入实心块 α 钳 150(非 255;:49346-49363)', () => {
    const h = makeHooks(makeWorld(false), P);
    const d = spawn(h, 370, 100, FLOOR + 1);  // 中心嵌地
    d.ai0 = 1; d.spawnAlpha = 149;
    dukeFishronAI(d, h.hooks, h.player as never);
    expect(d.spawnAlpha).toBe(150);
    d.spawnAlpha = 200;                       // 越界值也收敛回 150(原版两侧钳)
    dukeFishronAI(d, h.hooks, h.player as never);
    expect(d.spawnAlpha).toBe(150);
  });

  it('专家态 12 瞬移后 rotation += π 侧翻补偿(:50083-50097)', () => {
    const h = makeHooks(makeWorld(false), P);
    const d = spawn(h, 370, 140, 90);         // 玩家右 → ai1=+300 → 瞬移到玩家左侧
    d.ai0 = 12; d.ai1 = 0; d.ai2 = 15;        // teleT/2=15 当帧瞬移
    d.spin = 0;
    dukeFishronAI(d, h.hooks, h.player as never);
    // 瞬移后玩家在右 → direction=1;初 spr=1 ≠ -1 → spin += π(模 2π 比较,含瞄准段微偏)
    expect(Math.abs(modTau(d.spin) - Math.PI)).toBeLessThan(0.1);
  });
});
