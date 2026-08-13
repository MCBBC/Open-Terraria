// 小动物笼/缸放置链 + 锚桩 724（TECritterAnchor 等价）回归。
//
// 数据基准（反编译 1.4.5.6 = ../Terarria1456，TEdit items.json createTile 列交叉）：
//   ① 笼/缸物品 createTile 全量 92 条——Item.cs 三种写法（共享 case 段算式
//     :22078-22093/:39692-39706/:37046-37052、if 区间段 :24098-24108、单 case 直赋），
//     TEdit createTile 列 92/92 吻合；extract-itemfunc.mjs 只解出 5 条直赋，余 87 条
//     以 items.ts CAGE_ITEM_SHEET 表为权威。
//   ② 笼 tile 尺寸——TileObjectData.cs Style6x3（:2701）/StyleSmallCage（:2680 前后）/
//     Style2x2（:3658-3710 罐缸族），92 sheet 全核对（41 大笼 6×3 / 23 小笼 3×2 / 28 罐缸 2×2）。
//   ③ 锚桩 724——Item.DefaultToCapturedCritter（:47613-47626）93 件 createTile=724 +
//     makeNPC；TECritterAnchor（TileEntity）存物品 id，本仓以 FurnitureItems
//     'critter_anchor' 单槽记录近似（放置链 Game.ts tryPlace/breakTile 专用分支）。
import { describe, it, expect } from 'vitest';
import { ITEM_DEFS, ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, PLACE_TILE_ON_ALT_USE } from '../src/data/items';
import { TILE_BY_KEY, TILE_DEFS } from '../src/data/tiles';
import { CAGE_FAMILY, cageFamilyOf, cageSlot } from '../src/render/CritterCage';
import { framedCellFrame } from '../src/world/FurnitureStyle';
import { World } from '../src/world/World';
import {
  critterAnchorPlace, critterAnchorAt, critterAnchorBreakDrop,
  furnitureToSave, furnitureFromSave,
} from '../src/world/FurnitureItems';
import { ITEM_STABLE_OF_INTERNAL, ITEM_INTERNAL_OF_STABLE } from '../src/data/items';

const defOfVid = (vid: number) => {
  const k = VANILLA_ITEM_KEY_BY_ID[vid];
  return k !== undefined ? ITEM_DEFS[ITEM_BY_KEY[k]] : undefined;
};
const sheetOf = (vid: number) => {
  const d = defOfVid(vid);
  if (!d?.tile) return -1;
  return TILE_DEFS[TILE_BY_KEY[d.tile]]?.vanilla?.sheet ?? -1;
};

/** ① 权威映射：笼/缸物品 id → tile sheet（Item.cs createTile + TEdit 双源吻合） */
const CAGE_ITEMS: ReadonlyArray<readonly [number, number]> = [
  [250, 282],
  [2162, 275], [2163, 276], [2164, 277], [2165, 278], [2166, 279], [2167, 280], [2168, 281],
  [2174, 285], [2175, 286],
  [2178, 288], [2179, 289], [2180, 290], [2181, 291], [2182, 292], [2183, 293], [2184, 294], [2185, 295],
  [2186, 296], [2187, 297], [2190, 298], [2191, 299], [2206, 309], [2207, 310],
  [2439, 316], [2440, 317], [2441, 318],
  [2741, 339],
  [3070, 358], [3071, 359], [3072, 360], [3073, 361], [3074, 362], [3075, 363], [3076, 364],
  [3254, 391], [3255, 392], [3256, 393], [3257, 394],
  [3565, 413], [3566, 414],
  [4275, 505],
  [4327, 521], [4328, 522], [4329, 523], [4330, 524], [4331, 525], [4332, 526], [4333, 527],
  [4364, 532], [4376, 533], [4380, 538], [4396, 542], [4398, 543], [4399, 544],
  [4461, 550], [4462, 551], [4473, 553], [4474, 554], [4475, 555], [4476, 556],
  [4481, 558], [4483, 559],
  [4655, 568], [4656, 569], [4657, 570],
  [4846, 580], [4850, 582], [4880, 598],
  [4882, 599], [4883, 600], [4884, 601], [4885, 602], [4886, 603], [4887, 604], [4888, 605],
  [4889, 606], [4890, 607], [4891, 608], [4892, 609], [4893, 610], [4894, 611], [4895, 612],
  [4963, 619], [4964, 620],
  [5133, 629], [5213, 632], [5301, 640], [5314, 643], [5315, 644], [5316, 645],
  [5512, 710],
];

/** ② TileObjectData 尺寸分组（Style6x3 / StyleSmallCage 3×2 / Style2x2 罐缸） */
const DIMS_6X3 = [275, 276, 277, 278, 279, 280, 281, 296, 297, 309, 358, 359, 413, 414, 542, 550, 551, 553, 554, 558, 559, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 632, 640, 643, 644, 645, 710];
const DIMS_3X2 = [285, 286, 298, 299, 310, 339, 361, 362, 363, 364, 391, 392, 393, 394, 532, 533, 538, 544, 555, 556, 582, 619, 629];
const DIMS_2X2 = [282, 288, 289, 290, 291, 292, 293, 294, 295, 316, 317, 318, 360, 505, 521, 522, 523, 524, 525, 526, 527, 543, 568, 569, 570, 580, 598, 620];

/** ③ createTile=724 全量 93 件（DefaultToCapturedCritter 全调用点 + 区间展开） */
const ANCHOR_ITEMS: ReadonlyArray<number> = [
  261, 1338,
  1992, 1994, 1995, 1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2006, 2007,
  2015, 2016, 2017, 2018, 2019,
  2121, 2122, 2123, 2156, 2157, 2205, 2673, 2740,
  2889, 2890, 2891, 2892, 2893, 2894, 2895,
  3191, 3192, 3193, 3194, 3563, 3564,
  4068, 4069, 4070, 4274,
  4334, 4335, 4336, 4337, 4338, 4339, 4340,
  4359, 4361, 4362, 4363, 4373, 4374, 4375, 4395,
  4418, 4419, 4464, 4465, 4480, 4482,
  4831, 4832, 4833, 4834, 4835, 4836, 4837, 4838, 4839, 4840, 4841, 4842, 4843, 4844,
  4845, 4847, 4849, 4961, 5132, 5212,
  5300, 5311, 5312, 5313, 5350, 5511,
];
/** placeStyle = TECritterAnchor 原型 anchorStyle（Player.cs:42771）：非 0 档全列 */
const ANCHOR_STYLE: Readonly<Record<number, number>> = {
  2002: 1, 2003: 1, 2894: 1, 2895: 1, 3191: 1, 3192: 1, 3193: 1, 3194: 1,
  4363: 1, 4375: 1, 4464: 1, 4465: 1,
  2015: 2, 2016: 2, 2017: 2, 2889: 2, 4395: 2, 5212: 2, 5300: 2, 5311: 2, 5312: 2, 5313: 2,
  261: 3, 4274: 3, 4373: 3, 4480: 3, 4482: 3, 5511: 3,
  2891: 4, 4845: 4, 4961: 4,
};

// ============ ① 笼/缸物品 → tile 链接全量（92 条） ============
describe('笼/缸物品 createTile 链接（92 条全量）', () => {
  it('每条映射：def.tile 已落且目标 tile 的 vanilla.sheet 与权威表一致', () => {
    expect(CAGE_ITEMS.length).toBe(92);
    for (const [vid, sheet] of CAGE_ITEMS) {
      const d = defOfVid(vid);
      expect(d, `vid ${vid} 无物品 def`).toBeDefined();
      expect(d!.tile, `vid ${vid} 未落 tile`).toBeTruthy();
      expect(sheetOf(vid), `vid ${vid} → sheet ${sheetOf(vid)}，期望 ${sheet}`).toBe(sheet);
    }
  });

  it('CAGE_FAMILY 92 张笼表无孤儿：每 sheet 恰有一条物品链接', () => {
    expect(Object.keys(CAGE_FAMILY).length).toBe(92);
    const bySheet = new Map<number, number[]>();
    for (const [vid] of CAGE_ITEMS) {
      const s = sheetOf(vid);
      if (!bySheet.has(s)) bySheet.set(s, []);
      bySheet.get(s)!.push(vid);
    }
    for (const sheet of Object.keys(CAGE_FAMILY).map(Number)) {
      const vids = bySheet.get(sheet) ?? [];
      expect(vids, `sheet ${sheet} 无物品链接`).toHaveLength(1);
    }
    // 权威表与渲染表 sheet 集合完全一致
    const tableSheets = new Set(CAGE_ITEMS.map(([, s]) => s));
    const famSheets = new Set(Object.keys(CAGE_FAMILY).map(Number));
    expect([...tableSheets].sort((a, b) => a - b)).toEqual([...famSheets].sort((a, b) => a - b));
  });

  it('笼族 placeStyle 恒 0（DefaultToPlaceableTile 双参重载缺省）', () => {
    for (const [vid] of CAGE_ITEMS) {
      const d = defOfVid(vid)!;
      expect(d.placeStyle ?? 0, `vid ${vid} placeStyle 应为 0/缺省`).toBe(0);
    }
  });

  it('笼 tile 尺寸 = TileObjectData（6×3 大笼 / 3×2 小笼 / 2×2 罐缸）', () => {
    const expectDim = (sheet: number, w: number, h: number) => {
      const t = TILE_DEFS.find((x) => x.vanilla?.sheet === sheet && x.vanilla.frame === 'style');
      expect(t, `sheet ${sheet} 无 tile def`).toBeDefined();
      expect([t!.w ?? 1, t!.h ?? 1], `sheet ${sheet} 尺寸`).toEqual([w, h]);
    };
    for (const s of DIMS_6X3) expectDim(s, 6, 3);
    for (const s of DIMS_3X2) expectDim(s, 3, 2);
    for (const s of DIMS_2X2) expectDim(s, 2, 2);
    expect(DIMS_6X3.length + DIMS_3X2.length + DIMS_2X2.length).toBe(92);
  });
});

// ============ ② 放置端到端：物品 → tile 落位 + 帧锚 ============
describe('放置端到端（framedCellFrame 生产路径 → World store）', () => {
  /** 与 Game.tryPlace vanilla-style 分支同式落格：framedCellFrame 逐格写帧 */
  const placeCage = (w: World, vid: number, x: number, y: number): number => {
    const d = defOfVid(vid)!;
    const tileId = TILE_BY_KEY[d.tile!];
    const def = TILE_DEFS[tileId];
    const ow = def.w ?? 1, oh = def.h ?? 1;
    for (let dx = 0; dx < ow; dx++) {
      for (let dy = 0; dy < oh; dy++) {
        const [fx, fy] = framedCellFrame(
          def.vanilla?.sheet ?? -1, def.vanilla?.fw ?? 1, d.placeStyle ?? 0, dx, dy);
        w.store.setTile(x + dx, y + dy, tileId, fx, fy);
      }
    }
    return tileId;
  };

  it('全 92 件：落位后每格 tile 正确、帧锚 = (dx*18, dy*18)、槽位哈希可还原锚点', () => {
    const w = new World(80, 80, 42, 'cage-test');
    for (let x = 2; x < 30; x++) w.store.setTile(x, 40, TILE_BY_KEY['stone']!); // 地板承重
    let n = 0;
    for (const [vid, sheet] of CAGE_ITEMS) {
      const x = 2 + (n % 7) * 8, y = 40 - 3;
      const tileId = placeCage(w, vid, x, y);
      const def = TILE_DEFS[tileId];
      const ow = def.w ?? 1, oh = def.h ?? 1;
      const fam = cageFamilyOf(sheet);
      expect(fam, `sheet ${sheet} 不在笼族表`).not.toBeNull();
      let slot: number | null = null;
      for (let dx = 0; dx < ow; dx++) {
        for (let dy = 0; dy < oh; dy++) {
          const i = w.store.idx(x + dx, y + dy);
          expect(w.store.type[i], `vid ${vid} 格 (${dx},${dy}) 未落 tile`).toBe(tileId);
          // placeStyle=0 → 帧锚就是物体列/行偏移（TileObject.Place L74-102）
          expect(w.store.frameX[i], `vid ${vid} (${dx},${dy}) frameX`).toBe(dx * 18);
          expect(w.store.frameY[i], `vid ${vid} (${dx},${dy}) frameY`).toBe(dy * 18);
          // 槽位哈希（TileDrawing.cs:6636-6653）同一物体各格一致
          const s = cageSlot(fam!.slot, x + dx, y + dy, w.store.frameX[i], w.store.frameY[i]);
          if (slot === null) slot = s;
          expect(s).toBe(slot);
        }
      }
      n++;
    }
    expect(n).toBe(92);
  });

  it('placeStyle>0 的样式基偏移走 FurnitureStyle 布局表（竖排族不落 X 向）', () => {
    // 139 八音盒（StyleHorizontal=false 竖排 Y 步 36）：style 2 → (0,72) 非 (36,0)
    expect(framedCellFrame(139, 3, 2, 0, 0)).toEqual([0, 72]);
    // 15 椅子（竖排 Y 步 40）
    expect(framedCellFrame(15, 1, 2, 0, 0)).toEqual([0, 80]);
    // 笼族（无专属 case）：style 0 → 原点
    expect(framedCellFrame(275, 6, 0, 0, 0)).toEqual([0, 0]);
    expect(framedCellFrame(533, 3, 0, 2, 1)).toEqual([36, 18]);
  });
});

// ============ ③ 锚桩 724（TECritterAnchor 等价） ============
describe('捕获小动物 → 锚桩 724（TECritterAnchor 等价）', () => {
  it('93 件 createTile=724 物品全部落 v_724_critter_anchor 且在右键放置集', () => {
    expect(ANCHOR_ITEMS.length).toBe(93);
    for (const vid of ANCHOR_ITEMS) {
      const d = defOfVid(vid);
      expect(d, `vid ${vid} 无物品 def`).toBeDefined();
      expect(d!.tile, `vid ${vid} 未落锚桩 tile`).toBe('v_724_critter_anchor');
      // ItemID.Sets.PlaceTileOnAltUse（ItemID.cs:155）：右键放置、左键放生
      expect(PLACE_TILE_ON_ALT_USE.has(vid), `vid ${vid} 应在 PlaceTileOnAltUse`).toBe(true);
    }
  });

  it('placeStyle = TECritterAnchor 原型 anchorStyle（Player.cs:42771）', () => {
    for (const [vid, style] of Object.entries(ANCHOR_STYLE)) {
      expect(defOfVid(+vid)!.placeStyle, `vid ${vid} anchorStyle`).toBe(style);
    }
    // 未覆写 anchorStyle 的原型 = 0（缺省），抽查（2026-08-13 拴绳系统落位后：
    // 蝶族 1994 的 placeStyle = 物种变体 1-8（Item.cs:21303，放置帧档由
    // Game.tryPlace 按 anchorStyle 覆写）；水禽 4359 = Waterfowl : Bird = 2——
    // 两处均非缺省，从缺省抽查表移除，见 tests/leashed-critters.test.ts 全量对账）
    for (const vid of [2019, 2121, 2673, 4418]) {
      expect(defOfVid(vid)!.placeStyle ?? 0, `vid ${vid} 应为缺省 0`).toBe(0);
    }
  });

  it('锚桩记录：放置写入存物 → 命中反查 → 破坏取物清槽（InsertItem/DropItemForTileBreak）', () => {
    const recs: Parameters<typeof critterAnchorPlace>[0] = [];
    const bunny = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2019]!]; // 捕获兔兔（内部 id）
    const goldfish = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[261]!];

    const placed = critterAnchorPlace(recs, 10, 20, { id: bunny, stack: 5 });
    expect(placed.slots[0]).toEqual({ id: bunny, stack: 1, prefix: undefined });
    expect(critterAnchorAt(recs, 10, 20)?.slots[0]?.id).toBe(bunny);

    // 重放（旧记录清重建）
    critterAnchorPlace(recs, 10, 20, { id: goldfish, stack: 2 });
    expect(recs.filter((r) => r.x === 10 && r.y === 20)).toHaveLength(1);
    expect(critterAnchorAt(recs, 10, 20)?.slots[0]?.id).toBe(goldfish);

    // 破坏：取出存物并清槽（:63739-63744 同击掉物；tile 本体无掉落 :66141-66145）
    const dropped = critterAnchorBreakDrop(recs, 10, 20);
    expect(dropped?.id).toBe(goldfish);
    expect(critterAnchorAt(recs, 10, 20)?.slots[0]).toBeNull();
    expect(critterAnchorBreakDrop(recs, 10, 20)).toBeNull(); // 二次破坏空桩无掉落
  });

  it('锚桩记录随世界存档往返（serialize furniture 段对 kind 透传）', () => {
    const recs: Parameters<typeof critterAnchorPlace>[0] = [];
    const bunny = ITEM_BY_KEY[VANILLA_ITEM_KEY_BY_ID[2019]!];
    critterAnchorPlace(recs, 12, 8, { id: bunny, stack: 1 });
    // 存：内部 id → 稳定 id（SaveFile.serializeSave 同式）
    const saved = furnitureToSave(recs, (id) => ITEM_STABLE_OF_INTERNAL[id] ?? 0);
    expect(saved[0].kind).toBe('critter_anchor');
    // 读：稳定 id → 内部 id（SaveFile.loadSave 同式）
    const back = furnitureFromSave(saved, (sid) => ITEM_INTERNAL_OF_STABLE.get(sid) ?? 0);
    expect(back[0].kind).toBe('critter_anchor');
    expect(back[0].x).toBe(12);
    expect(back[0].slots[0]?.id).toBe(bunny);
  });
});
