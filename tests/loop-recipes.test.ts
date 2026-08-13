// 循环生成配方段回归（Recipe.cs SetupRecipes 内 7 处 `for` 循环 AddRecipe 段）。
// 旧提取器（tools/extract-recipes.mjs）只认字面量参数，循环体内 `2178 + n` /
// `num5 - 4327 + 4334` / `array[j, 0]` / `ItemID.Sets.TextureCopyLoad[i]` 全不命中
// → 整段蒸发（蝴蝶罐/蜻蜓罐/架子/字母雕像/假宝箱/平衡锤共 137 条全缺）。
// 2026-08-13 提取器补 flattenLoops 循环内联展开 + --append-loops 差集落表。
// 本表数据 = 反编译源码逐条手抄（非提取器复跑），作独立对账锚点。
import { describe, it, expect } from 'vitest';
import {
  VANILLA_RECIPES, RECIPE_GROUPS, collectOwnedItems, craftableCount,
  envOk, consumeMaterials, invIndexOfVanilla, vanillaItemKey,
  type VanillaRecipe, type VanillaCraftCtx,
} from '../src/data/vanillaRecipes';
import { Inventory } from '../src/items/Inventory';
import { TILE_DEFS } from '../src/data/tiles';

/** 站点 sheet（原版 TileID）→ 仓库内部 tile id（vanillaRecipes.SHEET_TO_INTERNAL 同款扫描） */
function internalBySheet(sheet: number): number {
  const idx = TILE_DEFS.findIndex((t) => t?.vanilla?.sheet === sheet);
  expect(idx, `sheet ${sheet} 未注册`).toBeGreaterThanOrEqual(0);
  return idx;
}

const ctx = (sheets: number[]): VanillaCraftCtx => ({
  nearbyInternal: new Set(sheets.map(internalBySheet)),
});

const ONE = (id: number) => ({ id, stack: 1 });

// ================= 普查锚点：7 个循环段 137 条（Recipe.cs 行号 = 循环头） =================

/** :12795 `for (int n = 0; n < 8; n++)`：蝴蝶罐 8 只 ← 同序蝴蝶 1994+n + 瓶子(31) 徒手 */
const BUTTERFLY_JARS: Array<[number, number]> = [
  [2178, 1994], [2179, 1995], [2180, 1996], [2181, 1997],
  [2182, 1998], [2183, 1999], [2184, 2000], [2185, 2001],
];
/** :12803 `for (int num5 = 4327; num5 <= 4332; num5++)`：蜻蜓罐 6 只 ← 蜻蜓 num5-4327+4334 + 瓶子(31) 徒手 */
const DRAGONFLY_JARS: Array<[number, number]> = [
  [4327, 4334], [4328, 4335], [4329, 4336], [4330, 4337], [4331, 4338], [4332, 4339],
];
/** :6701 `for (int k = 2114; k <= 2118; k++)`：武器架 5 种 ← 木(9)×12 + 铁锭(22)×3 @锯木台(106)，Wood+IronBar 组 */
const RACKS = [2114, 2115, 2116, 2117, 2118];
/** :9610 `for (int m = 0; m < 36; m++)`：字母雕像 A-Z+0-9 共 36 ← 石头(3)×50 @重型工作台(283) */
const ALPHABET_STATUES = Array.from({ length: 36 }, (_, m) => 2702 + m);
/** :9444 `for (int l = 3309; l <= 3314; l++)`：串平衡锤 5547 ← 白绳(3306) + 各色平衡锤 l @工匠作坊(114) */
const COUNTERWEIGHTS = [3309, 3310, 3311, 3312, 3313, 3314];
/**
 * :6525 `for (int i = 3665; i <= 3704; i++)`：伪装宝箱 40 种 ← TextureCopyLoad[i] 映射物 + 导线(530)×10
 * @重型工作台(283)。映射表 = ItemID.cs:1090 `Factory.CreateIntSet(-1, 3665, 48, ...)`（手抄全 40 对，
 * 注意 3702/3703 在源码里是乱序声明——3702→3180、3703→3125）。
 */
const TEXTURE_COPY_LOAD: Array<[number, number]> = [
  [3665, 48], [3666, 306], [3667, 328], [3668, 625], [3669, 626], [3670, 627], [3671, 680],
  [3672, 681], [3673, 831], [3674, 838], [3675, 914], [3676, 952], [3677, 1142], [3678, 1298],
  [3679, 1528], [3680, 1529], [3681, 1530], [3682, 1531], [3683, 1532], [3684, 2230],
  [3685, 2249], [3686, 2250], [3687, 2526], [3688, 2544], [3689, 2559], [3690, 2574],
  [3691, 2612], [3692, 2613], [3693, 2614], [3694, 2615], [3695, 2616], [3696, 2617],
  [3697, 2618], [3698, 2619], [3699, 2620], [3700, 2748], [3701, 2814], [3702, 3180],
  [3703, 3125], [3704, 3181],
];
/**
 * :6573 `for (int j = 0; j < array.GetLength(0); j++)`：伪装宝箱第二批 36 种（int[,] array 全 36 行，
 * Recipe.cs:6536-6571 手抄）← array[j,1] 映射物 + 导线(530)×10 @重型工作台(283)。
 */
const FAKE_CHEST_PAIRS: Array<[number, number]> = [
  [3886, 3884], [3887, 3885], [3950, 3939], [3976, 3965], [4164, 4153], [4185, 4174],
  [4206, 4195], [4227, 4216], [4266, 4265], [4268, 4267], [4585, 4574], [4713, 4712],
  [5167, 5156], [5188, 5177], [5209, 5198], [5567, 5556], [5620, 5609], [5708, 5697],
  [5731, 5720], [5754, 5745], [5776, 5763], [5797, 5784], [5818, 5805], [5839, 5826],
  [5857, 5846], [5878, 5865], [5897, 5886], [5918, 5905], [5952, 5939], [5974, 5962],
  [5995, 5982], [6018, 6005], [6041, 6028], [6064, 6051], [6087, 6074], [6131, 6118],
];

/** 伪装宝箱族成品（TextureCopyLoad 批 3665-3704 + int[,] 批）：public/sprites/vanilla.json
 *  无条目 → ITEM_DEFS 未注册、vanillaItemKey 反查不到。属素材表缺口（这族 item 的贴图
 *  本就是复用源箱子贴图，TextureCopyLoad 即为此设），与配方数据无关，此处登记不阻断。 */
const FAKE_CHEST_PRODUCTS: Set<number> = new Set<number>([
  ...TEXTURE_COPY_LOAD.map(([c]) => c),
  ...FAKE_CHEST_PAIRS.map(([c]) => c),
]);

/** 按期望精确定位一条配方（create 唯一锚点 + 全字段对账） */
function expectRecipe(
  create: number, tile: number, items: Array<{ id: number; stack: number }>, groups: number[] = [],
): VanillaRecipe {
  const hit = VANILLA_RECIPES.filter((r) => r.create === create
    && r.tile === tile
    && r.items.length === items.length
    && r.items.every((it, k) => it.id === items[k].id && it.stack === items[k].stack));
  expect(hit, `配方 create=${create} tile=${tile} items=${JSON.stringify(items)} 缺失或不符`).toHaveLength(1);
  expect(hit[0].createStack).toBe(1);
  expect(hit[0].groups).toEqual(groups);
  return hit[0];
}

describe('循环生成配方普查（Recipe.cs 7 处 for 段共 137 条）', () => {
  it('蝴蝶罐 :12795：8 只 = 对应蝴蝶(1994+n) + 瓶子(31) 徒手', () => {
    for (const [jar, butterfly] of BUTTERFLY_JARS) {
      expectRecipe(jar, -1, [ONE(butterfly), ONE(31)]);
    }
  });

  it('蜻蜓罐 :12803：6 只 = 对应蜻蜓(4334..4339) + 瓶子(31) 徒手', () => {
    for (const [jar, dragonfly] of DRAGONFLY_JARS) {
      expectRecipe(jar, -1, [ONE(dragonfly), ONE(31)]);
    }
  });

  it('金蜻蜓罐 4333 是线性配方不在循环段（← 4340 金蜻蜓 + 瓶子，已有）', () => {
    expectRecipe(4333, -1, [ONE(4340), ONE(31)]);
  });

  it('武器架 :6701：5 种 = 木(9)×12 + 铁锭(22)×3 @锯木台(106) + Wood/IronBar 组', () => {
    const groups = [RECIPE_GROUPS['Wood'], RECIPE_GROUPS['IronBar']];
    for (const rack of RACKS) {
      expectRecipe(rack, 106, [{ id: 9, stack: 12 }, { id: 22, stack: 3 }], groups);
    }
  });

  it('字母雕像 :9610：36 座 = 石头(3)×50 @重型工作台(283)', () => {
    for (const statue of ALPHABET_STATUES) {
      expectRecipe(statue, 283, [{ id: 3, stack: 50 }]);
    }
  });

  it('串平衡锤 :9444：6 条同产物 = 白绳(3306) + 各色平衡锤(3309..3314) @工匠作坊(114)', () => {
    for (const cw of COUNTERWEIGHTS) {
      expectRecipe(5547, 114, [ONE(3306), ONE(cw)]);
    }
    // 旧提取器循环残影（漏配重材料的半截 5547@114[3306x1]）已随 --append-loops 剔除
    expect(VANILLA_RECIPES.some((r) => r.create === 5547 && r.tile === 114 && r.items.length === 1)).toBe(false);
  });

  it('伪装宝箱 :6525（TextureCopyLoad 40 对）= 映射物 + 导线(530)×10 @重型工作台(283)', () => {
    for (const [chest, src] of TEXTURE_COPY_LOAD) {
      expectRecipe(chest, 283, [ONE(src), { id: 530, stack: 10 }]);
    }
  });

  it('伪装宝箱 :6573（int[,] 36 行）= 映射物 + 导线(530)×10 @重型工作台(283)', () => {
    for (const [chest, src] of FAKE_CHEST_PAIRS) {
      expectRecipe(chest, 283, [ONE(src), { id: 530, stack: 10 }]);
    }
  });

  it('差集清零：普查清单 137 条全量在表', () => {
    const expected = new Set<number>([
      ...BUTTERFLY_JARS.map(([c]) => c),
      ...DRAGONFLY_JARS.map(([c]) => c),
      ...RACKS,
      ...ALPHABET_STATUES,
      ...TEXTURE_COPY_LOAD.map(([c]) => c),
      ...FAKE_CHEST_PAIRS.map(([c]) => c),
      // 5547 六条（create 重复，单独点数）
    ]);
    let missing = 0;
    for (const c of expected) {
      if (!VANILLA_RECIPES.some((r) => r.create === c)) missing++;
    }
    expect(missing).toBe(0);
    expect(VANILLA_RECIPES.filter((r) => r.create === 5547 && r.tile === 114)).toHaveLength(6);
  });

  it('X 代理登记的 4880（熔岩鱼缸 LavaFishbowl）原版不可合成——箱子战利品专属（Player.cs:8415）', () => {
    // 该 id 在 Recipe.cs 全文 0 命中（含循环段），唯一来源 = 地狱箱 4877/4878 随机掉落，
    // 与世界生成 tile 598 的映射（WorldGen.cs:48627）。属误登记，非遗漏。
    expect(VANILLA_RECIPES.some((r) => r.create === 4880)).toBe(false);
  });

  it('登记：伪装宝箱族成品仅 16/76 进素材表（vanilla.json 缺 60）——配方侧无碍，素材侧遗留', () => {
    // 配方可合成校验/扣料全链已通（下方 craftOne），仅缺条目成品的 key 反查（vanillaItemKey）。
    // 已注册 16 项（int[,] 批前段 3886..5708），缺 60 项（TextureCopyLoad 全批 3665-3704 +
    // int[,] 批后段 5567..6131）——这族贴图本就复用源箱（TextureCopyLoad 即为此设），
    // 素材侧补录属独立工作项，不阻断配方数据。
    let registered = 0;
    for (const c of FAKE_CHEST_PRODUCTS) if (vanillaItemKey(c) !== undefined) registered++;
    expect(registered).toBe(16);
    expect(FAKE_CHEST_PRODUCTS.size).toBe(76);
    // 材料侧齐全（金箱 48 / 5962 均可反查内部 id）——缺口仅在成品登记
    expect(invIndexOfVanilla(48)).toBeGreaterThanOrEqual(0);
    expect(invIndexOfVanilla(5962)).toBeGreaterThanOrEqual(0);
  });
});

describe('循环配方 craftOne 端到端', () => {
  /** 装材料 → 断言环境门/可合成次数 → consumeMaterials → 校验产物 key 可反查 + 材料扣净 */
  function craftOne(r: VanillaRecipe, mats: Array<[number, number]>, sheets: number[]) {
    const inv = new Inventory();
    mats.forEach(([vid, stack], k) => {
      const iid = invIndexOfVanilla(vid);
      expect(iid, `材料 ${vid} 未注册`).toBeGreaterThanOrEqual(0);
      inv.slots[10 + k] = { id: iid, stack };
    });
    // 站点门：无站点时徒手配方可用/站点配方不可用；给定站点后可用
    expect(envOk(r, ctx([]))).toBe(r.tile < 0);
    expect(envOk(r, ctx(sheets))).toBe(true);
    expect(craftableCount(r, collectOwnedItems(inv))).toBe(1);
    expect(consumeMaterials(inv, r, 1, false)).toBe(true);
    // 材料按配方需求量精确投放 → 合成后全部扣净
    for (const [vid] of mats) expect(inv.countOf(invIndexOfVanilla(vid))).toBe(0);
    // 产物可反查到仓库 item key（合成 UI 放置进背包的入口）——伪装宝箱族
    // 尚未进素材表（见下方登记项），此处不设产物反查断言
    if (!FAKE_CHEST_PRODUCTS.has(r.create)) expect(vanillaItemKey(r.create)).toBeDefined();
  }

  it('蝴蝶罐：君主蝴蝶 1994 + 瓶子(31) → 2178，徒手可合成', () => {
    craftOne(VANILLA_RECIPES.find((x) => x.create === 2178 && x.tile === -1)!, [[1994, 1], [31, 1]], []);
  });

  it('蜻蜓罐：蓝蜻蜓 4335 + 瓶子(31) → 4328，徒手可合成', () => {
    craftOne(VANILLA_RECIPES.find((x) => x.create === 4328 && x.tile === -1)!, [[4335, 1], [31, 1]], []);
  });

  it('武器架：木(9)×12 + 铁锭(22)×3 → 2114，需锯木台(106)', () => {
    craftOne(VANILLA_RECIPES.find((x) => x.create === 2114 && x.tile === 106)!, [[9, 12], [22, 3]], [106]);
  });

  it('武器架组槽：任一木材均可满足（Wood 组聚合，RequiredItemEntry.Matches :35-42）', () => {
    const r = VANILLA_RECIPES.find((x) => x.create === 2114 && x.tile === 106)!;
    const inv = new Inventory();
    // 北方木 5215 代替木 9（Wood 组末位成员）
    const boreal = invIndexOfVanilla(5215);
    const iron = invIndexOfVanilla(22);
    expect(boreal).toBeGreaterThanOrEqual(0);
    inv.slots[10] = { id: boreal, stack: 12 };
    inv.slots[11] = { id: iron, stack: 3 };
    expect(craftableCount(r, collectOwnedItems(inv))).toBe(1);
  });

  it('字母雕像：石头(3)×50 → 2702，需重型工作台(283)', () => {
    craftOne(VANILLA_RECIPES.find((x) => x.create === 2702 && x.tile === 283)!, [[3, 50]], [283]);
  });

  it('伪装宝箱：金箱 48 + 导线(530)×10 → 3665，需重型工作台(283)', () => {
    craftOne(VANILLA_RECIPES.find((x) => x.create === 3665 && x.tile === 283)!, [[48, 1], [530, 10]], [283]);
  });

  it('伪装宝箱（int[,] 批）：5962 + 导线(530)×10 → 5974，需重型工作台(283)', () => {
    craftOne(VANILLA_RECIPES.find((x) => x.create === 5974 && x.tile === 283)!, [[5962, 1], [530, 10]], [283]);
  });

  it('串平衡锤：白绳(3306) + 黑平衡锤(3309) → 5547，需工匠作坊(114)', () => {
    const r = VANILLA_RECIPES.find((x) => x.create === 5547 && x.tile === 114
      && x.items.some((i) => i.id === 3309))!;
    craftOne(r, [[3306, 1], [3309, 1]], [114]);
  });
});
