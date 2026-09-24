// ★C9c 自适应 live 门单测（2026-09-24）——滞回步进 liveGateStep 纯函数。
// 背景三案：120fps 高刷滑档（C9b 到达即应用修）→ 用户复报不限帧率/进世界仍延迟
// → C9c liveAuth 门（warmup 禁陈旧倒灌）+ lagMs 滞回门（健康才转 live,饱和回退）。
import { describe, it, expect } from 'vitest';
import { liveGateStep } from '../src/lighting/LightingEngine';

describe('C9c live 滞回门', () => {
  it('lag=0（尚无结果）不计拍,永先进 live', () => {
    let s = liveGateStep(false, 0, 0, 0, false);
    for (let i = 0; i < 20; i++) s = liveGateStep(s.live, s.good, s.bad, 0, false);
    expect(s.live).toBe(false);
    expect(s.good).toBe(0);
  });

  it('无结果（hasResult=false）即使好拍满也不进 live', () => {
    let s = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 30; i++) s = liveGateStep(s.live, s.good, s.bad, 5, false);
    expect(s.live).toBe(false);
    expect(s.good).toBeGreaterThanOrEqual(8);
  });

  it('连续 8 拍健康且已有结果 → 进 live', () => {
    let s = { live: false, good: 0, bad: 0, fell: false };
    for (let i = 0; i < 7; i++) s = liveGateStep(s.live, s.good, s.bad, 5, true);
    expect(s.live).toBe(false);           // 7 拍不够
    s = liveGateStep(s.live, s.good, s.bad, 5, true);
    expect(s.live).toBe(true);            // 第 8 拍进入
    expect(s.fell).toBe(false);
  });

  it('live 态坏拍打断好拍连续性（好拍清零重计）', () => {
    let s = { live: false, good: 7, bad: 0, fell: false };
    s = liveGateStep(s.live, s.good, s.bad, 100, true);   // 一个坏拍
    expect(s.good).toBe(0);
    expect(s.bad).toBe(1);
    expect(s.live).toBe(false);
  });

  it('live 态连续 2 拍超阈 → 回退 warmup（fell=true,计数清零）', () => {
    let s = { live: true, good: 0, bad: 0, fell: false };
    s = liveGateStep(s.live, s.good, s.bad, 50, true);
    expect(s.live).toBe(true);            // 1 拍超阈不退（滞回）
    s = liveGateStep(s.live, s.good, s.bad, 50, true);
    expect(s.live).toBe(false);
    expect(s.fell).toBe(true);
    expect(s.good).toBe(0);
    expect(s.bad).toBe(0);
  });

  it('回退后好拍重满 8 拍可再进 live（往复治理）', () => {
    let s = { live: true, good: 0, bad: 2, fell: true };
    s = liveGateStep(s.live, s.good, s.bad, 50, true);    // 保持坏
    expect(s.live).toBe(false);
    for (let i = 0; i < 8; i++) s = liveGateStep(s.live, s.good, s.bad, 4, true);
    expect(s.live).toBe(true);
  });
});
