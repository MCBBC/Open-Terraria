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
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { TileStore } from '../src/world/TileStore';
import { vanillaItemKey } from '../src/data/vanillaRecipes';
import { ITEM_BY_KEY } from '../src/data/items';
import { trySnapStrike } from '../src/stats/SnapStrike';
import { hitEnemies, HitCooldown } from '../src/entities/WeaponProj';
import { pyroclastProjectileGate } from '../src/entities/projTargets';
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
  dead: boolean; cx: number; cy: number;
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
    damagePlayer: () => {},
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
    expect(trySnapStrike(s.hooks, s.player, 1, 1024, 1448, 7)).toBe(true);
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
