// 物品贴图动画(Main.InitializeItemAnimations :3685-3722)防回归:
// 坠星 75 等竖排多帧条必须切片,否则整条(22×208)入画。
import { describe, it, expect } from 'vitest';
import { ITEM_ANIMATION, itemAnimFrame } from '../src/assets/SpriteAtlas';

describe('物品贴图动画(Main.cs:3685-3722)', () => {
  it('坠星 75:8 帧 PingPong,每帧 5 tick', () => {
    const a = ITEM_ANIMATION[75];
    expect(a).toEqual({ dur: 5, n: 8, pingPong: true });
    // 序列 0..7..1..0(span=14)
    const seq = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1].map((_, i) => itemAnimFrame(75, i * 5));
    expect(seq).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1]);
    // 循环回绕
    expect(itemAnimFrame(75, 14 * 5)).toBe(0);
  });

  it('食物盘族 547-549/520/521/575:6t×4 帧循环;3453-3455 同', () => {
    for (const vid of [575, 547, 520, 548, 521, 549, 3453, 3454, 3455]) {
      expect(ITEM_ANIMATION[vid]).toEqual({ dur: 6, n: 4 });
    }
    expect(itemAnimFrame(547, 0)).toBe(0);
    expect(itemAnimFrame(547, 6)).toBe(1);
    expect(itemAnimFrame(547, 3 * 6)).toBe(3);
  });

  it('NotActuallyAnimating 族 4068-4070 恒帧 0', () => {
    for (const vid of [4068, 4069, 4070]) {
      expect(ITEM_ANIMATION[vid]?.static).toBe(true);
      expect(itemAnimFrame(vid, 999)).toBe(0);
    }
  });

  it('3580/3581 与水晶球 5644 在册', () => {
    expect(ITEM_ANIMATION[3580]).toEqual({ dur: 6, n: 4 });
    expect(ITEM_ANIMATION[3581]).toEqual({ dur: 4, n: 4 });
    expect(ITEM_ANIMATION[5644]).toEqual({ dur: 7, n: 9 });
  });

  it('无动画物品恒帧 0', () => {
    expect(itemAnimFrame(9, 999999)).toBe(0);  // 木头
    expect(itemAnimFrame(71, 999999)).toBe(0); // 铜币
  });
});
