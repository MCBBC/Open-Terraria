// UIGenProgressBar 手机窄屏宽度因子单测（纯逻辑）：
// 桌面逻辑宽 ≥628 → k≡1（drawSelf 表达式逐项退化原值，逐像素不变）；
// 竖屏手机 ~390 → 按 (w-16)/612 缩放；极窄屏下限 0.55。
import { describe, it, expect } from 'vitest';
import { fitProgressScale } from '../src/vui/elements/UIGenProgressBar';
import { UIScale } from '../src/vui/draw/UIScale';

describe('fitProgressScale（世界生成进度条窄屏因子）', () => {
  it('桌面/横屏逻辑宽 ≥628 → 恒 1', () => {
    expect(fitProgressScale(800)).toBe(1);    // 1024×768: UIScale=1.28 → logicalW=800
    expect(fitProgressScale(1920)).toBe(1);
    expect(fitProgressScale(844 / 0.86)).toBe(1); // 手机横屏逻辑宽远超阈值
    expect(fitProgressScale(628)).toBe(1);    // 边界：612 定宽 + 两侧余量 16
  });

  it('竖屏手机按 (logicalW-16)/612 缩放', () => {
    expect(fitProgressScale(390)).toBeCloseTo((390 - 16) / 612, 12); // ≈0.611
    expect(fitProgressScale(430)).toBeCloseTo((430 - 16) / 612, 12);
    // 竖屏 390×844 下 UIScale 公式 = max(1, min(0.49,1.41), 0.86) = 1 → logicalW=390
    UIScale.resize(390, 844, 1);
    expect(UIScale.logicalW).toBe(390);
    expect(fitProgressScale(UIScale.logicalW)).toBeLessThan(1);
  });

  it('极窄屏钳到下限 0.55', () => {
    expect(fitProgressScale(200)).toBe(0.55);
    expect(fitProgressScale(0)).toBe(0.55);
  });
});
