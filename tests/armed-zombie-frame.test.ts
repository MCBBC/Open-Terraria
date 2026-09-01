// 武装僵尸族帧规则（2026-09-01 用户实报"边走边播僵尸臂挥砍"）：
// FindFrame case 430-436/591（NPC.cs:71651-71716）与 case 494/495（:70437-70518）
// 此前落 vanillaFrameIdx default 全帧循环 → 行走中扫到挥砍帧行 3-6（494/495 为 5-7）。
// 本测锁定：攻咬窗（ai[2]>0，lungeFamilyStep 计至 20t）才播挥砍行；非攻咬态 =
// 站立 0 / 腾空·后滑 = 2（494/495 跳升 2 下落 3）/ 行走 [0,1,2,1]@32px（[0..4]@39px）。
import { describe, it, expect } from 'vitest';
import { vanillaFrameIdx } from '../src/render/Renderer';
import type { Enemy } from '../src/entities/Enemy';

function mk(id: number): Enemy {
  return {
    vanillaId: id,
    customFrameIdx: null,
    vanilla: { aiStyle: 3 },
    animT: 0,
    ai2: 0,
    onGround: true,
    facing: 1,
    vx: 0,
    vy: 0,
    walkCycleT: 0,
  } as unknown as Enemy;
}

describe('武装僵尸族帧机（FindFrame case 430-436/591，NPC.cs:71651-71716）', () => {
  it('ai[2]>0 攻咬窗按窗龄切挥砍帧行 3/4/5/6（<5/<10/<15/else）', () => {
    for (const id of [430, 431, 432, 433, 434, 435, 436, 591]) {
      const e = mk(id);
      e.ai2 = 3;
      expect(vanillaFrameIdx(e, 7)).toBe(3);
      e.ai2 = 7;
      expect(vanillaFrameIdx(e, 7)).toBe(4);
      e.ai2 = 12;
      expect(vanillaFrameIdx(e, 7)).toBe(5);
      e.ai2 = 19;
      expect(vanillaFrameIdx(e, 7)).toBe(6);
      e.ai2 = 0;
    }
  });

  it('非攻咬态：站立=0；腾空=2；后滑(direction×vx 相逆)=2；行走 [0,1,2,1]@32px', () => {
    const e = mk(430);
    expect(vanillaFrameIdx(e, 7)).toBe(0);            // 站立
    e.vx = 0.9;
    const seq: Array<[number, number]> = [[0, 0], [7, 0], [8, 1], [15, 1], [16, 2], [23, 2], [24, 1],
      [31, 1], [32, 0]];
    for (const [c, want] of seq) { e.walkCycleT = c; expect(vanillaFrameIdx(e, 7)).toBe(want); }
    e.onGround = false;
    expect(vanillaFrameIdx(e, 7)).toBe(2);            // 腾空
    e.onGround = true;
    e.facing = -1;
    expect(vanillaFrameIdx(e, 7)).toBe(2);            // direction=-1 而 vx>0 后滑
  });
});

describe('Crawdad 494/495 帧机（FindFrame case 494/495，NPC.cs:70437-70518）', () => {
  it('ai[2]>0 按 <7/<14 切行 5/6/7', () => {
    const e = mk(494);
    e.ai2 = 6;
    expect(vanillaFrameIdx(e, 8)).toBe(5);
    e.ai2 = 13;
    expect(vanillaFrameIdx(e, 8)).toBe(6);
    e.ai2 = 19;
    expect(vanillaFrameIdx(e, 8)).toBe(7);
  });

  it('腾空跳升 2/下落 3；行走 [0..4]@39px（末档 32..38 显示 4 并回卷）', () => {
    const e = mk(495);
    e.vx = 1;
    e.vy = -1;
    e.onGround = false;
    expect(vanillaFrameIdx(e, 8)).toBe(2);            // vy<0 跳升行
    e.vy = 1;
    expect(vanillaFrameIdx(e, 8)).toBe(3);            // vy>=0 下落行
    e.onGround = true;
    e.vy = 0;
    const walk: Array<[number, number]> = [[0, 0], [7, 0], [8, 1], [15, 1], [16, 2], [23, 2],
      [24, 3], [31, 3], [32, 4], [38, 4], [39, 0]];
    for (const [c, want] of walk) { e.walkCycleT = c; expect(vanillaFrameIdx(e, 8)).toBe(want); }
  });
});
