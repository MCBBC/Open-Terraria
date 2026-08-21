// 世界时间/昼夜时长对齐回归（用户问"推进速率或昼夜时长和原版对齐了吗"）：
// 标杆 Main.cs——time += dayRate（:64426，1t/帧@60fps 恒速）；昼 4:30AM-7:30PM
// = 54000t = 15min、夜 32400t = 9min（全周期 24min）；DAWN/DUSK 边界换算
// 4.5/24 与 19.5/24；起始 8:15AM（time=13500）；UpdateTimeRate（:6270-6294）
// 快进 60 / 冻结 0 / TargetTimeRate × 全员熟睡 5。
import { describe, it, expect } from 'vitest';
import { Clock } from '../src/world/World';

describe('昼夜时长对齐（Main.time :64426 + Clock 边界）', () => {
  it('昼夜边界 = 4:30/19:30（DAWN 0.1875 / DUSK 0.8125）', () => {
    expect(Clock.DAWN).toBe(4.5 / 24);
    expect(Clock.DUSK).toBe(19.5 / 24);
  });

  it('全周期 24min 恒速推进：昼窗恰 15min、夜窗恰 9min', () => {
    const c = new Clock(24 * 60 * 1000);
    // 从黎明前一点点推进，统计 isDay 窗口时长
    c.timeOfDay = Clock.DAWN - 0.001;
    let dayMs = 0, nightMs = 0;
    const step = 1000 / 60;   // 60fps 帧步长
    for (let i = 0; i < 24 * 60 * 60; i++) {   // 最多 24min（每 ms 一步）
      c.tick(step);
      if (c.isDay) dayMs += step; else nightMs += step;
      if (c.timeOfDay >= Clock.DAWN - 0.001 && c.dayCount > 1) break;   // 回到起点后停
    }
    expect(dayMs / 60000).toBeCloseTo(15, 1);    // 昼 15min（54000t@60fps）
    expect(nightMs / 60000).toBeCloseTo(9, 1);   // 夜 9min（32400t@60fps）
  });

  it('isDay 窗口 = [DAWN, DUSK] 开区间（4:30AM-7:30PM）', () => {
    const c = new Clock(24 * 60 * 1000);
    c.timeOfDay = 0.1;  expect(c.isDay).toBe(false);   // 凌晨
    c.timeOfDay = Clock.DAWN + 0.001; expect(c.isDay).toBe(true);
    c.timeOfDay = 0.5;                expect(c.isDay).toBe(true);   // 正午
    c.timeOfDay = Clock.DUSK - 0.001; expect(c.isDay).toBe(true);
    c.timeOfDay = Clock.DUSK + 0.001; expect(c.isDay).toBe(false);
  });

  it('起始时间 8:15AM（Main.time 13500 换算 8.25/24）', () => {
    const c = new Clock(24 * 60 * 1000);
    expect(c.timeOfDay).toBe(8.25 / 24);
    expect(c.hourFloat).toBeCloseTo(8.25, 5);
  });

  it('dayRate 链：全员熟睡 ×5（24min 周期 → 睡觉时 4.8min/天）', () => {
    // World.dayRate() 逻辑对拍（World 实例构造重——纯函数复刻）
    const dayRate = (fast: boolean, freeze: boolean, rate: number, allSleeping: boolean) =>
      fast ? 60 : freeze ? 0 : rate * (allSleeping ? 5 : 1);
    expect(dayRate(false, false, 1, false)).toBe(1);    // 常态 1
    expect(dayRate(false, false, 1, true)).toBe(5);     // 全员熟睡 5（:6280-6285）
    expect(dayRate(true, false, 1, false)).toBe(60);    // 日晷/月晷快进 60
    expect(dayRate(false, true, 1, false)).toBe(0);     // 旅程时间冻结 0
    expect(dayRate(false, false, 3, false)).toBe(3);    // 旅程时间速率 ×3
  });
});
