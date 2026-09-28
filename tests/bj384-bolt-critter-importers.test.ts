// ★BJ384（2026-09-28）critter 桶直系续批（BJ383 登记债清偿）：
//   件 1 = 1117/1122 bolt 面 critter 桶（StormLightning.damageAlongBolt）：
//     原版 Kill 帧 maxPenetrate=penetrate=-1 前置覆写（Projectile.cs:71920-71921
//     1122 / :71957-71959 1091/1117）→ Damage() 单趟 victim 循环（:12592）无穿透
//     消耗、无 keepIterating 截断,全部命中靶各结算一次;几何 = Colliding aiStyle203
//     全口径（:15951-15965 → StormLightningCollisionCheck :16205-16243:爆域 64×64 +
//     液体导通 + MultiPointHitbox 16×16 逐点含容——critter 与敌怪同一条 Colliding
//     路径,Damage_PVE_Inner :12618 flag=!friendly 对 critter 恒真）。结算单源
//     hitCrittersAll（projTargets 全结算+hitTest 覆写变体）;1091 trap=true 复位
//     dontHurtCritters 门（Player.cs:20676-20679）;命中入 pveNumHits 账（:14263
//     无条件——proc ladder 消费,critter lifeMax≤5 恒不吸血）;1091 comboSeed 绿雷
//     治疗支（:12795-12807）对 critter 照治不伤不入账。
//   件 2 = 三个 dealContacts 进口方 critter 补齐（沿 BJ381/383 接线范式）：
//     227 叶弹（penetrate=1 :3126-3141 → critter 受击弹亡,Kill 面 :76019-76031）/
//     567 孢子云（penetrate=1 :6187-6202 → 弹亡+迸气 :74317-74323）/221 山铜花瓣
//     （penetrate=−1 :3068-3080 → critter 照伤弹不亡）。
//     ★勘误备案：任务单所记「OrichalcumPetalProj 921」——921 实为敌对 NPC 弹
//     （6×6 hostile penetrate=3 :8738-8745,NPC 658 弹幕,Enemy.ts:4233 消费）,
//     敌对弹恒不结小动物伤害（:12631 !(hostile & flag2) 支,hitCritters hostile 门
//     同判）→ 无 critter 面;山铜花瓣真 id = 221（ArmorSetBonuses.cs:455-456
//     NewProjectile(221,36)）,本批按 221 落刀。
import { describe, it, expect } from 'vitest';
import { TileStore } from '../src/world/TileStore';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { StormLightning } from '../src/entities/proj1457';
import { ChloroLeafShot } from '../src/entities/ChloroLeafCrystalProj';
import { SporeSacCloud } from '../src/entities/SporeSacProj';
import { OrichalcumPetal } from '../src/entities/OrichalcumPetalProj';
import { lightningStrikeWeaponGenerator, stormLightningGenerator } from '../src/fx/LightningGenerator';

interface StealCall {
  kind: string; dmg: number; numHits: number; x: number; y: number; isMagic: boolean;
}

interface CritterCall { dmg: number; fromPlayer: boolean }

function mkEnemy(id: number, tx: number, ty: number, w = 24, h = 24,
  vanillaId: number | null = 15) {
  const e = {
    id, x: tx * TILE, y: ty * TILE, w, h, dead: false, vanillaId, maxHp: 100, hp: 100,
    lastStrikeDealt: 0, attempts: 0, iframes: 0,
    get cx() { return this.x + this.w / 2; },
    get cy() { return this.y + this.h / 2; },
    hurt(this: { lastStrikeDealt: number; attempts: number }, dmg: number): boolean {
      this.attempts++;
      this.lastStrikeDealt = dmg;
      return true;
    },
  };
  return e;
}

function mkCritter(px: number, py: number) {
  const c = {
    x: px, y: py, w: 18, h: 20, dead: false, hp: 5, maxHp: 5,
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

const PX = 80;
const PY = 90;
// StormLightning 构造中心（x=px−w/2 回读=原参）;seed 缺省 0=doKill 折线种子
const BCX = PX * TILE + 8;
const BCY = PY * TILE + 8;
// 空店探针（tileProbe 语义:非实心/无液体 → 恒 false——与测试 TileStore 等价）
const NO_PROBE = (): boolean => false;

/** 复算 1117 Kill 帧折线（GenerateMainBoltPath(0, Center)——doKill :71937-71941 同参） */
function boltLine1117(): { x: number; y: number }[] {
  const bolt = lightningStrikeWeaponGenerator(NO_PROBE)
    .generate([], 0, { x: BCX, y: BCY }, { x: 0, y: 1 }, true, true);
  return bolt.positions;
}

/** 复算 1091 Kill 帧折线（StormLightning 预设,length=1000） */
function boltLine1091(): { x: number; y: number }[] {
  const bolt = stormLightningGenerator(NO_PROBE)
    .generate([], 0, { x: BCX, y: BCY }, { x: 0, y: 1 }, true, true);
  return bolt.positions;
}

// ================= 件 1：bolt 面 critter 桶（多点几何/全结算/门/trap/绿雷） =================

describe('BJ384 件1:1117 bolt 多点面 critter（MultiPointHitbox 逐点含容进 victim 循环）', () => {
  it('折线中段小动物（本体盒外）→ 5 伤受理+入账不吸血（:12618/:14263）', () => {
    const ste: StealCall[] = [];
    const pts = boltLine1117();
    const mid = pts[Math.floor(pts.length / 2)];
    const c = mkCritter(mid.x - 9, mid.y - 10);        // 18×20 盒中心对齐折线点
    const g = makeHooks({ critters: [c], ste });
    const bolt = new StormLightning(1117, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(bolt.dead).toBe(true);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);
    expect(bolt.pveNumHits).toBe(1);                   // :14263 无条件入账
    expect(ste.length).toBe(0);                        // critter 不吸血（flag10 lifeMax>5）
  });

  it('全结算（hitAll）：折线两点两只小动物同拍全受理 → pveNumHits=2（无 keepIterating 截断）', () => {
    const pts = boltLine1117();
    const p1 = pts[Math.floor(pts.length * 0.35)];
    const p2 = pts[Math.floor(pts.length * 0.7)];
    const c1 = mkCritter(p1.x - 9, p1.y - 10);
    const c2 = mkCritter(p2.x - 9, p2.y - 10);
    const g = makeHooks({ critters: [c1, c2] });
    const bolt = new StormLightning(1117, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(c1.calls.length).toBe(1);
    expect(c2.calls.length).toBe(1);
    expect(bolt.pveNumHits).toBe(2);
  });

  it('dontHurtCritters 饰品门：1117（非 trap）拒收零伤零账（:20675 CountsAsCritter∧flag）', () => {
    const pts = boltLine1117();
    const mid = pts[Math.floor(pts.length / 2)];
    const c = mkCritter(mid.x - 9, mid.y - 10);
    const g = makeHooks({
      critters: [c],
      player: {
        equipStats: { dontHurtCritters: true },
        cx: BCX, cy: BCY + 400, x: BCX - 10, y: BCY + 400 - 21,
        w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
        buffs: { has: () => false },
      },
    });
    const bolt = new StormLightning(1117, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
    expect(bolt.pveNumHits).toBe(0);
  });

  it('1091 世界雷 trap=true 复位：dontHurtCritters 下照伤（:20676-20679;fromPlayer=false=trap 归因）', () => {
    const pts = boltLine1091();
    const mid = pts[Math.floor(pts.length / 2)];
    const c = mkCritter(mid.x - 9, mid.y - 10);
    const g = makeHooks({
      critters: [c],
      player: {
        equipStats: { dontHurtCritters: true },
        cx: BCX, cy: BCY + 400, x: BCX - 10, y: BCY + 400 - 21,
        w: 20, h: 42, dead: false, facing: 1, vx: 0, vy: 0,
        buffs: { has: () => false },
      },
    });
    const bolt = new StormLightning(1091, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    (bolt as unknown as { life: number }).life = 2;    // 压寿命（缺省 240）直达 doKill
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(bolt.dead).toBe(true);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: false }]);  // trap → ownedBySomeone=false
    expect(bolt.pveNumHits).toBe(1);
  });

  it('1091 comboSeed 绿雷：critter 治疗不伤不入账（:12795-12807 治疗支 continue 同敌面）', () => {
    const pts = boltLine1091();
    const mid = pts[Math.floor(pts.length / 2)];
    const c = mkCritter(mid.x - 9, mid.y - 10);
    c.hp = 3;                                          // 5−3=2 缺口 → 治满
    const g = makeHooks({ critters: [c] });
    const bolt = new StormLightning(1091, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    bolt.comboSeed = true;                             // noLightning+moreLightning
    (bolt as unknown as { life: number }).life = 2;
    for (let i = 0; i < 60 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);                    // 不走 hurt（绿雷不伤）
    expect(c.hp).toBe(5);                              // heal=min(max(60×1,0.5),2)=2
    expect(bolt.pveNumHits).toBe(0);                   // 治疗支 return 在 :14263 前
  });

  it('判别面：折线远离处小动物零受击（几何门不误伤）', () => {
    const c = mkCritter(BCX + 900, BCY + 40);          // 折线长 750 上行,侧向 900 外
    const g = makeHooks({ critters: [c] });
    const bolt = new StormLightning(1117, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
    expect(bolt.pveNumHits).toBe(0);
  });
});

// ================= 件 2：三进口方 critter 补齐（227 / 567 / 221） =================

describe('BJ384 件2:227 叶弹 critter（penetrate=1 → 受击弹亡 :14184→:17312）', () => {
  it('重叠 critter → 5 伤+弹亡（killWithFx=Kill 音尘面 :76019-76031）', () => {
    const c = mkCritter(PX * TILE - 9, PY * TILE - 10);
    const g = makeHooks({ critters: [c] });
    const shot = new ChloroLeafShot(PX * TILE, PY * TILE, 0, 0);   // 中心语义,盒 14×14
    shot.fixedUpdate(1 / 60, g);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);
    expect(shot.dead).toBe(true);
  });

  it('盒外 critter 零受击（判别面;★181 子步/拍=timeLeft 180 同拍自然耗尽 Kill）', () => {
    const c = mkCritter(PX * TILE + 60, PY * TILE + 60);
    const g = makeHooks({ critters: [c] });
    const shot = new ChloroLeafShot(PX * TILE, PY * TILE, 0, 0);
    shot.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
  });

  it('critter+敌重叠 → critter 独占穿透（keepIterating 截断,敌零结算）——变异 M2 判别位', () => {
    const ste: StealCall[] = [];
    const c = mkCritter(PX * TILE - 9, PY * TILE - 10);
    const e = mkEnemy(41, PX, PY);
    const g = makeHooks({ enemies: [e], critters: [c], ste });
    const shot = new ChloroLeafShot(PX * TILE, PY * TILE, 0, 0);
    shot.fixedUpdate(1 / 60, g);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);   // 桶序先小动物=首受理
    expect(e.attempts).toBe(0);                        // penetrate 已耗尽 → 敌零结算
    expect(shot.dead).toBe(true);                      // :17312 Kill
  });
});

describe('BJ384 件2:567 孢子云 critter（penetrate=1 → 弹亡+迸气 :74317-74323）', () => {
  it('重叠 critter → 5 伤+云亡+同伤气团（ai[1]==0 非寿终支=burst()）', () => {
    const gas: { x: number; y: number; dmg: number }[] = [];
    const c = mkCritter(PX * TILE - 2, PY * TILE - 2);
    const g = makeHooks({ critters: [c] });
    const cloud = new SporeSacCloud(PX * TILE, PY * TILE, 567, 70, 1.5, 0,
      (x, y, _vx, _vy, dmg) => gas.push({ x, y, dmg }));
    cloud.fixedUpdate(1 / 60, g);
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);
    expect(cloud.dead).toBe(true);
    expect(gas.length).toBe(1);
    expect(gas[0].dmg).toBe(70);                       // 同伤透传（NewProjectile :74321）
  });

  it('寿终段（dying）零接触结算——critter 亦不伤（damage=0/ai[1]=1 :40815-40830）', () => {
    const c = mkCritter(PX * TILE - 2, PY * TILE - 2);
    const gas: { x: number; y: number; dmg: number }[] = [];
    const g = makeHooks({ critters: [c] });
    const cloud = new SporeSacCloud(PX * TILE, PY * TILE, 567, 70, 1.5, 0,
      (x, y, _vx, _vy, dmg) => gas.push({ x, y, dmg }));
    (cloud as unknown as { dying: boolean }).dying = true;
    cloud.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
    expect(gas.length).toBe(0);                        // 寿终 Kill 不迸气（:74317 门）
  });
});

describe('BJ384 件2:221 山铜花瓣 critter（penetrate=−1 → 照伤弹不亡 :3068-3080/:14184）', () => {
  it('重叠 critter → 5 伤单次（一击即死后无重结算）+花瓣续飞', () => {
    const c = mkCritter(PX * TILE - 2, PY * TILE - 2);
    const g = makeHooks({ critters: [c] });
    const petal = new OrichalcumPetal(PX * TILE, PY * TILE, 0, 0);   // 盒左上形参 20×20
    petal.fixedUpdate(1 / 60, g);                      // 3 子步——首子步受理后 critter 已死
    expect(c.calls).toEqual([{ dmg: 5, fromPlayer: true }]);
    expect(petal.dead).toBe(false);                    // penetrate=−1 无消耗
  });

  it('盒外 critter 零受击（判别面）', () => {
    const c = mkCritter(PX * TILE + 60, PY * TILE + 60);
    const g = makeHooks({ critters: [c] });
    const petal = new OrichalcumPetal(PX * TILE, PY * TILE, 0, 0);
    petal.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(0);
  });
});

describe('BJ384 件1 回归锚：bolt 敌面 proc 账与 critter 面共存（BJ383 锚不回退）', () => {
  it('1117 敌+critter 双靶：敌 proc 读 critter 入账后 ladder（桶序先小动物）;敌结算不受 critter 挤占', () => {
    const ste: StealCall[] = [];
    const pts = boltLine1117();
    // 敌盒放折线 50% 点（弹心上方 ~375px,索敌半径外 → 无 MoveTowards,弹心静止
    // =复算折线有效）;critter 放 15% 点（更远端,两靶不重叠）
    const pe = pts[Math.floor(pts.length * 0.5)];
    const pc = pts[Math.floor(pts.length * 0.15)];
    const e = mkEnemy(31, (pe.x - 32) / TILE, (pe.y - 32) / TILE, 64, 64);
    const c = mkCritter(pc.x - 9, pc.y - 10);
    const g = makeHooks({ enemies: [e], critters: [c], ste });
    const bolt = new StormLightning(1117, BCX, BCY, 60, 2);
    bolt.critChance = 0;
    for (let i = 0; i < 80 && !bolt.dead; i++) bolt.fixedUpdate(1 / 60, g);
    expect(c.calls.length).toBe(1);
    expect(e.attempts).toBe(1);                        // 敌面照常结算（双桶并存）
    expect(ste.length).toBe(1);
    expect(ste[0].kind).toBe('ghost');
    expect(ste[0].numHits).toBe(1);                    // critter 先入账（:14263）→ ladder 0.15 档
    expect(bolt.pveNumHits).toBe(2);
  });
});
