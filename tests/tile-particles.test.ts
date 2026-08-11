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

  it('高频项对齐原版概率量级：水蜡烛/和平蜡烛 ~1.5/tick（1/2×3）、熔炉点燃帧 ~0.075（1/40×3）', () => {
    const candle = TILE_PARTICLE_RULES.get(49)?.[0];
    expect(candle?.prob).toBeCloseTo(1.5, 5);
    const peace = TILE_PARTICLE_RULES.get(372)?.[0];
    expect(peace?.prob).toBeCloseTo(1.5, 5);
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
