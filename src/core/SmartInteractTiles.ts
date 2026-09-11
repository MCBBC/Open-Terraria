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
//
// 【SW-RB11a 审计落刀（2026-09-10）】
//   · F1 CANDIDATE_TILE_DIMS 四处 num11 錯值（207 应 0；3×2/3×3/3×4 三组应缺省 2）
//     ——见表头注。
//   · F2 Fill 谓词重建：FILL_TARGET_TYPES 无条件 57 型 + 六条件型（SmartInteractCondCtx）
//     ——旧 DIMS.has 谓词把 14/469 误入候选,且五条件门整缺（15/497 贴靠圈/237/212
//     持物/356/663 晷冷却）。
//   · F3 高亮帧矩形修正表缺块 + 动画排除集缺员 ——见 TileHighlight.ts SW-RB11a 注。

import { TileStore } from '../world/TileStore';
import { VANILLA_RECIPES, TILE_COUNTS_AS } from '../data/vanillaRecipes';
import { TILE_DEFS } from '../data/tiles';

/**
 * ★SW-BJ61（2026-09-11）id 域归一：本文件全部谓词表（FILL_TARGET_TYPES/
 * DISABLE_SMART_INTERACT/DIMS_BY_TYPE/CAMPFIRE_TILES/switch case 组）皆按
 * 【vanilla sheet 域】照录（TileID.cs 各表/TileSmartInteractCandidateProvider 原文
 * case 号），而 store.type=【内部 id 域】（TILE_DEFS 序——643/664 与 sheet 分歧,
 * 运行时实测：internal 4=铜矿(7)/10=木块(30)/11=平台(19)/12=火把(4)/16=宝箱(21)/
 * 19=蘑菇(3)/21=高草(3)/23=雪(147)）。曾按内部 id 直配 sheet 表=候选/高亮打错物：
 * 高草(21)吃 sheet21 宝箱候选（2×2 黄框画在地面草上）、木块(10)吃 sheet10 门候选、
 * 平台(11)吃 sheet11——用户实报「未持工具时地面暗黄痕迹」（选中档 (avg,avg,avg/3)
 * 黄调×光照衰减即"暗黄"）真根因。
 * 一律先转 sheet 再查表（与渲染器 TILE_DEFS[type].vanilla.sheet 消费同式）。 */
function sheetOfStoreType(type: number): number {
  return TILE_DEFS[type]?.vanilla?.sheet ?? -1;
}

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
 * ★SW-RB11a（2026-09-10）四处錯值订正（逐 case 复核）：
 *   · 207 原文显式 `num11 = 0`（:200-204）——旧值 2 系误抄 104 块（:205-208 无 num11 行）;
 *   · 3×2 组 {14,17,26,77,86,89,114,133,217,218,237,377,469}（:214-229）、
 *     3×3 组 {106,220,228,243,247,283,300-308,355,412,499}（:230-250）、
 *     3×4 组 {101,102,463,475,597}（:273-280）原文【均不写 num11】→ 缺省 2——
 *     旧值 0 系相邻 88 块（num11=0）串行误抄。模 18h+2 vs 18h 在 frameY≥首行周期后
 *     分歧（如桌 14 style1 顶行 frameY=36：38 模=36→锚上 2 行=原版 quirk 照录；
 *     36 模=0→锚本行=偏离）。
 */
export const CANDIDATE_TILE_DIMS: ReadonlyArray<readonly [number, number, number, number]> = [
  ...[136, 144, 494].map((t) => [t, 1, 1, 0] as const),                      // :117-123
  ...[216, 338].map((t) => [t, 1, 2, 2] as const),                           // :124-128（缺省 2）
  ...[15, 497].map((t) => [t, 1, 2, 4] as const),                            // :129-134
  [10, 1, 3, 0] as const,                                                    // :135-139
  ...[388, 389].map((t) => [t, 1, 5, 2] as const),                           // :140-144（缺省 2）
  ...[16, 18, 29, 134, 387].map((t) => [t, 2, 1, 2] as const),               // :145-152（缺省 2）
  ...[21, 55, 85, 94, 96, 97, 125, 132, 172, 287, 335, 386, 411, 425, 441,
    467, 468, 573, 621, 622].map((t) => [t, 2, 2, 2] as const),              // :153-175（缺省 2）
  ...[79, 139, 510, 511].map((t) => [t, 2, 2, 0] as const),                  // :176-183
  ...[11, 356, 410, 470, 480, 509, 657, 658, 663, 720, 721, 725].map(
    (t) => [t, 2, 3, 0] as const),                                           // :184-199
  [207, 2, 4, 0] as const,                                                   // :200-204 显式 num11=0
  [104, 2, 5, 2] as const,                                                   // :205-208（缺省 2）
  [88, 3, 1, 0] as const,                                                    // :209-213
  ...[14, 17, 26, 77, 86, 89, 114, 133, 217, 218, 237, 377, 469].map(
    (t) => [t, 3, 2, 2] as const),                                           // :214-230（缺省 2）
  ...[106, 220, 228, 243, 247, 283, 300, 301, 302, 303, 304, 305, 306, 307,
    308, 355, 412, 499].map((t) => [t, 3, 3, 2] as const),                   // :231-250（缺省 2）
  ...[354, 455, 491, 733].map((t) => [t, 3, 3, 0] as const),                 // :251-258
  [487, 4, 2, 0] as const,                                                   // :259-263
  [212, 4, 3, 2] as const,                                                   // :264-267（缺省 2）
  [209, 4, 3, 0] as const,                                                   // :268-272
  ...[101, 102, 463, 475, 597].map((t) => [t, 3, 4, 2] as const),            // :273-280（缺省 2）
  [699, 4, 4, 2] as const,                                                   // :281-284（缺省 2）
  [464, 5, 4, 2] as const,                                                   // :285-288（缺省 2）
];

/** Campfires 覆盖（:332-334）：num7=3, num8=2（num11 维持缺省 2） */
export const CAMPFIRE_DIMS: Readonly<[number, number]> = [3, 2];

/**
 * FillPotentialTargetTiles 无条件 case 表（TileSmartInteractCandidateProvider.cs:385-445，
 * 57 型照录）——★SW-RB11a（2026-09-10）：旧实现用 `DIMS_BY_TYPE.has(type)` 充当候选
 * 谓词,而尺寸表含 Fill 表外型（14 桌/469 桌2 无配方站资格）→ 桌族整类被误当候选
 * 高亮（原版 Fill switch 无 14/469 case、TileUsedInRecipes 亦不含,永不入 targets）。
 * 其余尺寸表外型（16/17/18/26/77/86/94/96/101/106/114/133/134/172/217/218/220/228/
 * 243/247/283/300-308/355/412/499/622 等）靠 TileUsedInRecipes ∪ CountsAsWaterForCrafting
 * 谓词入集（recipes 数据闸门已对账）,与本表并集 ≙ 原版 Fill 语义。
 * 条件型 15/497/237/212/356/663 不在本表——见 SmartInteractCondCtx 各门。
 */
export const FILL_TARGET_TYPES: ReadonlySet<number> = new Set([
  10, 11, 21, 29, 55, 79, 85, 88, 89, 97, 102, 104, 125, 132, 136, 139, 144,
  207, 209, 216, 287, 335, 338, 354, 377, 386, 387, 388, 389, 410, 411, 425,
  441, 455, 463, 464, 467, 468, 470, 475, 480, 487, 491, 494, 509, 510, 511,
  573, 597, 621, 657, 658, 699, 720, 721, 725, 733,
]);

/** 条件型候选门（:446-477 逐支）入参——undefined 时取「无玩家/静息世界」缺省：
 *  15/497 出 40px 贴靠圈=不候选、237/212 未持钥匙物=不候选、356/663 冷却静息=候选。 */
export interface SmartInteractCondCtx {
  /** 15/497 门 IsWithinSnappngRangeToTile(i,j,40)（Player.cs:17476-17482）：
   *  dist((i×16+8,j×16+8),(Center.X, Bottom.Y−16)) ≤ 40 */
  playerCX: number;
  playerBottomY: number;
  /** 237 LihzahrdAltar 门 player.HasItem(1293=LihzahrdPowerCell)（:453-457） */
  hasLihzahrdPowerCell: boolean;
  /** 212 SnowballLauncher 门 player.HasItem(949=Snowball)（:459-463） */
  hasSnowball: boolean;
  /** 356 Sundial 门 `!Main.fastForwardTimeToDawn && (netMode==1 || sundialCooldown==0)`
   *  （:465-469,单机化=冷却 0） */
  sundialUsable: boolean;
  /** 663 Moondial 门 `!Main.fastForwardTimeToDusk && (netMode==1 || moondialCooldown==0)` */
  moondialUsable: boolean;
}

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
  cond?: SmartInteractCondCtx,
): SmartInteractTileScan {
  const out: SmartInteractTileScan = { coords: [], selected: [], winDist: null, winX: -1, winY: -1 };
  const mx = Math.floor(mouseWX / 16);
  const my = Math.floor(mouseWY / 16);

  // ---- FillPotentialTargetTiles（:359-480）★SW-RB11a：候选谓词 = Campfires ∪
  //      TileUsedInRecipes ∪ CountsAsWaterForCrafting ∪ FILL_TARGET_TYPES（无条件
  //      57 型）∪ 条件型六支（15/497 贴靠 40px、237/212 持物、356/663 晷冷却）——
  //      旧谓词 DIMS_BY_TYPE.has 会把 14/469 等表外型误入候选（见 FILL_TARGET_TYPES 注）。
  //      尺寸展开（下方逐目标 loop）仍读 DIMS_BY_TYPE——凡入 targets 的型必在尺寸表
  //      有键（原版两表同源,尺寸表 14/469 键在原版即死键）。
  const isTargetType = (type: number, tx: number, ty: number): boolean => {
    if (CAMPFIRE_TILES.has(type) || tileUsedInRecipes().has(type)
      || COUNTS_AS_WATER_FOR_CRAFTING.has(type) || FILL_TARGET_TYPES.has(type)) return true;
    switch (type) {
      case 15:
      case 497:
        if (!cond) return false;
        return Math.hypot(tx * 16 + 8 - cond.playerCX,
          ty * 16 + 8 - (cond.playerBottomY - 16)) <= 40;      // :448-451
      case 237:
        return cond?.hasLihzahrdPowerCell ?? false;             // :453-457
      case 212:
        return cond?.hasSnowball ?? false;                      // :459-463
      case 356:
        return cond?.sundialUsable ?? true;                     // :465-469
      case 663:
        return cond?.moondialUsable ?? true;                    // :471-475
      default:
        return false;
    }
  };
  const targets: Array<[number, number]> = [];
  for (let i = lx; i <= hx; i++) {
    for (let j = ly; j <= hy; j++) {
      if (!store.inBounds(i, j)) continue;
      const si = store.idx(i, j);
      if (!(store.flags[si] & 1)) continue;                       // !tile.active()
      const type = store.type[si];
      if (isTargetType(sheetOfStoreType(type), i, j)) {   // ★SW-BJ61 域归一
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
    const sheet = sheetOfStoreType(type);                           // ★SW-BJ61 域归一
    let cols: number, rows: number, extra: number;
    if (CAMPFIRE_TILES.has(sheet)) {
      [cols, rows, extra] = [CAMPFIRE_DIMS[0], CAMPFIRE_DIMS[1], 2];  // :332-334 num11 维持缺省
    } else {
      const dims = DIMS_BY_TYPE.get(sheet);
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
  return DISABLE_SMART_INTERACT.has(sheetOfStoreType(store.type[si]));   // ★SW-BJ61 域归一
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
