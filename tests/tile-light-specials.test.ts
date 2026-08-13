import { describe, it, expect } from 'vitest';
import { specialTileLight, TileLightScanner, type ScannerWorld } from '../src/lighting/TileLightScanner';
import { FlickerClock } from '../src/lighting/SkyColor';
import { LightMap } from '../src/lighting/LightMap';
import { TileStore } from '../src/world/TileStore';
import { TILE_BY_KEY } from '../src/data/tiles';

// 动态发光特例（原版 ApplyTileLight 帧条件/动态色 case 1:1）
describe('tile 动态发光特例（specialTileLight）', () => {
  const f = new FlickerClock();

  it('迪斯科球 126：frameX<36 发光，≥36 不发', () => {
    expect(specialTileLight(126, 0, 0, f)).not.toBeNull();
    expect(specialTileLight(126, 36, 0, f)).toBeNull();
    const [r, g, b] = specialTileLight(126, 0, 0, f)!;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('导线灯泡 429：按 frameX/18 位段叠加线色', () => {
    // n=0 无线 → 全 0；n=1 红；n=2 绿；n=4 蓝；n=8 致动器 R+G 各 +0.2
    expect(specialTileLight(429, 0, 0, f)).toEqual([0, 0, 0]);
    expect(specialTileLight(429, 18, 0, f)).toEqual([0.5, 0, 0]);
    expect(specialTileLight(429, 36, 0, f)).toEqual([0, 0.5, 0]);
    expect(specialTileLight(429, 72, 0, f)).toEqual([0, 0, 0.5]);
    expect(specialTileLight(429, 144, 0, f)).toEqual([0.2, 0.2, 0]);
  });

  it('传送门炮 209：仅传送门帧发光（PortalHelper.GetPortalColor 单人档：portal0=橙/portal1=青）', () => {
    expect(specialTileLight(209, 0, 0, f)).toBeNull();
    // hslToRgb(0.12,1,0.5)=(1,0.72,0) ×0.65 → R 主导（PortalHelper.cs:387）
    expect(specialTileLight(209, 234, 0, f)![0]).toBeGreaterThan(0.5); // 橙 portal0
    expect(specialTileLight(209, 252, 0, f)![0]).toBeGreaterThan(0.5);
    // hslToRgb(0.52,1,0.6)=(0.2,0.9,1) ×0.65 → B 主导
    expect(specialTileLight(209, 306, 0, f)![2]).toBeGreaterThan(0.5); // 青 portal1
    expect(specialTileLight(209, 324, 0, f)![2]).toBeGreaterThan(0.5);
  });

  it('开花药草 84：style 2/5/6 三色，其余不发光', () => {
    expect(specialTileLight(84, 0, 0, f)).toBeNull();           // style 0（昼花等）
    expect(specialTileLight(84, 18 * 5, 0, f)).toEqual([0.9, 0.72, 0.18]); // style5 火焰草
    const s6 = specialTileLight(84, 18 * 6, 0, f)!;
    expect(s6[2]).toBeCloseTo(0.08, 5);                          // style6 颤骨草淡蓝
    const s2 = specialTileLight(84, 18 * 2, 0, f)!;              // style2 死亡草随闪烁
    expect(s2[0]).toBeGreaterThan(0);
  });
});

// 蘑菇组发光（TileLightScanner.cs:2938-2960 case 70/71/72/190/348/349/528/578）：
// R=0、B=1、G=0.2+num11/2（只抬 G，num11∈[0.14,0.21]+(270-mouseTextColor)/1000）
describe('蘑菇组发光（exportTo 种子光）', () => {
  const flicker = new FlickerClock();

  /** 在 (x,y) 放一个 sheet 的 tile，扫描后取该格种子色（不经 Blur） */
  const glowAt = (key: string, frameX = 0): [number, number, number] => {
    const st = new TileStore(3, 3);
    const id = TILE_BY_KEY[key]!;
    st.setTile(1, 1, id);
    st.frameX[st.idx(1, 1)] = frameX;
    const world: ScannerWorld = {
      store: st,
      groundLevel: -1, lavaLine: st.h + 1,   // 不触发天空/地狱光
      get clock() { return { timeOfDay: 0.5, dayCount: 1 } as never; },
    };
    const map = new LightMap();
    map.setSize(3, 3);
    new TileLightScanner(flicker).exportTo(world, map, 0, 0, []);
    const i = 1 * 3 + 1;
    return [map.r[i], map.g[i], map.b[i]];
  };

  for (const key of [
    'v_70_mushroom_grass_block', 'v_71_mushroom_plant', 'v_72_mushroom_tree',
    'v_190_glowing_mushroom_block', 'v_348_shroomite_plating',
    'v_528_mushroom_vines', 'v_578_mushroom_beam',
  ]) {
    it(`${key}：R=0、B=1、G∈[0.2,0.45] 呼吸蓝光`, () => {
      const [r, g, b] = glowAt(key);
      expect(r).toBe(0);
      expect(b).toBe(1);
      // G = 0.2 + num11/2，num11 ≥ 0.14 → G ≥ 0.27；上界留余量（mouseTextColor 项）
      expect(g).toBeGreaterThanOrEqual(0.27);
      expect(g).toBeLessThanOrEqual(0.45);
    });
  }

  it('蘑菇雕像 349：frameX<36（style 0）不发光，≥36 发光', () => {
    const off = glowAt('v_349_mushroom_statue', 0);
    expect(off).toEqual([0, 0, 0]);
    const on = glowAt('v_349_mushroom_statue', 36);
    expect(on[2]).toBe(1);
    expect(on[1]).toBeGreaterThanOrEqual(0.27);
  });
});
