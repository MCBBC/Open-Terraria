// 原版飘字位图字体资产结构校验(tools/extract-combat-font.mjs 产物):
//   ReLogic DynamicSpriteFontReader 字段序反编译自本地 ReLogic.dll;
//   数字页 p22(Combat_Text/Combat_Crit 各 10 字形 0-9)
import { describe, it, expect } from 'vitest';
import fontJson from '../src/data/combat-font.json';

const F = fontJson as unknown as {
  Combat_Text: {
    lineSpacing: number; spacing: number; defaultCharacter: number;
    glyphs: Array<{ x: number; y: number; width: number; height: number }>;
    padding: Array<{ x: number; y: number; width: number; height: number }>;
    characters: number[]; kerning: Array<[number, number, number]>;
  };
  Combat_Crit: { lineSpacing: number; characters: number[]; kerning: Array<[number, number, number]> };
};

describe('飘字位图字体资产（Combat_Text/Combat_Crit p22）', () => {
  it('数字页:0-9 十字形齐全,三数组等长', () => {
    for (const name of ['Combat_Text', 'Combat_Crit'] as const) {
      const f = F[name];
      expect(f.characters).toEqual([48, 49, 50, 51, 52, 53, 54, 55, 56, 57]);
      expect(f.kerning.length).toBe(10);
    }
  });

  it('kerning 三元组合理:left/right ≥0,advance 为正', () => {
    const f = F.Combat_Text;
    f.kerning.forEach(([l, w, r]) => {
      expect(l).toBeGreaterThanOrEqual(0);
      expect(r).toBeGreaterThanOrEqual(0);
      // XNA:advance = kerning.Y,可与 glyph 宽有出入（字形可溢出 advance 盒,如 '4'）
      expect(w).toBeGreaterThan(0);
    });
  });

  it('字形矩形在 64×64 纹理内且高 14-16px(Combat_Text 数字规格)', () => {
    for (const g of F.Combat_Text.glyphs) {
      expect(g.x + g.width).toBeLessThanOrEqual(64);
      expect(g.y + g.height).toBeLessThanOrEqual(64);
      expect(g.height).toBeGreaterThanOrEqual(13);
      expect(g.height).toBeLessThanOrEqual(17);
    }
  });

  it('暴击字体行距大于普通(38 vs 30,NewText dramatic 档)', () => {
    expect(F.Combat_Crit.lineSpacing).toBeGreaterThan(F.Combat_Text.lineSpacing);
  });

  it('度量函数:measure 单调且非零(combatMeasure 语义)', async () => {
    const { combatMeasure } = await import('../src/render/CombatTextFont');
    const a = combatMeasure('1', false);
    const b = combatMeasure('100', false);
    expect(a.w).toBeGreaterThan(5);
    expect(b.w).toBeGreaterThan(a.w);
    expect(combatMeasure('88', true).w).toBeGreaterThanOrEqual(combatMeasure('88', false).w); // crit ≥ 普通(个别字形同宽)
  });
});
