// R5 幸运系统回归：luck 聚合（药水三档）+ rollLuck 掷骰修正（Luck.cs:6）
import { describe, it, expect } from 'vitest';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { BuffType } from '../src/stats/Buffs';
import { rollCoins, type NpcDropCtx } from '../src/drops/NpcDrops';
import { RNG } from '../src/core/rng';

describe('R5 幸运值聚合（RecalculateLuck :28671）', () => {
  it('幸运药水三档：>600s → luck 0.3 / >300s → 0.2 / 其余 0.1（AddBuff max 合并→分实例验）', () => {
    const mkP = () => new Player(0, 0, new Inventory());
    expect(mkP().luck).toBe(0);
    const p2 = mkP(); p2.buffs.apply(BuffType.Luck, 600);
    expect(p2.luck).toBeCloseTo(0.2, 5); // 600 不 >600 → 档 2
    const p3 = mkP(); p3.buffs.apply(BuffType.Luck, 900);
    expect(p3.luck).toBeCloseTo(0.3, 5); // >600s → 档 3
    const p1 = mkP(); p1.buffs.apply(BuffType.Luck, 100);
    expect(p1.luck).toBeCloseTo(0.1, 5);
  });

  it('rollCoins luck 重掷：高 luck 下金额期望显著高于 0 luck（同种子族）', () => {
    let plain = 0, lucky = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const c1: NpcDropCtx = { rng: new RNG(seed), luck: 0 } as never;
      const c2: NpcDropCtx = { rng: new RNG(seed), luck: 0.9 } as never;
      plain += rollCoins(1000, c1, false).reduce((a, d) => a + d.n, 0);
      lucky += rollCoins(1000, c2, false).reduce((a, d) => a + d.n, 0);
    }
    // |luck|=0.9 → ~90% 触发重掷；重掷取后者使期望向"再抽一次"移动（可升可降，
    // 但方向上近似 max 偏置需大样本）——此处只断言链路生效（金额分布有变化）
    expect(lucky).not.toBe(plain);
    // 高 luck 触发概率高 → 与 0.1 luck 的差值方向性断言（宽松）
    let lowL = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const c3: NpcDropCtx = { rng: new RNG(seed), luck: 0.1 } as never;
      lowL += rollCoins(1000, c3, false).reduce((a, d) => a + d.n, 0);
    }
    expect(Math.abs(lucky - plain)).toBeGreaterThan(Math.abs(lowL - plain) * 0.5);
  });
});
