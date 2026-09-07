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

// ============ 2026-09-07 光照批两修边（TileLightScanner.ts 域） ============
// ① 传送器 235 零 tile 光：原版 case 235（TileLightScanner.cs:1021-1029 光地板
//    X/Y<0.6 抬底）整段在 ApplyTileLight `if (Main.tileLighted[tile.type])`（:350）
//    门内,Main.cs 全树零处 tileLighted[235] 赋值 ⇒ 死分支——本仓曾发 [0.6,0.6,0]=债,
//    已撤（对照 238 世纪之花球茎:tileLighted[238]=true（Main.cs:10384）真活分支保留）。
// ② 涂装门 1:1（:2510-2511 case 22/140、:2578-2580 case 204/347、:2962-2967 case 739
//    flag + 尾段 :3131-3141）：PaintID 26=White/27=Gray（PaintID.cs:57-59,非黑漆 25）。
describe('涂装门 + 传送器死分支（2026-09-07 对账清偿）', () => {
  const flicker = new FlickerClock();

  /** 放 sheet tile（可带漆）后扫描取该格种子光（exportTo 直读,不经 Blur） */
  const glowAt = (key: string, paint = 0): [number, number, number] => {
    const st = new TileStore(3, 3);
    st.setTile(1, 1, TILE_BY_KEY[key]!);
    if (paint !== 0) st.setPaintSilent(1, 1, paint);
    const world: ScannerWorld = {
      store: st,
      groundLevel: -1, lavaLine: st.h + 1,
      get clock() { return { timeOfDay: 0.5, dayCount: 1 } as never; },
    };
    const map = new LightMap();
    map.setSize(3, 3);
    new TileLightScanner(flicker).exportTo(world, map, 0, 0, []);
    const i = 1 * 3 + 1;
    return [map.r[i], map.g[i], map.b[i]];
  };

  it('传送器 235：零 tile 光（死分支撤除）,238 世纪之花球茎保留光地板', () => {
    expect(specialTileLight(235, 0, 0, flicker)).toBeNull();
    // 238 活分支：光地板 X/Z 抬 0.5 ≙ max-merge (0.5,0,0.5)
    expect(specialTileLight(238, 0, 0, flicker)).toEqual([0.5, 0, 0.5]);
    const [r, g, b] = glowAt('v_235_teleporter');
    expect(r).toBe(0); expect(g).toBe(0); expect(b).toBe(0);
  });

  it('魔矿 22：无漆 R=0.12；白(26)/灰(27)漆 R 置零 G/B 照常；黑(25)漆门不动', () => {
    const base = glowAt('ore_demonite');
    expect(base[0]).toBeCloseTo(31 / 255, 5);
    expect(base[1]).toBeCloseTo(18 / 255, 5);
    expect(base[2]).toBeCloseTo(82 / 255, 5);
    const white = glowAt('ore_demonite', 26);
    expect(white[0]).toBe(0);                                  // R 置零支
    expect(white[1]).toBeCloseTo(18 / 255, 5);                 // G 照常（:2513 在门外）
    expect(white[2]).toBeCloseTo(82 / 255, 5);                 // B 照常
    const gray = glowAt('ore_demonite', 27);
    expect(gray).toEqual(white);
    const black = glowAt('ore_demonite', 25);                  // 黑漆不在门内
    expect(black).toEqual(base);
  });

  it('魔矿砖 140 同门；猩红矿 204/347 白/灰漆整支归零（G/B 本为零）', () => {
    const whiteBrick = glowAt('v_140_demonite_brick', 26);
    expect(whiteBrick[0]).toBe(0);
    expect(whiteBrick[1]).toBeCloseTo(18 / 255, 5);
    expect(whiteBrick[2]).toBeCloseTo(82 / 255, 5);
    const baseCrim = glowAt('ore_crimtane');
    expect(baseCrim[0]).toBeCloseTo(89 / 255, 5);
    const whiteCrim = glowAt('ore_crimtane', 26);
    expect(whiteCrim).toEqual([0, 0, 0]);                      // 只抬 R → 归零不发光
    const whiteBrick2 = glowAt('v_347_crimtane_brick', 27);
    expect(whiteBrick2).toEqual([0, 0, 0]);
  });

  it('水母块 739：flag=true 涂装覆写支——无漆 (0.35,0.63,0.7),有漆整支覆写 paintColor/255', () => {
    const base = glowAt('v_739_jellyfish_block');
    expect(base[0]).toBeCloseTo(89 / 255, 5);
    expect(base[1]).toBeCloseTo(161 / 255, 5);
    expect(base[2]).toBeCloseTo(179 / 255, 5);
    const yellow = glowAt('v_739_jellyfish_block', 3);         // 黄漆 paintColor(3)=(255,255,0)
    expect(yellow).toEqual([1, 1, 0]);
    const black = glowAt('v_739_jellyfish_block', 25);         // 黑漆 (75,75,75)≈压暗（Float32 精度 → closeTo）
    expect(black[0]).toBeCloseTo(75 / 255, 6);
    expect(black[1]).toBeCloseTo(75 / 255, 6);
    expect(black[2]).toBeCloseTo(75 / 255, 6);
    const white = glowAt('v_739_jellyfish_block', 26);         // 白漆 (255,255,255)
    expect(white).toEqual([1, 1, 1]);
  });
});
