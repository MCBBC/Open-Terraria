// 原版 1.4.5.7 经典合成网格视图 + 切换钮纯逻辑模块(SW-FX30 刀②+⑦,2026-09-11)——零 DOM,可 vitest 算术验证。
//
// 权威(1457 终值;1458 未触数值面,SetDefaults 零变更):
// - Terraria.UI/CraftingUI.cs:DrawGridToggle :267-330(帧算式/左右键支/悬停 ±15 盒)/
//   DrawRecipesGrid :446-571(网格几何/行分页/逐格交互)/ScrollCraftingGrid :575-594(滚轮档)/
//   OpenCloseFilter :146-159(站点 focus 钩 classic 支)/CraftingWindowTextTipKey :91-97(悬停名键)
// - Terraria/Main.cs:42437-42443(切换钮 @(94,450+adjY) + 就近箱钮 +40)/42449-42454
//   (PipsUseGrid ∧ InPipCrafting → DrawRecipesGrid;★列表 :42425-42428 不吃 PipsUseGrid 门
//   =网格与列表同屏,网格是拾取器非替换面)/43922-43930(!PipsUseGrid → recStart=0)/
//   17595-17633(DoScrollingInInventory 滚轮:网格矩形命中 → 每档 ScrollCraftingGrid,
//   ★网格支不清 flag → :17632 ScrollCraftingList 同拍仍走)
// - Terraria/Player.cs:33541-33547(TileInteractionsUse 尾臂:GetCraftingFilterForTile →
//   flag2 + AdjTiles + InteractWithCraftingStation)/:33555-33561(模式分派)/:33567-33587
//   (资格谓词)/:35924-35940(SetAdjTile 递归 TileCountsAs 闭包 = adjTile 语义)
// - Terraria.GameContent.UI/NewCraftingUI.cs:TileBasedRecipeFilter.GetWindowDescription
//   :101-104(CombineFormat.Crafting + 地图对象名)/CraftStationRecipeFilter.Accepts :159-170/
//   WaterSourceRecipeFilter.Accepts :180-187(11 类筛选条 :286-301 + BySearch 全部住在
//   modern 窗=分期,见 SW-FX30 报告分期表)
// - Terraria/Recipe.cs:106-116(DoesNotNeedTileOrLiquid)/:250-266(UpdateRecipeList
//   filterHack ∧ 环境 ∧ 材料三连门)
// - Terraria/Utils.cs:2901-2910(DrawSelectedCraftingBarIndicator 金标指示条)
// - Terraria/ID/TileID.cs:279(DoesNotOpenCraftingMenuOnInteract = CreateBoolSet(215, 207))
// - Terraria/Main.cs:886(OurFavoriteColor = (255,231,69))
// 坐标系 = .sw-vinv 原版 UI 逻辑空间(vanillaInvLayout 同源;sw/sh = 视口/K)。
import { TILE_COUNTS_AS, expandStationTiles, type VanillaRecipeLike } from '../data/vanillaRecipes';
import { COUNTS_AS_WATER_FOR_CRAFTING, tileUsedInRecipes } from '../core/SmartInteractTiles';

// ---- 网格几何(DrawRecipesGrid CraftingUI.cs:447-452) ----
//   num=42 格距;inventoryScale=0.75(槽 52×0.75=39 视觉);num2=340 顶;num3=310 左;
//   num4=列数=(screenWidth-310-280)/42;num5=行数=(screenHeight-340-20)/42
export const CRAFT_GRID_CELL = 42;
export const CRAFT_GRID_LEFT = 310;
export const CRAFT_GRID_TOP = 340;
export const CRAFT_GRID_RIGHT_MARGIN = 280;
export const CRAFT_GRID_BOTTOM_MARGIN = 20;
/** 网格槽视觉缩放(CraftingUI.cs:448 inventoryScale=0.75;52 底图 → 39px) */
export const CRAFT_GRID_SLOT_SCALE = 0.75;

export interface CraftGridGeometry {
  /** 列数 num4(:449) */
  cols: number;
  /** 行数 num5(:450) */
  rows: number;
  left: number;
  top: number;
  /** 整网格命中盒宽/高(Main.cs:17602-17608 Rectangle(num4,num3,num5*num2,num6*num2)) */
  w: number;
  h: number;
}

export function craftGridGeometry(sw: number, sh: number): CraftGridGeometry {
  const cols = Math.trunc((sw - CRAFT_GRID_LEFT - CRAFT_GRID_RIGHT_MARGIN) / CRAFT_GRID_CELL);
  const rows = Math.trunc((sh - CRAFT_GRID_TOP - CRAFT_GRID_BOTTOM_MARGIN) / CRAFT_GRID_CELL);
  return {
    cols, rows, left: CRAFT_GRID_LEFT, top: CRAFT_GRID_TOP,
    w: cols * CRAFT_GRID_CELL, h: rows * CRAFT_GRID_CELL,
  };
}

/** 槽位网格坐标(:544-566:num8/num9 起点 (310,340),+42 步距,满列换行) */
export function craftGridCellXY(indexInPage: number, cols: number): { x: number; y: number } {
  return { x: (indexInPage % cols) * CRAFT_GRID_CELL, y: Math.floor(indexInPage / cols) * CRAFT_GRID_CELL };
}

// ---- 上/下分页钮(:453-455 num10=310-20 / num11=340+2;下钮 num11+20 :500) ----
export function craftGridPageBtnXY(dir: 'up' | 'down'): { x: number; y: number } {
  return { x: CRAFT_GRID_LEFT - 20, y: CRAFT_GRID_TOP + 2 + (dir === 'down' ? 20 : 0) };
}

// ---- recStart 钳制三式 ----
/** 每拍绘制钳制(:461-467:recStart > avail-cols·rows → 收到 avail-cols·rows,再钳 0) */
export function clampCraftGridRecStart(recStart: number, avail: number, cols: number, rows: number): number {
  const page = cols * rows;
  let r = recStart;
  if (r > avail - page) {
    r = avail - page;
    if (r < 0) r = 0;
  }
  return r;
}

/** 上页钮(:476-481:recStart -= cols;<0 → 0) */
export function craftGridRecStartAfterUp(recStart: number, cols: number): number {
  const r = recStart - cols;
  return r < 0 ? 0 : r;
}

/** 下页钮(:508-514:recStart += cols;> avail-cols → avail-cols。★钳位目标 = avail-cols
 *  非 avail-page=原版逐字(尾页可留半空网格),音效在钳位前(:511) */
export function craftGridRecStartAfterDown(recStart: number, cols: number, avail: number): number {
  const r = recStart + cols;
  return r > avail - cols ? avail - cols : r;
}

// ---- 切换钮帧算式(DrawGridToggle :281-293) ----
//   num=2;NewCraftingUI.Visible → 4;Recipes 页 ∧ PipsUseGrid → 0(grid 后到=覆盖 modern 支);
//   num += hover.ToInt()。CraftToggle_0-5 六帧:0/1 网格态(常驻/悬停),2/3 列表态,4/5 modern 窗态。
export type CraftingGridControl = 'classic' | 'modern';

export function craftToggleFrame(modernVisible: boolean, grid: boolean, hover: boolean): number {
  let f = 2;
  if (modernVisible) f = 4;
  if (grid) f = 0;
  return f + (hover ? 1 : 0);
}

// ---- 右键循环(:322-331):Classic↔Modern 双态(无第三态) ----
export function cycleCraftingGridControl(mode: CraftingGridControl): CraftingGridControl {
  return mode === 'classic' ? 'modern' : 'classic';
}

// ---- 悬停名键(CraftingWindowTextTipKey :91-97) ----
//   Classic → GameUI.CraftingWindowClassicTip;否则 GameUI.CraftingWindowTip。
//   两键含 {InputTrigger_InteractWithTileUI} 占位符 → Lang.text 全局替换半边出键位名。
export function craftingWindowTextTipKey(mode: CraftingGridControl): string {
  return mode === 'classic' ? 'GameUI.CraftingWindowClassicTip' : 'GameUI.CraftingWindowTip';
}

// ---- 金标指示条几何(Utils.cs:2901-2910) ----
//   16 行渐变(y=craftY+16-k,k=16..1,每行 32×2,α=(1-k/16)·0.6)+ 实心 32×4 @(craftY+16)。
//   条画在钮下方(钮精灵后画覆盖其上半);色 = OurFavoriteColor(Main.cs:886 (255,231,69))。
export const CRAFT_BAR_COLOR = '255,231,69';
export function craftSelectedBarRows(): Array<{ y: number; h: number; a: number }> {
  const rows: Array<{ y: number; h: number; a: number }> = [];
  for (let k = 16; k >= 1; k--) rows.push({ y: 16 - k, h: 2, a: (1 - k / 16) * 0.6 });
  return rows;
}
/** 实心尾段(:2910 y=craftY+16,32×4,α=1) */
export const CRAFT_BAR_SOLID = { y: 16, h: 4 } as const;
/** 指示条相对切换钮 top-left 锚:条顶 = 钮心 = top + 17(钮 32×34,原版 origin=size/2 居中) */
export const CRAFT_BAR_TOP_OFF = 17;

// ---- 站点/水源 focus 钩(刀⑦ classic 支) ----
// GetCraftingFilterForTile(Player.cs:33567-33587):DoesNotOpenCraftingMenuOnInteract → null;
// TileUsedInRecipes → station;CountsAsWaterForCrafting → water;else null。
export const DOES_NOT_OPEN_CRAFTING_MENU: ReadonlySet<number> = new Set([215, 207]);   // TileID.cs:279

export type CraftingTileFilter =
  | { kind: 'station'; tile: number }
  | { kind: 'water'; tile: number };

export function craftingFilterForTile(sheet: number): CraftingTileFilter | null {
  if (DOES_NOT_OPEN_CRAFTING_MENU.has(sheet)) return null;                    // :33570-33573
  if (tileUsedInRecipes().has(sheet)) return { kind: 'station', tile: sheet };   // :33574-33579
  if (COUNTS_AS_WATER_FOR_CRAFTING.has(sheet)) return { kind: 'water', tile: sheet };   // :33580-33585
  return null;
}

// ★TileUsedInRecipes 语义定谳(2026-09-11 红蓝自审翻案):Recipe.cs:593-602
// UpdateInheritedTilesUsedInRecipes 把 TileCountsAs 继承闭包【回写】进 TileUsedInRecipes
// (SetupRecipes 流 :15153 调用)——运行时 :33574 门是【闭包折叠集】,裸 AddRecipe 置位
// (:16804)只是初始半边。故本模块直接复用 SmartInteractTiles.tileUsedInRecipes()(折叠
// 集,结果集等价):炼金台 355/699 本身无配方要求,但 countsAs→13(放置瓶)∈配方 ⇒
// 运行时门为真 ⇒ 右键炼金台开 crafting 菜单(过滤到 355,接受集 {355,13})=原版同相。

/** DoesNotNeedTileOrLiquid(Recipe.cs:106-116):requiredTile<0 ∧ !needHoney ∧ !needWater ∧ !needLava */
export function doesNotNeedTileOrLiquid(r: VanillaRecipeLike): boolean {
  if (r.tile < 0 && !r.honey && !r.water) return !r.lava;
  return false;
}

/** CraftStationRecipeFilter 接受集(:141-157 AcceptTileType 递归):station tile + TileCountsAs 链闭包 */
export function stationAcceptTypes(tile: number): ReadonlySet<number> {
  const s = new Set<number>();
  let cur: number | undefined = tile;
  for (let hop = 0; cur !== undefined && hop < 8; hop++) {
    s.add(cur);
    cur = TILE_COUNTS_AS[String(cur)];
  }
  return s;
}

/** 配方过滤判据(Recipe.cs:252 recipeFilterHack.Accepts(recipe) 消费点):
 *  station = CraftStationRecipeFilter.Accepts(:159-170);water = WaterSourceRecipeFilter
 *  .Accepts(:180-187,只认 needWater,蜜/岩浆不进)。 */
export function recipeFilterAccepts(r: VanillaRecipeLike, f: CraftingTileFilter): boolean {
  if (f.kind === 'station') {
    if (!doesNotNeedTileOrLiquid(r)) {
      if (r.tile >= 0) return stationAcceptTypes(f.tile).has(r.tile);
      return false;
    }
    return true;
  }
  if (!doesNotNeedTileOrLiquid(r)) return !!r.water;
  return true;
}

/** CanRemainOpen(NewCraftingUI.cs:120-122)= player.adjTile[tileType]——SetAdjTile
 *  (Player.cs:35924-35940)语义:近站 sheet 及其 TileCountsAs 链闭包命中 filter.tile。
 *  nearbySheets = Game.vanillaNearbyStations()(AdjTiles 全 active tile 收集,内部 id 域)
 *  经 sheetOf 映射后的原版 sheet 集。 */
export function filterRemainOpen(f: CraftingTileFilter, nearbySheets: Iterable<number>): boolean {
  for (const sheet of nearbySheets) {
    for (const t of expandStationTiles(sheet)) {
      if (t === f.tile) return true;
    }
  }
  return false;
}
