// ★BJ383（2026-09-28）proj1457 族二窗回归：
//   件 1 = 幽灵兜帽吸血 per-class 补课二窗（BJ380/382 登记债收尾——proj1457 族）：
//     440/704/731/950/1115/1116/1117/1122 + 482(ClingerStaffWallProj) 逐弹挂
//     SpectreSoulProj.ghostHealProc 单源（受理位=dealContacts onHit / damageAlongBolt
//     StrikeNPC 后;proc 先于 :14263 numHits++;拒收不 proc 不计数;298 出生由
//     Game.applyLifeSteal 单源自证）。439 定谳=Damage_CanDealDamage 排除表成员
//     （Projectile.cs:12461 type==439）→ 原版零命中面,不接线（备案）。
//   件 2 = proj1457.ts 全 dealContacts 调用方 critter 桶补齐（BJ381 登记债「其余
//     11 个」）——逐弹判据（Terarria1457/Terraria/Projectile.cs）：
//     ①friendly 弹伤 critter（Damage_PVE_Inner :12618 flag=!friendly 恒真;拒收唯
//       CanNPCBeHitByPlayerOrPlayerProjectile :20673-20689,玩家直射族仅受
//       dontHurtCritters 门）;hostile 弹恒不伤（:12631 !(hostile & flag2) 支——
//       本批 12 调用方全 friendly,无例外成员）。
//     ②穿透语义 :14184 `penetrate>0 → --;归零 keepIterating=false` + Update :17312
//       `penetrate==0 → Kill`：penetrate=1（440/731/1116/908/1115 一档）critter 受击
//       弹亡;penetrate=−1（1126/1127/1128/1129/704/950/482）不亡。
//     ③1128 尾孢子 Damage_CanDealDamage :12463（type==1128∧ai[1]>=1）→ Damage() 整跳
//       = critter 亦零伤（门内接线）。1115 critter 受击耗穿透档（hits 单计数=
//       numHits,:14263 critter 亦入账）。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';
import {
  LaserMachinegunLaser, ThunderBoltShot, BookStormTwister, PrincessMagicCircle,
  GlacierFangShot, PetalstormShot, StormLightning, ChloroClaymoreBlade,
  ChloroSaberStab, ChloroSporeCloud, ChloroBladeSlam, TitaniumStormShard,
} from '../src/entities/proj1457';
import { ClingerStaffWallProj } from '../src/entities/ClingerStaffWallProj';
import type { GlacierFangCtl } from '../src/entities/proj1457';

interface StealCall {
  kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean;
}

interface CritterCall { dmg: number; fromPlayer: boolean }

function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  const e = {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0,
    // cx/cy 中心读数（StormLightning 索敌/MoveTowards 消费——缺读=NaN 沿锁直写）
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number }, dmg: number): boolean {
      this.attempts++;
      this.lastStrikeDealt = dmg;                 // 无防御桩:num41=dmg
      return true;
    },
  };
  return e;
}

function mkCritter(px: number, py: number) {
  const c = {
    x: px, y: py, w: 18, h: 20, dead: false,
    calls: [] as CritterCall[],
    hurt(dmg: number, _kx: number, _ky: number, _g: unknown, _armorPen: number,
      _crit: boolean, _pierce: number, fromPlayer: boolean): boolean {
      c.calls.push({ dmg, fromPlayer });
      c.dead = true;                              // critter lifeMax=5 一击即死(全族)
      return true;
    },
  };
  return c;
}

function makeHooks(opts: {
  enemies?: unknown[]; critters?: unknown[]; ste?: StealCall[];
  player?: Record<string, unknown>; projectiles?: unknown[];
} = {}): GameHooks {
  const player = opts.player ?? {
    equipStats: {}, cx: 80 * TILE, cy: 90 * TILE, x: 80 * TILE - 10, y: 90 * TILE - 21,
    w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
    buffs: { has: () => false },
  };
  const hooks = {
    world: { store: new TileStore(200, 120) } as never,
    player,
    enemies: () => opts.enemies ?? [],
    critters: () => opts.critters ?? [],
    projectiles: () => opts.projectiles ?? [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {}, playSfxAt: () => {},
    showPickupLabel: () => {},
    addLightAt: () => {},
    startLoopSfx: () => ({ stop: () => {}, setVolume: () => {}, playing: true, dead: false }),
    spawnDust: () => null,
    applyLifeSteal: (kind: 'vampire' | 'ghost', dmg: number, numHits: number,
      x: number, y: number, isMagic?: boolean) => {
      opts.ste?.push({ kind, dmg, numHits, x, y, isMagic: !!isMagic });
      return 0;
    },
    stack: { anyTagged: () => false, hasActiveEffect: () => false },
  };
  return hooks as unknown as GameHooks;
}

const PX = 80;      // 基准列（px 格）——各弹以 (PX*TILE, 90*TILE) 为锚
const PY = 90;

// ================= 件 1：幽灵兜帽吸血 proc（ghostHealProc 单源接线） =================

describe('BJ383 件1:440 激光机枪弹 ghostHeal proc（dealContacts onHit 受理位）', () => {
  it('命中敌 → proc:kind=ghost/dmg=num41/numHits=0(自增前)/出生=受害者 Center/isMagic', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(1, PX, PY);
    const g = makeHooks({ enemies: [e], ste });
    const l = new LaserMachinegunLaser(PX * TILE + 5, PY * TILE + 5, 0, 0, 60, 2);
    l.critChance = 0;
    l.fixedUpdate(1 / 60, g);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(1);
    expect(ste[0].kind).toBe('ghost');
    expect(ste[0].dmg).toBe(e.lastStrikeDealt);            // num41 等位（防后实扣）
    expect(ste[0].numHits).toBe(0);                        // :14263 自增在 proc 后
    expect(ste[0].x).toBe(PX * TILE + 12);                 // 受害者 Center（:13879）
    expect(ste[0].y).toBe(PY * TILE + 12);
    expect(ste[0].isMagic).toBe(true);                     // 440 magic 数据面（:5125）
    expect(l.pveNumHits).toBe(1);                          // 受理后自增
  });

  it('拒收（iframes>0 内环免疫门）不 proc 不计数（:12635 门整跳）', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(2, PX, PY);
    e.iframes = 2;
    const g = makeHooks({ enemies: [e], ste });
    const l = new LaserMachinegunLaser(PX * TILE + 5, PY * TILE + 5, 0, 0, 60, 2);
    l.critChance = 0;
    l.fixedUpdate(1 / 60, g);
    expect(e.attempts).toBe(0);
    expect(ste.length).toBe(0);
    expect(l.pveNumHits).toBe(0);
  });

  it('victim 门（canGhostHeal=false 族 384）不 proc 仍计数（numHits++ 无条件 :14263）', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(3, PX, PY, 24, 24, 384);
    const g = makeHooks({ enemies: [e], ste });
    const l = new LaserMachinegunLaser(PX * TILE + 5, PY * TILE + 5, 0, 0, 60, 2);
    l.critChance = 0;
    l.fixedUpdate(1 / 60, g);
    expect(e.attempts).toBe(1);
    expect(ste.length).toBe(0);                            // 吸血被 victim 门滤
    expect(l.pveNumHits).toBe(1);                          // 计数不受 victim 门
  });
});

describe('BJ383 件1:704 风暴 proc ladder + critter 入账面', () => {
  it('双敌同拍受理 → ladder numHits 0/1（proc 先于自增）;累计 pveNumHits=2', () => {
    const ste: StealCall[] = [];
    const e1 = mkEnemy(11, PX, PY);
    const e2 = mkEnemy(12, PX + 1, PY + 3);              // 构造参=中心:盒 1250..1310/1335..1545
    const g = makeHooks({ enemies: [e1, e2], ste });
    const t = new BookStormTwister(PX * TILE, PY * TILE, 0, 63, 9);
    t.critChance = 0;
    t.fixedUpdate(1 / 60, g);
    expect(ste.length).toBe(2);
    expect(ste[0].numHits).toBe(0);
    expect(ste[1].numHits).toBe(1);                        // ladder 0.15 档实参
    expect(ste.every((s) => s.kind === 'ghost' && s.isMagic)).toBe(true);
    expect(t.pveNumHits).toBe(2);
  });

  it('critter 受击入 numHits 账但不吸血（lifeMax=5 → flag10 lifeMax>5 段恒假）', () => {
    const ste: StealCall[] = [];
    const c = mkCritter(PX * TILE + 20, PY * TILE + 100);
    const g = makeHooks({ critters: [c], ste });
    const t = new BookStormTwister(PX * TILE, PY * TILE, 0, 63, 9);
    t.critChance = 0;
    t.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);                        // BJ381 命中面维持
    expect(c.calls[0].dmg).toBe(5);
    expect(t.pveNumHits).toBe(1);                          // :14263 无条件入账
    expect(ste.length).toBe(0);                            // hitCritters 支不 proc
    expect(t.dead).toBe(false);                            // penetrate=−1 不消耗
  });
});

describe('BJ383 件1:731/950/1116/1115 proc（逐弹受理位）', () => {
  it('731 命中敌 → proc（magic :7701）numHits=0/自增后 1', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(21, PX, PY);
    const g = makeHooks({ enemies: [e], ste });
    const b = new ThunderBoltShot(PX * TILE, PY * TILE, 0, 0, 24, 3);
    b.critChance = 0;
    b.fixedUpdate(1 / 60, g);
    expect(ste.length).toBe(1);
    expect(ste[0].kind).toBe('ghost');
    expect(ste[0].numHits).toBe(0);
    expect(ste[0].isMagic).toBe(true);
    expect(b.pveNumHits).toBe(1);
  });

  it('950 魔法阵命中敌 → proc（magic :8969）', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(22, PX, PY);
    const g = makeHooks({ enemies: [e], ste });
    const c = new PrincessMagicCircle(PX * TILE, PY * TILE, 50, 2);
    c.critChance = 0;
    c.fixedUpdate(1 / 60, g);
    expect(ste.length).toBe(1);
    expect(ste[0].isMagic).toBe(true);
    expect(ste[0].numHits).toBe(0);
    expect(c.pveNumHits).toBe(1);
  });

  it('1116 花瓣命中敌 → proc + penetrate=1 弹亡（onHit 内序:proc→计数→Kill）', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(23, PX, PY);
    const g = makeHooks({ enemies: [e], ste });
    const p = new PetalstormShot(PX * TILE, PY * TILE, 0, 0, 50, 2, 0);
    p.critChance = 0;
    p.fixedUpdate(1 / 60, g);
    expect(ste.length).toBe(1);
    expect(ste[0].numHits).toBe(0);
    expect(p.pveNumHits).toBe(1);
    expect(p.dead).toBe(true);                             // :10422 penetrate=1
  });

  it('1115 释放冰矛命中敌 → proc（hits 读自增前值=0）;penTier=1 耗尽弹亡', () => {
    const ste: StealCall[] = [];
    const g = makeHooks({ ste });
    const ctl: GlacierFangCtl = {
      channel: () => false, aim: () => ({ x: 0, y: 0 }), payMana: () => {},
      chargeRate: () => 1,
    };
    const shot = new GlacierFangShot(PX * TILE, PY * TILE, 0, 0, 60, 2, ctl);
    shot.critChance = 0;
    shot.fixedUpdate(1 / 60, g);                           // 释放拍（charge=0 → penTier=1）
    const e = mkEnemy(24, (shot.x + 4) / TILE, (shot.y + 4) / TILE);
    (g as unknown as { enemies: () => unknown[] }).enemies = () => [e];
    shot.fixedUpdate(1 / 60, g);
    expect(ste.length).toBe(1);
    expect(ste[0].numHits).toBe(0);                        // hits 自增前
    expect(ste[0].isMagic).toBe(true);                     // 1115 magic（:10469）
    expect(shot.dead).toBe(true);                          // hits=1 ≥ penTier=1
  });
});

describe('BJ383 件1:1117/1122 bolt 面 proc + 1091 同面反例（magic/hostile 过滤）', () => {
  it('1117 Kill 帧 bolt 命中敌 → proc（magic :10433）;proc 先于 numHits++', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(31, PX, PY, 64, 64);                 // 大盒盖爆域/折线
    const g = makeHooks({ enemies: [e], ste });
    const bolt = new StormLightning(1117, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    // 寿命 30 → doKill（bolt 伤害结算面）;尸检期 visualTotal=45 后 dead=true
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(bolt.dead).toBe(true);
    expect(ste.length).toBe(1);
    expect(ste[0].kind).toBe('ghost');
    expect(ste[0].isMagic).toBe(true);
    expect(ste[0].numHits).toBe(0);
    expect(bolt.pveNumHits).toBe(1);
  });

  it('1091 世界雷同面 → 不 proc（SetDefaults :10178-10186 无 magic 行+hostile;ghostHealProc magic 门过滤）', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(32, PX, PY, 64, 64);
    const g = makeHooks({ enemies: [e], ste });
    const bolt = new StormLightning(1091, PX * TILE + 8, PY * TILE + 8, 60, 2);
    bolt.critChance = 0;
    (bolt as unknown as { life: number }).life = 2;        // 压寿命（缺省 240）直达 doKill
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);   // +45 尸检期
    expect(bolt.dead).toBe(true);
    expect(e.attempts).toBe(1);                            // 敌面照常结算
    expect(ste.length).toBe(0);                            // 吸血零行为（flag10 !hostile 同判）
  });
});

describe('BJ383 件1:482 诅咒焰墙 proc（ClingerStaffWallProj 传面）', () => {
  it('墙内敌 → proc（magic :5584）;critter 入墙 5 伤弹不亡+入账不吸血', () => {
    const ste: StealCall[] = [];
    const e = mkEnemy(101, PX, PY);
    const g = makeHooks({ enemies: [e], ste });
    const wall = new ClingerStaffWallProj(PX * TILE, PY * TILE, PY * TILE, 240, 50, 2);
    wall.critChance = 0;
    wall.fixedUpdate(1 / 60, g);
    expect(ste.length).toBe(1);
    expect(ste[0].isMagic).toBe(true);
    expect(ste[0].numHits).toBe(0);
    expect(wall.pveNumHits).toBe(1);
    expect(wall.dead).toBe(false);                         // penetrate=−1

    const c = mkCritter(PX * TILE + 2, PY * TILE + 100);
    const g2 = makeHooks({ critters: [c] });
    const wall2 = new ClingerStaffWallProj(PX * TILE, PY * TILE, PY * TILE, 240, 50, 2);
    wall2.fixedUpdate(1 / 60, g2);
    expect(c.calls.length).toBe(1);
    expect(c.calls[0].dmg).toBe(5);
    expect(wall2.dead).toBe(false);
    expect(wall2.pveNumHits).toBe(1);                      // :14263 critter 亦入账
  });
});

// ================= 件 2：dealContacts 调用方 critter 桶（BJ381 登记债） =================

describe('BJ383 件2:penetrate=1 族 critter 受击弹亡（:14184→:17312 Kill）', () => {
  it('731 critter → 5 伤+弹亡（die()=Kill 面 :77055）', () => {
    const c = mkCritter(PX * TILE + 2, PY * TILE + 2);
    const g = makeHooks({ critters: [c] });
    const b = new ThunderBoltShot(PX * TILE, PY * TILE, 0, 0, 24, 3);
    b.fixedUpdate(1 / 60, g);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);
    expect(b.dead).toBe(true);
  });

  it('440 critter → 5 伤+弹亡（die()=Kill 尘面 :74946）', () => {
    const c = mkCritter(PX * TILE + 2, PY * TILE + 2);
    const g = makeHooks({ critters: [c] });
    const l = new LaserMachinegunLaser(PX * TILE, PY * TILE, 0, 0, 60, 2);
    l.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(l.dead).toBe(true);
  });

  it('1116 critter → 5 伤+弹亡（die()=Kill 尘面 :72202）', () => {
    const c = mkCritter(PX * TILE + 2, PY * TILE + 2);
    const g = makeHooks({ critters: [c] });
    const p = new PetalstormShot(PX * TILE, PY * TILE, 0, 0, 50, 2, 0);
    p.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(p.dead).toBe(true);
  });

  it('908 钛屏障碎片 critter → 5 伤+弹亡（penetrate=1 :8636）;非 magic 不 proc', () => {
    const ste: StealCall[] = [];
    const c = mkCritter(PX * TILE - 5, PY * TILE - 2);
    const g = makeHooks({
      critters: [c], ste,
      player: {
        equipStats: {}, cx: PX * TILE, cy: PY * TILE, x: PX * TILE - 10, y: PY * TILE - 21,
        w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
        buffs: { has: (t: number) => t === BuffType.TitaniumStorm },
      },
    });
    const shard = new TitaniumStormShard(PX * TILE, PY * TILE, 50, 5);
    shard.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(shard.dead).toBe(true);
    expect(ste.length).toBe(0);                            // 908 非 magic（:8628-8638）
  });

  it('1115 penTier=3 档 critter 受击耗一档不亡（:14184 未耗尽续飞）', () => {
    const g = makeHooks({});
    const ctl: GlacierFangCtl = {
      channel: () => false, aim: () => ({ x: 0, y: 0 }), payMana: () => {},
      chargeRate: () => 1,
    };
    const shot = new GlacierFangShot(PX * TILE, PY * TILE, 0, 0, 60, 2, ctl);
    (shot as unknown as { charge: number }).charge = 60;   // 满蓄 → penTier=3（:37651）
    shot.fixedUpdate(1 / 60, g);                           // 释放拍
    const c = mkCritter(shot.x + 2, shot.y + 2);
    (g as unknown as { critters: () => unknown[] }).critters = () => [c];
    shot.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(shot.dead).toBe(false);                         // hits=1 < 3
  });
});

describe('BJ383 件2:penetrate=−1 族 critter 受击弹不亡', () => {
  it('1126 叶绿巨剑刃 critter → 5 伤不亡', () => {
    const c = mkCritter(PX * TILE + 2, PY * TILE + 2);
    const g = makeHooks({ critters: [c] });
    const blade = new ChloroClaymoreBlade(PX * TILE, PY * TILE, 1, 0, 50, 5, 20, 1);
    blade.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(c.calls[0].dmg).toBe(5);
    expect(blade.dead).toBe(false);
  });

  it('1127 叶绿军刃刺 critter → 5 伤不亡（DefaultToShortsword :10775-10788 penetrate=−1）', () => {
    const c = mkCritter(PX * TILE + 3, PY * TILE - 5);
    const g = makeHooks({ critters: [c] });
    const stab = new ChloroSaberStab(1, 0, 10, 1, 40, 4);
    stab.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(stab.dead).toBe(false);
  });

  it('1128 砸地大云（ai1==0）critter → 5 伤;尾孢子（ai1>=1）零伤（CanDealDamage :12463 门同盖）', () => {
    const c1 = mkCritter(PX * TILE - 2, PY * TILE - 2);
    const g1 = makeHooks({ critters: [c1] });
    const slam = new ChloroSporeCloud(PX * TILE, PY * TILE, 0, 0, 40, 0);
    slam.fixedUpdate(1 / 60, g1);
    expect(c1.calls.length).toBe(1);

    const c2 = mkCritter(PX * TILE - 2, PY * TILE - 2);
    const g2 = makeHooks({ critters: [c2] });
    const tail = new ChloroSporeCloud(PX * TILE, PY * TILE, 0, 0, 40, 100);
    tail.fixedUpdate(1 / 60, g2);
    expect(c2.calls.length).toBe(0);                       // 尾孢子纯视觉零伤
  });

  it('1129 砸地爆盒 critter → 5 伤不亡', () => {
    const c = mkCritter(PX * TILE + 10, PY * TILE + 10);
    const g = makeHooks({ critters: [c] });
    const slam = new ChloroBladeSlam(PX * TILE, PY * TILE, 128, 96, 60);
    slam.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(slam.dead).toBe(false);
  });

  it('950 魔法阵 critter → 5 伤不亡+入账', () => {
    const c = mkCritter(PX * TILE, PY * TILE);
    const g = makeHooks({ critters: [c] });
    const circle = new PrincessMagicCircle(PX * TILE, PY * TILE, 50, 2);
    circle.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(circle.dead).toBe(false);
    expect(circle.pveNumHits).toBe(1);
  });
});

describe('BJ383 件2:判别面（命中门不误伤）', () => {
  it('704 不重叠 critter 零受击（回归 BJ381 判别面）', () => {
    const c = mkCritter(PX * TILE + 400, PY * TILE + 100);
    const g = makeHooks({ critters: [c] });
    const t = new BookStormTwister(PX * TILE, PY * TILE, 0, 63, 9);
    for (let i = 0; i < 5 && !t.dead; i++) t.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
  });

  it('1128 盒外 critter 零受击', () => {
    const c = mkCritter(PX * TILE + 60, PY * TILE + 60);
    const g = makeHooks({ critters: [c] });
    const slam = new ChloroSporeCloud(PX * TILE, PY * TILE, 0, 0, 40, 0);
    slam.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
  });
});
