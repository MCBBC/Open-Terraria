import { describe, it, expect } from 'vitest';
import {
  TILE_PARTICLE_RULES, ruleMatches, DUST_COLOR,
  type TileParticleRule,
} from '../src/render/TileParticles';
import { TILE_DEFS, TILE_BY_KEY } from '../src/data/tiles';

// 方块环境粒子规则表健全性（原版 DrawTiles_EmitParticles Tier 1/2）
describe('方块环境粒子规则表（TileParticles）', () => {
  it('覆盖的 sheet 全部已注册为 tile def', () => {
    const registeredSheets = new Set<number>();
    for (const d of TILE_DEFS) if (d.vanilla?.sheet !== undefined) registeredSheets.add(d.vanilla.sheet);
    const missing: number[] = [];
    for (const sheet of TILE_PARTICLE_RULES.keys()) {
      if (!registeredSheets.has(sheet)) missing.push(sheet);
    }
    expect(missing).toEqual([]);
  });

  it('概率域合法（0, 1]：每 3 tick 一次发射概率不得超过 1', () => {
    const bad: string[] = [];
    TILE_PARTICLE_RULES.forEach((rules, sheet) => {
      for (const r of rules) {
        if (r.prob <= 0 || r.prob > 1) bad.push(`sheet ${sheet} prob=${r.prob}`);
      }
    });
    expect(bad).toEqual([]);
  });

  it('高频项对齐原版概率量级：水蜡烛/和平蜡烛 高发射率（1/2 钳 0.95）、熔炉点燃帧 ~0.075（1/40×3）', () => {
    const candle = TILE_PARTICLE_RULES.get(49)?.[0];
    expect(candle?.prob).toBe(0.95);
    const peace = TILE_PARTICLE_RULES.get(372)?.[0];
    expect(peace?.prob).toBe(0.95);
    const furnace = TILE_PARTICLE_RULES.get(17)?.[0];
    expect(furnace?.prob).toBeCloseTo(0.075, 5);
    expect(furnace?.fx0).toBe(18);
    expect(furnace?.fy0).toBe(18);
  });

  it('帧门判定：ruleMatches 边界', () => {
    const furnace: TileParticleRule = { sheet: 17, color: '#FFF', prob: 0.1, fx0: 18, fy0: 18, rise: 1 };
    expect(ruleMatches(furnace, 18, 18)).toBe(true);
    expect(ruleMatches(furnace, 0, 0)).toBe(false);
    expect(ruleMatches(furnace, 18, 0)).toBe(false);
    // 暗影球：fx>=36 阴影 / fx<36 紫尘
    const shadow = TILE_PARTICLE_RULES.get(31)!.find((r) => r.sideways !== undefined)!;
    expect(ruleMatches(shadow, 36, 0)).toBe(true);
    expect(ruleMatches(shadow, 0, 0)).toBe(false);
  });

  it('篝火 215 / 悬挂火盆 592：按列拆三条，出生盒落在火堆 [2,38)px（★2026-08-31 偏移定谳）', () => {
    for (const sheet of [215, 592] as const) {
      const rules = TILE_PARTICLE_RULES.get(sheet)!;
      expect(rules).toHaveLength(3);
      // 原版每列 1/12/帧（外层 Next(4) × Next(3)），×3 扫描 = 0.25
      for (const r of rules) {
        expect(r.prob).toBeCloseTo(0.25, 5);
        expect(r.dxBox).toBeDefined();
        expect(r.dyBox).toBeDefined();
      }
      // 列帧门 + 出生盒（L6893-6924：NewDust(i*16+2, ∓4, 4×8) + 列修正 ±rand(8)）。
      // ★dxBox = 命中格自身左上相对值（发射器 x = cellX*16 + 盒采样）：
      //   col0 [2,13) / col1 [2,6) / col2 [-6,6) → 绝对羽流 = X0+[2,13)∪[18,22)∪[26,38)
      const byCol = new Map(rules.map((r) => [r.fx0!, r] as const));
      expect(byCol.get(0)!.dxBox).toEqual([2, 13]);   // 2+rand(4)+rand(8)
      expect(byCol.get(18)!.dxBox).toEqual([2, 6]);   // 2+rand(4)（绝对 = 本列+18..22）
      expect(byCol.get(36)!.dxBox).toEqual([-6, 6]);  // 2+rand(4)−rand(8)（绝对 = 本列+26..38）
      // 绝对羽流右界 ≤38px（火堆 48px 宽）——右列盒尾 32+6=38
      expect(byCol.get(36)!.dxBox![1] + 32).toBeLessThanOrEqual(38);
      // 帧门：仅点火行（215 fy0=0 / 592 fy0=18）各自列命中
      const fy = sheet === 215 ? 0 : 18;
      expect(ruleMatches(byCol.get(0)!, 0, fy)).toBe(true);
      expect(ruleMatches(byCol.get(0)!, 18, fy)).toBe(false);
      expect(ruleMatches(byCol.get(36)!, 36, fy)).toBe(true);
      expect(ruleMatches(byCol.get(36)!, 36, fy === 0 ? 18 : 0)).toBe(false);
    }
    expect(TILE_PARTICLE_RULES.get(215)![0].dyBox).toEqual([-4, 4]);
    expect(TILE_PARTICLE_RULES.get(592)![0].dyBox).toEqual([4, 12]);
  });

  it('dust 色表覆盖规则引用的所有基础色键', () => {
    expect(DUST_COLOR[6]).toBeDefined();
    expect(DUST_COLOR[14]).toBeDefined();
    expect(DUST_COLOR[5]).toBeDefined();
    expect(DUST_COLOR[41]).toBeDefined();
    expect(DUST_COLOR[242]).toBeDefined();
    expect(DUST_COLOR[172]).toBeDefined();
    expect(DUST_COLOR[43]).toBeDefined();
  });

  it('药草 83 六 style（昼耀/月华/死亡草/叶绿/火焰花/颤骨）各有规则', () => {
    const herbs = TILE_PARTICLE_RULES.get(83)!;
    expect(herbs.length).toBe(6); // Blinkroot 原版无粒子
    // 成熟帧门：fx 为 style*18 时命中
    const fireblossom = herbs.find((r) => r.pred?.(90, 0))!;
    expect(fireblossom).toBeDefined();
    expect(fireblossom.color).toBe(DUST_COLOR[6]);
  });
});
