// 动画陈设帧表（原版 Main.AnimateTiles L18366-19155 / TileDrawing addFrY 语义）：
// - 帧数从素材行数推导：制冰机 306 = 648/18/3 = 12 帧；Living Loom 304 单帧恒 0
// - 每帧推进 tick 数与原版一致（306/300 等 = 5 tick，篝火 215 = 4，熔炉 17 = 6）
import { describe, it, expect } from 'vitest';
import { TILE_ANIM_RATE, tileAnim, animFrameIdx } from '../src/render/TileAnim';

describe('动画陈设帧表（AnimateTiles）', () => {
  it('制冰机 306：12 帧，每 5 tick 推进，循环回卷', () => {
    tileAnim.tick = 0;
    expect(animFrameIdx(306, 3, 36)).toBe(0);
    tileAnim.tick = 4;
    expect(animFrameIdx(306, 3, 36)).toBe(0);
    tileAnim.tick = 5;
    expect(animFrameIdx(306, 3, 36)).toBe(1);
    tileAnim.tick = 35;
    expect(animFrameIdx(306, 3, 36)).toBe(7);
    tileAnim.tick = 60;
    expect(animFrameIdx(306, 3, 36)).toBe(0); // 12 帧回卷
  });

  it('Living Loom 304 无动画（原版 AnimateTiles 无此条目，素材单帧）', () => {
    tileAnim.tick = 12345;
    expect(TILE_ANIM_RATE[304]).toBeUndefined();
    expect(animFrameIdx(304, 3, 3)).toBe(0);
  });

  it('rate 归一化：熔炉 17=6tick/篝火 215=4tick/固化机 220=5tick', () => {
    expect(TILE_ANIM_RATE[17]).toBe(6);
    expect(TILE_ANIM_RATE[215]).toBe(4);
    expect(TILE_ANIM_RATE[220]).toBe(5);
    expect(TILE_ANIM_RATE[247]).toBe(5); // 自动锻造机
  });

  it('单帧素材（rows/fh ≤ 1）恒 0，不越界', () => {
    tileAnim.tick = 999;
    expect(animFrameIdx(306, 3, 3)).toBe(0);
  });
});
