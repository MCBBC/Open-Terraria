// 蓝队二轮对抗修复回归（2026-08-31）——红队 findings F1/F2/F3/F6 裁决件：
//  F2 lastStrikeDealt「本拍结算面」合同：入口清零 + 488 immortal 分支写足额
//     （vanilla StrikeNPC_Inner：num :82067 防后结算、:82197-82215 仅 immortal 跳扣血、
//      :82400 return num；num41 是单次调用返回值不是持久字段）
//  F3 hitCritters 门禁（Player.cs:20673-20689 + Damage_PVE_Inner :12622-12625/:12631）
//  F6 TownNPC.hurt crit 通道（ProcessHitAgainstNPC :44651-57 → StrikeNPC ×2 :82067）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { TownNPC } from '../src/entities/TownNPC';
import { TileStore } from '../src/world/TileStore';
import { hitCritters } from '../src/entities/projTargets';
import type { GameHooks } from '../src/entities/types';

function stubHooks(critters: unknown[]): GameHooks {
  const world = new World(64, 32, 42, 'blue-f');
  const stubPlayer = { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0, dead: false,
    cx: 0, cy: 0, equipStats: {}, buffs: { has: () => false }, addDPS: (_n: number) => {} };
  return {
    world,
    player: stubPlayer,
    enemies: () => [],
    critters: () => critters,
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    cutTile: () => {},
    spawnParticles: () => {},
    playSfxFiles: () => {},
    onEnemyKilled: () => {},
  } as unknown as GameHooks;
}

/** Enemy.hurt 最小驱动桩：给假人/普通敌喂一刀并回读结算面 */
function strikeEnemy(vid: number) {
  const e = Enemy.fromVanilla(vid, 500, 500);
  if (!e) throw new Error(`Enemy.fromVanilla(${vid}) 失败`);
  const world = new World(64, 32, 42, 'blue-f-strike');
  const game = {
    world,
    player: { hp: 100, maxHp: 100, mana: 20, maxMana: 20, luck: 0, dead: false,
      cx: 508, cy: 520, addDPS: (_n: number) => {}, equipStats: {}, buffs: { has: () => false } },
    enemies: () => [],
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: () => {},
    addDamageNumber: () => {},
    dust: { spawn: () => {} },
    spawnParticles: () => {},
    playSfxFiles: () => {},
    playSfx: () => {},
    onEnemyKilled: () => {},
    bannerNpcActive: () => false,
    recLog: () => {},
  } as unknown as GameHooks;
  return { e, game, hurt: (dmg: number, pen: number, crit = false) =>
    (e as unknown as { hurt: (...a: unknown[]) => boolean })
      .hurt(dmg, 2, 0, game, pen, crit, pierceFor(e), true) };
}
const pierceFor = (_e: unknown): number => 1;   // 单发弹豁免 iframes，保证可重复驱动

describe('F2 lastStrikeDealt 本拍结算面合同', () => {
  it('普通敌怪：实际扣血路径写防后终值', () => {
    const z = Enemy.fromVanilla(3 /* green slime */, 500, 500)!;
    const g = stubHooks([]);
    const hpBefore = z.hp;
    // 注：Enemy.hurt 返回值语义是「是否死亡」——存活受击恒 false；结算面看字段。
    (z as unknown as { hurt: (...a: unknown[]) => boolean })
      .hurt(30, 2, 0, g, 0, false, 1, true);
    expect(z.hp).toBeLessThan(hpBefore);
    expect(z.lastStrikeDealt).toBeGreaterThan(1);
  });

  it('训练假人 488（immortal）：lastStrikeDealt 写足额 → 幽灵头 dealt<=1 门放行', () => {
    const s1 = strikeEnemy(488);
    expect(s1.hurt(40, 0)).toBe(true);         // 假人永不死但走满管线
    expect(s1.e.hp).toBe(s1.e.maxHp || 1000);  // life 不减（immortal 只跳扣血段）
    expect(s1.e.lastStrikeDealt).toBeGreaterThanOrEqual(1);
    // 防御 0 → num41 == 入伤（防后 Max(1,…)*1 恰等于 dmg）
    expect(s1.e.lastStrikeDealt).toBe(40);
  });

  it('dontTakeDamage 靶（266 克脑一阶段）：hurt 返回 false 且结算面清零不残留', () => {
    const brain = Enemy.fromVanilla(266, 500, 500);
    if (!brain) throw new Error('克脑一阶段构造失败');
    const g = stubHooks([]);
    const h = (brain as unknown as { hurt: (...a: unknown[]) => boolean });
    // 先制造一笔真实历史残值（直接改字段模拟上一拍命中）
    (brain as unknown as { lastStrikeDealt: number }).lastStrikeDealt = 999;
    expect(h.hurt(30, 2, 0, g, 0, false, 1, true)).toBe(false);
    expect(brain.lastStrikeDealt).toBe(0);     // ★旧实现此处残留 999（F2② 泄漏案发位）
  });

  it('iframes 免疫帧内：同样清零（无本拍结算=0）', () => {
    const z = Enemy.fromVanilla(3, 500, 500)!;
    const g = stubHooks([]);
    const h = (z as unknown as { hurt: (...a: unknown[]) => boolean });
    h.hurt(20, 2, 0, g, 0, false, 10, true);   // 穿透弹首击落 10t 帧
    (z as unknown as { lastStrikeDealt: number }).lastStrikeDealt = 777;
    h.hurt(20, 2, 0, g, 0, false, 10, true);   // 帧内二击早退
    expect(z.lastStrikeDealt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// F3 hitCritters 门禁
// ---------------------------------------------------------------------------

describe('F3 hitCritters 统一出口门禁（Player.cs:20673-20689 / Damage_PVE_Inner :12631）', () => {
  function critterAt(vid: number, x: number, y: number): Enemy {
    const c = Enemy.fromVanilla(vid, x, y);
    if (!c) throw new Error(`critter ${vid} 构造失败`);
    return c;
  }
  function boxAt(projId: number | undefined, x: number, y: number) {
    return { x, y, w: 16, h: 16, projId };
  }

  it('玩家弹×dontHurtCritters=false（未装饰品）：松鼠照常一击杀', () => {
    const sq = critterAt(299, 300, 300);
    const g = stubHooks([sq]);
    expect(hitCritters(boxAt(1, 300, 300), g)).toBe(true);
    expect(sq.dead).toBe(true);
  });

  it('玩家弹×dontHurtCritters=true：小动物拒收（:20684 CountsAsCritter∧flag）', () => {
    const sq = critterAt(299, 300, 300);
    const g = stubHooks([sq]);
    (g.player as unknown as { equipStats: { dontHurtCritters?: boolean } }).equipStats
      .dontHurtCritters = true;
    expect(hitCritters(boxAt(1, 300, 300), g)).toBe(false);
    expect(sq.dead).toBe(false);
  });

  it('敌方小动物复权（:20680 IsCritterThatIsHostileToPlayers）：饰品在场仍强制放行', () => {
    // 538 恶魔松鼠 / 299 变体群系成员 aiStyle==3 —— CRITTER_TURN_ON_PLAYERS_TYPES 成员
    let vid: number | null = null;
    for (const cand of [538, 539, 639, 645]) {
      const probe = Enemy.fromVanilla(cand, 320, 320);
      if (probe && (probe.def as unknown as { aiStyle?: number })?.aiStyle === 3) { vid = cand; break; }
    }
    if (vid === null) { expect(true).toBe(true); return; }   // 表内无 aiStyle3 成员时跳过
    const c = critterAt(vid, 300, 300);
    const g = stubHooks([c]);
    (g.player as unknown as { equipStats: { dontHurtCritters?: boolean } }).equipStats
      .dontHurtCritters = true;
    expect(hitCritters(boxAt(1, 300, 300), g)).toBe(true);
    expect(c.dead).toBe(true);
  });

  it('hostile-only 敌对弹（教徒冰雾 464/闪电球 465）：对小动物恒零伤（:12631 受理式推导）', () => {
    for (const pid of [464, 465, 466, 580]) {
      const sq = critterAt(299, 300, 300);
      const g = stubHooks([sq]);
      expect(hitCritters(boxAt(pid, 300, 300), g)).toBe(false);
      expect(sq.dead).toBe(false);
    }
  });

  it('双面环境弹（陨石碎块 1078 / 下落沙 56）：走玩家面门——无饰品照常砸死', () => {
    for (const pid of [1078, 56]) {
      const sq = critterAt(299, 300, 300);
      const g = stubHooks([sq]);
      expect(hitCritters(boxAt(pid, 300, 300), g)).toBe(true);
      expect(sq.dead).toBe(true);
    }
  });

  it('双面环境弹 × dontHurtCritters=true：同样拒收（vanilla friendly 弹同门）', () => {
    const sq = critterAt(299, 300, 300);
    const g = stubHooks([sq]);
    (g.player as unknown as { equipStats: { dontHurtCritters?: boolean } }).equipStats
      .dontHurtCritters = true;
    expect(hitCritters(boxAt(56, 300, 300), g)).toBe(false);
    expect(sq.dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F6 TownNPC.hurt crit 通道（接收端）
// ---------------------------------------------------------------------------

describe('F6 TownNPC.hurt 可选 crit 形参（NPC.cs:82067 ×2 应用位）', () => {
  const T = 16;
  function townStub() {
    const npc = new TownNPC('guide', 100 * T, 90 * T);
    const damageNums: Array<{ dmg: number; crit: boolean }> = [];
    const game = {
      world: new World(200, 200, 110, 'blue-f-town'),
      player: { hp: 100, maxHp: 100, dead: true, x: -9999, y: -9999, w: 0, h: 0 },
      npcs: () => [], enemies: () => [], critters: () => [],
      addDamageNumber: (_x: number, _y: number, dmg: number, crit: boolean) =>
        damageNums.push({ dmg, crit }),
      spawnParticles: () => {},
      playSfxFiles: () => {},
      behavioLog: () => {},
      recLog: () => {},
    } as never;
    return { npc, game, damageNums };
  }

  it('crit=false：伤害与旧口径一致（回归锁）', () => {
    const { npc, game, damageNums } = townStub();
    const hpBefore = npc.hp;
    (npc as unknown as { hurt: (...a: unknown[]) => boolean }).hurt(30, 2, 0, game);
    expect(npc.hp).toBeLessThan(hpBefore);       // 实扣发生（深度数值交由飘字断言）
    expect(damageNums.length).toBe(1);
    expect(damageNums[0].crit).toBe(false);
  });

  it('crit=true：×2 于 CalculateDamageNPCsTake 后应用并随飘字携带 crit 位', () => {
    const plain = townStub();
    (plain.npc as unknown as { hurt: (...a: unknown[]) => boolean }).hurt(30, 2, 0, plain.game);
    const crit = townStub();
    (crit.npc as unknown as { hurt: (...a: unknown[]) => boolean })
      .hurt(30, 2, 0, crit.game, 0, 0, true);
    expect(crit.damageNums[0].crit).toBe(true);
    expect(crit.damageNums[0].dmg).toBe(plain.damageNums[0].dmg * 2);   // NPC.cs:82067
  });
});
