// BJ271 恶魔眼晶状体掉落钉值（用户实报"掉率怪"定谳刀）
// 原版锚（Terarria1457）：
// - ItemID.cs:1622 Lens = 38（★任务书误记 155= Muramasa 村正,ItemID.cs:1856——
//   非晶状体；236 BlackLens =2018 / 43 SuspiciousLookingEye =:1632）
// - ItemDropDatabase.cs:1090-1092 恶魔眼族注册（npcNetIds14 = 9 eye）：
//     Common(236, 1/100).OnFailedRoll(Common(38, 1/3))
//     ItemDropWithConditionRule(43, 1/50, EyeOfCthulhuDefeatedAndNoAltarsInWorld)
// - CommonDrop.cs:34 走 player.RollLuck(denom)<num（luck=0 ≡ rng.Next(denom)）；
//   Luck.cs:6-13 RollLuck 双掷语义（本仓 NpcDrops.rollLuck 同构,2026-08-14 复核）
// ⇒ Lens 率 = (99/100)×(1/3) = 0.33（normal=expert,恶魔眼族无难度分档）
// - NPCLoot 头部雕像门（NPC.cs:79648-79654 + NPCID.cs:4799 StatueSpawnedDropRarity[2]=0.05f）
//   消费面已接（Enemy.ts statueSkip/STATUE_DROP_RARITY）
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { resolveDrops, type NpcDropCtx } from '../src/drops/NpcDrops';
import dropData from '../src/data/vanilla-npcdrops.json';

const EYE_FAMILY = [2, 317, 318, 190, 191, 192, 193, 194, 133];

function mkCtx(over: Partial<NpcDropCtx> = {}): NpcDropCtx {
  return {
    rng: new RNG(42),
    netId: 2, type: 2,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 1000, y: 1000,
    worldSurfaceTile: 200, rockLayerTile: 400, underworldTileY: 900,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 50, friendly: false, boss: false, damage: 14, value: 75,
    hp: 80, hpMax: 100, mana: 15, manaMax: 20,
    luck: 0,
    ...over,
  };
}

function sample(type: number, n: number, seedBase = 7919, over: Partial<NpcDropCtx> = {}) {
  const counts = new Map<number, number>();
  const killsWith: Array<Set<number>> = [];
  for (let i = 0; i < n; i++) {
    const res = resolveDrops(mkCtx({ rng: new RNG(i * seedBase + 13), netId: type, type, ...over }));
    const ids = new Set<number>();
    for (const d of res.drops) {
      counts.set(d.id, (counts.get(d.id) ?? 0) + d.n);
      ids.add(d.id);
    }
    killsWith.push(ids);
  }
  return { counts, killsWith };
}

describe('BJ271 恶魔眼掉落（静态表）', () => {
  const entries = (dropData as { entries: Array<{ npcs?: number[]; rule: any }> }).entries;

  it('恶魔眼族注册：236@1/100 → failedRoll → 38@1/3（ItemDropDatabase.cs:1091）', () => {
    const chain = entries.find((e) => e.npcs?.length === 9 && e.rule.k === 'common' && e.rule.item === 236);
    expect(chain).toBeDefined();
    expect(chain!.rule.denom).toBe(100);
    expect(chain!.rule.chain).toEqual([
      { on: 'failedRoll', rule: { k: 'common', item: 38, denom: 3, min: 1, max: 1 } },
    ]);
    expect([...chain!.npcs!].sort((a, b) => a - b)).toEqual([...EYE_FAMILY].sort((a, b) => a - b));
  });

  it('坠星条件件 43@1/50（:1092 EyeOfCthulhuDefeatedAndNoAltarsInWorld,普通世界恒关）', () => {
    const cond = entries.find((e) => e.npcs?.length === 9 && e.rule.k === 'cond' && e.rule.item === 43);
    expect(cond).toBeDefined();
    expect(cond!.rule.denom).toBe(50);
    expect(cond!.rule.cond.name).toBe('EyeOfCthulhuDefeatedAndNoAltarsInWorld');
  });

  it('Lens=38 的 key 映射非空（落地可实例化;155=Muramasa 勘误锚）', async () => {
    const { VANILLA_ITEM_KEY_BY_ID } = await import('../src/data/items');
    expect(VANILLA_ITEM_KEY_BY_ID[38]).toBeTruthy();   // lens
    expect(VANILLA_ITEM_KEY_BY_ID[155]).toBeTruthy();  // muramasa（非晶状体）
  });
});

describe('BJ271 恶魔眼掉落（掷面钉值）', () => {
  const N = 20000;
  const lens = sample(2, N).counts.get(38) ?? 0;
  const black = sample(2, N).counts.get(236) ?? 0;

  it('晶状体 38 率 = 99/100 × 1/3 ≈ 33%（20000 杀 ±5σ [6268,6932]）', () => {
    // 原版期望率 0.33：链先掷 236@1/100,失败才掷 38@1/3
    expect(lens).toBeGreaterThanOrEqual(6268);
    expect(lens).toBeLessThanOrEqual(6932);
  });

  it('黑晶状体 236 率 = 1/100（20000 杀 ±4σ [143,257]）', () => {
    expect(black).toBeGreaterThanOrEqual(143);
    expect(black).toBeLessThanOrEqual(257);
  });

  it('链互斥：任一杀不得同时掉 236 与 38（failedRoll 链门）', () => {
    const { killsWith } = sample(2, N);
    for (const ids of killsWith) {
      expect(ids.has(236) && ids.has(38)).toBe(false);
    }
  });

  it('普通世界掉落面 ⊆ {38,236}（43 条件假/global 全 failedCond）', () => {
    const { killsWith } = sample(2, N);
    for (const ids of killsWith) {
      for (const id of ids) expect([38, 236]).toContain(id);
    }
  });

  it('概率门两侧（固定种子扫描：全败/仅38/仅236 三态齐备）', () => {
    let allFail = 0, lensOnly = 0, blackOnly = 0;
    for (let s = 0; s < 500; s++) {
      const res = resolveDrops(mkCtx({ rng: new RNG(s * 31 + 1) }));
      const ids = new Set(res.drops.map((d) => d.id));
      if (ids.size === 0) allFail++;
      else if (ids.has(38)) lensOnly++;
      else if (ids.has(236)) blackOnly++;
    }
    expect(allFail).toBeGreaterThan(0);   // 38 也掷败的杀
    expect(lensOnly).toBeGreaterThan(0);  // 38 掷中的杀
    expect(blackOnly).toBeGreaterThan(0); // 236 掷中（链终止,无 38）的杀
  });

  it('expert 无分档：恶魔眼族规则无专家包装,率仍 ≈33%', () => {
    const n = 8000;
    const got = sample(2, n, 7919, { isExpert: true }).counts.get(38) ?? 0;
    // 期望 2640,σ=sqrt(8000*.33*.67)≈42,±5σ [2430,2850]
    expect(got).toBeGreaterThanOrEqual(2430);
    expect(got).toBeLessThanOrEqual(2850);
  });
});

describe('BJ271 恶魔眼变体族对照（同规则集）', () => {
  it.each(EYE_FAMILY.filter((t) => t !== 2))('眼族 type %i：Lens 率 ≈33%（2000 杀 ±5σ）', (t) => {
    const n = 2000;
    const got = sample(t, n).counts.get(38) ?? 0;
    // 期望 660,σ≈21,±5σ [555,765]
    expect(got).toBeGreaterThanOrEqual(555);
    expect(got).toBeLessThanOrEqual(765);
  });
});

describe('BJ271 常见掉落回归（不回归守卫）', () => {
  it('僵尸(3) 铁皮药剂 216@1/50（2000 杀 ±4σ [18,62]）+ 史莱姆(1) 凝胶恒掉', () => {
    const z = sample(3, 2000);
    expect(z.counts.get(216) ?? 0).toBeGreaterThanOrEqual(18);
    expect(z.counts.get(216) ?? 0).toBeLessThanOrEqual(62);
    const sl = sample(1, 500);
    expect(sl.counts.get(23) ?? 0).toBeGreaterThanOrEqual(500); // Gel(1,1,2) 恒掉 1-2
  });
});
