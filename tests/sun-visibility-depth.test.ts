// 太阳遮挡采样深度门(HorizonHelper.cs:46-80 UpdateSunVisibility 等价):
//  屏顶低于地表线+16px(=天空层跳过门 Main.cs:61492 同条件)→ 上一帧渲染目标在
//  太阳屏位处=地下背景(不透明)→ 原版遮挡纹理 alpha 满 → sunVisibility=0
//  (用户实报"1050 英尺深仍见落日光晕"=地下遮挡恒 0 的近似域错)。
//  地表以上按太阳世界位 tile 采样(树冠遮阳语义保留)。
import { describe, it, expect } from 'vitest';
import { SkyRenderer } from '../src/render/SkyRenderer';
import { World } from '../src/world/World';
import { TILE_BY_KEY } from '../src/data/tiles';

const mk = (surfacePx: number, playerRow: number, sunScreenY: number) => {
  const r = Object.create(SkyRenderer.prototype) as unknown as {
    sunScreen: { x: number; y: number } | null;
    frameCtx: { world: World; z: number } | null;
    fx: { surfaceY: number };
    sunVisSampled: boolean;
    sunVisibility: number;
    sampleSunVisibility(camX: number, camY: number, z: number, viewW: number, viewH: number): void;
  };
  const w = new World(60, 1200, 1, 'sv');
  const dirt = TILE_BY_KEY['dirt'] ?? 1;
  // 采样域净空(行 290-303)+ 地板(行 304-310)——地表带上太阳世界位=空气 → 1;
  //  地下屏顶过门 → 0。地板供「锚未拆时贴地」对照与生成地形覆盖
  for (let x = 24; x <= 36; x++) {
    for (let y = 290; y <= 310; y++) w.store.setTileSilent(x, y, y >= 304 ? dirt : 0, 0, 0);
  }
  r.sunScreen = { x: 756, y: sunScreenY };
  r.frameCtx = { world: w, z: 1.25 };
  r.fx = { surfaceY: surfacePx };
  r.sunVisSampled = false;
  r.sunVisibility = 1;
  r.sampleSunVisibility(30 * 16, playerRow * 16 + 344, 1.25, 1512, 862);
  return { r, w };
};

describe('太阳遮挡采样深度门', () => {
  it('地下 1050 英尺(屏顶深于地表+16px)→ sunVisibility=0(光斑不显)', () => {
    const { r } = mk(4800, 860, -2000);            // 屏顶≈13759px ≫ 4816
    expect(r.sunVisibility).toBe(0);
    expect(r.sunVisSampled).toBe(true);
  });
  it('地表带上(屏顶高于地表+16px 门)→ 按太阳世界位 tile 采样', () => {
    // 玩家行 295:屏顶≈4719px < 4816 门过 → 采样域(行 296-303)全空气 → 1
    const { r, w } = mk(4800, 295, 100);
    let dump = '';
    for (let yy = 294; yy <= 306; yy++) { let row = '';
      for (let xx = 24; xx <= 36; xx++) row += w.store.isSolid(xx, yy) ? 'S' : (w.store.get(xx, yy) === 0 ? '.' : 'x');
      dump += `r${yy}:${row} `; }
    console.log('DBGSV vis=', r.sunVisibility, dump);
  });
});
