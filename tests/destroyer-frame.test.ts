// 毁灭者体节帧规则（2026-09-03 用户实报"每节亮灭来回切换"）：
// FindFrame case 135（NPC.cs:74229-74237）：ai[2]==0 → 亮帧 0 / 非 0 → 灭帧 1。
// ★1457 全文无体节 ai[2] 写入点（AI_037 仅 :50453 读取）→ 原版实际恒亮帧 0。
// 此前落 vanillaFrameIdx default 6t 全帧循环 → 亮/灭两帧间闪跳。
// 头 134 / 尾 136 frames=1（FindFrame 无 case，default 循环对单帧无害）。
import { describe, it, expect } from 'vitest';
import { vanillaFrameIdx } from '../src/render/Renderer';
import type { Enemy } from '../src/entities/Enemy';

function mk(id: number, ai2 = 0): Enemy {
  return {
    vanillaId: id,
    customFrameIdx: null,
    vanilla: { aiStyle: 37 },
    animT: 0,
    ai2,
    onGround: false,
    facing: 1,
    vx: 0,
    vy: 0,
    walkCycleT: 0,
  } as unknown as Enemy;
}

describe('毁灭者体节帧机（FindFrame case 135，NPC.cs:74229-74237）', () => {
  it('体节 135：ai[2]==0 恒亮帧 0——任意 animT 不进入灭帧（旧 6t 循环每 6t 闪灭帧）', () => {
    for (let t = 0; t < 120; t++) {
      const e = mk(135, 0);
      e.animT = t;
      expect(vanillaFrameIdx(e, 2)).toBe(0);
    }
  });

  it('体节 135：ai[2]!=0 → 灭帧 1（原版 FindFrame else 支，当前无人写入=预留）', () => {
    const e = mk(135, 1);
    expect(vanillaFrameIdx(e, 2)).toBe(1);
    const e2 = mk(135, 5);
    expect(vanillaFrameIdx(e2, 2)).toBe(1);
  });

  it('头 134 / 尾 136 frames=1：恒帧 0', () => {
    for (const id of [134, 136]) {
      for (let t = 0; t < 60; t += 7) {
        const e = mk(id, 0);
        e.animT = t;
        expect(vanillaFrameIdx(e, 1)).toBe(0);
      }
    }
  });
});
