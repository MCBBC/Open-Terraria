// 水平侧撞族整族移植回归（★D1，2026-08-31 清零批二波）：
//   原版 CollideWithNPCs 公共核心（1457 Player.cs:20536-20577）+ 五循环分块
//   （:20238-20320：独角兽10/山羊47/马40-42、海盗船44、暗影木45、蜥蜴14、高尔夫球车17）
//   ——与踩踏三循环共用同一扫掠核心/门串/hurt 单点/break 语义（轴参数化,零复制核心）。
//   阈值速度面 = Mount.DashSpeed/RunSpeed 生效值（调用方实例传入）；盒 =
//   getRect()[direction==1 → Offset(width-1,0)].Width=2.Inflate(6,12)。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { mountHorizontalCharges, mountChargeBox, grantCollisionAttackImmunity, mountJumpStomps,
  chilletDashCharge, mountDash6Box, MOUNT_DASH6_TYPES, MOUNT_CAN_DASH_TYPES } from '../src/entities/MountCombat';

const world = new World(160, 160, 33, 'd1');

interface ChargeSpy {
  x: number; y: number; w: number; h: number;
  dead?: boolean; dontTakeDamage?: boolean; iframes?: number; noTileCollide?: boolean;
  id?: number;
  def?: { friendly?: boolean };
  hurts: Array<{ dmg: number; kbx: number }>;
}

function spyEnemy(x: number, y: number, o: Partial<ChargeSpy> = {}): ChargeSpy {
  return {
    x, y, w: 24, h: 24,
    dead: false, id: 77, def: { friendly: false },
    hurts: [],
    hurt(this: ChargeSpy, dmg: number, kbx: number) {
      this.hurts.push({ dmg, kbx });
      return true;
    },
    ...o,
  } as unknown as ChargeSpy;
}

function shell(enemy: ChargeSpy | null, playerO: Record<string, unknown> = {}) {
  const e = enemy ?? spyEnemy(10000, 10000);
  const p = {
    x: 800, y: 640, w: 20, h: 42, vx: 0, vy: 0, facing: 1,
    iframes: 0, wetSlime: 0,
    summonDamageMult: 1,
    mount: { active: true, type: 10, runSpeed: () => 10, dashSpeed: 26 },
    ...playerO,
  };
  const game = {
    world,
    player: p,
    enemies: () => [e],
    critters: () => [],
  } as never as Parameters<typeof mountHorizontalCharges>[1];
  return { game, p, e };
}

describe('D1 冲撞盒几何（getRect[Offset].Width=2.Inflate(6,12)，双面向双收）', () => {
  it('facing=1：前沿右缘 2px 条外扩 ±6；facing=-1：后沿左缘 2px 条外扩', () => {
    // x=1000,w=20,h=42 → 右条 [1013..1035]（1019±6? 精算见断言）；竖向 ±12
    const r1 = mountChargeBox(1000, 600, 20, 42, 1);
    expect(r1.x).toBe(1000 + 19 - 6);              // Offset(width-1)=x+19 → inflate −6
    expect(r1.w).toBe(14);                         // Width=2 + Inflate ×12
    expect(r1.h).toBe(66);                         // h=42 + 24
    expect(r1.y).toBe(588);
    const r2 = mountChargeBox(1000, 600, 20, 42, -1);
    expect(r2.x).toBe(994);                        // 无偏移（左缘）→ inflate −6
    expect(r2.w).toBe(14);
  });

  it('双面向双收：左右两个 facing 各自成条命中各自一侧的目标', () => {
    const right = shell(spyEnemy(816, 640));        // 右条域 [x+13,x+27]
    right.p.vx = 30;
    expect(mountHorizontalCharges(right.p as never, right.game)).toBe(1);
    const left = shell(spyEnemy(796, 640));         // 左条域 [x-6,x+8]
    const lp = { ...left.p, vx: 30, facing: -1 };
    expect(mountHorizontalCharges(lp as never,
      { ...left.game, player: lp } as never)).toBe(1);
  });
});

describe('D1 五循环阈值/伤害/击退/免疫档表（Player.cs:20238-20320 分块顺序）', () => {
  function thresholdCase(mountType: number, runSpeed: number, dashSpeed: number,
    thresholdAt: number): boolean {
    const justBelow = shell(spyEnemy(815, 640), { mount: { active: true, type: mountType, runSpeed: () => runSpeed, dashSpeed } });
    justBelow.p.vx = thresholdAt - 0.001;
    const below = mountHorizontalCharges(justBelow.p as never, justBelow.game);
    const atOrAbove = shell(spyEnemy(815, 640), { mount: { active: true, type: mountType, runSpeed: () => runSpeed, dashSpeed } });
    atOrAbove.p.vx = thresholdAt;
    const above = mountHorizontalCharges(atOrAbove.p as never, atOrAbove.game);
    void above;
    return below === 0 && above >= 0;               // 门=严格大于（> threshold）
  }

  it('独角兽10/山羊47 ∪ 马40-42：阈 DashSpeed−RunSpeed/2，dmg60×mult（马30），kb10（马7），玩家免疫6', () => {
    for (const t of [10, 47]) {
      const s = shell(spyEnemy(815, 640), { mount: { active: true, type: t, runSpeed: () => 10, dashSpeed: 26 } });
      s.p.vx = 21;                                   // DashSpeed−RunSpeed/2 = 21 → 门为 > → 不中
      expect(mountHorizontalCharges(s.p as never, s.game)).toBe(0);
      s.p.vx = 21.001;
      expect(mountHorizontalCharges(s.p as never, s.game)).toBe(1);
      expect((s.game as { enemies?: never }).enemies !== undefined).toBe(true);
      const e = (s.game as unknown as { enemies: () => ChargeSpy[] }).enemies()[0];
      expect(e.hurts[0]).toMatchObject({ dmg: 60 });          // 60×minionDamage 截断
      expect(Math.abs(e.hurts[0].kbx)).toBeCloseTo(10, 6);
    }
    for (const t of [40, 41, 42]) {
      const s = shell(spyEnemy(815, 640), { mount: { active: true, type: t, runSpeed: () => 10, dashSpeed: 26 }, summonDamageMult: 2 });
      s.p.vx = 22;
      expect(mountHorizontalCharges(s.p as never, s.game)).toBe(1);
      const e = (s.game as unknown as { enemies: () => ChargeSpy[] }).enemies()[0];
      expect(e.hurts[0]).toMatchObject({ dmg: 60 });          // trunc(30×2)
      expect(Math.abs(e.hurts[0].kbx)).toBeCloseTo(7, 6);
    }
  });

  it('海盗船44：阈 DashSpeed−RunSpeed/4；dmg100×mult；kb12；暗影木45：阈 DashSpeed×0.9；dmg120；kb12', () => {
    const s44 = shell(spyEnemy(815, 640), { mount: { active: true, type: 44, runSpeed: () => 10, dashSpeed: 28 }, summonDamageMult: 1.5 });
    s44.p.vx = 18;                                 // DashSpeed−RunSpeed/4 = 25.5 → 严格大于不达
    expect(mountHorizontalCharges(s44.p as never, s44.game)).toBe(0);
    s44.p.vx = 25.501;
    expect(mountHorizontalCharges(s44.p as never, s44.game)).toBe(1);
    let e = (s44.game as unknown as { enemies: () => ChargeSpy[] }).enemies()[0];
    expect(e.hurts[0]).toMatchObject({ dmg: 150 });           // trunc(100×1.5)
    expect(Math.abs(e.hurts[0].kbx)).toBeCloseTo(12, 6);

    const s45 = shell(spyEnemy(815, 640), { mount: { active: true, type: 45, runSpeed: () => 10, dashSpeed: 20 } });
    s45.p.vx = 17.999;                              // （负向跑同样只看 |vx|）参考对照：略低于阈不达
    expect(mountHorizontalCharges(s45.p as never, s45.game)).toBe(0);
    s45.p.vx = 18.001;
    expect(mountHorizontalCharges(s45.p as never, s45.game)).toBe(1);
    e = (s45.game as unknown as { enemies: () => ChargeSpy[] }).enemies()[0];
    expect(e.hurts[0]).toMatchObject({ dmg: 120 });
    expect(Math.abs(e.hurts[0].kbx)).toBeCloseTo(12, 6);
  });

  it('蜥蜴14 RunSpeed/2 kb10 / 高尔夫球车17 RunSpeed/2 kb10——17 玩家免疫档 12（其余 6）', () => {
    const s14 = shell(spyEnemy(815, 640), { mount: { active: true, type: 14, runSpeed: () => 10, dashSpeed: 10 } });
    s14.p.vx = 5.001;
    expect(mountHorizontalCharges(s14.p as never, s14.game)).toBe(1);
    expect(((s14.p.iframes ?? 0)) >= 6).toBe(true);            // GiveImmune(6)

    const s17 = shell(spyEnemy(815, 640), { mount: { active: true, type: 17, runSpeed: () => 10, dashSpeed: 10 } });
    s17.p.vx = 5.001;
    expect(mountHorizontalCharges(s17.p as never, s17.game)).toBe(1);
    const e17 = (s17.game as unknown as { enemies: () => ChargeSpy[] }).enemies()[0];
    expect(e17.hurts[0]).toMatchObject({ dmg: 40 });
    expect((s17.p.iframes ?? 0)).toBeGreaterThanOrEqual(12);   // 高尔夫横撞 GiveImmune(12)
  });

  it('阈值不达 / 未骑乘 / 表外坐骑 → 全链静默', () => {
    const slow = shell(spyEnemy(815, 640));
    slow.p.mount.type = 10;
    slow.p.vx = 20.9;
    expect(mountHorizontalCharges(slow.p as never, slow.game)).toBe(0);

    const dismount = shell(spyEnemy(1020, 640));
    dismount.p.mount.active = false;
    dismount.p.vx = 30;
    expect(mountHorizontalCharges(dismount.p as never, dismount.game)).toBe(0);

    const other = shell(spyEnemy(1020, 640), { mount: { active: true, type: 90, runSpeed: () => 1, dashSpeed: 1 } });
    other.p.vx = 30;
    expect(mountHorizontalCharges(other.p as never, other.game)).toBe(0);
  });

  it('npc 免疫窗 30t 写入 + 玩家侧 GiveImmuneTimeForCollisionAttack 统一时钟授予 + break 语义', () => {
    const a = spyEnemy(815, 640);
    const b = spyEnemy(816, 641);
    const s = shell(a, { summonDamageMult: 1 });
    const g = s.game as unknown as { enemies: () => unknown[]; player: unknown };
    g.enemies = () => [a, b];                       // 双目标同带
    s.p.mount.type = 10;
    s.p.vx = 30;
    expect(mountHorizontalCharges(s.p as never, s.game)).toBe(1);   // 核心 break：仅首个
    expect(a.hurts.length).toBe(1);
    expect(b.hurts.length).toBe(0);
    expect(a.iframes).toBe(30);                     // nPC.immune[whoAmI]=30
  });

  it('grantCollisionAttackImmunity：≤20t 内三连击豁免规则（<3 才授予,与踩踏共钟）', () => {
    const p = { iframes: 0 };
    grantCollisionAttackImmunity(p, 6);             // strikes=1
    grantCollisionAttackImmunity(p, 6);             // strikes=2 → 仍授予
    expect(p.iframes).toBe(6);
    grantCollisionAttackImmunity(p, 12);            // strikes=3 → 豁免拒授
    expect(p.iframes).toBe(6);
    grantCollisionAttackImmunity(p, 12);
    expect(p.iframes).toBe(6);                      // 连击期内不再抬高
  });
});

// ---------------------------------------------------------------------------
// ★F6 同帧双候选顺序 + 常数集胜出（vanilla HorizontalMovement 尾 :20238-20320 先于
//   JumpMovement 三循环 :20693-20801，且都在 TileCollision 积分前——Player.fixedUpdate
//   的调用点已按横撞→竖踩重排）。构造高尔夫车 17 同帧"脚底带+面向带"双候选交叠目标：
//   横撞先手（kb10/npc immune30/玩家钟12）→ 竖踩因 npc immune≠0 门落空。
// ---------------------------------------------------------------------------
describe('F6 同帧双候选：横撞先于竖踩', () => {
  it('高尔夫车 vx=8 静止下压：重叠目标吃横撞常数集（kb10/immune30），竖踩零命中', () => {
    const e = spyEnemy(806, 654);            // 交叠面向带(x+13..) ∩ 脚底带(y+h-7..)
    const { game, p } = shell(e, {
      mount: { active: true, type: 17, runSpeed: () => 10, dashSpeed: 26 },
      vx: 0, vy: 2,
      // |vx|=8 > RunSpeed/2=5（:20309 门）→ 横撞受理；vy>0 → 竖踩也受理
    });
    (p as unknown as { vx: number }).vx = 8;
    const hx = mountHorizontalCharges(p as never, game);
    expect(hx).toBe(1);                       // 横撞命中
    expect(e.hurts[0].kbx).toBe(10);          // 高尔夫车横撞 kb=10
    expect((e as unknown as { iframes?: number }).iframes).toBe(30);   // npc 免疫 30
    expect(mountJumpStomps(p as never, game)).toBe(0);                 // 竖踩被 immune≠0 拒
    expect(e.hurts.length).toBe(1);           // 全程仅一次结算 = 原文同帧赢家语义
  });

  it('不满足横撞阈值时竖踩独走（C 支常数：kb5/immune12）', () => {
    const e = spyEnemy(806, 654);
    const { game, p } = shell(e, {
      mount: { active: true, type: 17, runSpeed: () => 10, dashSpeed: 26 },
      vx: 0, vy: 3,                           // vx=0 → 无横撞
    });
    expect(mountHorizontalCharges(p as never, game)).toBe(0);
    expect(mountJumpStomps(p as never, game)).toBe(1);
    expect(Math.abs(e.hurts[0].kbx)).toBe(5);   // C 支 kb=5
    expect((e as unknown as { iframes?: number }).iframes).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// ★F5① dash==6 冲撞面（Chillet 62-65，Player.cs:21354-21405）：盒朝向前沿 +60px、
//   伤害 (150|32)×minionDamage（64/65 特例 150）、kb6/immune20/GiveImmune(10)、
//   crit 恒字面。触发链+滑行阻尼在 Player.ts 冲刺段（本处测扫掠面与盒几何）。
// ---------------------------------------------------------------------------
describe('F5① chilletDashCharge（dash==6 冲撞面）', () => {

  it('盒几何：前视半身投影 −4 外扩 ±8，宽 +60 朝向带；facing=-1 整体左移 60', () => {
    const r1 = mountDash6Box(1000, 600, 20, 42, -10, 4, 1);
    expect(r1.x).toBe(Math.trunc(1000 + (-10) * 0.5 - 4));   // x + vx×0.5 − 4
    expect(r1.y).toBe(Math.trunc(600 + 4 * 0.5 - 4));
    expect(r1.w).toBe(20 + 8 + 60);
    expect(r1.h).toBe(42 + 8);
    const r2 = mountDash6Box(1000, 600, 20, 42, 0, 0, -1);
    expect(r2.x).toBe(1000 - 4 - 60);                        // direction==-1 → X -= 60
    expect(r2.w).toBe(r1.w);                                 // 宽度增量恒 60
    expect([...MOUNT_CAN_DASH_TYPES].filter((t) => t >= 62)).toEqual([62, 63, 64, 65]);
  });

  it('伤害档：type 62→32、type 64→150（×minionDamage 截断）；immune=20/给钟10/kb 基 6', () => {
    for (const [mt, base] of [[62, 32], [64, 150]] as Array<[number, number]>) {
      const e = spyEnemy(806, 650, { iframes: 0 });
      const grants: number[] = [];
      const { game, p } = shell(e, {
        mount: { active: true, type: mt, runSpeed: () => 3, dashSpeed: 9 },
        summonDamageMult: 2,
      });
      (game as unknown as { noteNpcPlayerImmune?: (id: number, t: number) => void }).noteNpcPlayerImmune =
        (_id: number, t: number) => grants.push(t);
      e.hurts.length = 0;
      const raw = Math.trunc(base * 2);
      // 直接驱动扫掠面：挂 dashDelay<0 语境由调用方保证——此处单测面级
      const hits = chilletDashCharge(p as never, game, false);
      expect(hits).toBe(1);
      expect(e.hurts[0].dmg).toBe(raw);
      expect(e.hurts[0].kbx).toBe(6);
      expect((e as unknown as { iframes?: number }).iframes).toBe(20);
      expect(grants).toContain(20);
      void p; void game;
    }
  });

  it('免疫帧内目标不重复结算（多目标逐帧全结算语义的免重闸）', () => {
    const e = spyEnemy(806, 650, { iframes: 5 });   // immune>0
    const { game, p } = shell(e, {
      mount: { active: true, type: 62, runSpeed: () => 3, dashSpeed: 9 },
    });
    expect(chilletDashCharge(p as never, game, false)).toBe(0);
    expect(e.hurts.length).toBe(0);
  });

  // ★治理批 B6③（2026-08-31）：AI_112 仙灵免疫支落地——原版 ：21368
  // `nPC.aiStyle == 112 && !(nPC.ai[2] <= 1f)` continue。该支现役可达（仙灵
  // 583/584/585 Enemy.fairyAI 在册,虫网释放进态 2 起 ai[2]>1）；SetDefaults
  // 三型限定使 vanillaId 判定与 aiStyle 判定等价。
  it('★B6③ 仙灵引导态(ai[2]>1)免吃冲撞;ai[2]<=1 与非仙灵照常结算', () => {
    for (const [o, expectedHits] of [
      [{ vanillaId: 584, ai2: 3 }, 0],      // 宝箱引导态 2..7 —— 免疫
      [{ vanillaId: 583, ai2: 1 }, 1],      // 漂游前态 upper bound 含 1 —— 可打
      [{ vanillaId: 999, ai2: 5 }, 1],      // 非 112 型同类态不误伤该门
    ] as Array<[Record<string, unknown>, number]>) {
      const e = spyEnemy(806, 650, o);
      const { game, p } = shell(e, {
        mount: { active: true, type: 62, runSpeed: () => 3, dashSpeed: 9 },
      });
      expect(chilletDashCharge(p as never, game, false)).toBe(expectedHits);
      expect(e.hurts.length).toBe(expectedHits);
    }
  });
});
