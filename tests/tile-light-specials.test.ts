import { describe, it, expect } from 'vitest';
import { specialTileLight } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';

// 动态发光特例（原版 ApplyTileLight 帧条件/动态色 case 1:1）
describe('tile 动态发光特例（specialTileLight）', () => {
  const f = new FlickerClock();

  it('迪斯科球 126：frameX<36 发光，≥36 不发', () => {
    expect(specialTileLight(126, 0, 0, f)).not.toBeNull();
    expect(specialTileLight(126, 36, 0, f)).toBeNull();
    const [r, g, b] = specialTileLight(126, 0, 0, f)!;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('导线灯泡 429：按 frameX/18 位段叠加线色', () => {
    // n=0 无线 → 全 0；n=1 红；n=2 绿；n=4 蓝；n=8 致动器 R+G 各 +0.2
    expect(specialTileLight(429, 0, 0, f)).toEqual([0, 0, 0]);
    expect(specialTileLight(429, 18, 0, f)).toEqual([0.5, 0, 0]);
    expect(specialTileLight(429, 36, 0, f)).toEqual([0, 0.5, 0]);
    expect(specialTileLight(429, 72, 0, f)).toEqual([0, 0, 0.5]);
    expect(specialTileLight(429, 144, 0, f)).toEqual([0.2, 0.2, 0]);
  });

  it('传送门炮 209：仅传送门帧发光', () => {
    expect(specialTileLight(209, 0, 0, f)).toBeNull();
    expect(specialTileLight(209, 234, 0, f)![2]).toBeGreaterThan(0.5); // 紫
    expect(specialTileLight(209, 306, 0, f)![0]).toBeGreaterThan(0.5); // 橙
  });

  it('开花药草 84：style 2/5/6 三色，其余不发光', () => {
    expect(specialTileLight(84, 0, 0, f)).toBeNull();           // style 0（昼花等）
    expect(specialTileLight(84, 18 * 5, 0, f)).toEqual([0.9, 0.72, 0.18]); // style5 火焰草
    const s6 = specialTileLight(84, 18 * 6, 0, f)!;
    expect(s6[2]).toBeCloseTo(0.08, 5);                          // style6 颤骨草淡蓝
    const s2 = specialTileLight(84, 18 * 2, 0, f)!;              // style2 死亡草随闪烁
    expect(s2[0]).toBeGreaterThan(0);
  });
});
