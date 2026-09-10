// SW-BJ54（2026-09-10）智能交互 tile 候选扫描 —— TileSmartInteractCandidateProvider.cs 1:1
//
// 【定谳】1457 原版存在「光标悬停可交互物 → 该物贴图叠加高光」渲染效果：
//   · 机制链：Player.SmartInteractLookup（Player.cs:17488-17513，每帧 :25646）→
//     SmartInteractSystem.RunQuery（SmartInteractSystem.cs:34-62）→
//     TileSmartInteractCandidateProvider.ProvideCandidate（本文件 1:1）→
//     渲染消费 TileDrawing.cs:902-904（TileID.Sets.HasOutlines 门）→
//     :4518-4529 GetTileOutlineInfo（TextureAssets.HighlightMask[type] +
//     Colors.GetSelectionGlowColor）→ :1422-1427 与本体同源矩形叠画。
//   · 触发面（PC）：智能光标模式（按住 Ctrl = cSmart 默认键 Main.cs:53271/67586；
//     cSmartCursorModeIsToggleAndNotHold=false hold 模式 :29042-29070）∧ 光标未捏物
//     （Player.cs:17497-17498 `(!ShowGamepadHints && !SmartCursorIsUsed) || !mouseItem.IsAir`
//     → 清候选整 return）。纯鼠标不按 Ctrl 无高亮——原版如此。
//   · 黄/白两态：SmartInteractTileCoordsSelected（离光标最近目标格所在的首件整件）
//     黄调 GetSelectionGlowColor(true) = (avg,avg,avg/3,avg)；其余候选件白调
//     (avg/2,avg/2,avg/2,avg)（Colors.cs:127-130）。avg=该格 Lighting.GetColor
//     RGB 均值（TileDrawing.cs:886 采 ：903 用，GetFinalLight 之前），avg>10 才画
//     （:4522-4524）。
//   · 范围门：WinCandidacy 置 Main.TileInteractionLX..HY = 扫描域(LX..HY) ±10
//     （provider Reuse :346-353 + WinCandidacy :34-42），渲染经
//     Main.InSmartCursorHighlightArea（Main.cs:4042-4052）双门
//     （范围 ∩ SmartInteractTileCoords.Contains）。本仓 coords ⊆ 域，等价。
//   · block 门：BlockBecauseYouAreOverAnImportantTile.cs:12-25 —— 光标格
//     (Player.tileTargetX/Y) 出界(!InWorld 10) 或 active ∧
//     TileID.Sets.DisableSmartInteract[type]（TileID.cs:207）→ RunQuery 整链清空。
//     ★原版此门在全部 provider 之前（NPC 支同吃）；本仓 SW-BJ1 NPC 支未做 block
//     面（债，见测试尾注）。
//   · 1458 增量核对：Terarria1458/Player.cs:17488-17512 与 1457 逐句一致（仅行号
//     漂移 17495→17497 等），TileDrawing/ObjectInteractions 域零变更。
//
// 【时序】原版每帧 SmartInteractLookup 开头 Main.ClearSmartInteract() 清全部候选
//   （Main.cs:48855-48863）；provider 优先级 PotionOfReturn→Projectile→NPC→Tile，
//   前序候选零距 break（RunQuery :47-52）→ NPC 零距胜出时 tile 支整跳（coords 空）；
//   全部跑完取 DistanceFromCursor 最小者 WinCandidacy（:56-61，等距先序者保位
//   ——NPC 在前，故 tile 胜出 ⟺ tileDist < npcDist）。
//   本仓驱动位 = Game.tickSmartInteractTiles（updateSmartCursor 同帧，NPC 支后）。

import { TileStore } from '../world/TileStore';
import { VANILLA_RECIPES, TILE_COUNTS_AS } from '../data/vanillaRecipes';

/** TileID.Sets.Campfires（TileID.cs:407）= CreateBoolSet(215) */
export const CAMPFIRE_TILES: ReadonlySet<number> = new Set([215]);

/** TileID.Sets.CountsAsWaterForCrafting（TileID.cs:281）= CreateBoolSet(172, 207) */
export const COUNTS_AS_WATER_FOR_CRAFTING: ReadonlySet<number> = new Set([172, 207]);

/** TileID.Sets.DisableSmartInteract（TileID.cs:207）
 *  = CreateBoolSet(4, 410, 480, 509, 657, 658, 720, 721, 725, 733, 395, 698, 334, 33, 455, 471, 520) */
export const DISABLE_SMART_INTERACT: ReadonlySet<number> = new Set([
  4, 410, 480, 509, 657, 658, 720, 721, 725, 733, 395, 698, 334, 33, 455, 471, 520,
]);

/**
 * provider 硬编码多格尺寸表（TileSmartInteractCandidateProvider.cs:140-330）。
 * [tileType, cols(num7 横向), rows(num8 纵向), extraOffsetY(num11 缺省 2,
 * 仅显式置位者记录)]。num9=num10=18（:135-138）。Campfires 族在表外覆盖为
 * 3×2（:332-334）。
 * ★num11 缺省=2（:139），显式 0/4 者按原值——宝箱 21 走缺省 2（frameY%38，
 * 底行 frameY=18 折回锚顶行，见测试锚）。
 */
export const CANDIDATE_TILE_DIMS: ReadonlyArray<readonly [number, number, number, number]> = [
  ...[136, 144, 494].map((t) => [t, 1, 1, 0] as const),                      // :141-149
  ...[216, 338].map((t) => [t, 1, 2, 2] as const),                           // :150-153（缺省 2）
  ...[15, 497].map((t) => [t, 1, 2, 4] as const),                            // :154-157
  [10, 1, 3, 0] as const,                                                    // :158-162
  ...[388, 389].map((t) => [t, 1, 5, 2] as const),                           // :163-166（缺省 2）
  ...[16, 18, 29, 134, 387].map((t) => [t, 2, 1, 2] as const),               // :167-171（缺省 2）
  ...[21, 55, 85, 94, 96, 97, 125, 132, 172, 287, 335, 386, 411, 425, 441,
    467, 468, 573, 621, 622].map((t) => [t, 2, 2, 2] as const),              // :172-186（缺省 2）
  ...[79, 139, 510, 511].map((t) => [t, 2, 2, 0] as const),                  // :187-191
  ...[11, 356, 410, 470, 480, 509, 657, 658, 663, 720, 721, 725].map(
    (t) => [t, 2, 3, 0] as const),                                           // :192-202
  [207, 2, 4, 2] as const,                                                   // :203-206（缺省 2）
  [104, 2, 5, 2] as const,                                                   // :207-210（缺省 2）
  [88, 3, 1, 0] as const,                                                    // :211-214
  ...[14, 17, 26, 77, 86, 89, 114, 133, 217, 218, 237, 377, 469].map(
    (t) => [t, 3, 2, 0] as const),                                           // :215-228
  ...[106, 220, 228, 243, 247, 283, 300, 301, 302, 303, 304, 305, 306, 307,
    308, 355, 412, 499].map((t) => [t, 3, 3, 0] as const),                   // :229-246
  ...[354, 455, 491, 733].map((t) => [t, 3, 3, 0] as const),                 // :247-251
  [487, 4, 2, 0] as const,                                                   // :252-255
  [212, 4, 3, 2] as const,                                                   // :256-259（缺省 2）
  [209, 4, 3, 0] as const,                                                   // :260-263
  ...[101, 102, 463, 475, 597].map((t) => [t, 3, 4, 0] as const),            // :264-269
  [699, 4, 4, 2] as const,                                                   // :270-273（缺省 2）
  [464, 5, 4, 2] as const,                                                   // :274-277（缺省 2）
];

/** Campfires 覆盖（:332-334）：num7=3, num8=2（num11 维持缺省 2） */
export const CAMPFIRE_DIMS: Readonly<[number, number]> = [3, 2];

const DIMS_BY_TYPE: ReadonlyMap<number, readonly [number, number, number]> = (() => {
  const m = new Map<number, readonly [number, number, number]>();
  for (const [t, c, r, e] of CANDIDATE_TILE_DIMS) m.set(t, [c, r, e]);
  return m;
})();

/**
 * Recipe.TileUsedInRecipes 等价集合：全配方站点 tile（Recipe.cs:16804
 * `TileUsedInRecipes[currentRecipe.requiredTile] = true`）∪ TileCountsAs 继承闭包
 * （Recipe.cs:573-601 TileUsedInRecipeInherited 深度优先）。原版逐 SetupRecipes
 * 运行时填，本仓从提取数据静态建（结果集等价——配方数据提取闸门已对账）。
 */
let _usedInRecipes: Set<number> | null = null;

export function tileUsedInRecipes(): ReadonlySet<number> {
  if (_usedInRecipes) return _usedInRecipes;
  const set = new Set<number>();
  for (const r of VANILLA_RECIPES) {
    if (r.tile >= 0) set.add(r.tile);
  }
  // TileCountsAs 继承闭包（Recipe.cs:593-601）：键 tile 视作其 countsAs 目标族
  // 成员——目标在集合内 ⇒ 键入集（沿链传递）。
  let grew = true;
  while (grew) {
    grew = false;
    for (const keyStr of Object.keys(TILE_COUNTS_AS)) {
      const key = Number(keyStr);
      const target = TILE_COUNTS_AS[keyStr];
      if (!set.has(key) && set.has(target)) {
        set.add(key);
        grew = true;
      }
    }
  }
  _usedInRecipes = set;
  return set;
}

export interface ScanTileSource {
  readonly store: TileStore;
}

export interface SmartInteractTileScan {
  /** 候选整件格全集（原版 Main.SmartInteractTileCoords，含 selected 成员） */
  coords: Array<{ x: number; y: number }>;
  /** 被选件格集（原版 Main.SmartInteractTileCoordsSelected —— 离光标最近目标格
   *  所在的首件整件；黄调消费面） */
  selected: Array<{ x: number; y: number }>;
  /** tile 支候选距离（最近目标格 16 盒 ClosestPointInRect 距；无域内候选 = null）。
   *  与 npcWinDist 比较：严格小于才胜出（NPC 先序等距保位，SmartInteractSystem.cs:56-61） */
  winDist: number | null;
  /** 胜者目标格（原版 candidate WinCandidacy → Main.SmartInteractX/Y 的 tile 值） */
  winX: number;
  winY: number;
}

/** Collision.InTileBounds（Collision.cs）——闭区间盒判定 */
function inTileBounds(x: number, y: number, lx: number, ly: number, hx: number, hy: number): boolean {
  return x >= lx && x <= hx && y >= ly && y <= hy;
}

/**
 * TileSmartInteractCandidateProvider.ProvideCandidate + ClearSelfAndPrepareForCheck
 * 1:1。参数：
 *  - store：tile 存储（type/frameX/frameY/flags bit0 active）
 *  - LX..HY：扫描域 = SmartInteractLookup_PrepareCommonlyUsedInfo（Player.cs:17514-17523）
 *    TileReachCheckSettings.Simple.GetTileRegion（玩家盒外扩 tileRangeX/Y，钳
 *    10..maxTiles-10）——调用方（Game.tileReach(0) 同源）已备。
 *  - mouseWX/WY：光标世界坐标（settings.mousevec，Player.cs:17516）
 *  - npcWinDist：NPC 支胜者距离（无候选传 +Infinity）；NPC 零距 → tile 支整跳
 *    （RunQuery :47-52 break 语义）。
 *  - fullInteraction：settings.FullInteraction（Player.cs:17506 恒 true）——
 *    全部候选整件入 coords；false 时仅被选件入（手柄专用路径，本仓不触达，参数留测）。
 */
export function scanSmartInteractTiles(
  store: TileStore,
  lx: number, ly: number, hx: number, hy: number,
  mouseWX: number, mouseWY: number,
  npcWinDist: number,
  fullInteraction = true,
): SmartInteractTileScan {
  const out: SmartInteractTileScan = { coords: [], selected: [], winDist: null, winX: -1, winY: -1 };
  const mx = Math.floor(mouseWX / 16);
  const my = Math.floor(mouseWY / 16);

  // ---- FillPotentialTargetTiles（:359-408）：候选谓词 Campfires ∪ TileUsedInRecipes
  //      ∪ CountsAsWaterForCrafting ∪ 硬编码表（DIMS_BY_TYPE 有键者）----
  const targets: Array<[number, number]> = [];
  for (let i = lx; i <= hx; i++) {
    for (let j = ly; j <= hy; j++) {
      if (!store.inBounds(i, j)) continue;
      const si = store.idx(i, j);
      if (!(store.flags[si] & 1)) continue;                       // !tile.active()
      const type = store.type[si];
      if (CAMPFIRE_TILES.has(type) || tileUsedInRecipes().has(type)
        || COUNTS_AS_WATER_FOR_CRAFTING.has(type) || DIMS_BY_TYPE.has(type)) {
        targets.push([i, j]);
      }
    }
  }

  // ---- 最近目标（:85-105）：targets 中格心距光标最小者；须仍落域内（:97）----
  let winX = -1, winY = -1;
  {
    let bestD = -1;
    let bx = 0, by = 0;
    for (const [tx, ty] of targets) {
      const dx = tx * 16 + 8 - mouseWX;
      const dy = ty * 16 + 8 - mouseWY;
      const d = Math.hypot(dx, dy);
      if (bestD === -1 || d <= bestD) {                           // :92 `num6 <= num5` 后到保位
        bestD = d;
        bx = tx; by = ty;
      }
    }
    if (targets.length > 0 && inTileBounds(bx, by, lx, ly, hx, hy)) {
      winX = bx; winY = by;
    }
  }
  if (winX === -1) return out;                                    // ProvideCandidate 返回 false

  // ---- candidate 距离 = 鼠标点到目标格 16 盒 ClosestPointInRect 距（:347-349）----
  const dxp = Math.max(winX * 16 - mouseWX, 0, mouseWX - (winX * 16 + 16));
  const dyp = Math.max(winY * 16 - mouseWY, 0, mouseWY - (winY * 16 + 16));
  const tileDist = Math.hypot(dxp, dyp);

  // ---- 逐目标整件展开（:107-341）----
  const coordKeys = new Set<string>();
  const selKeys = new Set<string>();
  let firstSelected = false;
  for (const [tx, ty] of targets) {
    const si = store.idx(tx, ty);
    const type = store.type[si];
    let cols: number, rows: number, extra: number;
    if (CAMPFIRE_TILES.has(type)) {
      [cols, rows, extra] = [CAMPFIRE_DIMS[0], CAMPFIRE_DIMS[1], 2];  // :332-334 num11 维持缺省
    } else {
      const dims = DIMS_BY_TYPE.get(type);
      if (!dims) continue;                                          // :329-331 `num7==0||num8==0` skip
      [cols, rows, extra] = dims;
    }
    // 整件锚（:325-326）：num12 = tx - frameX%(18*cols)/18；num13 = ty - frameY%(18*rows+extra)/18
    const fx = store.frameX[si];
    const fy = store.frameY[si];
    const ax = tx - ((fx % (18 * cols)) / 18);
    const ay = ty - ((fy % (18 * rows + extra)) / 18);
    // flag2 = 最近目标格落在此件整件盒内（:327）；flag3 = 鼠标点在盒内（:328）
    const flag2 = inTileBounds(winX, winY, ax, ay, ax + cols - 1, ay + rows - 1);
    const flag3 = inTileBounds(mx, my, ax, ay, ax + cols - 1, ay + rows - 1);
    if (!fullInteraction) { if (!flag3) continue; }                 // :334-336（PC 恒 true 不触达）
    const use2 = firstSelected ? false : flag2;                     // :337-339 首件保位
    for (let k = ax; k < ax + cols; k++) {
      for (let l = ay; l < ay + rows; l++) {
        const key = `${k},${l}`;
        if (coordKeys.has(key)) continue;                           // :341 !Coords.Contains
        if (use2) selKeys.add(key);                                 // :343-345
        if (use2 || fullInteraction) {                              // :346-348
          coordKeys.add(key);
          out.coords.push({ x: k, y: l });
        }
      }
    }
    if (use2) firstSelected = true;                                 // :351-353
    void flag3;
  }
  out.selected = [...selKeys].map((k) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y };
  });
  out.winDist = tileDist;
  out.winX = winX;
  out.winY = winY;
  return out;
}

/**
 * BlockBecauseYouAreOverAnImportantTile.ShouldBlockSmartInteract（:12-25）1:1：
 * 光标格出界（原版 !WorldGen.InWorld(tx,ty,10)）或 active ∧
 * DisableSmartInteract[type] → true（RunQuery 整链清空，NPC 支同吃）。
 * tile 为空格（原版 tile==null）→ true —— 空格在原版 Main.tile[x,y]==null 语义，
 * 本仓 store 恒非 null（type==0 = 空），空格不 block（active()=false 落 :22 return false）。
 */
export function shouldBlockSmartInteract(store: TileStore, tx: number, ty: number): boolean {
  const w = 10;
  if (tx < w || ty < w || tx >= store.w - w || ty >= store.h - w) return true;  // InWorld(…,10)
  const si = store.idx(tx, ty);
  if (!(store.flags[si] & 1)) return false;
  return DISABLE_SMART_INTERACT.has(store.type[si]);
}

// ---- 每帧共享帧态（renderEnv 同款模式：update 侧写、渲染侧读，零签名变更）----

/** 渲染消费帧态（TileDrawing.cs:902-904 GetTileOutlineInfo 链） */
export const smartInteractTileFrame = {
  /** tile 支是否胜出（⟺ Main.TileInteractionLX..HY 有效——InSmartCursorHighlightArea 范围门） */
  tileWon: false,
  /** 候选整件格（白调面，⊆ 扫描域） */
  coords: [] as Array<{ x: number; y: number }>,
  /** 被选件格键集 "x,y"（黄调面 = Main.SmartInteractTileCoordsSelected） */
  selected: new Set<string>(),
};

/** 每帧清空（Main.ClearSmartInteract Main.cs:48855-48863 tile 半边） */
export function clearSmartInteractTileFrame(): void {
  smartInteractTileFrame.tileWon = false;
  smartInteractTileFrame.coords = [];
  smartInteractTileFrame.selected = new Set<string>();
}
