// 红队 RA 渲染域 findings 修复锁定（2026-09-04）：
//   F1 drawMultiVine 平台 pivot 谓词整谓词对齐——TileDrawing.cs:9430 三元 +
//      WorldGen.cs:38682-38693 IsBelowANonHammeredPlatform（active 门 / sizeX==1 支 /
//      465/591/592 双列支）+ multiVineSize 698→1×1（原版尺寸表 :9048-9050，原缺被
//      default 2×2 误吞）
//   F3 Minimap.fillBand 回声涂层双门与增量路径 colorFor 单源一致——两路逐格等值
//      （MapHelper.GetTileType invisibleBlock→baseType=0 / GetWallType !invisibleWall()）
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TileStore } from '../src/world/TileStore';
import { multiVinePlatformLift, _windSwayInternals } from '../src/render/WindSway';
import { Minimap } from '../src/render/Renderer';
import { T } from '../src/data/tiles';

const { multiVineSize } = _windSwayInternals;

// ============ F1：multiVineSize 尺寸表（TileDrawing.cs:9014-9052 全量） ============
describe('multiVineSize（DrawMultiTileVines 尺寸表 :9014-9052）', () => {
  it('全表 1:1（含 698=1×1，此前被 default 2×2 误吞）', () => {
    expect(multiVineSize(34)).toEqual({ sx: 3, sy: 3 });   // 吊灯
    expect(multiVineSize(454)).toEqual({ sx: 4, sy: 3 });
    expect(multiVineSize(91)).toEqual({ sx: 1, sy: 3 });
    expect(multiVineSize(42)).toEqual({ sx: 1, sy: 2 });
    expect(multiVineSize(270)).toEqual({ sx: 1, sy: 2 });
    expect(multiVineSize(660)).toEqual({ sx: 1, sy: 2 });
    expect(multiVineSize(95)).toEqual({ sx: 2, sy: 2 });
    expect(multiVineSize(126)).toEqual({ sx: 2, sy: 2 });
    expect(multiVineSize(444)).toEqual({ sx: 2, sy: 2 });
    expect(multiVineSize(465)).toEqual({ sx: 2, sy: 3 });
    expect(multiVineSize(591)).toEqual({ sx: 2, sy: 3 });
    expect(multiVineSize(592)).toEqual({ sx: 2, sy: 3 });
    expect(multiVineSize(698)).toEqual({ sx: 1, sy: 1 });  // ★修复点
  });
});

// ============ F1：平台 lift 谓词三元（TileDrawing.cs:9430 + WorldGen.cs:38682-38693） ============
describe('multiVinePlatformLift（平台下方吊挂 pivot 上移 8 的门）', () => {
  /** 上格(4,2)放平台、吊挂件锚在(4,3)；opts 构造上格/右邻(5,2)各态 */
  function storeWith(opts: {
    anchor?: 'active' | 'ghost' | 'half' | 'slope' | 'none';
    right?: 'none' | 'active' | 'ghost';
    actuated?: boolean;
  } = {}): TileStore {
    const st = new TileStore(16, 16);
    if (opts.anchor !== 'none') {
      st.setTileSilent(4, 2, T.PLATFORM);
      if (opts.anchor === 'ghost') st.flags[st.idx(4, 2)] = 0;      // active(false) 残型
      if (opts.anchor === 'half') st.half[st.idx(4, 2)] = 1;        // 被锤成半砖
      if (opts.anchor === 'slope') st.slope[st.idx(4, 2)] = 2;      // 被锤成坡
      if (opts.actuated) st.wire[st.idx(4, 2)] = TileStore.WIRE_ACTUATED;
    }
    if (opts.right === 'active') st.setTileSilent(5, 2, T.PLATFORM);
    if (opts.right === 'ghost') {
      st.setTileSilent(5, 2, T.PLATFORM);
      st.flags[st.idx(5, 2)] = 0;
    }
    return st;
  }

  it('1 宽件（91 灯笼/42/698）压平台 → 偏移', () => {
    expect(multiVinePlatformLift(storeWith(), 91, 1, 4, 3)).toBe(true);
    expect(multiVinePlatformLift(storeWith(), 42, 1, 4, 3)).toBe(true);
    expect(multiVinePlatformLift(storeWith(), 698, 1, 4, 3)).toBe(true);
  });

  it('幽灵平台残型（active 门，flags=0,type≠0）不偏移', () => {
    expect(multiVinePlatformLift(storeWith({ anchor: 'ghost' }), 91, 1, 4, 3)).toBe(false);
  });

  it('被锤平台（半砖/坡）不偏移；上格非平台/空也不偏移', () => {
    expect(multiVinePlatformLift(storeWith({ anchor: 'half' }), 91, 1, 4, 3)).toBe(false);
    expect(multiVinePlatformLift(storeWith({ anchor: 'slope' }), 91, 1, 4, 3)).toBe(false);
    expect(multiVinePlatformLift(storeWith({ anchor: 'none' }), 91, 1, 4, 3)).toBe(false);
  });

  it('y<1 门：y=0 时上格越界 → false', () => {
    const st = storeWith();
    st.setTileSilent(4, 0, T.PLATFORM); // 上格仍在界外(y=-1)
    expect(multiVinePlatformLift(st, 91, 1, 4, 0)).toBe(false);
  });

  it('2 宽以上摇摆件永不偏移（34 吊灯 3 宽/454 4 宽/95/126/444 2 宽）', () => {
    expect(multiVinePlatformLift(storeWith(), 34, 3, 4, 3)).toBe(false);
    expect(multiVinePlatformLift(storeWith(), 454, 4, 4, 3)).toBe(false);
    expect(multiVinePlatformLift(storeWith(), 95, 2, 4, 3)).toBe(false);
    expect(multiVinePlatformLift(storeWith(), 126, 2, 4, 3)).toBe(false);
    expect(multiVinePlatformLift(storeWith(), 444, 2, 4, 3)).toBe(false);
  });

  it('465/591/592 双列支：锚点列+右邻列都压平台才偏移；缺一/右列幽灵皆 false', () => {
    expect(multiVinePlatformLift(storeWith({ right: 'active' }), 465, 2, 4, 3)).toBe(true);
    expect(multiVinePlatformLift(storeWith({ right: 'active' }), 591, 2, 4, 3)).toBe(true);
    expect(multiVinePlatformLift(storeWith({ right: 'active' }), 592, 2, 4, 3)).toBe(true);
    expect(multiVinePlatformLift(storeWith(), 465, 2, 4, 3)).toBe(false);              // 右邻列空
    expect(multiVinePlatformLift(storeWith({ right: 'ghost' }), 465, 2, 4, 3)).toBe(false); // 右列幽灵
    expect(multiVinePlatformLift(storeWith({ anchor: 'ghost', right: 'active' }), 591, 2, 4, 3)).toBe(false);
  });

  it('双列支不吃 sizeX==1 支的亏：即便传 1 也按双列判', () => {
    expect(multiVinePlatformLift(storeWith({ right: 'active' }), 465, 1, 4, 3)).toBe(true);
    expect(multiVinePlatformLift(storeWith(), 465, 1, 4, 3)).toBe(false);
  });

  it('已致动平台仍算（原版 IsBelowANonHammeredPlatform 只查 active() 不排 inActive）', () => {
    expect(multiVinePlatformLift(storeWith({ actuated: true }), 91, 1, 4, 3)).toBe(true);
  });

  it('左世界边缘 x=0：旧实现被 ax>0 短路漏判，现按原版正常判', () => {
    const st = new TileStore(16, 16);
    st.setTileSilent(0, 2, T.PLATFORM);
    expect(multiVinePlatformLift(st, 91, 1, 0, 3)).toBe(true);
  });
});

// ============ F3：fillBand 回声涂层双门（与增量路径 colorFor 两路等值） ============
describe('fillBand 回声涂层双门（隐形涂层房间两路一致）', () => {
  function abgrHex(v: number): string {
    const r = v & 255, g = (v >>> 8) & 255, b = (v >>> 16) & 255;
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  it('隐形涂层块/墙不上小地图（fillBand）；显示门开时照画；逐格与 colorFor 等值', () => {
    const w = new World(48, 130, 7, 'ra-fixes');
    w.groundLevel = 40; w.rockLevel = 80;
    const st = w.store;
    const Y = 60;
    st.setTileSilent(6, Y, T.DIRT);                                   // 普通实体参照
    st.setTileSilent(8, Y, T.DIRT);
    st.setCoat(8, Y, TileStore.COAT_BLOCK_MASK, TileStore.COAT_INVISIBLE_BLOCK);   // 隐形块
    st.setWall(10, Y, 4);                                             // 普通墙参照
    st.setWall(12, Y, 4);
    st.setCoat(12, Y, TileStore.COAT_WALL_MASK, TileStore.COAT_INVISIBLE_WALL);    // 隐形墙
    st.setTileSilent(14, Y, T.DIRT);                                  // 隐形块+可见墙：落穿墙支
    st.setWall(14, Y, 4);
    st.setCoat(14, Y, TileStore.COAT_BLOCK_MASK, TileStore.COAT_INVISIBLE_BLOCK);
    // (16,Y) 纯背景参照

    const mm = new Minimap(w);          // 同步全量 = fillBand 热循环（showInvisibleBlocks=false）
    const p = mm.p32!;
    const px = (x: number, y: number) => p[st.idx(x, y)];
    expect(px(8, Y)).toBe(px(16, Y));   // 隐形块 → 背景（不上图）
    expect(px(12, Y)).toBe(px(16, Y));  // 隐形墙 → 背景
    expect(px(14, Y)).toBe(px(10, Y));  // 隐形块后的可见墙仍画（GetWallType 优先级）
    expect(px(6, Y)).not.toBe(px(16, Y)); // 无涂层实体照画

    st.showInvisibleBlocks = true;      // 回声腔/幽灵护目镜（Main.cs:58912-58917）
    mm.redrawAll();
    expect(px(8, Y)).toBe(px(6, Y));    // 显示态：隐形块现形 == 普通泥土
    expect(px(12, Y)).toBe(px(10, Y));  // 显示态：隐形墙现形 == 普通墙
    st.showInvisibleBlocks = false;
    mm.redrawAll();

    // 两路劈叉锁定：fillBand 全量像素 == colorFor 增量色（逐格，含涂层/普通/背景格）
    for (const x of [6, 8, 10, 12, 14, 16]) {
      expect(abgrHex(px(x, Y))).toBe(mm.colorFor(x, Y));
    }
  });
});
