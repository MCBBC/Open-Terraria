// 三个精确遗留小项回归（对 1456 反编译源码逐行核对）：
//   A 树妖(20)月相轮换货 4430-4441   Chest.cs:1650-1697（归属核对：
//     NPCInteractions.cs:491 `Shop(20, 3)` → 槽位 3 = 树妖；
//     ★动物学家(633)【无】此轮换——其月相段仅 :3358-3379 兽耳尾套装四相位对）
//   B 骷髅商(453)月相定价系数       ShopHelper.cs:64-88 GetSkeletonMerchantPrices
//     （1456 中该方法零调用点，ProcessMood :107 对 453 提前 return；按任务要求
//      复现原表，消费点 Game.openNpcShop）
//   C npcTypeNoAggro +1000 罚项     Player.cs:14144-14168（物品 3090 表 23 类）
//                                  + NPC.cs:78492-78495（direction!=0 → +1000f）
//                                  + NPC.cs:78543-78546（faceTarget=false 不转身）
//                                  ★SW-RB8c 2026-09-08 重钉：置位源唯一=3090（凝胶）,
//                                  Calming 零索敌效应（calmed 只吃刷怪率 NPC.cs:708-712）
import { describe, it, expect } from 'vitest';
import { dryadMoonPhaseStock, skeletonMerchantMoonPriceMul } from '../src/data/townNpcProfiles';
import { Enemy, CALMING_NO_AGGRO_TYPES } from '../src/entities/Enemy';
import { BuffState, BuffType } from '../src/stats/Buffs';
import type { Player } from '../src/entities/Player';

// ==================== A 树妖月相轮换货（Chest.cs:1650-1697） ====================
describe('A 树妖(20)月相轮换货 4430-4441（Chest.cs:1650-1697）', () => {
  it('hardMode：moonPhase/2 四组各 3 件（:1654-1673）', () => {
    expect(dryadMoonPhaseStock(0, true)).toEqual([4430, 4431, 4432]); // case 0 = 相0/1
    expect(dryadMoonPhaseStock(1, true)).toEqual([4430, 4431, 4432]);
    expect(dryadMoonPhaseStock(2, true)).toEqual([4433, 4434, 4435]); // case 1 = 相2/3
    expect(dryadMoonPhaseStock(3, true)).toEqual([4433, 4434, 4435]);
    expect(dryadMoonPhaseStock(4, true)).toEqual([4436, 4437, 4438]); // case 2 = 相4/5
    expect(dryadMoonPhaseStock(5, true)).toEqual([4436, 4437, 4438]);
    expect(dryadMoonPhaseStock(6, true)).toEqual([4439, 4440, 4441]); // default = 相6/7
    expect(dryadMoonPhaseStock(7, true)).toEqual([4439, 4440, 4441]);
  });

  it('非 hardMode：各组前 2 件，4432/4435/4438/4441 不上架（:1680-1695）', () => {
    expect(dryadMoonPhaseStock(0, false)).toEqual([4430, 4431]);
    expect(dryadMoonPhaseStock(3, false)).toEqual([4433, 4434]);
    expect(dryadMoonPhaseStock(4, false)).toEqual([4436, 4437]);
    expect(dryadMoonPhaseStock(7, false)).toEqual([4439, 4440]);
  });

  it('四组并集 = 4430-4441 全 12 件且无重复（尾接主商品链 num++，无数量覆盖）', () => {
    const all = [0, 1, 2, 3].flatMap((g) => dryadMoonPhaseStock(g * 2, true));
    expect(all).toHaveLength(12);
    expect([...new Set(all)].sort((a, b) => a - b)).toEqual(
      [4430, 4431, 4432, 4433, 4434, 4435, 4436, 4437, 4438, 4439, 4440, 4441]);
  });
});

// ==================== B 骷髅商月相定价（ShopHelper.cs:64-88） ====================
describe('B 骷髅商(453)月相定价系数（ShopHelper.cs:64-88）', () => {
  it('夜间逐相：相0=1.0 基价 → 1/7=1.1 → 2/6=1.2 → 3/5=1.3 → 相4=1.4 最贵', () => {
    // :66 num = 1f（相0 满月，最便宜）
    expect(skeletonMerchantMoonPriceMul(0, false)).toBeCloseTo(1.0);
    // :67-70 moonPhase==1 || 7 → 1.1f
    expect(skeletonMerchantMoonPriceMul(1, false)).toBeCloseTo(1.1);
    expect(skeletonMerchantMoonPriceMul(7, false)).toBeCloseTo(1.1);
    // :71-74 moonPhase==2 || 6 → 1.2f
    expect(skeletonMerchantMoonPriceMul(2, false)).toBeCloseTo(1.2);
    expect(skeletonMerchantMoonPriceMul(6, false)).toBeCloseTo(1.2);
    // :75-78 moonPhase==3 || 5 → 1.3f
    expect(skeletonMerchantMoonPriceMul(3, false)).toBeCloseTo(1.3);
    expect(skeletonMerchantMoonPriceMul(5, false)).toBeCloseTo(1.3);
    // :79-82 moonPhase==4（新月）→ 1.4f
    expect(skeletonMerchantMoonPriceMul(4, false)).toBeCloseTo(1.4);
  });

  it('白天再 +0.1（:83-86 if (Main.dayTime) num += 0.1f）', () => {
    expect(skeletonMerchantMoonPriceMul(0, true)).toBeCloseTo(1.1);
    expect(skeletonMerchantMoonPriceMul(4, true)).toBeCloseTo(1.5);
  });
});

// ==================== C npcTypeNoAggro +1000 罚项 ====================
/** 索敌单元桩：只读 cx/cy/aggro/w/h/useTime/itemAnimTicks/buffs（公开字段） */
const stub = (over: Record<string, unknown> = {}) => ({
  cx: 300, cy: 110, aggro: 0, w: 20, h: 42, useTime: 0, itemAnimTicks: 0,
  ...over,
}) as unknown as Player;

describe('C 罚项表（Player.cs:14144-14168：物品 3090 → 23 类）', () => {
  it('表与原版逐项一致（npcTypeNoAggro[N]=true 的全部 23 项，:14146-14168）', () => {
    expect([...CALMING_NO_AGGRO_TYPES].sort((a, b) => a - b)).toEqual([
      1, 16, 59, 71, 81, 121, 122, 138, 141, 147, 183, 184, 204, 225, 244,
      302, 333, 334, 335, 336, 537, 667, 676,
    ]);
    expect(CALMING_NO_AGGRO_TYPES.has(1)).toBe(true);    // :14146 首项
    expect(CALMING_NO_AGGRO_TYPES.has(676)).toBe(true);  // :14167 末项
    expect(CALMING_NO_AGGRO_TYPES.has(3)).toBe(false);   // 僵尸不在表内
  });
});

describe('C +1000 罚项（NPC.cs:78492-78495）与不面向门（NPC.cs:78543-78546）——SW-RB8c 2026-09-08 重钉原版 1:1', () => {
  // ★定谳：npcTypeNoAggro 唯一置位源 = 装备 3090 皇家凝胶（1457 Player.cs:14790-14814;
  // 1456 :14144-14168 同;ResetEffects :18922/UpdateDead :17157 每帧全清）。镇静药水
  // calmed 只吃刷怪率 spawnRate×1.65/maxSpawns×0.6（NPC.cs:708-712）——零索敌效应。
  // 旧钉「Calming → +1000/不面向」为置位源误接（mb CALMING_NO_AGGRO_TYPES 表名误导），
  // 本块按 gel 专面重钉。
  const mkCalming = () => { const b = new BuffState(); b.apply(BuffType.Calming, 30); return b; };
  const gel = { equipStats: { royalGel: true } };

  it('表内怪（NPC 1 蓝史莱姆）+ 凝胶装备 → 有效距离 +1000；裸玩家不罚', () => {
    const e = Enemy.fromVanilla(1, 100, 50);
    expect(e).not.toBeNull();
    const manhattan = Math.abs(300 - e!.cx) + Math.abs(110 - e!.cy);
    expect(e!.effectiveTargetDist(stub())).toBe(manhattan);                       // 无装备
    expect(e!.effectiveTargetDist(stub(gel))).toBe(manhattan + 1000);             // :78494
  });

  it('镇静药水零索敌效应（calmed 不置 npcTypeNoAggro）——+1000 罚/不面向门双面', () => {
    const e = Enemy.fromVanilla(1, 100, 50);
    e!.facing = 1;
    const manhattan = Math.abs(300 - e!.cx) + Math.abs(110 - e!.cy);
    expect(e!.effectiveTargetDist(stub({ buffs: mkCalming() }))).toBe(manhattan); // 不罚
    // 不面向门同面：镇静下照常转身（原版 :78542 门不吃 calmed）
    expect(e!.seekDirX(stub({ cx: e!.cx - 200, cy: e!.cy, buffs: mkCalming() }))).toBe(-1);
  });

  it('表外怪（僵尸）不受罚项影响（凝胶/镇静皆然）', () => {
    const z = new Enemy('zombie', 100, 50);
    const manhattan = Math.abs(300 - z.cx) + Math.abs(110 - z.cy);
    expect(z.effectiveTargetDist(stub(gel))).toBe(manhattan);
    expect(z.effectiveTargetDist(stub({ buffs: mkCalming() }))).toBe(manhattan);
  });

  it('罚项等效收窄索敌门：canTargetPlayerAt 同距离由命中转不命中（+1000 曼哈顿）', () => {
    const e = Enemy.fromVanilla(1, 100, 300);
    const p = stub({ cx: 300, cy: 300, ...gel });               // 距离 200px
    const range = 18 * 16;                                      // flyAI 18 格门
    expect(e!.effectiveTargetDist(p)).toBe(Math.abs(300 - e!.cx) + 1000);
    expect(e!.canTargetPlayerAt(p, range)).toBe(false);         // 1200 > 288
    expect(e!.canTargetPlayerAt(stub({ cx: 300, cy: 300 }), range)).toBe(true); // 无 gel 命中
  });

  it('不面向门：表内怪 + 凝胶保留旧朝向（faceTarget=false :78543-78546）', () => {
    const e = Enemy.fromVanilla(1, 100, 50);
    e!.facing = 1;                                              // 旧朝向朝右
    // 玩家放在会触发转身的另一侧，凝胶下应保持旧朝向
    const p = stub({ cx: e!.cx - 200, cy: e!.cy, ...gel });
    expect(e!.seekDirX(p)).toBe(1);                             // 门生效：不转身
    expect(e!.seekDirX(stub({ cx: e!.cx - 200, cy: e!.cy }))).toBe(-1);
  });

  it('单人 direction 语义：facing 恒 ±1 非 0（:324/:675），罚项对表内怪恒生效', () => {
    const e = Enemy.fromVanilla(1, 100, 50);
    expect(e!.facing).not.toBe(0);   // NPC.direction 恒 ±1 → :78492 direction!=0 恒真
    const p = stub(gel);
    expect(e!.effectiveTargetDist(p)).toBe(
      Math.abs(300 - e!.cx) + Math.abs(110 - e!.cy) + 1000);
  });
});
