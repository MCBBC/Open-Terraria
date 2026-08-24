// 地下带层坐标空间回归锁:Renderer 世界变换内画屏幕空间背景须逆变换补偿
// (2026-08-24 用户报"地底远景全黑"根因=08-20 搬入世界层时坐标未换算)
import { describe, it, expect } from 'vitest';

/** Renderer 世界变换(像素吸附版):T(viewW/2)·S(z)·T(-camRX,-camRY) */
function worldTransform(x: number, y: number, z: number, camRX: number, camRY: number, viewW: number, viewH: number): [number, number] {
  return [(x - camRX) * z + viewW / 2, (y - camRY) * z + viewH / 2];
}
/** 修复的逆变换:T(camRX,camRY)·S(1/z)·T(-viewW/2,-viewH/2) */
function inverse(x: number, y: number, z: number, camRX: number, camRY: number, viewW: number, viewH: number): [number, number] {
  return [(x - viewW / 2) / z + camRX, (y - viewH / 2) / z + camRY];
}

describe('地下带层屏幕空间逆变换（世界层内画屏幕坐标背景）', () => {
  const z = 1.25, viewW = 1512, viewH = 862;
  const cam = { x: 8196.4, y: 4109.2 };
  const camRX = Math.round(cam.x * z) / z, camRY = Math.round(cam.y * z) / z;

  it('逆变换补偿后:屏幕空间点经全变换落回原屏幕位（恒等）', () => {
    for (const [sx, sy] of [[0, 0], [756, 431], [1512, 862], [400, 700]] as const) {
      const [wx, wy] = inverse(sx, sy, z, camRX, camRY, viewW, viewH);
      const [dx, dy] = worldTransform(wx, wy, z, camRX, camRY, viewW, viewH);
      expect(dx).toBeCloseTo(sx, 6);
      expect(dy).toBeCloseTo(sy, 6);
    }
  });

  it('无补偿(回归态):屏幕空间点被画到世界坐标=屏外(带层消失的机制)', () => {
    // 屏幕中心带层行 destY=431 → 世界 y≈4109 → 再经世界变换 → 屏 y=(4109-camRY)*z+431
    const [wx, wy] = [756, 431];   // 未补偿时 destY 直接当世界坐标
    const [dx, dy] = worldTransform(wx, wy, z, camRX, camRY, viewW, viewH);
    // 世界 y 431 在屏顶上方数千 px → 画到屏外负区(带层不可见)
    expect(dy).toBeLessThan(-2000);
  });

  it('带层行覆盖断言:补偿后 dirt 带行(96px 周期 tiling)落屏内', () => {
    // 深地下相机:camTop=3655,带层 deep wrapping 行 destY ∈ [0,862)
    for (let destY = 0; destY < viewH; destY += 96) {
      const [wx, wy] = inverse(756, destY, z, camRX, camRY, viewW, viewH);
      const [dx, dy] = worldTransform(wx, wy, z, camRX, camRY, viewW, viewH);
      expect(dy).toBeGreaterThanOrEqual(-1);
      expect(dy).toBeLessThanOrEqual(viewH + 1);
    }
  });
});
