// 原版配方数据运行时（tools/extract-recipes.mjs 从 Recipe.cs 提取，3309 条
// 【2026-08-23 SW_TREE=Terarria1457 重建:存量 11 处数值改动(2209/739-744/3279/3280/3377/
// 561/1595)+新组 SilverBar/GoldBar+~33 新配方(6148-6192 段)均已并入;头注曾写
// "1456 基准存量同值"系陈旧误导——R14-B5①勘误】：
// 含 for 循环生成段 137 条——蝴蝶罐/蜻蜓罐/武器架/字母雕像/伪装宝箱/串平衡锤）。
// 可用性 = Recipe.UpdateRecipeList（Recipe.cs:229-258）：环境条件（站点/液体/群系）× 材料计数。
// 组匹配 = RecipeGroup（id 假偏移 1000000，Recipe.cs:20）——组计数 = 组内所有物品持有数之和。
import recipesJson from './vanilla-recipes.json';
import { itemCombat } from './vanillaItemCombat';
import { TILE_DEFS, TILE_BY_KEY } from './tiles';
import { ITEM_DEFS } from './items';
import type { Inventory } from '../items/Inventory';
import type { ChestData } from '../world/World';
import type { TileStore } from '../world/TileStore';

export interface VanillaRecipe {
  create: number;          // 原版 item id
  createStack: number;
  tile: number;           // 站点 TileID（-1=徒手）
  items: Array<{ id: number; stack: number }>;
  groups: number[];
  honey?: boolean; water?: boolean; lava?: boolean;
  snow?: boolean; graveyard?: boolean; alchemy?: boolean;
  /** 1457：Ocram's Razor(5334) 需 remix+getGood/everything 世界（Mechdusa 三合一） */
  mechdusa?: boolean;
  /** 1457：火把神恩宠解锁（5573/5638） */
  torchGod?: boolean;
  /** decraft 族(2026-08-13 提取器补提,Recipe.cs 裸赋值 :1064/:1140/:1145) */
  notDecraftable?: boolean;
  crimson?: boolean;
  corruption?: boolean;
  /** AddCustomShimmerResult(:173)——decraft 产物覆盖表 [[id,stack],...] */
  shimmer?: Array<[number, number]>;
}

const DOC = recipesJson as unknown as {
  count: number;
  groups: Record<string, number>;
  groupItems: Record<string, number[]>;
  tileCountsAs: Record<string, number>;
  recipes: VanillaRecipe[];
};
export const VANILLA_RECIPES = DOC.recipes;
export const RECIPE_GROUPS = DOC.groups;
export const RECIPE_GROUP_ITEMS = DOC.groupItems;
export const TILE_COUNTS_AS = DOC.tileCountsAs;

/** 站点继承递归展开（Player.SetAdjTile :35192-35208）：tile 本身 + CountsAs 链全部置位 */
// ================= decraft 索引表（Recipe.UpdateWhichItemsAreCrafted :15110-15127 1:1） =================
// 注册序遍历后写 = last-wins（原版同款）; notDecraftable 跳过 IsCrafted;
// crimson/corruption 配方写各自专属表（GetDecraftingRecipeIndex 按世界 evil 取用）。
// 惰性构建一次（模块加载即建,3309 条线性扫）。
const IS_CRAFTED = new Map<number, number>();
const IS_CRAFTED_CRIMSON = new Map<number, number>();
const IS_CRAFTED_CORRUPTION = new Map<number, number>();
{
  const rs = DOC.recipes;
  for (let i = 0; i < rs.length; i++) {
    const r = rs[i];
    if (!r.notDecraftable) IS_CRAFTED.set(r.create, i);
    if (r.crimson) IS_CRAFTED_CRIMSON.set(r.create, i);
    if (r.corruption) IS_CRAFTED_CORRUPTION.set(r.create, i);
  }
}

/** ShimmerTransforms.GetDecraftingRecipeIndex（ShimmerTransforms.cs:15-31）:
 *  IsCrafted<0 → -1;猩红世界取 crimson 表(≥0 才用),腐化世界同理,否则 IsCrafted */
export function getDecraftingRecipeIndex(vid: number, crimsonWorld: boolean): number {
  const base = IS_CRAFTED.get(vid) ?? -1;
  if (base < 0) return -1;
  if (crimsonWorld) {
    const c = IS_CRAFTED_CRIMSON.get(vid) ?? -1;
    if (c >= 0) return c;
  } else {
    const c = IS_CRAFTED_CORRUPTION.get(vid) ?? -1;
    if (c >= 0) return c;
  }
  return base;
}

/** 按索引取配方（decraft 执行端用） */
export function recipeAt(index: number): VanillaRecipe | undefined {
  return DOC.recipes[index];
}

export function expandStationTiles(tile: number): number[] {
  const out = [tile];
  let cur = tile;
  for (let hop = 0; hop < 6; hop++) {
    const next = TILE_COUNTS_AS[String(cur)];
    if (next === undefined) break;
    out.push(next);
    cur = next;
  }
  return out;
}

/** 站点继承"替身集"：requiredTile R 能被哪些邻近 tile 置位 adjTile[R]——
 *  {R} ∪ TileCountsAs 后裔（沿"谁 counts-as 谁"反向闭包）。
 *  原版方向：Player.SetAdjTile(Player.cs:35920-35939) 对【邻近 tile】沿链递归置位
 *  （Recipe.cs:559-571 表：77→17/133→77/134→16/302→17/96→215/17→215/304→86/355→13/699→13），
 *  Recipe.cs:325 只查 adjTile[requiredTile]——所以近 T 满足 R ⟺ R ∈ {T}∪chain(T)
 *  ⟺ T ∈ 后裔(R)。例：R=17 的替身集 = {17,302 玻璃窑,77 地狱熔炉,133 钛金熔炉}。 */
const STATION_SATISFIERS = new Map<number, ReadonlySet<number>>();

export function stationSatisfierTiles(tile: number): ReadonlySet<number> {
  const hit = STATION_SATISFIERS.get(tile);
  if (hit) return hit;
  const out = new Set<number>([tile]);
  const stack = [tile];
  while (stack.length) {
    const v = stack.pop()!;
    for (const k of Object.keys(TILE_COUNTS_AS)) {
      // TILE_COUNTS_AS[k]=v 语义：k 视作 v ⇒ k 是 v 的直接后裔
      if (TILE_COUNTS_AS[k] === v && !out.has(Number(k))) {
        out.add(Number(k));
        stack.push(Number(k));
      }
    }
  }
  STATION_SATISFIERS.set(tile, out);
  return out;
}

/** vi_<id> key → 原版 item id 反解。〔方案 A 阶段 5（BJ266）退役〕items.ts reorder 块 ⑥
 *  vid 回填后 internal≡vid≡键解析恒等,唯一调用位（UI throwHeldToWorld 露西门）已改
 *  `ITEM_DEFS[id].vid` 直读——新消费面禁再引入键前缀反解（见 items.ts 头注铁律）。 */

// ================= 附近箱子合成联动（CraftFromNearbyChests，1.4.5.6 默认开） =================
// Player.Settings.CraftFromNearbyChests（Player.cs:359 默认 true）→ Recipe.CollectItemsFromChests
// （Recipe.cs:378-405）把附近箱/bank 聚进 Recipe._ownedItems；扣料走 CraftingRequests.Consume
// （CraftingRequests.cs:220-235，先背包后箱）。ChestData 结构上即满足本接口（items 槽数组）。

/** 单个合成材料源（Recipe._recipeChests 的一项）：世界箱 ChestData 或玩家 bank 槽数组 */
export interface CraftItemSource {
  /** 材料 slot 数组（Chest.item / bank；消费阶段原位扣减——stack 部分扣 / 整格清空） */
  items: Array<{ id: number; stack: number } | null>;
}

/** 合成范围常量（NearbyChests.cs:14/:37 range 缺省 600f）——单位 px（16px/格 → 37.5 格） */
export const CRAFT_CHEST_RANGE_PX = 600;

/**
 * NearbyChests.GetChestsInRangeOf（NearbyChests.cs:10-31）1:1：
 * 箱锚 = (x*16+16, y*16+16)（注意是锚格**右缘**，非格中心 x*16+8），与玩家
 * position 的欧氏距离 > range 即排除。IsLockedOrInUse（Chest.cs:171-183）：
 * locked → 排除；被任一玩家开着 → 排除（单人 = 当前开箱，由 openChest 首位收录，
 * 此处按引用去重一并覆盖，等价 Recipe.cs:395 的 Contains 去重 + IsPlayerInChest 门）。
 */
export function nearbyChestsForCrafting(
  chests: readonly ChestData[], px: number, py: number,
  rangePx = CRAFT_CHEST_RANGE_PX, openChest?: CraftItemSource | null,
): ChestData[] {
  const out: ChestData[] = [];
  const r2 = rangePx * rangePx;
  for (const c of chests) {
    if (c.locked) continue;
    if (openChest && c === openChest) continue;
    const dx = c.x * 16 + 16 - px, dy = c.y * 16 + 16 - py;
    if (dx * dx + dy * dy > r2) continue;   // Vector2.Distance > range（平方比较免开方）
    out.push(c);
  }
  return out;
}

/** 玩家储物 tile → bank 槽位（NearbyChests.cs:68-82：29 存钱罐/97 保险箱/
 *  463 守护者熔炉/491 虚空vault；容器索引约定 -2..-5 → bank..bank4） */
const BANK_TILE_SHEETS: ReadonlyArray<readonly [number, number]> = [[29, 0], [97, 1], [463, 2], [491, 3]];
/** GetBanksInRangeOf tile 段（NearbyChests.cs:41-43）：num = (int)(range/16+2) = 39（600px），
 *  玩家中心格 ±39 的 79×79 盒；WorldGen.InWorld 越界跳过 */
function bankSourcesForCrafting(
  store: Pick<TileStore, 'w' | 'h' | 'inBounds' | 'idx' | 'type'>,
  centerTileX: number, centerTileY: number,
  banks: ReadonlyArray<CraftItemSource | null | undefined> | undefined,
  rangePx: number, voidVaultHeld: boolean,
): CraftItemSource[] {
  if (!banks) return [];
  const num = Math.trunc(rangePx / 16 + 2);
  const out: CraftItemSource[] = [];
  // 内部 tile id 预解析（sheet 29/97/463/491；未注册 → 该 bank 永不命中）
  const internal: number[] = BANK_TILE_SHEETS.map(([sheet]) => SHEET_TO_INTERNAL.get(sheet) ?? -1);
  for (let j = centerTileX - num; j < centerTileX - num + num * 2 + 1; j++) {
    for (let k = centerTileY - num; k < centerTileY - num + num * 2 + 1; k++) {
      if (!store.inBounds(j, k)) continue;
      const t = store.type[store.idx(j, k)];
      for (let bi = 0; bi < BANK_TILE_SHEETS.length; bi++) {
        if (t !== internal[bi]) continue;
        // ContainerIndexToPlayerBank（NearbyChests.cs:105-134）：bank 缺席跳过；
        // case -5（void vault）：背包持有 vault 物品 5325 → 该 bank 不计（:119-130）
        const bank = banks[BANK_TILE_SHEETS[bi][1]];
        if (!bank) break;
        if (BANK_TILE_SHEETS[bi][1] === 3 && voidVaultHeld) break;
        if (!out.includes(bank)) out.push(bank);
        break;
      }
    }
  }
  return out;
}

export interface CraftSourcesOpts {
  /** 当前打开容器（Recipe.cs:381-384：player.chest != -1 → GetCurrentContainer
   *  Player.cs:33036-33047 首入列；Game 开 bank 面板时传 {x:-2-bi, items:banks[bi]} 同源）。
   *  x 随 ChestData 携带容器索引约定（-2..-5=bank..bank4）→ 虚空袋门（:386 chest!=-5）
   *  按 x===-5 自动派生（SW-AV2 2026-09-06） */
  openChest?: (CraftItemSource & { x?: number }) | null;
  /** 玩家 bank×4（piggy/safe/forge/void vault；null/缺省 = 无该 bank） */
  banks?: ReadonlyArray<CraftItemSource | null | undefined>;
  /** 背包持有虚空袋 4131（useVoidBag Player.cs:22892-22902）→ bank4 计入（Recipe.cs:385-388，
   *  与当前开的是否 bank4 无关的语义由 openIsBank4 表达） */
  voidBagHeld?: boolean;
  /** 当前打开容器就是 bank4（player.chest == -5）→ 虚空袋规则不再重复计入（:386 门）。
   *  SW-AV2 2026-09-06：缺省时由 openChest?.x === -5 自动派生（本仓 placed vault/透镜
   *  面板 x=-5 与原版 chest=-5 同约定），显式传值仅作覆盖 */
  openIsBank4?: boolean;
  /** 背包持有虚空vault物品 5325 → 放置的 vault 槽不计（ContainerIndexToPlayerBank :119-130） */
  voidVaultHeld?: boolean;
  /** ★SW-AZ1 2026-09-06（item4）：Player.Settings.CraftFromNearbyChests（Player.cs:355
   *  默认 true）作用域门。false = ③④ 整体旁路——附近 bank（盒/弹体）与 600px 世界箱
   *  不计；①当前开箱容器（Recipe.cs:378-381）与 ②虚空袋 bank4（:382-385）【不受此
   *  开关管】（vanilla 该开关只包住 :386-397 的两段 GetBanksInRangeOf/GetChestsInRangeOf
   *  循环——逐行核实）。缺省 true = 原版默认 */
  nearbyChestsEnabled?: boolean;
  /** ★SW-AZ1 2026-09-06（item5）：弹体容器支（GetBanksInRangeOf 弹体段 :44-58——
   *  Projectile.TryGetContainerIndex Projectile.cs:80559-80568：525 飞猪存钱罐/
   *  960 Chester → -2 = player.bank、734 虚空透镜 → -5 = player.bank4）——射程盒内
   *  的容器弹体把对应 bank 计入合成源。Game 侧算好"存活∧射程盒内∧(透镜:背包无
   *  5325)"的 bank 包装传入；与 tile 段/虚空袋支按 items 身份去重（同一 bank 数组
   *  只计一次,vanilla Contains :388/:398 同义）。入列序在 tile 盒扫描之前（vanilla
   *  弹体段先于 tile 段）;受 nearbyChestsEnabled 管辖（③族）。缺省 = 无弹体源 */
  projectileBanks?: ReadonlyArray<CraftItemSource>;
  /** bank tile 扫描源（GetBanksInRangeOf tile 段 :61-89）；缺省 = 跳过 bank 扫描 */
  store?: Pick<TileStore, 'w' | 'h' | 'inBounds' | 'idx' | 'type'>;
  /** 玩家中心 tile（GetBanksInRangeOf :42 player.Center.ToTileCoordinates()） */
  centerTileX?: number;
  centerTileY?: number;
}

/**
 * Recipe._recipeChests 组装序（Recipe.cs:378-405 CollectItemsFromChests 1:1）：
 *  ① 当前打开容器 → ② 虚空袋持有且未开 bank4 → bank4 → ③ 附近 bank tile（盒判定）
 *  → ④ 附近世界箱（600px 圈，locked/占用排除）。px/py = 玩家 position（左上角 px）。
 *  SW-AV2 2026-09-06：去重按 items 数组身份（vanilla Contains 按 Chest 对象引用
 *  Recipe.cs:390/:398；本仓开中的 bank 面板 openChest 与 banks 扫描包装是两个对象
 *  但同一 items 数组——曾按包装对象 includes 判重失手：开中的 placed bank 会在
 *  ③ 里再入列一次，同一 bank 内容计双份 → craftableCount 翻倍而扣料只扣得动一份
 *  = 校验过、实扣不足的白嫖窗口）。
 */
export function craftSourcesFor(
  chests: readonly ChestData[], px: number, py: number, opts: CraftSourcesOpts = {},
): CraftItemSource[] {
  const out: CraftItemSource[] = [];
  const push = (s: CraftItemSource | null | undefined) => {
    if (!s) return;
    if (out.some((o) => o.items === s.items)) return;   // 同一 Chest 对象=同一 items 数组
    out.push(s);
  };
  if (opts.openChest) push(opts.openChest);
  // 虚空袋门（Recipe.cs:382 `player.useVoidBag() && player.chest != -5`）：当前打开的
  // 就是 vault/bank4 面板（本仓 placed vault 491 / 透镜面板 openChest.x=-5，Game.ts
  // 储物族 :22687 bi=3 → -2-3）时不重复计入——旧 openIsBank4 恒 false 的备案推理有误
  // （vanilla 开 placed vault 同样置 chest=-5 走此门）。未显式传时按 openChest.x 派生。
  const openIsBank4 = opts.openIsBank4 ?? opts.openChest?.x === -5;
  if (opts.voidBagHeld && !openIsBank4) push(opts.banks?.[3]);
  // ★SW-AZ1（item4）：CraftFromNearbyChests=false → ③④ 整体旁路（vanilla 该开关
  // 只包住 Recipe.cs:386-397 的 bank 盒/世界箱两段;①开箱②虚空袋在其外,上面已入列）
  if (opts.nearbyChestsEnabled !== false) {
    // 弹体容器支（GetBanksInRangeOf 弹体段 :44-58,先于 tile 段——TryGetContainerIndex
    // Projectile.cs:80559-80568:525/960→bank、734→bank4；射程/5325 门由 Game 侧预筛）
    if (opts.projectileBanks) {
      for (const pb of opts.projectileBanks) push(pb);
    }
    if (opts.store && opts.centerTileX !== undefined && opts.centerTileY !== undefined) {
      for (const b of bankSourcesForCrafting(opts.store, opts.centerTileX, opts.centerTileY,
        opts.banks, CRAFT_CHEST_RANGE_PX, !!opts.voidVaultHeld)) {
        push(b);
      }
    }
    for (const c of nearbyChestsForCrafting(chests, px, py, CRAFT_CHEST_RANGE_PX, opts.openChest)) {
      push(c);
    }
  }
  return out;
}

/** 玩家持有的原版 id 计数表（含 RecipeGroup 假 id 聚合，Recipe.cs:408-415）。
 *  sources = 附近合成材料源（Recipe._recipeChests，Recipe.cs:377-405 CollectItemsFromChests
 *  → :418-431 CollectItems 箱槽在背包之后聚合；再跑假 id 聚合 :409-415） */
export function collectOwnedItems(
  inv: Inventory, sources?: readonly CraftItemSource[],
): Map<number, number> {
  const owned = new Map<number, number>();
  const add = (vid: number, n: number) => owned.set(vid, (owned.get(vid) ?? 0) + n);
  const inc = (key: string, stack: number) => {
    const def = ITEM_DEFS[inv[key as never] as unknown as number];
    void def;
  };
  void inc;
  // slots 0-57（背包+钱币+弹药）
  for (const s of inv.slots) {
    if (!s) continue;
    const def = ITEM_DEFS[s.id];
    if (!def) continue;
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    if (vid >= 0) add(vid, s.stack);
  }
  // 箱/bank 槽（CollectItems(recipeChest.item, recipeChest.maxItems)——stack>0 才计）
  if (sources) {
    for (const src of sources) {
      for (const it of src.items) {
        if (!it || it.stack <= 0) continue;
        const def = ITEM_DEFS[it.id];
        if (!def) continue;
        const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
        if (vid >= 0) add(vid, it.stack);
      }
    }
  }
  // RecipeGroup 假 id 聚合（组内所有物品持有数之和；须在箱聚合之后重算）
  for (const [gidS, items] of Object.entries(RECIPE_GROUP_ITEMS)) {
    let sum = 0;
    for (const it of items) sum += owned.get(it) ?? 0;
    if (sum > 0) add(1000000 + Number(gidS), sum);
  }
  return owned;
}

/** 材料槽 → 所属组（CreateRequiredItemQuickLookups :15043-15056：槽 id 命中本配方
 *  接受组的 ValidItems → 该槽重标记为组）。哨兵 id(≥1000000,提取器遗留)按同义处理 */
function groupOf(r: VanillaRecipe, reqId: number): number {
  if (reqId >= 1000000) return reqId - 1000000;
  for (const g of r.groups) {
    if ((RECIPE_GROUP_ITEMS[String(g)] ?? []).includes(reqId)) return g;
  }
  return -1;
}

/** 材料匹配（RequiredItemEntry.Matches Recipe.cs:35-42）：组槽 = 组内全体持有量之和
 *  （collectOwnedItems 已按假 id 聚合）——持 Boreal 木(5215)可满足 Wood 组槽 */
function itemMatches(r: VanillaRecipe, reqId: number, owned: Map<number, number>): number {
  const g = groupOf(r, reqId);
  if (g >= 0) return owned.get(1000000 + g) ?? 0;
  return owned.get(reqId) ?? 0;
}

/** 单条配方当前可合成次数（HowManyTimesCanRecipeBeCrafted Recipe.cs:289-310）；
 *  返回 0 = 材料不足 */
export function craftableCount(r: VanillaRecipe, owned: Map<number, number>): number {
  let min = Infinity;
  for (const req of r.items) {
    const have = itemMatches(r, req.id, owned);
    if (have < req.stack) return 0;
    min = Math.min(min, Math.floor(have / req.stack));
  }
  return min === Infinity ? 0 : min;
}

/** 站点 TileID → 本仓库内部 tile id（TILE_BY_KEY 反查 v_<id>_ key 不稳定，按 vanilla.sheet 扫 TILE_DEFS） */
const SHEET_TO_INTERNAL = (() => {
  const m = new Map<number, number>();
  for (let i = 0; i < TILE_DEFS.length; i++) {
    const sheet = TILE_DEFS[i]?.vanilla?.sheet;
    if (sheet !== undefined && !m.has(sheet)) m.set(sheet, i);
  }
  return m;
})();

export interface VanillaCraftCtx {
  /** 附近站点（内部 tile id 集合——Game.stationsNearby 扫描结果） */
  nearbyInternal: Set<number>;
  /** 附近有炼金台（tile 355/699 经继承算 tile 13；player.alchemyTable）——炼金配方材料 1/3 免费 */
  alchemyTable?: boolean;
  /** 附近液体：水/蜂蜜/岩浆源（adjWaterSource/adjHoney/adjLava） */
  nearWater?: boolean;
  nearHoney?: boolean;
  nearLava?: boolean;
  zoneSnow?: boolean;
  zoneGraveyard?: boolean;
  /** remix+getGood/everything 世界（Mechdusa） */
  mechdusa?: boolean;
  /** 火把神恩宠已解锁 */
  torchGod?: boolean;
}

/** 环境条件（PlayerMeetsEnvironmentConditions Recipe.cs:321-357） */
export function envOk(r: VanillaRecipe, ctx: VanillaCraftCtx): boolean {
  if (r.tile >= 0) {
    // adjTile[requiredTile]（Recipe.cs:325）的置位面 = 邻近 tile 沿 TileCountsAs 链
    // 的继承（Player.SetAdjTile Player.cs:35926-35939 对邻近 tile 递归）——判据是
    // requiredTile 的"替身集"（后裔闭包 stationSatisfierTiles），不是 requiredTile
    // 自身的上游链。曾方向反置（expandStationTiles(r.tile) 扩 [17→215]）→ 近地狱
    // 熔炉(77)/钛金熔炉(133)/玻璃窑(302) 做不了熔炉(17)配方、近秘银砧(134)做不了
    // 铁砧(16)配方、近营火(215)反而误解锁熔炉配方（2026-09 用户实报+FX36 探针定谳）
    let ok = false;
    for (const t of stationSatisfierTiles(r.tile)) {
      const internal = SHEET_TO_INTERNAL.get(t);
      if (internal !== undefined && ctx.nearbyInternal.has(internal)) {
        ok = true;
        break;
      }
    }
    if (!ok) return false;
  }
  if (r.water && !ctx.nearWater) return false;
  if (r.honey && !ctx.nearHoney) return false;
  if (r.lava && !ctx.nearLava) return false;
  if (r.snow && !ctx.zoneSnow) return false;
  if (r.graveyard && !ctx.zoneGraveyard) return false;
  if (r.mechdusa && !ctx.mechdusa) return false;
  if (r.torchGod && !ctx.torchGod) return false;
  return true;
}

/** 成品 → 本仓库 item key（vi_<id>_* 反查） */
const VID_TO_KEY = (() => {
  const m = new Map<number, string>();
  // ★方案 A（BJ264）：ITEM_DEFS 重排后稀疏——for..of 对洞产出 undefined，须 !def 跳过
  for (const def of ITEM_DEFS) {
    if (!def) continue;
    const vid = def.vid ?? (def.key.startsWith('vi_') ? parseInt(def.key.slice(3), 10) : -1);
    if (vid >= 0 && !m.has(vid)) m.set(vid, def.key);
  }
  return m;
})();

export function vanillaItemKey(vid: number): string | undefined {
  return VID_TO_KEY.get(vid);
}

/** 材料原版 id → 显示名用的本仓库 key（组内物品可能部分缺，取第一个存在的） */
export function ingredientKey(vid: number): string | undefined {
  if (vid >= 1000000) {
    const items = RECIPE_GROUP_ITEMS[String(vid - 1000000)];
    if (items) for (const it of items) {
      const k = VID_TO_KEY.get(it);
      if (k) return k;
    }
    return undefined;
  }
  return VID_TO_KEY.get(vid);
}

/** 计算可用配方索引列表（UpdateRecipeList 主干）。
 *  sources = 附近箱/bank（CraftFromNearbyChests，Player.cs:359 默认开）——
 *  箱材料计入可用性（CollectItemsToCraftWithFrom Recipe.cs:373-377） */
export function availableRecipes(
  inv: Inventory, ctx: VanillaCraftCtx, sources?: readonly CraftItemSource[],
): Array<{ r: VanillaRecipe; count: number }> {
  const owned = collectOwnedItems(inv, sources);
  const out: Array<{ r: VanillaRecipe; count: number }> = [];
  for (const r of VANILLA_RECIPES) {
    if (!envOk(r, ctx)) continue;
    const count = craftableCount(r, owned);
    if (count > 0) out.push({ r, count });
  }
  return out;
}

/** Recipe.GetAvailableItemCount（Recipe.cs:313-320）等价：某材料槽在材料源聚合
 *  持有量表（collectOwnedItems 产物,含附近箱/bank）中的可用数——组槽返回组假 id
 *  聚合值（itemMatches 同义）。UI 行内材料统计与 availableRecipes 必须同源取表
 *  （SW-AV2 2026-09-06：曾只数背包,箱内材料在行统计显示缺口且行被误置灰禁点） */
export function availableItemCountFor(r: VanillaRecipe, reqId: number, owned: Map<number, number>): number {
  return itemMatches(r, reqId, owned);
}

/** 单材料匹配（RequiredItemEntry.Matches Recipe.cs:35-42 的实例判定侧）：
 *  组槽 = 组内任一成员物品；单槽 = 精确 vanilla id。itemId = 本仓库内部 item id */
function reqMatchesItem(r: VanillaRecipe, reqId: number, itemId: number): boolean {
  const g = groupOf(r, reqId);
  if (g < 0) return invIndexOfVanilla(reqId) === itemId;
  const members = RECIPE_GROUP_ITEMS[String(g)];
  if (!members) return false;
  for (const m of members) if (invIndexOfVanilla(m) === itemId) return true;
  return false;
}

/** 跨源计数（CraftingRequests.CountMatches :206-218 + CollectItems 双源聚合）：
 *  背包 0-57 槽 + 各材料源槽，按 req 匹配求和 */
function countReqAcross(
  r: VanillaRecipe, reqId: number, inv: Inventory, sources?: readonly CraftItemSource[],
): number {
  let n = 0;
  const g = groupOf(r, reqId);
  if (g >= 0) {
    for (const m of (RECIPE_GROUP_ITEMS[String(g)] ?? [])) {
      const iid = invIndexOfVanilla(m);
      if (iid >= 0) n += inv.countOf(iid);
    }
  } else {
    const iid = invIndexOfVanilla(reqId);
    if (iid >= 0) n += inv.countOf(iid);
  }
  if (sources) {
    for (const src of sources) {
      for (const it of src.items) {
        if (!it || it.stack <= 0) continue;
        if (reqMatchesItem(r, reqId, it.id)) n += it.stack;
      }
    }
  }
  return n;
}

/** 执行合成（CraftingRequests.CraftItem 循环主干）：扣材料→返【实际合成轮数】
 *  （SW-AZ1 2026-09-06 R3：0 = 一轮都没合成,以前调用方按 false 处理）。
 *  sources = 附近箱/bank（CraftFromNearbyChests）：校验计入箱材料，扣料先背包后箱
 *  （CraftingRequests.Consume :220-235），箱内按槽序部分扣/整格清空（:242-285）。
 *
 *  ★R3 部分量语义（CraftingRequests.cs:88-110 CraftItem 1:1）：循环 qty 次、
 *  每轮【重查】CollectedEnoughItemsToCraft（_ownedItems 逐轮 SubtractOwnedItem
 *  :259-265 按 req.stack【未折扣面】递减）——料够 3 造 3（shift×10 不再"不够 10 造 0"）。
 *  i==0 无门（:93 `i <= 0 ||`——调用方 UI 行点击已保证 count>0）;i>0 门不过即停。
 *  每轮扣料前仍按实际持有量校验（countReqAcross vs 本轮折扣后需求）——R14-B2
 *  防蒸发不变量保持：校验不过整轮不扣、同 tick 校验与实扣同源计数,白嫖窗口不重开。
 *  炼金台折扣按【实际发生的每轮】独立掷（GetIngredientsForOneCraft →
 *  GetIngredientCraftingDiscount REC57:214-227 对每材料掷 stack 次 Next(3)==0）——
 *  旧"先一次性掷满 times 轮"在部分量停产时会烧掉未发生迭代的掷（随 R3 语义一并修正,
 *  掷流序备案 B9 更新：掷次数 = 实际合成轮数 × 材料数 × stack）。 */
export function consumeMaterials(
  inv: Inventory, r: VanillaRecipe, times = 1, alchemyTable = false,
  sources?: readonly CraftItemSource[],
): number {
  // 材料源聚合持有量表（Recipe._ownedItems——CollectItemsToCraftWithFrom :366-373
  // 聚一次,轮内不重collect;逐轮 SubtractOwnedItem 递减,与原版同构）
  const ownedAcc = collectOwnedItems(inv, sources);
  let crafted = 0;
  for (let k = 0; k < times; k++) {
    // ---- 轮门（k>0）：CollectedEnoughItemsToCraft（Recipe.cs:280-283 →
    // HowManyTimesCanRecipeBeCrafted :289-310 min(have/req.stack)>0）——组槽按
    // 组假 id 聚合值取数（itemMatches 同义）。ownedAcc 按【折扣后实扣面】递减
    // （SubtractOwnedItem :259-265 消费的是 GetIngredientsForOneCraft 入列的折扣
    // 副本,RequiredItemEntry=struct——★SW-RB5a 2026-09-07 纠注见下账面递减段;
    // 旧注"未折扣面/折扣省料不续命"系误读）——折扣省料留在账面可续命迭代,1:1 ----
    if (k > 0) {
      let ok = true;
      for (const req of r.items) {
        const have = itemMatches(r, req.id, ownedAcc);
        if (have < req.stack) { ok = false; break; }
      }
      if (!ok) break;
    }
    // ---- 本轮需求：折扣按本轮独立掷（CraftItem :95 GetIngredientsForOneCraft）----
    const needOf = new Map<object, number>();
    for (const req of r.items) {
      let need = req.stack;
      if (r.alchemy && alchemyTable) {
        let discounted = 0;
        for (let i = 0; i < req.stack; i++) if (Math.random() < 1 / 3) discounted++;
        need -= discounted;
      }
      needOf.set(req, Math.max(0, need));   // :206-208 stack-=discount; >0 才入列
    }
    // ---- 本轮校验（不扣）——R14-B2 防蒸发：任一材料实际持有不足 → 整轮不扣,
    // 循环终止（首轮不过 = 0 轮合成零扣减,旧行为的 false 等价面）----
    let lack = false;
    for (const req of r.items) {
      const need = needOf.get(req)!;
      if (countReqAcross(r, req.id, inv, sources) < need) { lack = true; break; }
    }
    if (lack) break;
    // ---- 本轮执行扣除（校验已过,理论不触不足;保持原折扣/组扣语义）----
    for (const req of r.items) {
      let need = needOf.get(req)!;
      // 组材料（groupOf:占位 id/哨兵 id 统一判定,ConsumeFromInventory :451 语义——
      // 组槽可扣组内任一成员,依序补足）
      const gid2 = groupOf(r, req.id);
      if (gid2 >= 0) {
        for (const g of (RECIPE_GROUP_ITEMS[String(gid2)] ?? [])) {
          if (need <= 0) break;
          const iid = invIndexOfVanilla(g);
          if (iid < 0) continue;
          const take = Math.min(inv.countOf(iid), need);
          if (take > 0) { inv.remove(iid, take); need -= take; }
        }
        // 阶段一已过,残余只可能来自折扣外并发,放行不吞
      } else {
        // 单 id 材料：扣后同步递减 need（ConsumeItemsFrom :252-275 语义）——旧代码
        // 扣背包不减 need，接附近箱扣料后会重复扣箱（2026-08-13 随箱联动修复）
        const iid = invIndexOfVanilla(req.id);
        if (iid >= 0) {
          const take = Math.min(inv.countOf(iid), need);
          inv.remove(iid, take);
          need -= take;
        }
      }
      // ---- 箱/bank 扣减（CraftingRequests.Consume :220-235：先背包后箱,
      // 背包扣净后 need≤0 本段自然空转;ConsumeItemsFrom :242-285：槽序扫,
      // stack>need 部分扣、否则整格清空,need 归零即停。组槽按 Matches 任一成员）----
      if (sources && need > 0) {
        for (const src of sources) {
          if (need <= 0) break;
          const items = src.items;
          for (let i = 0; i < items.length && need > 0; i++) {
            const it = items[i];
            if (!it || it.stack <= 0 || !reqMatchesItem(r, req.id, it.id)) continue;
            if (it.stack > need) { it.stack -= need; need = 0; }
            else { need -= it.stack; items[i] = null; }
          }
        }
      }
      // ---- 账面递减（CraftItem :108-110 SubtractOwnedItem：RequiredItemEntry 是
      // struct——GetIngredientsForOneCraft :204 `stack -= discount` 改的是
      // requiredItemQuickLookup[i] 的【副本】,入列副本随行折扣面 ⇒ SubtractOwnedItem
      // 按【折扣后实扣面】递减（★SW-RB5a 2026-09-07 纠注:旧注"按 req.stack 未折扣面"
      // 系误读 struct 拷贝语义;折扣省料留在账面,times>1 直调时可续命迭代）,
      // Max(...,0) 钳非负;组槽按组假 id 键——vanilla req.itemIdOrRecipeGroup 同键）。
      // ★只在【入列材料】上递减——GetIngredientsForOneCraft 对折扣归零的材料不入列
      // （:206-208 `stack-=discount; >0 才入列`）,账面随之不动（vanilla 同构）----
      if (needOf.get(req)! > 0) {
        const accKey = gid2 >= 0 ? 1000000 + gid2 : req.id;
        ownedAcc.set(accKey, Math.max((ownedAcc.get(accKey) ?? 0) - needOf.get(req)!, 0));
      }
    }
    crafted++;
  }
  return crafted;
}

/** CollectedEnoughItemsToCraft（Recipe.cs:275-283 → HowManyTimesCanRecipeBeCrafted
 *  :285-310）＝ 持有量表上每个材料 req 的持有量 ≥ 未折扣 req.stack。组槽按组假 id
 *  聚合值取数（itemMatches 同义）。★SW-BM1 2026-09-06（CraftItem 逐轮循环前置门
 *  CraftingRequests.cs:102 `i<=0 || (CollectedEnoughItemsToCraft && …)` 的第一腿）：
 *  与 consumeMaterials 内部 k>0 账面门同判（同 collectOwnedItems/itemMatches 机制）,
 *  每轮 fresh 重算 = 逐轮 SubtractOwnedItem 递减的等价形态（账面=实际持有量快照）。
 *  停轮先于炼金折扣掷发生 ⇒ 空轮不烧掷（掷流序 B9 备案保持） */
export function collectedEnoughForCraft(
  r: VanillaRecipe, inv: Inventory, sources?: readonly CraftItemSource[],
): boolean {
  const owned = collectOwnedItems(inv, sources);
  for (const req of r.items) {
    if (itemMatches(r, req.id, owned) < req.stack) return false;
  }
  return true;
}

/** 原版 item id → Inventory 内部 item id（缓存） */
const _iidCache = new Map<number, number>();
export function invIndexOfVanilla(vid: number): number {
  let hit = _iidCache.get(vid);
  if (hit !== undefined) return hit;
  const key = VID_TO_KEY.get(vid);
  // ITEM_DEFS 下标即内部 id——线性扫一次后缓存
  // ★方案 A（BJ264）：重排后 ITEM_DEFS 稀疏（洞=undefined）——无 !d 守卫时冷缓存
  //   首格（stable 0=空洞）即 TypeError
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
    if (!d) continue;
    const v = d.vid ?? (d.key.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (v === vid) { hit = i; break; }
  }
  hit ??= -1;
  _iidCache.set(vid, hit);
  return hit;
}

/** 供合成 UI 判定"此物品是合成材料吗"（ItemID.Sets.IsAMaterial 近似：出现在任一配方材料中） */
export const MATERIAL_VIDS = (() => {
  const s = new Set<number>();
  for (const r of VANILLA_RECIPES) for (const req of r.items) s.add(req.id);
  return s;
})();

export type VanillaRecipeLike = VanillaRecipe;
export { itemCombat };
