// GAP-B·tile 227 染料植物族（2026-09-01 定谳不等价 → 实装专用路由 + 数据回填）。
// 原版链：Player.cs:40086 TryPlacing 显式把 227 从 TileObjectData 满分制排除
// (`CustomPlace(...) && !=82 && !=227 && !=4`) → AssortedThings :41403-41405 无条件
// canPlace=true → PlaceIt legacy 支 (:40451) → PlaceTile case227 (:60533-60536)
// → WorldGen.PlaceDye (:54451-54502) 逐 style 环境门，成功 `frameX=34*style`。
// 失败=静默无动作不消耗（result=false → ApplyItemTime 不跑）。
// 物品面 12 件：1107-1112(style0-5)/1114 血橙根(style7 吊顶)/3385-3388 异奇株(8-11)。
// 通用链曾有三处不等价：①3385-3388 placeStyle 缺失全落 style0；
// ②framedCellFrame default style*18 步长≠原版 34*style；③支撑/环境门语义不符。
import { describe, it, expect } from 'vitest';
import {
  DyePlantSpot, dyePlaceOk, DYE_PLANT_PLANT_FAMILY, DYE_PLANT_FRAME_STEP,
} from '../src/world/evolution/PlantRules';
import { ITEM_BY_KEY, ITEM_DEFS, VANILLA_ITEM_KEY_BY_ID } from '../src/data/items';
import { styleDropVidOfFrames, styleFromFrame } from '../src/data/vanillaStyleDrops';

/** 立地基础档构造器：下方实心泥土+上方空格+目标格干净 */
const spot = (over: Partial<DyePlantSpot>): DyePlantSpot => ({
  style: 0,
  aboveActive: false, aboveSheet: -1,
  aboveSolid: false,
  belowActive: true, belowSheet: 0,
  sideLeftActive: false, sideRightActive: false,
  belowSolid: true,
  selfLiquidFullWater: false,
  selfHasLiquid: false,
  selfWall: 0,
  ...over,
});

describe('dyePlaceOk（PlaceDye cs:54451-54502 门纯函数）', () => {
  it('常规立地档 style0/1/2：下实心+上空+液体 0 即可；背景墙【不】拦', () => {
    for (const s of [0, 1, 2]) {
      expect(dyePlaceOk(spot({ style: s })), `style ${s}`).toBe(true);
      expect(dyePlaceOk(spot({ style: s, selfWall: 57 })), `style ${s} with wall`).toBe(true);
      expect(dyePlaceOk(spot({ style: s, selfHasLiquid: true })), `style ${s} in liquid`).toBe(false);
    }
  });
  it('上方被非植物家具占住 → 拒（cs:54464-54468 上邻 active 非豁免族即 return）；植物族豁免但仍过 !aboveActive 组门', () => {
    expect(dyePlaceOk(spot({ aboveActive: true, aboveSheet: 105 }))).toBe(false);
    // 豁免族只是绕过早退，else-if 第二支 `&& !active(y-1)` 照样拦 ⇒ 净效果同拒
    expect(dyePlaceOk(spot({ aboveActive: true, aboveSheet: 3 }))).toBe(false);
    expect(DYE_PLANT_PLANT_FAMILY.has(3)).toBe(true);   // 豁免表含短草 3
  });
  it('地表档 style3/4（万寿菊/蓝浆果）：要求【无】背景墙（cs:54498-54507 wall==0 才 flag）', () => {
    expect(dyePlaceOk(spot({ style: 3 }))).toBe(true);
    expect(dyePlaceOk(spot({ style: 3, selfWall: 3 }))).toBe(false);
    expect(dyePlaceOk(spot({ style: 4, selfWall: 63 }))).toBe(false);
    expect(dyePlaceOk(spot({ style: 4, selfWall: 0 }))).toBe(true);
    // 地表档同样忌液体
    expect(dyePlaceOk(spot({ style: 4, selfHasLiquid: true }))).toBe(false);
  });
  it('水中档 style5（石灰海带）：仅满水且非岩浆/蜂蜜/微光；立地干放拒绝', () => {
    expect(dyePlaceOk(spot({ style: 5, selfLiquidFullWater: true }))).toBe(true);
    expect(dyePlaceOk(spot({ style: 5, selfLiquidFullWater: true, selfHasLiquid: true }))).toBe(true);
    expect(dyePlaceOk(spot({ style: 5 }))).toBe(false);   // 干放拒绝
    // 满水之外还须下方实心+上空（worldgen plantDye 的双格满水探测即喂这组前提）
    expect(dyePlaceOk(spot({ style: 5, selfLiquidFullWater: true, belowSolid: false }))).toBe(false);
  });
  it('异奇株 style8-11（Strange Plant）：立地即可，液/墙无视（cs:54493-54497 无分支直置）', () => {
    for (const s of [8, 9, 10, 11]) {
      expect(dyePlaceOk(spot({ style: s })), `style ${s} dry`).toBe(true);
      expect(dyePlaceOk(spot({ style: s, selfWall: 40, selfHasLiquid: true })), `style ${s} wet+walled`).toBe(true);
    }
  });
  it('吊顶档 style7（血橙根）：上邻 SolidTile 锚+下邻须空；下邻植物/家具皆拒', () => {
    expect(dyePlaceOk(spot({ style: 7, aboveSolid: true, belowActive: false, belowSheet: -1 }))).toBe(true);
    expect(dyePlaceOk(spot({ style: 7, aboveSolid: false, belowActive: false, belowSheet: -1 }))).toBe(false);   // 缺天花板
    expect(dyePlaceOk(spot({ style: 7, aboveSolid: true, belowActive: true, belowSheet: 80 }))).toBe(false);
    expect(dyePlaceOk(spot({ style: 7, aboveSolid: true, belowActive: true, belowSheet: 3 }))).toBe(false);
  });
  it('仙人掌寄生档 style6（世界生成专用,物品面无 6 档）：下邻须 nactive+80 且左右两行空', () => {
    expect(dyePlaceOk(spot({ style: 6, belowActive: false, belowSheet: 80 }))).toBe(false);   // 下邻未激活=拒
    // 原版 cs:54472 要求 nactive()：belowActive=true + sheet80 + 侧空
    expect(dyePlaceOk(spot({ style: 6, belowActive: true, belowSheet: 80 }))).toBe(true);
    expect(dyePlaceOk(spot({ style: 6, belowActive: true, belowSheet: 80, sideLeftActive: true }))).toBe(false);
    expect(dyePlaceOk(spot({ style: 6, belowActive: true, belowSheet: 60 }))).toBe(false);
  });
});

describe('帧步长与 CheckDye 反推一致性', () => {
  it('PlaceDye frameX=34*style；KillTile num=frameX/34、CheckDye band 同式', () => {
    expect(DYE_PLANT_FRAME_STEP).toBe(34);
  });
});

describe('物品面 12 件 placeStyle 终值（itemfunc 提取 + 回填表 2026-09-01 补齐）', () => {
  const CASES: ReadonlyArray<readonly [number, number]> = [
    [1107, 0], [1108, 1], [1109, 2], [1110, 3], [1111, 4], [1112, 5],
    [1114, 7],
    [3385, 8], [3386, 9], [3387, 10], [3388, 11],
  ];
  it('vid→def.placeStyle 逐件对表（3385-3388 曾全缺=放/掉全成 style0）', () => {
    for (const [vid, style] of CASES) {
      const key = VANILLA_ITEM_KEY_BY_ID[vid];
      const id = key !== undefined ? ITEM_BY_KEY[key] : -1;
      expect(id ?? -1, `item def exists for ${vid} via ${key}`).toBeGreaterThanOrEqual(0);
      expect(ITEM_DEFS[id]?.placeStyle ?? 0, `placeStyle of ${vid} (${key})`).toBe(style);
    }
  });
  it('createTile 面 == 12 件全覆盖（vanilla.json 实查面,GAP-B 登记漏了 1114 血橙根）', () => {
    expect(CASES.map(([v]) => v)).toEqual(
      expect.arrayContaining([1107, 1108, 1109, 1110, 1111, 1112, 1114, 3385, 3386, 3387, 3388]),
    );
  });
});

describe('破坏/失撑掉落（GetItemDrop case 227 cs:65563-65568：num=frameX/34,8-11 覆写 3385+n-8）', () => {
  it('按帧带直查：0-5 掉原物、6/7 两生成期档掉占位物 1113/1114（照抄算式产物）、8-11 掉异奇株', () => {
    const want: ReadonlyArray<readonly [number, number]> = [
      [0, 1107], [1, 1108], [2, 1109], [3, 1110], [4, 1111], [5, 1112],
      [6, 1113], [7, 1114], [8, 3385], [9, 3386], [10, 3387], [11, 3388],
    ];
    for (const [band, vid] of want) {
      expect(styleDropVidOfFrames(227, band * 34, 0), `band ${band}`).toBe(vid);
    }
    expect(styleFromFrame[227]).toBeDefined();
  });
});
