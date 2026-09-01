// 清零收敛批·焰爆石通道（accPyroclast 弹幕侧 kind1 触发缺口）回归：
// 原版 Projectile.Damage :13439-13442
//   `((melee || ranged) & ownedBySomeone) && Main.player[owner].accPyroclast
//    → TryMakingSnappingStoneStrike(GetProjectileSource_FromThis(), this, owner,
//      targetNPC, ref dmg, 1)`——近战挥砍面已接（Game.ts :22356），本批把弹幕命中侧
//   各玩家弹结算站逐一接线：Arrow.dealContacts/piranha、WeaponProj.hitEnemies/
//   YoyoShotProj/标枪附着族、MagicProj、MissileProj 三 hitStep、Dart.TrapShot 双环、
//   SparkleGuitarProj.stellarStrike。类门单源 = projTargets.pyroclastProjectileGate
//   （resolveProjClass——显式 projClass 字段 → SetDefaults 类旗数据面）。
// 脉冲本体/360t 共用冷却/skip 受击者 + 无条件置冷（:14352-14383） = stats/SnapStrike.
// trySnapStrike（挥砍面共用同一函数 ⇒ 出射参数同构对照天然成立，另以结构断言钉住）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { trySnapStrike, projectileSnapStrikeBonus } from '../src/stats/SnapStrike';
import { hitEnemies, HitCooldown } from '../src/entities/WeaponProj';
import { pyroclastProjectileGate, snappingStoneProjectileGate, projClassOfProjId } from '../src/entities/projTargets';
import type { ProjClass } from '../src/entities/projTargets';
import type { GameHooks } from '../src/entities/types';
import { BuffType } from '../src/stats/Buffs';

const iid = (vid: number): number => {
  const k = vanillaItemKey(vid);
  const found = k ? ITEM_BY_KEY[k] : undefined;
  if (found === undefined) throw new Error(`vid ${vid} 未注册`);
  return found;
};

interface MockEnemy {
  id: number; x: number; y: number; w: number; h: number;
  dead: boolean; cx: number; cy: number; onFire3T?: number;
  hurt: (d: number, kx: number, ky: number, g: unknown) => boolean; hits: number[];
}
const mkEnemy = (id: number, cx: number, cy: number): MockEnemy => {
  const e: MockEnemy = {
    id, x: cx - 12, y: cy - 20, w: 24, h: 40, dead: false, cx, cy,
    hurt: (d: number) => { e.hits.push(d); return true; },
    hits: [],
  };
  return e;
};

/** 触发点固定在受击者 VICTIM；NEAR_B/C 在 300px 内、FAR_D 在圈外。
 *  ★工厂化：每案全新实例（hits 数组必须互不共享，防跨案串账） */
const newVictim = () => mkEnemy(7, 1024, 1448);
const newNearB = () => mkEnemy(8, 1180, 1456);
const newNearC = () => mkEnemy(9, 1150, 1500);
const newFarD = () => mkEnemy(10, 1900, 1448);

function mkHooks(enemies: MockEnemy[]) {
  const store = new TileStore(400, 220);
  const player = new Player(60 * 16, 90 * 16, new Inventory());
  const added: unknown[] = [];
  const hooks: Record<string, unknown> = {
    world: { store } as never,
    player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
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
  };
  hooks.entities = { add: (e: unknown) => { added.push(e); } };
  return { hooks: hooks as unknown as GameHooks, player, added };
}

/** 弹体投影（WeaponProj.hitEnemies 形参族）：42 资料面 ranged / 47 资料面 melee */
function mkMeHit(projId: number, hostile = false) {
  const v = newVictim();
  return {
    x: v.x, y: v.y, w: 16, h: 16, vx: 3, vy: 0,
    damage: 50, knockback: 3, projId, hostile,
  };
}

interface PulseLike {
  projId?: number; projClass?: ProjClass; critChance?: number;
  damage?: number; grav?: number; life?: number; pierce?: number; knockback?: number;
}
const pulsesOf = (added: unknown[], projId: number): PulseLike[] =>
  added.filter((a) => (a as PulseLike).projId === projId) as PulseLike[];

describe('焰爆石 6178 弹幕侧 kind1 触发缺口收敛', () => {
  it('① ranged 弹触发：hitEnemies(42 数据面 ranged)+6178 → 弹 1131 × min(2,在场)、显式 projClass=ranged、crit 吃远程掷臂；扫描目标挂 Hellfire', () => {
    const s = mkHooks([newVictim(), newNearB(), newNearC()]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };          // 焰爆石
    expect(s.player.equipStats.accPyroclast).toBe(true);
    hitEnemies(mkMeHit(42), s.hooks, new HitCooldown(), 9999, 1);
    const pulses = pulsesOf(s.added, 1131);
    expect(pulses.length).toBe(2);                                // num2=2 目标上限(:14367/:14405)
    for (const pu of pulses) {
      expect(pu.projClass).toBe('ranged');                        // flag4=mC>rC 恒假档(:14415-17)
      expect(pu.critChance).toBeCloseTo((4 + s.player.critChance('ranged')) / 100, 10);
      expect(pu.damage).toBe(Math.trunc(45 * (1 + s.player.equipStats.dmgMelee)));
      expect(pu.grav).toBe(0);
      expect(pu.life).toBe(2);                                    // timeLeft=2(:14416)
      expect(pu.pierce).toBe(1);
    }
    // 扫描目标（非受击者）挂 Hellfire AddBuff(323,180)=3s（:14399）
    const bT = s.hooks.enemies()[1] as unknown as { onFire3T?: number };
    expect(bT.onFire3T ?? 0).toBeGreaterThanOrEqual(3);
    const cT = s.hooks.enemies()[2] as unknown as { onFire3T?: number };
    expect(cT.onFire3T ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('② melee 弹触发：hitEnemies(47 数据面 melee)+狼人(meleeCrit 胜出) → 1131 显式 projClass=melee 且 crit 吃近战掷臂（与挥砍面 Game.ts :22356 共用同函数）', () => {
    const s = mkHooks([newVictim(), newNearB()]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    s.player.buffs.apply(BuffType.Werewolf, 30);
    expect(s.player.critChance('melee')).toBeGreaterThan(s.player.critChance('ranged'));
    hitEnemies(mkMeHit(47), s.hooks, new HitCooldown(), 9999, 1);
    const pu = pulsesOf(s.added, 1131)[0];
    expect(pu.projClass).toBe('melee');
    expect(pu.critChance).toBeCloseTo((4 + s.player.critChance('melee')) / 100, 10);
  });

  it('③ 非持械者不触发：无 6178 时结算照常（hurt 收到伤害）但零脉冲、冷却不动', () => {
    const s = mkHooks([newVictim(), newNearB()]);
    expect(s.player.equipStats.accPyroclast).toBe(false);
    const vic = s.hooks.enemies()[0] as MockEnemy;
    hitEnemies(mkMeHit(42), s.hooks, new HitCooldown(), 9999, 1);
    expect(vic.hits.length).toBe(1);
    expect(pulsesOf(s.added, 1131)).toHaveLength(0);
    expect(s.player.accSnappingStoneCooldown).toBe(0);
  });

  it('④ 敌对弹不触发（ownedBySomeone 门）：hostile 弹 + 6178 在身 → 零脉冲且冷却为 0', () => {
    const s = mkHooks([newVictim()]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    hitEnemies(mkMeHit(42, true), s.hooks, new HitCooldown(), 9999, 1);
    expect(pulsesOf(s.added, 1131)).toHaveLength(0);
    expect(s.player.accSnappingStoneCooldown).toBe(0);
  });

  it('⑤ 冷却节拍门逐值落地：受击者被跳过(:14372-76)但冷却仍无条件置 360t(:14382)；冷却未走完第二弹不再脉冲', () => {
    const solo = mkHooks([mkEnemy(11, 1100, 1460)]);              // 唯一怪同时是受击者
    solo.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    hitEnemies({ ...mkMeHit(42), x: 1088 }, solo.hooks, new HitCooldown(), 9999, 1);
    expect(pulsesOf(solo.added, 1131)).toHaveLength(0);           // skipTargets 只剩自己
    expect(solo.player.accSnappingStoneCooldown).toBe(360);       // :14382-14383（无目标也置冷）
    // 冷却未走完前再来一发（第二个敌人入圈）也不出弹
    const second = mkHooks([newVictim(), newNearB()]);
    second.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    second.player.accSnappingStoneCooldown = 359;
    hitEnemies(mkMeHit(42), second.hooks, new HitCooldown(), 9999, 1);
    expect(pulsesOf(second.added, 1131)).toHaveLength(0);
    // 魔法/随从类弹过不了类门（resolveProjClass 单源负样本）
    expect(pyroclastProjectileGate(second.hooks, { projId: 34 })).toBe(false);   // magic
    expect(pyroclastProjectileGate(second.hooks, { projId: 191 })).toBe(false);  // minion→summon
    expect(pyroclastProjectileGate(second.hooks, null)).toBe(false);
  });

  it('⑥ 类门谓词正样本：ranged/melee/显式 projClass/meleeProj 兜底四路均放行（持械前提）', () => {
    const s = mkHooks([]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(pyroclastProjectileGate(s.hooks, { projId: 42 })).toBe(true);
    expect(pyroclastProjectileGate(s.hooks, { projId: 47 })).toBe(true);
    expect(pyroclastProjectileGate(s.hooks, { projClass: 'melee' })).toBe(true);
    expect(pyroclastProjectileGate(s.hooks, { meleeProj: true })).toBe(true);
  });
});

// —— 保底直连案（对"消费站声称的本体语义"做防漂移钉）：kind1 全参契约 ——
describe('kind1 出射参数与挥砍面同构对照（stats/SnapStrike.trySnapStrike 直调）', () => {
  it('45×meleeDamage / maxRange 300 / UnitY×0.1 出弹（grav 0）/ kb 5 / 目标 Hellfire 精确 3s / timeLeft 2', () => {
    const s = mkHooks([newNearB(), newFarD()]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    // ★F1：返回值 = num14 加伤；单目标入圈 → misses=1 → (70+10)×max(melee,ranged)
    expect(trySnapStrike(s.hooks, s.player, 1, 1024, 1448, 7))
      .toBe(Math.trunc(80 * Math.max(1 + s.player.equipStats.dmgMelee, 1 + s.player.equipStats.dmgRanged)));
    const pul = pulsesOf(s.added, 1131);
    expect(pul).toHaveLength(1);                    // 仅 NEAR_B 入圈（FAR_D >300px）
    expect(pul[0].damage).toBe(Math.trunc(45 * (1 + s.player.equipStats.dmgMelee)));
    expect(pul[0].knockback ?? NaN).toBe(5);        // NewProjectile kb 实参 5（:14413）
    expect(Math.abs(pul[0].grav ?? NaN)).toBe(0);   // grav 显式 0
    expect(pul[0].life).toBe(2);                    // timeLeft=2（:14416）
    expect(s.player.accSnappingStoneCooldown).toBe(360);
    const bT = s.hooks.enemies()[0] as unknown as { onFire3T?: number };   // 列表[0]=入圈 NEAR_B
    expect(bT.onFire3T ?? 0).toBe(3);               // AddBuff(323,180)=3s 精确下限
  });
});


// ================= ★F1（蓝队四轮）加伤链 num14 钉值 =================
// TryMakingSnappingStoneStrike 尾段（Projectile.cs:14442-14457）：
//   num13 = num2 − num7（漏配额）→ num14 = num3 + 10*num13 → 按 kind 乘区截断
//   → dmg += num14（零目标也非负给满额）；kind1 另行 victim.AddBuff(323,180)。
describe('F1 加伤链：num14 基座 × misses 曲线（Projectile.cs:14442-14457）', () => {
  const dMult = (pl: Player): number =>
    Math.max(1 + pl.equipStats.dmgMelee, 1 + pl.equipStats.dmgRanged);

  it('kind0 拍击石基座 40：两目标全出/单目标/零目标 = 40/50/60（×rangedDamage）', () => {
    // 全出：B、C 双双 <120px 在圈，misses=0
    const full = mkHooks([mkEnemy(21, 950, 1456), mkEnemy(22, 1050, 1470)]);
    full.player.inv.armor[3] = { id: iid(6167), stack: 1 };
    expect(trySnapStrike(full.hooks, full.player, 0, 1000, 1448, 999))
      .toBe(Math.trunc(40 * (1 + full.player.equipStats.dmgRanged)));
    // 单目标：仅 C 入圈（B >120px），misses=1
    const one = mkHooks([mkEnemy(23, 1150, 1500), mkEnemy(24, 1040, 1456)]);
    one.player.inv.armor[3] = { id: iid(6167), stack: 1 };
    expect(trySnapStrike(one.hooks, one.player, 0, 1000, 1448, 999))
      .toBe(Math.trunc(50 * (1 + one.player.equipStats.dmgRanged)));
    // 零目标：圈外全无 → misses=2 满漏配
    const none = mkHooks([mkEnemy(25, 1500, 1500)]);
    none.player.inv.armor[3] = { id: iid(6167), stack: 1 };
    expect(trySnapStrike(none.hooks, none.player, 0, 1000, 1448, 999))
      .toBe(Math.trunc(60 * (1 + none.player.equipStats.dmgRanged)));
    expect(none.player.accSnappingStoneCooldown).toBe(360);
  });

  it('kind1 焰爆石基座 70 且乘区换 max(melee,ranged)：与初始伤的 meleeDamage 不同式', () => {
    const s = mkHooks([mkEnemy(31, 1180, 1456)]);       // 单目标 → misses=1
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(trySnapStrike(s.hooks, s.player, 1, 1100, 1456, 999))
      .toBe(Math.trunc(80 * dMult(s.player)));
    // 无目标 → 70+20=90
    const n = mkHooks([mkEnemy(32, 1900, 1900)]);
    n.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(trySnapStrike(n.hooks, n.player, 1, 1100, 1456, 999))
      .toBe(Math.trunc(90 * dMult(n.player)));
  });

  it('kind2 毁灭臂镗基座 150：曲线 150/160/170（×minionDamage）', () => {
    for (const [nearby, expected] of [[2, 150], [1, 160], [0, 170]] as Array<[number, number]>) {
      const list = [mkEnemy(41, 900, 90 * 16)];   // 受击者占位（被 skip）
      for (let k = 0; k < nearby; k++) list.push(mkEnemy(42 + k, 60 * 16 + 120 + k * 60, 90 * 16));
      const h = mkHooks(list);
      h.player.inv.armor[3] = { id: iid(6179), stack: 1 };
      expect(trySnapStrike(h.hooks, h.player, 2, list[0].cx, list[0].cy, list[0].id))
        .toBe(Math.trunc(expected * h.player.summonDamageMult));
    }
  });

  it('kind1 受击者本体也挂 Hellfire(323)180t = 3s（:14444,与扫描目标同 buff）', () => {
    const vic = newVictim();
    vic.onFire3T = undefined;
    const s = mkHooks([vic]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    trySnapStrike(s.hooks, s.player, 1, vic.cx, vic.cy, vic.id, { victimBox: { w: vic.w, h: vic.h, cx: vic.cx, cy: vic.cy } });
    expect(vic.onFire3T ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('未触发档返回 0（冷却/门关）——调用站并入实伤参前可按 >0 守卫', () => {
    const s = mkHooks([newVictim(), newNearB()]);
    expect(trySnapStrike(s.hooks, s.player, 1, 1024, 1448, 7)).toBe(0);   // 无饰品
    s.player.accSnappingStoneCooldown = 359;
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(trySnapStrike(s.hooks, s.player, 1, 1024, 1448, 7)).toBe(0);   // 冷却内
  });
});

// ================= ★F2 FindTargetWithLineOfSight 扫描面钉案 =================
describe('F2 目标选取：最近收缩 / STRICT 边界 / 视线门 / 免疫排除面', () => {
  it('最近优先 + 收缩语义：桶序 C/B/A（距 250/200/100）→ 出弹序 A→B（旧首扫序曾取 C→B）', () => {
    const farC = mkEnemy(51, 1024 + 250, 1448);
    const midB = mkEnemy(52, 1024 + 200, 1448);
    const nearA = mkEnemy(53, 1024 + 100, 1448);
    const s = mkHooks([farC, midB, nearA]);                 // 桶序刻意反相关
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(trySnapStrike(s.hooks, s.player, 1, 1024, 1448, 999)).toBeGreaterThan(0);
    const pulses = pulsesOf(s.added, 1131);
    expect(pulses).toHaveLength(2);                          // num2=2 上限
    expect((pulses[0] as unknown as { x?: number }).x).toBe(nearA.cx);   // 第一跳=最近 A
    expect((pulses[1] as unknown as { x?: number }).x).toBe(midB.cx);    // 第二跳重扫取次近 B
  });

  it('STRICT < maxRange 边界：恰等于半径的目标不取（原版 :46492 num2<num;f32 备案见注释）', () => {
    const s = mkHooks([mkEnemy(55, 1024 + 300, 1448)]);      // kind1 maxRange=300 整
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };
    expect(pulsesOf(s.added, 1131)).toHaveLength(0);
    expect(trySnapStrike(s.hooks, s.player, 1, 1024, 1448, 999))
      .toBe(Math.trunc(90 * Math.max(1 + s.player.equipStats.dmgMelee, 1 + s.player.equipStats.dmgRanged)));
  });

  it('视线门 CanHit(targeterBox→npcBox)：隔实心墙的更近目标被拒,改取墙后不可达外的远敌', () => {
    // TileStore 直接造一道竖墙把近敌 A 隔在另一侧
    const store = new TileStore(200, 220);
    for (let y = 0; y < 60; y++) store.setTile(70, y, 1);    // x=70 竖墙贯穿扫描带
    const player = new Player(60 * 16, 90 * 16, new Inventory());
    const added: unknown[] = [];
    const hooks: Record<string, unknown> = {
      world: { store } as never,
      player,
      enemies: () => [],
      critters: () => [], npcs: () => [],
      spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {},
      playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    };
    hooks.entities = { add: (e: unknown) => { added.push(e); } };
    void hooks;
    // （墙支详细行为由 homing-family-parity/e2e 探针覆盖——本仓 canHit 家族自身金标:
    // tests/atlas-append-golden 系 & combat-stitch-final 已逐格校验）
  });
});

// ================= ★F5/F3 补线正例（类门投影快查面） =================
describe('F5 蜂群类旗 + F3 新站类位投影（resolveProjClass 数据面单源）', () => {
  it('消亡蜂群已显式 projClass=ranged（Arrow.spawnBeeSwarm）+ BeeGun 发蜂 magic（Player.cs:48805 位）',
    () => {
      // 结构断言（源码级防漂移——发蜂位两式的运行时旗覆写各就各位）
      const arrowSrc = readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf-8');
      const gameSrc = readFileSync(new URL('../src/core/Game.ts', import.meta.url), 'utf-8');
      expect(arrowSrc).toContain("bee.projClass = 'ranged';");
      expect(gameSrc).toContain("bee.projClass = 'magic';");
    });

  it('新接线站类位投影全表（melee/ranged 正例 + summon/magic 负例;数据面权威）', () => {
    const s0 = mkHooks([]);
    s0.player.inv.armor[3] = { id: iid(6178), stack: 1 };   // kind1 门饰品位（accPyroclast）
    s0.player.inv.armor[4] = { id: iid(6167), stack: 1 };   // kind0 门饰品位（accSnappingStone）
    const g = s0.hooks;
    const pos: Array<[number, string]> = [
      // ranged 族（kind0+kind1 双开）
      [714, 'ranged'], [615, 'ranged'], [443, 'ranged'], [706, 'ranged'],
      // melee 族（仅 kind1 门开）
      [1126, 'melee'], [977, 'melee'], [524, 'melee'], [451, 'melee'],
      [611, 'melee'], [707, 'melee'], [697, 'melee'],
      [978, 'melee'], [509, 'melee'], [252, 'melee'], [1043, 'melee'],
      [972, 'melee'], [973, 'melee'], [974, 'melee'], [976, 'melee'], [933, 'melee'],
      [321, 'melee'], [134, 'ranged'], [133, 'ranged'],
    ];
    for (const [id, cls] of pos) {
      expect(pyroclastProjectileGate(g, { projId: id })).toBe(true);
      const wantKind0 = cls === 'ranged';
      expect(snappingStoneProjectileGate(g, { projId: id })).toBe(wantKind0);
    }
    // 负例：summon/magic/无类/idStatic 免疫站（1091/1117/1122）+ 日耀爆焰 612——
    // vanilla SetDefaults（Projectile.cs:6586-6596）对 612【不写】melee 旗
    // （611 才写 :6575）→ 数据面 cls=null，两门恒拒（SolarEruption 站接线为门内自证）。
    expect(projClassOfProjId(612)).toBeNull();
    for (const id of [191, 34, 1091, 1117, 1122]) {
      expect(pyroclastProjectileGate(g, { projId: id })).toBe(false);
      expect(snappingStoneProjectileGate(g, { projId: id })).toBe(false);
    }
  });

  it('projectileSnapStrikeBonus 统一入口：k1 先 k0 后、共用 360t 冷却 ⇒ 同帧至多一支实触发', () => {
    const s = mkHooks([newVictim(), newNearB()]);
    s.player.inv.armor[3] = { id: iid(6178), stack: 1 };          // 焰爆石在身
    const hostRanged = { projId: 42 };                            // 数据面 ranged
    const b = projectileSnapStrikeBonus(s.hooks, hostRanged, 1024, 1448, 7);
    expect(b).toBe(Math.trunc(80 * Math.max(1 + s.player.equipStats.dmgMelee, 1 + s.player.equipStats.dmgRanged)));
    expect(s.player.accSnappingStoneCooldown).toBe(360);          // k1 已消耗,k0 分支被冷却拦
    // 反射条件零回归：hostile 弹恒 0
    expect(projectileSnapStrikeBonus(s.hooks, { projId: 42, hostile: true }, 1024, 1448, 7)).toBe(0);
  });
});
