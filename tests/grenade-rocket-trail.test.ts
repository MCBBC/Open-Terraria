// 玩家火箭发射器（GrenadeProj fired 支,弹 134）尾烟回归（2026-09-01 用户报
// "尾烟只有烟没有火"）:AI_016 :48183-48234——|v|≥8 每 update 2×尘 num13(6 烟)
// + 2×尘 31 火(scale 0.5、fadeIn 1+r5×0.1、v×0.05)。桩 GameHooks+真 VanillaDust。
import { describe, it, expect } from 'vitest';
import { GrenadeProj } from '../src/entities/WeaponProj';
import { VanillaDust } from '../src/fx/VanillaDust';
import { TILE } from '../src/core/constants';

describe('GrenadeProj 134 火箭尾烟', () => {
  it('每 update 双发:尘 6 烟(noGravity、scale×2+)与尘 31 火(fadeIn 1-1.4、scale~0.5)并存', () => {
    const vd = new VanillaDust();
    const w = 64, h = 64;
    const game = {
      world: {
        store: {
          w, h,
          type: new Uint16Array(w * h), flags: new Uint8Array(w * h),
          wall: new Uint16Array(w * h), liquid: new Uint8Array(w * h),
          slope: new Uint8Array(w * h), half: new Uint8Array(w * h),
          idx: (x: number, y: number) => y * w + x,
          inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
          isSolid: () => false,
        },
      },
      vanillaDust: vd,
      spawnDust: (x: number, y: number, ww: number, hh: number, type: number, sx = 0, sy = 0,
        alpha = 0, color = null, scale = 1) => vd.spawn(x, y, ww, hh, type, sx, sy, alpha, color, scale),
      spawnParticles: () => {},
      enemies: () => [],
      cutTile: () => {},
      breakTile: () => {},
      playSfxFiles: () => {},
      player: { dead: false, cx: -9999, cy: -9999, x: -9999, y: -9999, w: 20, h: 42 },
    };
    const r = new GrenadeProj(32 * TILE, 20 * TILE, 12, 0, 60, 3600, 134, () => {});
    r.fired = true;
    for (let i = 0; i < 8; i++) r.fixedUpdate(1 / 60, game as never);
    const pool = (vd as unknown as { pool: Array<{ active: boolean; type: number; scale: number; fadeIn: number; noGravity: boolean }> }).pool;
    let smoke = 0, flame = 0, flameFade = 0, smokeScale = 0, flameScale = 9, noGrav = 0;
    for (const dd of pool) {
      if (!dd.active) continue;
      if (dd.type === 6) { smoke++; smokeScale = Math.max(smokeScale, dd.scale); if (dd.noGravity) noGrav++; }
      if (dd.type === 31) { flame++; flameFade = Math.max(flameFade, dd.fadeIn); flameScale = Math.min(flameScale, dd.scale); }
    }
    expect(smoke).toBeGreaterThanOrEqual(8);
    expect(flame).toBeGreaterThanOrEqual(8);          // ★火尘必须与烟并存（用户报缺失项）
    expect(smokeScale).toBeGreaterThan(1.5);          // ×2+ 乘区生效（抖动下限 0.8×2）
    expect(noGrav).toBe(smoke);
    expect(flameFade).toBeGreaterThanOrEqual(1);
    expect(flameFade).toBeLessThanOrEqual(1.5);
    expect(flameScale).toBeGreaterThan(0.3);          // NewDust 抖动×0.5 → 0.4..0.6
    expect(flameScale).toBeLessThan(0.8);
  });
});
