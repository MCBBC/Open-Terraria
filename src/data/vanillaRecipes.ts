// 原版配方数据运行时（tools/extract-recipes.mjs 从 Terarria1456 Recipe.cs 提取，3309 条：
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

/** vi_<id> key → 原版 item id 反解 */
export function vanillaIdOfItemKey(key: string): number {
  const m = key.match(/^vi_(\d+)_/);
  return m ? Number(m[1]) : -1;
}

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
   *  Player.cs:33036-33047 首入列；Game 开 bank 面板时传 {x:-2-bi, items:banks[bi]} 同源） */
  openChest?: CraftItemSource | null;
  /** 玩家 bank×4（piggy/safe/forge/void vault；null/缺省 = 无该 bank） */
  banks?: ReadonlyArray<CraftItemSource | null | undefined>;
  /** 背包持有虚空袋 4131（useVoidBag Player.cs:22892-22902）→ bank4 计入（Recipe.cs:385-388，
   *  与当前开的是否 bank4 无关的语义由 openIsBank4 表达） */
  voidBagHeld?: boolean;
  /** 当前打开容器就是 bank4（player.chest == -5）→ 虚空袋规则不再重复计入（:386 门） */
  openIsBank4?: boolean;
  /** 背包持有虚空vault物品 5325 → 放置的 vault 槽不计（ContainerIndexToPlayerBank :119-130） */
  voidVaultHeld?: boolean;
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
 */
export function craftSourcesFor(
  chests: readonly ChestData[], px: number, py: number, opts: CraftSourcesOpts = {},
): CraftItemSource[] {
  const out: CraftItemSource[] = [];
  if (opts.openChest) out.push(opts.openChest);
  if (opts.voidBagHeld && !opts.openIsBank4 && opts.banks?.[3]) out.push(opts.banks[3]);
  if (opts.store && opts.centerTileX !== undefined && opts.centerTileY !== undefined) {
    for (const b of bankSourcesForCrafting(opts.store, opts.centerTileX, opts.centerTileY,
      opts.banks, CRAFT_CHEST_RANGE_PX, !!opts.voidVaultHeld)) {
      if (!out.includes(b)) out.push(b);
    }
  }
  for (const c of nearbyChestsForCrafting(chests, px, py, CRAFT_CHEST_RANGE_PX, opts.openChest)) {
    out.push(c);
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
}

/** 环境条件（PlayerMeetsEnvironmentConditions Recipe.cs:321-357） */
export function envOk(r: VanillaRecipe, ctx: VanillaCraftCtx): boolean {
  if (r.tile >= 0) {
    const expanded = expandStationTiles(r.tile);
    // 任一等价站点在附近（adjTile[requiredTile] + CountsAs 继承）
    const ok = expanded.some((t) => {
      const internal = SHEET_TO_INTERNAL.get(t);
      return internal !== undefined && ctx.nearbyInternal.has(internal);
    });
    if (!ok) return false;
  }
  if (r.water && !ctx.nearWater) return false;
  if (r.honey && !ctx.nearHoney) return false;
  if (r.lava && !ctx.nearLava) return false;
  if (r.snow && !ctx.zoneSnow) return false;
  if (r.graveyard && !ctx.zoneGraveyard) return false;
  return true;
}

/** 成品 → 本仓库 item key（vi_<id>_* 反查） */
const VID_TO_KEY = (() => {
  const m = new Map<number, string>();
  for (const def of ITEM_DEFS) {
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

/** 执行合成（CraftingRequests.CraftLocally 主干）：扣材料→返成品 key（放置进背包由调用方）。
 *  sources = 附近箱/bank（CraftFromNearbyChests）：校验计入箱材料，扣料先背包后箱
 *  （CraftingRequests.Consume :220-235），箱内按槽序部分扣/整格清空（:242-285） */
export function consumeMaterials(
  inv: Inventory, r: VanillaRecipe, times = 1, alchemyTable = false,
  sources?: readonly CraftItemSource[],
): boolean {
  // ---- 第一阶段：可用性校验（不扣）——CraftingRequests.cs:86-102 每次迭代重查、
  // 永不过扣。旧实现"边扣边查、不足 return false 不回滚"=材料部分销毁零产出
  // （shift ×10 合成时整批蒸发,2026-08-13 修）----
  for (const req of r.items) {
    const need = req.stack * times;
    if (countReqAcross(r, req.id, inv, sources) < need) return false;
  }
  // ---- 第二阶段：执行扣除（校验已过,理论不触不足;保持原折扣/组扣语义）----
  for (const req of r.items) {
    let need = req.stack * times;
    // 炼金折扣（GetIngredientCraftingDiscount Recipe.cs:213-227：alchemy 配方且 alchemyTable
    // 时每个材料独立掷 1/3 概率该份免费——按"每份独立掷骰"逐个扣）
    if (r.alchemy && alchemyTable && times === 1) {
      let discounted = 0;
      for (let k = 0; k < need; k++) if (Math.random() < 1 / 3) discounted++;
      need -= discounted;
      if (need <= 0) continue;
    }
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
  for (let i = 0; i < ITEM_DEFS.length; i++) {
    const d = ITEM_DEFS[i];
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
