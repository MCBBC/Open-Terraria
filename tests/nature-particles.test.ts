// 自然粒子：滴水溅落音钩子（Gore.cs :967-984 语义——落地/入水两路径、flag4 静音）
import { describe, it, expect } from 'vitest';
import { NatureParticles } from '../src/render/NatureParticles';
import type { TileStore } from '../src/world/TileStore';

/** 最小 TileStore 形状（updateDrips/boxCollide 用到 isSolid/inBounds/idx/flags/liquid） */
function fakeStore(groundRow = 10, w = 8, h = 24) {
  const solid = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) solid[groundRow * w + x] = 1;
  return {
    w, h,
    flags: new Uint8Array(w * h).fill(1),
    liquid: new Uint8Array(w * h),
    liquidType: new Uint8Array(w * h),
    inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
    idx: (x: number, y: number) => y * w + x,
    isSolid: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x],
  } as unknown as TileStore;
}

describe('滴水溅落音（Gore.cs :968-984）', () => {
  it('下落滴碰地 → 触发干溅落音（位置 +8，wet=false）并转溅落帧', () => {
    const np = new NatureParticles();
    np.bindStore(fakeStore());
    let fired: { x: number; y: number; wet: boolean } | null = null;
    np.onDripSplash = (x, y, wet) => { fired = { x, y, wet }; };
    np.drips.push({ x: 32, y: 100, vy: 0, type: 706, frame: 9, frameCounter: 0, alpha: 0, dead: false });
    for (let i = 0; i < 60 && !fired; i++) np.updateDrips(0);
    expect(fired).not.toBeNull();
    expect(fired!.wet).toBe(false);
    expect(fired!.x).toBe(40); // +8
    expect(fired!.y).toBeGreaterThanOrEqual(100); // 已下落
  });

  it('flag4 水型（716 蜂蜜/717/943/1160-62）溅落不发声', () => {
    for (const t of [716, 717, 943, 1160, 1161, 1162]) {
      const np = new NatureParticles();
      np.bindStore(fakeStore());
      let fired = false;
      np.onDripSplash = () => { fired = true; };
      np.drips.push({ x: 32, y: 100, vy: 0, type: t, frame: 9, frameCounter: 0, alpha: 0, dead: false });
      for (let i = 0; i < 60; i++) np.updateDrips(0);
      expect(fired, `type ${t} 不应发声`).toBe(false);
      // 粒子本身仍正常转溅落帧（溅落完成被过滤移除 = drips 清空）
      expect(np.drips.length === 0 || np.drips.some((d) => d.frame >= 10 || d.dead)).toBe(true);
    }
  });

  it('入水路径（wet=true）触发对应 variant 语义——由 Game 钩子映射 Drip_2，此处验证 wet 标志', () => {
    // 液面格 + 液体：滴落入水 → wet=true
    const w = 8, h = 24, groundRow = 10;
    const solid = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { solid[groundRow * w + x] = 1; }
    const liquid = new Uint8Array(w * h);
    const liquidType = new Uint8Array(w * h);
    for (let x = 0; x < w; x++) { liquid[(groundRow - 1) * w + x] = 255; liquidType[(groundRow - 1) * w + x] = 1; }
    const st = {
      w, h, flags: new Uint8Array(w * h).fill(1), liquid, liquidType,
      inBounds: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h,
      idx: (x: number, y: number) => y * w + x,
      isSolid: (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!solid[y * w + x],
    } as unknown as TileStore;
    const np = new NatureParticles();
    np.bindStore(st);
    let wet: boolean | null = null;
    np.onDripSplash = (_x, _y, w2) => { wet = w2; };
    np.drips.push({ x: 32, y: 100, vy: 0, type: 706, frame: 9, frameCounter: 0, alpha: 0, dead: false });
    for (let i = 0; i < 60 && wet === null; i++) np.updateDrips(0);
    expect(wet).toBe(true); // 入水先于触地 → WetCollision 分支
  });
});
