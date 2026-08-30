// 动画陈设帧表（原版 Main.AnimateTiles L18366-19155 / TileDrawing.GetTileDrawData addFrY 语义）：
// - pitch 两组（TileDrawing 实证）：默认 38（熔炉/篝火/磨刀站——2 格高帧带 2px 额外间距），
//   特例组 54（3 格高：锯木机/固化机/自动锻造机/300-308/354/355/499）
// - 帧数从素材像素高推导：frames = floor(height / pitch)，与 AnimateTiles 回卷上限互证
import { describe, it, expect } from 'vitest';
import { TILE_ANIM_RATE, TILE_ANIM_FRAMES, tileAnim, animFrameIdx, animYOffset } from '../src/render/TileAnim';

describe('动画陈设帧表（AnimateTiles + GetTileDrawData pitch）', () => {
  it('熔炉 17：pitch 38（默认），12 帧 = 456/38，每 6 tick 推进', () => {
    tileAnim.tick = 0;
    expect(animFrameIdx(17, 456)).toBe(0);
    tileAnim.tick = 5;
    expect(animFrameIdx(17, 456)).toBe(0);
    tileAnim.tick = 6;
    expect(animFrameIdx(17, 456)).toBe(1);
    tileAnim.tick = 72;
    expect(animFrameIdx(17, 456)).toBe(0); // 12 帧回卷
    expect(animYOffset(17, 456)).toBe(0);
    tileAnim.tick = 66; // 第 11 帧
    expect(animYOffset(17, 456)).toBe(11 * 38);
  });

  it('磨刀站 377：pitch 38，4 帧 = 152/38（此前 36 近似致错位）', () => {
    tileAnim.tick = 15;
    expect(animFrameIdx(377, 152)).toBe(3);
    expect(animYOffset(377, 152)).toBe(3 * 38);
  });

  it('篝火 215：pitch 38 默认，8 帧 = 324/38，每 4 tick', () => {
    tileAnim.tick = 4;
    expect(animFrameIdx(215, 324)).toBe(1);
    tileAnim.tick = 32;
    expect(animFrameIdx(215, 324)).toBe(0); // 8 帧回卷
  });

  it('制冰机 306：pitch 54 特例组，12 帧 = 648/54，每 5 tick', () => {
    tileAnim.tick = 5;
    expect(animFrameIdx(306, 648)).toBe(1);
    expect(animYOffset(306, 648)).toBe(54);
    tileAnim.tick = 60;
    expect(animFrameIdx(306, 648)).toBe(0);
  });

  it('锯木机 106：pitch 54 特例组，2 帧 = 108/54', () => {
    tileAnim.tick = 5;
    expect(animFrameIdx(106, 108)).toBe(1);
    tileAnim.tick = 10;
    expect(animFrameIdx(106, 108)).toBe(0);
  });

  it('Living Loom 304 无动画（原版 AnimateTiles 无此条目，素材单帧）', () => {
    tileAnim.tick = 12345;
    expect(TILE_ANIM_RATE[304]).toBeUndefined();
    expect(animFrameIdx(304, 54)).toBe(0);
  });

  it('帧号只由 AnimateTiles 权威表驱动（2026-08-30 契约更新）：传入残缺高度也回全局周期，不再随调用参数缩水', () => {
    // 曾以 floor(height/pitch) 推帧数——上一轮审计把风格带总数当帧数写入表后
    // 该回退掩盖不了越界采样（vframeAt 落空→整物平铺第一格）。现显式表值
    // （Main.cs 权威）恒胜出：传错高度不会造出"局部单帧"假象。
    tileAnim.tick = 999;
    expect(animFrameIdx(306, 54)).toBe(animFrameIdx(306, 648));   // 同钟同相
    expect(TILE_ANIM_FRAMES[306]).toBe(12);                        // 制冰机权威 12 帧
    expect(animFrameIdx(106, 108)).toBeLessThan(2);                // 锯木机恒 0..1
    expect(animFrameIdx(220, 216)).toBeLessThan(4);                // 固化机恒 0..3
  });
});
