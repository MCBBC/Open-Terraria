// 303 火箭尾烟回归（2026-09-01 用户报"尾烟只有烟没有火"）：
// AI_016_Bombs :48181-48233 1:1——|v|≥8 每拍 2 组:尘 6 烟(scale×(2+r10×0.1)、
// vel×0.2、noGravity)+ 尘 31 火(scale 0.5、fadeIn 1+r5×0.1、vel×0.05);
// 空中加速 |vx|<15 且 |vy|<15 → ×1.1。桩 GameHooks + 真 VanillaDust 池,无 DOM。
import { describe, it, expect } from 'vitest';
import { Dart } from '../src/entities/Dart';
import { VanillaDust } from '../src/fx/VanillaDust';
import { TILE } from '../src/core/constants';

function makeGame() {
  const vd = new VanillaDust();
  const w = 64, h = 64;
  const store = {
    w, h,
    type: new Uint16Array(w * h), flags: new Uint8Array(w * h), wall: new Uint16Array(w * h),
    liquid: new Uint8Array(w * h),
    idx: (x: number, y: number) => y * w + x,
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    isSolid: () => false,
    get: () => 0,
  };
  const game = {
    world: { store, w, h, groundLevel: 40 },
    player: { dead: false, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 20, h: 42 },
    vanillaDust: vd,
    spawnDust: (x: number, y: number, ww: number, hh: number, type: number, sx = 0, sy = 0,
      alpha = 0, color = null, scale = 1) => vd.spawn(x, y, ww, hh, type, sx, sy, alpha, color, scale),
    playSfxFiles: () => {},
    spawnParticles: () => {},
  };
  return { game, vd };
}

describe('303 火箭尾烟（AI_016_Bombs :48181-48233）', () => {
  it('速度门(|v|≥8)内每拍发烟 6 + 火 31;烟 scale×2+、noGravity;火 fadeIn 1-1.4、scale~0.5', () => {
    const { game, vd } = makeGame();
    const d = new Dart(32 * TILE, 20 * TILE, 12, 0, 60, 303);
    for (let i = 0; i < 8; i++) d.fixedUpdate(1 / 60, game as never);
    let smoke = 0, flame = 0, smokeScale = 0, flameFade = 0, noGrav = 0, flameScale = 9;
    for (const dd of vd.pool) {
      if (!dd.active) continue;
      if (dd.type === 6) { smoke++; smokeScale = Math.max(smokeScale, dd.scale); if (dd.noGravity) noGrav++; }
      if (dd.type === 31) { flame++; flameFade = Math.max(flameFade, dd.fadeIn); flameScale = Math.min(flameScale, dd.scale); }
    }
    expect(smoke).toBeGreaterThanOrEqual(8);
    expect(flame).toBeGreaterThanOrEqual(8);
    // NewDust 抖动 0.8..1.2 × (2+r10×0.1) → 下限 1.6;>1.5 即证明 ×2+ 乘区生效
    expect(smokeScale).toBeGreaterThan(1.5);
    expect(noGrav).toBe(smoke);
    expect(flameFade).toBeGreaterThanOrEqual(1);
    expect(flameFade).toBeLessThanOrEqual(1.5);
    expect(flameScale).toBeGreaterThan(0.3);
    expect(flameScale).toBeLessThan(0.8);
  });

  it('空中加速 |vx|<15 → ×1.1/拍(:48230-48233);原版无重力(表 grav 已除)', () => {
    const { game } = makeGame();
    const d = new Dart(32 * TILE, 20 * TILE, 5, 0, 60, 303);
    const v0 = d.vx;
    d.fixedUpdate(1 / 60, game as never);
    expect(d.vx).toBeCloseTo(v0 * 1.1, 5);
    expect(d.vy).toBe(0);                       // 无重力直飞
  });
});
