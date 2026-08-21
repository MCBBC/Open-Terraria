// 合成列表滚动跟随（2026-08-21 用户报"无法滚动到第 7 项以后"）：
// 旧窗取法 min(focus-30, len-60) 在 len<60 时恒 start=0 → 渲染窗钉死顶部,
// 240px overflow:hidden 只露前 ~8 行,滚轮只空转焦点。修=可见行窗焦点居中
// （原版 availableRecipeY[focus]→0 = 视口中心,CraftingUI.cs:383-404）。
// 本测试直测窗取法纯逻辑（UI 类依赖 DOM,几何规则在此单测锁定）。
import { describe, it, expect } from 'vitest';

/** 与 UI.refreshVanillaCrafting 同源的窗取法（抽出来锁行为） */
function craftWindow(focus: number, len: number, vis = 8): { start: number; end: number } {
  if (focus > len - 1) focus = Math.max(0, len - 1);
  const start = Math.max(0, focus - (vis >> 1));
  const end = Math.min(len, start + vis + 4);
  return { start, end };
}

describe('合成列表渲染窗跟随焦点', () => {
  it('短列表（len<60,旧 bug 区）：滚到第 7 项窗口必须移动（start>0）', () => {
    const len = 15;
    const w0 = craftWindow(0, len);
    expect(w0.start).toBe(0);
    const w7 = craftWindow(7, len);       // 用户报障点:滚到第 7 项
    expect(w7.start).toBe(3);             // 7-4=3（焦点居中）
    expect(w7.end).toBe(15);              // 钳尾
    expect(w7.start).toBeGreaterThan(w0.start);   // 窗口跟随
  });

  it('长列表：焦点居中 ±(vis/2)，尾端钳制不越界', () => {
    const len = 300;
    expect(craftWindow(100, len)).toEqual({ start: 96, end: 108 });
    expect(craftWindow(299, len).end).toBe(300);          // 尾端
    expect(craftWindow(299, len).start).toBe(295);
    expect(craftWindow(0, len).start).toBe(0);            // 头端
  });

  it('焦点越界钳到 len-1 不回卷（ScrollCraftingList :582-589 钳 [0,len-1]）', () => {
    expect(craftWindow(500, 15)).toEqual({ start: 10, end: 15 });   // 14-4=10
  });
});
