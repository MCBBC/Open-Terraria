// 地平线系统纯函数对账(2026-08-20 光照专案·原版化落地):
//   锚:SunGradients.cs 梯度表 / Main.cs:2865 HorizonPhase / SetBackColor:62896-62931
//   sunColor 三段 / :63354-63359 非血月月色恒白 / NextHorizonRenderer:185-196
//   ModifyHorizonLight 的逐通道 max-lerp。
import { describe, it, expect } from 'vitest';
import {
  SUNRISE_GRADS, SUNSET_GRADS, horizonPhaseOf, sunColorOf, moonDrawColor, modifyHorizonLight,
} from '../src/lighting/Horizon';

describe('SunGradients 梯度表(SunGradients.cs 逐值)', () => {
  it('四调色板 × 15 帧,首末帧锚值', () => {
    expect(SUNRISE_GRADS).toHaveLength(4);
    expect(SUNRISE_GRADS[0]).toHaveLength(15);
    expect(SUNRISE_GRADS[0][0]).toEqual([17, 35, 67]);      // Sunrise_Blue[0]
    expect(SUNRISE_GRADS[0][14]).toEqual([255, 230, 153]);  // Sunrise_Blue[14]
    expect(SUNRISE_GRADS[3][7]).toEqual([138, 95, 155]);    // Sunrise_Aluminum[7]
    expect(SUNSET_GRADS[2][14]).toEqual([240, 125, 63]);    // Sunset_Pink[14]
    expect(SUNSET_GRADS[3][0]).toEqual([27, 24, 39]);       // Sunset_Red[0]
  });
});

describe('HorizonPhase(Main.cs:2865-2877)', () => {
  it('夜/白昼后半 = moonPhase;白昼前半 −1;负数回卷 +8', () => {
    expect(horizonPhaseOf(5, false, 0)).toBe(5 % 4);
    expect(horizonPhaseOf(5, true, 30000)).toBe(5 % 4);
    expect(horizonPhaseOf(0, true, 100)).toBe(7 % 4);       // 0−1 → 7
  });
});

describe('sunColor 三段曲线(SetBackColor Main.cs:62896-62931)', () => {
  it('黎明首端 (55,75,5) → 正午白;黄昏末端 (55,25,55)', () => {
    expect(sunColorOf(0)).toEqual([55, 75, 5]);
    expect(sunColorOf(13500)).toEqual([255, 255, 255]);
    expect(sunColorOf(20000)).toEqual([255, 255, 255]);     // 正午段
    expect(sunColorOf(37800.5)[0]).toBeCloseTo(255, 0);     // 黄昏前段起点≈白
    const dusk = sunColorOf(54000);                          // 黄昏后段末端(浮点尾差容差)
    expect(dusk[0]).toBeCloseTo(55, 5);
    expect(dusk[1]).toBeCloseTo(25, 5);
    expect(dusk[2]).toBeCloseTo(55, 5);
  });
});

describe('月绘制色(SetBackColor:63354-63359 + 血月 :62946-62960)', () => {
  it('非血月恒白;血月入夜首端红移 (215,225,255) → 深夜 (205,55,55)', () => {
    expect(moonDrawColor(0, false)).toEqual([255, 255, 255]);
    expect(moonDrawColor(0, true)).toEqual([215, 225, 255]);
    expect(moonDrawColor(16200, true)).toEqual([205, 55, 55]);
  });
});

describe('ModifyHorizonLight(NextHorizonRenderer:185-196 逐通道 max 后 lerp)', () => {
  it('可见度 0 = 原样;可见度 1 单通道取 max', () => {
    expect(modifyHorizonLight([10, 10, 10], 0, 0, 0)).toEqual([10, 10, 10]);
    // Sunset_Blue 中帧 = [171,103,125](相位 0)
    const out = modifyHorizonLight([10, 200, 10], 0, 1, 0);
    expect(out[0]).toBe(171);                               // max(10,171)=171
    expect(out[1]).toBe(200);                               // max(200,103)=200
    expect(out[2]).toBe(125);                               // max(10,125)=125
  });
});
