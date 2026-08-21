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
  Item_Stack: {
    lineSpacing: number; spacing: number; defaultCharacter: number; texture: string;
    glyphs: Array<{ x: number; y: number; width: number; height: number }>;
    padding: Array<{ x: number; y: number; width: number; height: number }>;
    characters: number[]; kerning: Array<[number, number, number]>;
  };
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

// ---------------------------------------------------------------------------
// Item_Stack（FontAssets.ItemStack,AssetInitializer.cs:110）——Boss 血条数值文本
// （BigProgressBarHelper.DrawHealthText）用;p0 页 (0,0,240,104) 裁片,数字+"/" 11 字形
// ---------------------------------------------------------------------------
describe('Item_Stack 位图字体（Boss 血条数值文本）', () => {
  it('字符集 = "/"+0-9（DrawHealthText 三段串的完整字符面）;行盒 24', () => {
    const f = F.Item_Stack;
    expect(f.characters).toEqual([47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57]);
    expect(f.lineSpacing).toBe(24);
    expect(f.texture).toBe('vanilla/Item_Stack_p0.png');
    expect(f.glyphs.length).toBe(11);
    expect(f.kerning.length).toBe(11);
    expect(f.padding.length).toBe(11);
  });
  it('字形矩形在 240×104 裁片内（p0 坐标原样保留,裁自 (0,0)）', () => {
    for (const g of F.Item_Stack.glyphs) {
      expect(g.x + g.width).toBeLessThanOrEqual(240);
      expect(g.y + g.height).toBeLessThanOrEqual(104);
      expect(g.width).toBeGreaterThan(0);
      expect(g.height).toBeGreaterThanOrEqual(10);   // 数字 10-15px、'/' 14px
      expect(g.height).toBeLessThanOrEqual(15);
    }
  });
  it('itemStackMeasure:XNA 语义逐值（advance=l+w+r+spacing;缺字 8px 兜底）', async () => {
    const { itemStackMeasure } = await import('../src/render/CombatTextFont');
    expect(itemStackMeasure('1')).toEqual({ w: 5, h: 24 });          // kerning [1,3,1]
    expect(itemStackMeasure('/')).toEqual({ w: 7, h: 24 });          // [0,7,0]
    expect(itemStackMeasure('100')).toEqual({ w: 23, h: 24 });       // '1'5+'0'9+'0'9 逐字符 l+w+r
    expect(itemStackMeasure('7').w).toBe(7);                          // '7' kerning [-1,8,0]——负左跨距为原版真值
    expect(itemStackMeasure('A').w).toBe(8);                          // 字符集外兜底
  });
  it('drawItemStackBorderString:字体未就绪静默返回（node 无 Image;浏览器像素验证走探针）', async () => {
    const { drawItemStackBorderString, itemStackFontReady } = await import('../src/render/CombatTextFont');
    expect(itemStackFontReady()).toBe(false);
    const stub = {
      save: () => {}, restore: () => {}, drawImage: () => {},
      set imageSmoothingEnabled(_v: boolean) {},
    } as unknown as CanvasRenderingContext2D;
    expect(() => drawItemStackBorderString(stub, '123', 100, 50, 0, 0)).not.toThrow();
  });
});
