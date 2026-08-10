// csCompat 数值语义单测：C# (int)/整除/Math.Round(ToEven)/(float) 边界值
import { describe, it, expect } from 'vitest';
import { ctrunc, cdiv, cround, fround } from '../src/core/csCompat';

describe('C# → JS 数值兼容助手', () => {
  it('ctrunc：向零截断（区别 Math.floor 的负数行为）', () => {
    expect(ctrunc(3.9)).toBe(3);
    expect(ctrunc(-3.9)).toBe(-3); // Math.floor(-3.9) = -4 ✗
    expect(ctrunc(0.5)).toBe(0);
    expect(ctrunc(-0.5)).toBe(0);
  });

  it('cdiv：C# int 整除（向零截断）', () => {
    expect(cdiv(7, 2)).toBe(3);
    expect(cdiv(-7, 2)).toBe(-3); // C# -7/2 = -3（Math.floor 是 -4）
    expect(cdiv(100, 3)).toBe(33);
  });

  it('cround：Math.Round 默认 ToEven 银行家舍入', () => {
    expect(cround(0.5)).toBe(0); // .5 取偶 → 0
    expect(cround(1.5)).toBe(2);
    expect(cround(2.5)).toBe(2); // Math.round(2.5)=3 ✗
    expect(cround(3.5)).toBe(4);
    expect(cround(2.4)).toBe(2);
    expect(cround(2.6)).toBe(3);
    expect(cround(-0.5)).toBe(0);
    expect(cround(-1.5)).toBe(-2);
    expect(cround(-2.5)).toBe(-2); // 取偶
  });

  it('fround：float32 单步舍入（double 中间量不会漂移丢失）', () => {
    // 0.1 + 0.2 的 double 误差在 float32 步进下被舍掉
    const d = 0.1 + 0.2;
    expect(fround(d)).not.toBe(d);
    expect(fround(d)).toBeCloseTo(0.3, 6);
    // 大数舍入（float32 有效位 ~7 位十进制）
    expect(fround(16777217)).toBe(16777216);
  });
});
