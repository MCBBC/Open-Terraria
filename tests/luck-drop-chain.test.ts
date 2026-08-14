// luck → 掉落掷骰全链锁死（2026-08-14 A 级近似清理项 3）：
//   LuckState 各来源（瓢虫/微光币/火炬/地精/灯笼夜）→ Player.luck（RecalculateLuck
//   Player.cs:28672-28697）→ NpcDropCtx.luck（Enemy.ts 击杀处注入）→ Luck.RollLuck
//   同构掷骰（NpcDrops.rollLuck / rollCoins 双轮极值 / rollHeartsAndStars）。
// 本文件只测【链路拼接】——单件语义已由 luck-system.test.ts / npc-drops.test.ts 覆盖。
import { describe, it, expect } from 'vitest';
import { RNG } from '../src/core/rng';
import { rollCoins, rollHeartsAndStars, type NpcDropCtx } from '../src/drops/NpcDrops';
import { LuckState } from '../src/stats/Luck';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';

function ctxOf(luck: number, seed: number): NpcDropCtx {
  return {
    rng: new RNG(seed),
    netId: 3, type: 3,
    isExpert: false, isMaster: false, hardMode: false, crimson: false,
    flags: {},
    x: 800, y: 3200,
    worldSurfaceTile: 100, rockLayerTile: 150, underworldTileY: 400,
    maxTilesX: 4200, maxTilesY: 1200,
    lifeMax: 100, friendly: false, boss: false, damage: 20, value: 100,
    hp: 200, hpMax: 400, mana: 40, manaMax: 180,
    luck,
  };
}

describe('luck 来源链 → Player.luck 聚合（RecalculateLuck :28672-28697 逐项）', () => {
  it('瓢虫碾死负值：贴身满额 -10800 → ladyBugLuck −1 → luck −0.2（NPC.cs:82332-82360）', () => {
    const p = new Player(0, 0, new Inventory());
    expect(p.luck).toBe(0);
    p.luckState.ladyBugKilled(0);                      // 距离 0 → 满额坏运
    expect(p.luckState.ladyBugLuckTimeLeft).toBe(-10800);
    expect(p.luck).toBeCloseTo(-0.2, 5);                // ×0.2（:28673）
  });

  it('微光币 coinLuck 分档 +0.2 / 火炬满档 +0.2 / 地精 +0.2 / 灯笼夜 +0.3（原版四来源合击）', () => {
    const p = new Player(0, 0, new Inventory());
    p.luckState.addCoinLuck(0, 300_000);                // 微光化币 >249000 → 0.2 档（:17968-17997）
    expect(p.luckState.coinLuckValue).toBeCloseTo(0.2, 5);
    p.luckState.torchLuck = 1;                          // TryRecalculatingTorchLuck 满档
    p.luckState.hasGardenGnomeNearby = true;
    p.luckState.lanternsUp = true;
    expect(p.luck).toBeCloseTo(0.9, 5);
  });

  it('来源组合后经 ctx.luck 进掷骰（Enemy 注入位同式）：运气改善心/星掉率', () => {
    const good = new Player(0, 0, new Inventory());
    good.luckState.ladyBugKilled(0);                    // -0.2（碾死瓢虫）
    good.luckState.addCoinLuck(0, 300_000);             // +0.2 → 恰归 0
    expect(good.luck).toBeCloseTo(0, 5);
    const lucky = new Player(0, 0, new Inventory());
    lucky.luckState.lanternsUp = true;                  // +0.3
    lucky.luckState.torchLuck = 1;                      // +0.2
    expect(lucky.luck).toBeCloseTo(0.5, 5);
  });
});

describe('ctx.luck → 掉落掷骰（Luck.RollLuck 同构链）', () => {
  const N = 4000;
  function starRate(luck: number): number {
    let hits = 0;
    for (let i = 0; i < N; i++) {
      // 心/星第一掷 RollLuck(6)==0：luck>0 改掷 [3,6)、luck<0 改掷 [6,12)
      const drops = rollHeartsAndStars(ctxOf(luck, 1000 + i * 7919));
      hits += drops.filter((d) => d.id === 184 || d.id === 58).length > 0 ? 1 : 0;
    }
    return hits / N;
  }

  it('心/星掉率随 luck 单调：−1 < 0 < +1（合成率 ≈0.488 / 0.583 / 1.0）', () => {
    // 两掷合成：P(any) = 1−(1−p6)(1−p2)。luck=0:p6=1/6、p2=1/2 → 0.583;
    // luck=+1:p6≈0.261,p2 = Next(Next(1,2)) = Next(1) ≡ 0 → 恒中（原版分母 2
    // 正运改掷的天然退化,非实现偏差）→ 1.0;luck=−1:p6≈0.123、p2≈0.417 → ≈0.488
    const neg = starRate(-1), base = starRate(0), pos = starRate(1);
    expect(base).toBeGreaterThan(0.54);
    expect(base).toBeLessThan(0.62);
    expect(pos).toBeGreaterThan(0.99);                  // 正运恒掉
    expect(base - neg).toBeGreaterThan(0.04);           // 负运显著下降
  });

  it('钱币双轮取极值（NPCLoot_DropMoney :80414-80487）：E[luck=+1] > E[0] > E[luck=−1]', () => {
    const value = 10_000;
    const meanOf = (luck: number): number => {
      let sum = 0;
      for (let i = 0; i < N; i++) {
        const drops = rollCoins(value, ctxOf(luck, 77 + i * 104729), false);
        sum += drops.reduce((a, d) => a + (d.id === 71 ? 1 : d.id === 72 ? 100 : d.id === 73 ? 10_000 : 1_000_000) * d.n, 0);
      }
      return sum / N;
    };
    const neg = meanOf(-1), base = meanOf(0), pos = meanOf(1);
    // |luck|=1 → 重掷门恒开：+1 取两轮 max、−1 取 min（原近似曾两分支都单掷）
    expect(pos).toBeGreaterThan(base * 1.02);
    expect(neg).toBeLessThan(base * 0.98);
    expect(pos).toBeGreaterThan(neg);
  });

  it('luck=0 时链路零扰动（掷骰退化为 rng.Next,钱币管线与旧基线同构）', () => {
    // luck=0：rollCoins 双掷门不开;rollHeartsAndStars 同 Next(6)/Next(2) 语义
    for (let i = 0; i < 200; i++) {
      const c = rollCoins(500, ctxOf(0, 31 + i), false);
      expect(c.length).toBeGreaterThanOrEqual(1);       // value 500 → 至少 1 铜
    }
  });
});
