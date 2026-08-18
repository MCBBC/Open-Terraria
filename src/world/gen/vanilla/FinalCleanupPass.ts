// 原版 pass "FinalCleanup"(1456 WorldGen.cs:22304-22670)1:1 移植。
//
// ── 建议接入位(协调者接线用) ──
//   原版注册序 cs:22304(BrokenTrapCleanup cs:22283 之后,是 105 pass 的最后一个
//   全图清理);我方应在 runBrokenTrapCleanupPass 之后调用:
//     runFinalCleanupPass(store, gs);
//
// 子项处置(审计裁决「补」;编号沿用审计清单):
//   ② FillWallHolesInArea(cs:22306)+ SecretSeed surfaceIsDesert 分支(cs:22309)——
//      备案跳过(FillWallHoles 我方未实装;特殊种子分支不适用普通世界)
//   ③ 悬空落体柱生长(cs:22312-22385):{53 沙,112 邪沙,234 猩沙,224 淤泥,123 粉砂}
//      下方无实心 → 地表带向下长同类型 ≤10 格(10 格内有矿轨 314 则停),停点封底
//      (397/398/399/147/1 按类型);非地表带直接转硬化沙族
//   ④ 墙 187/216(沙岩/硬沙墙)液体 → 满岩浆(cs:22387-22392;remix/dualDungeons 种子门不适用)
//   ⑤ 137 石板?——实为 statue/陷阱类 slope/halfBrick 复位(cs:22394-22398,无 active 门)
//   ⑥ 巨石重帧+补支撑(cs:22400-22458):2×2 重帧;上方有 26 祭坛则整块替换
//      (138/664/665/711-716 → 石 0,浮空滚动仙人掌 484 → 397)
//   ⑦ 液体中棕榈 323 杀(cs:22460-22463)
//   ⑧ 地牢墙(wallDungeon 7/8/9/94-99)内液体转水、374→373、刺 56 杀+灌满水
//      (cs:22465-22477)
//   ⑨ 314 矿轨上下清液(上 15 下 1,cs:22479-22491;extraLiquid 种子门不适用)
//   ⑩ 金币堆 332 下方补 332(cs:22493-22498,先 ClearEverything)
//   ⑪ 地表散水清除(cs:22500-22510:非满液且左右下邻皆非满液、邻格非云族)
//   ⑫ 无墙画作继承邻墙(cs:22512-22543,继承序:左→右→上→下)
//   ⑭ DirtiestBlock 彩蛋(cs:22546-22587,XXX 批 2026-08-18 补)——数量 GetWorldSize
//      档 3/6/9(尺寸敏感!曾备案跳过=中/大世界各缺 6/9 格 668),每迭代 2 掷
//      [50,w-50)×[50,h-200) 拒绝采样,命中 TileID.Sets.Dirt={0,668} 活性格即替换
//      (ClearTile=ClearSlope+active(false)+inActive(false) → active(true)+type=668,
//      帧/墙/液体不动)。
//   循环末尾的 TileFrame(i,j)(cs:22544)——ZZZ 批 2026-08-18 落地(生成期 1:1:
//   掷耗+击杀写侧+苔藓帧重写;实现与掷门全表见文件后部注释块)
//
// ① Main.tileSolid[484]=false(cs:22305)——本 pass 全程生效;原版不在此还原
//   (Main.tileSolid 随读档重置),故 ③ 的 SolidTile 与 ⑥ 后的类型判断都要用覆写表。
//
// ③-⑫ 零掷骰(确定性写格);⑭ 每 `3000-剩余` 迭代 2 掷(rng 缺省跳过=旧行为)。
import type { TileStore } from '../../TileStore';
import { LIQUID_TYPE } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { flipGenSolid } from './GenSolid';
import { checkStalactite } from './ShimmerPass';

/** sheet(=原版 tile id)→ 内部 id;未实装时 0(空格)安全退化 */
const SHEET_TO_INTERNAL = new Map<number, number>();
for (const d of TILE_DEFS) {
  const vs = d.vanilla?.sheet;
  if (vs !== undefined && !SHEET_TO_INTERNAL.has(vs)) SHEET_TO_INTERNAL.set(vs, TILE_BY_KEY[d.key]);
}
const sid = (sheet: number): number => SHEET_TO_INTERNAL.get(sheet) ?? 0;

/** ③ 落体族 → 封底/转化类型(53→397,112→398,234→399,224→147,123→1) */
const SAND_FALL_BASE = new Map<number, number>([
  [sid(53), sid(397)],
  [sid(112), sid(398)],
  [sid(234), sid(399)],
  [sid(224), sid(147)],
  [sid(123), sid(1)],
]);
/** TileID.Sets.Boulders(1456 TileID.cs:195) */
const BOULDERS = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
/** TileID.Sets.Clouds(1456 TileID.cs:197) */
const CLOUDS = idsByVanillaSheet(189, 196, 460, 717, 718, 719);
/** TileID.Sets.Paintings(1456 TileID.cs:187) */
const PAINTINGS = idsByVanillaSheet(245, 246, 240, 241, 242);
/** Main.wallDungeon(Main.cs:10507-10515) */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);

const ROLLING_CACTUS = sid(484);
const TRACK = sid(314);
const PALM_TREE = sid(323);
const COIN_PILE = sid(332);
const SPIKE = sid(56);
const LAVA_DRIP = sid(374);
const WATER_DRIP = sid(373);
const DEMON_ALTAR = sid(26);
const TRAP_137 = sid(137);

/** Main.tileSolid[t](含 ① 的 484=false 覆写) */
function tileSolidT(t: number): boolean {
  if (t === ROLLING_CACTUS) return false; // ① 覆写(cs:22305)
  return !!TILE_DEFS[t]?.solid;
}

/** WorldGen.SolidTile(cs:42370):active && tileSolid && !tileSolidTop && !halfBrick && slope==0 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && tileSolidT(st.type[i]) && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 生成期 KillTile(cs:63559,生成期 noItem=true):仅清活性/类型,保留液体
 *  ——ZZZ 批已被 killTileGen（含尾部 SquareTileFrame 级联）全面取代 */

/** slope(0)+halfBrick(false)(原版两连写,如 cs:22320-22321) */
function flatten(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.slope[i] = 0;
  st.half[i] = 0;
}

/** Tile.ClearEverything(Tile.cs:140-151):type/wall/liquid/headers/帧全清 */
function clearEverything(st: TileStore, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  st.setTileSilent(x, y, 0);
  st.wall[i] = 0;
  st.liquid[i] = 0;
  st.liquidType[i] = LIQUID_TYPE.NONE;
  st.wire[i] = 0;
}

/** oceanDepths(cs:10978-10989):y 超过海洋层直接 false;横向上进沙滩带返回 true */
function oceanDepths(st: TileStore, gs: GenState, x: number, y: number): boolean {
  if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
  return x < gs.beachDistance || x > st.w - gs.beachDistance;
}

// ============================================================
// TileFrame 全图扫掷仿真 + 写侧（ZZZ 批 2026-08-18，cs:22544 逐格）
// ============================================================
// 原版 FinalCleanup 主循环每格末尾无条件 TileFrame(i,j)（cs:22544）——生成期
// （generatingWorld=true）语义：越界余量 5 早退；!active 清 half/slope 早退；
// frameImportant 族走 TileFrameImportant（cs:85703），非实心非 frameImportant 走
// CheckCactus/CheckVines，TileFrameCosmetic 不跑（!generatingWorld 门）。
// 掷骰族全表（TileFrameImportant 体内仅 3 处 + 可达 helper）：
//   ① 184 苔藓芽（cs:85916）：每格**无条件** 1×Next(3)（num20 先掷后判——被杀/
//      带内不写的情形同样耗掷）；
//   ② 72 蘑菇帽（cs:86600）：下∈{72,70} 且上≠72 且 frameX==0 → 1×Next(3)；
//   ③ 178 宝石籽（cs:85872）：仅 resetFrame=true（KillTile 九宫中心）才掷——
//      本扫 KillTile 目标恒非 178，永不触发；
//   ④ 571 竹（CheckBamboo cs:58508/58515/58522）：帧出带 1×Next(a,b)；
//   ⑤ 549 海藻（CheckUnderwaterPlant cs:58619/58629）：帧出带 1×Next(a,b)；
//   ⑥ 165 钟乳石（CheckStalactite→UpdateStalagtiteStyle cs:38690）：样式失配
//      1×Next(3)（支撑已失的击杀路径短路不掷）；
//   ⑦ KillTile 尾部 SquareTileFrame（cs:63953）级联重访——邻格 184 每访再掷。
// KillTile（cs:63559）生成期（isGeneratingOrLoadingWorld→noItem=true）：无掉落
//   （Item.NewItem 系 Main.rand 不耗 genRand）；type51+wall62 掷（cs:63904）与
//   481-483 裂砖链 8 掷（cs:63877）的门=被杀格类型，本扫 KillTile 目标族
//   （184/165/植物/藤/187 族/240/28/72/571/549/518/519/56/323/136/129/149/529）
//   均不命中；getGoodWorld/remix 门不适用；TruncatesWalls={54,328,459,748}∩杀族=∅。
// 未移植族（零掷+本种子金标零击杀证据；帧重写对 8 通道对拍不可见）：
//   5/583-589/596/616/634 树族、323 棕榈（CheckPalmTree）、火把、门 10/11、
//   矿轨 314、CheckDye 227、CheckOrb 12/31/639/696、CheckGnome 567、
//   CheckRockGolemHead 579、693/694、235、442、128/269、91、35/139、386-389、
//   92/93/453、Check2x2 族、172/360/505-527、27、171、376/443/444、630/631、723/724。

/** 内部 id → 原版 sheet（沿用 SurfaceDecorPasses 口径） */
const SWEEP_SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
const REV_SHEET_ID = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') {
    SWEEP_SHEET[i] = s;
    if (!REV_SHEET_ID.has(s)) REV_SHEET_ID.set(s, i);
  }
}

/** TileID.Sets.Conversion.Moss（TileID.cs:38，→ 石 1，ShimmerCleanUp 用） */
const CONV_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
/** GetTileMossColor（cs:81954）：苔藓 sheet → 色号（case 184 的 frameX=22*色号） */
const MOSS_COLOR: Record<number, number> = {
  179: 0, 512: 0, 180: 1, 513: 1, 181: 2, 514: 2, 182: 3, 515: 3, 183: 4, 516: 4,
  381: 5, 517: 5, 534: 6, 535: 6, 536: 7, 537: 7, 539: 8, 540: 8, 625: 9, 626: 9, 627: 10, 628: 10,
};
/** TileID.Sets.IsVine（:237） */
const IS_VINE = new Set([52, 382, 62, 115, 205, 528, 636, 638]);
/** TileID.Sets.Platforms */
const PLATFORMS = new Set([19, 427, 435, 436, 437, 438, 439]);
/** Main.tileTable（Main.cs:6828-6903 全量 76 id） */
const TILE_TABLE = new Set([
  280, 275, 276, 277, 278, 279, 281, 605, 604, 603, 602, 601, 599, 600, 612, 611, 610, 609,
  608, 606, 607, 558, 554, 553, 551, 550, 542, 413, 309, 297, 296, 645, 643, 644, 632, 640,
  559, 414, 359, 358, 285, 286, 582, 555, 538, 533, 532, 394, 393, 392, 391, 339, 310, 299,
  298, 629, 619, 556, 544, 364, 363, 362, 361, 710, 376, 380, 14, 469, 18, 19, 114, 101, 87,
  88, 405, 427,
]);
/** Main.tileNoAttach（Main.cs 全量 59 id）——AnchorValid(SolidTile) 用 */
const NO_ATTACH = new Set([
  568, 569, 570, 580, 620, 572, 564, 565, 593, 594, 590, 595, 615, 110, 3, 4, 10, 50, 707,
  20, 19, 13, 14, 469, 486, 488, 704, 487, 489, 490, 15, 497, 16, 134, 17, 18, 21, 467, 441,
  468, 27, 114, 86, 87, 88, 89, 90, 101, 102, 94, 95, 96, 97, 98, 99, 91, 92, 93, 387, 388,
  427, 390,
]);
/** TileID.Sets.IsADripTile（:157） */
const IS_DRIP = new Set([373, 374, 375, 461, 709]);
/** Check3x2 平台顶支族（cs:49234） */
const C3X2_PLATFORM = new Set([285, 286, 298, 299, 310, 339, 538, 532, 544, 533, 555, 556, 582, 619, 629, 361, 362, 363, 364]);
/** Check3x2 全 case 族（cs:86713 组） */
const C3X2_TYPES = new Set([14, 17, 26, 77, 86, 87, 88, 89, 114, 133, 186, 187, 215, 217, 218, 237, 244, 285, 286, 298, 299, 310, 339, 361, 362, 363, 364, 377, 469, 532, 533, 538, 544, 555, 556, 582, 619, 629]);
/** 植物族（PlantCheck，cs:85971） */
const PLANTS = new Set([3, 24, 61, 71, 73, 74, 110, 113, 201, 637, 703]);
/** PlantCheck 合法地基（cs:81421） */
function plantBadMatch(down: number, type: number): boolean {
  if ((type !== 3 || down === 2 || down === 477 || down === 78 || down === 380 || down === 579)
    && (type !== 73 || down === 2 || down === 477 || down === 78 || down === 380 || down === 579)
    && (type !== 24 || down === 23 || down === 661)
    && (type !== 61 || down === 60 || down === 226)
    && (type !== 74 || down === 60 || down === 226)
    && (type !== 71 || down === 70)
    && (type !== 110 || down === 109 || down === 492)
    && (type !== 113 || down === 109 || down === 492)
    && (type !== 201 || down === 199 || down === 662)) {
    if (type === 637) return down !== 633;
    return false;
  }
  return true;
}
/** PlantCheck_TryGetNewType（cs:81334-81418）：按地基换型+帧折叠 */
function plantNewType(sheet: number, down: number, fx: number): { type: number; fx: number } {
  let type = sheet, nfx = fx;
  if ((type === 3 || type === 110 || type === 24)) { /* isMushroom 判定仅重帧 */ }
  if ((type === 3 || type === 73) && down !== 2 && down !== 477 && nfx >= 162) nfx = 126;
  if (type === 74 && down !== 60 && down !== 226 && nfx >= 162) nfx = 126;
  switch (down) {
    case 23: case 661: type = 24; if (nfx >= 162) nfx = 126; break;
    case 2: case 477: type = type === 113 ? 73 : 3; break;
    case 109: case 492: type = type === 73 ? 113 : 110; break;
    case 199: case 662: type = 201; break;
    case 60: case 226: type = 61; while (nfx > 126) nfx -= 126; break;
    case 70: type = 71; while (nfx > 72) nfx -= 72; break;
  }
  return { type, fx: nfx };
}

/** 扫描上下文：destroyObject 原版全局位（各 Check 首查尾清）；
 *  frameSparse=true（仅 _wwwrep 对拍探针用）：跳过击杀谓词读帧的族——
 *  探针基座的 frames 边界只覆盖 JS 管线写过的格（165 族 32%/陶罐 55%），
 *  金标基座上这些族缺帧 → 完整性/样式门必然误杀。生产管线（WorldGen.ts）
 *  恒 false（分布式帧完整）。 */
interface SweepCtx { rng: RNG | undefined; destroyObject: boolean; frameSparse: boolean; stats?: ZzzStats }
/** ZZZ 开发统计钩子（探针用;生产恒缺省） */
export interface ZzzStats {
  roll184: number; mossKilled: number; mossVisited: number;
  kills184Other: number; kills165: number; killsPlant: number; killsVine: number;
  killsC3x2: number; killsPot: number; killsPaint: number; kills485: number;
  killsOther: number; rolls165: number; rollsOther: number;
}

const sheetAt2 = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  return SWEEP_SHEET[st.type[st.idx(x, y)]];
};
const activeAt2 = (st: TileStore, x: number, y: number): boolean =>
  st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
/** nactive = active && !inActive（本仓 inActive 位在 wire>>5） */
const nactiveAt = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return st.flags[i] !== 0 && (st.wire[i] & 32) === 0;
};
const slopeOf = (st: TileStore, x: number, y: number): number =>
  st.inBounds(x, y) ? st.slope[st.idx(x, y)] : 0;
const halfOf = (st: TileStore, x: number, y: number): boolean => {
  if (!st.inBounds(x, y)) return false;
  return st.half[st.idx(x, y)] !== 0;
};
/** PlatformProperTopFrame（cs:70205）：fx/18 ∈ [0,7]∪[12,16]∪[25,26] */
const platformProperTop = (fx: number): boolean => {
  const n = Math.floor(fx / 18);
  return (n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26);
};
/** SolidTileAllowBottomSlope（cs:70211）：active&&(solid||solidTop)&&(!顶坡||平台正帧)&&!half&&!inActive */
function solidAllowBottom(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !(d.solid || d.platform)) return false;
  const sl = st.slope[i];
  const sh = SWEEP_SHEET[st.type[i]];
  const topSlope = sl === 1 || sl === 2;
  if (topSlope && !(PLATFORMS.has(sh) && platformProperTop(st.frameX[i]!))) return false;
  return !st.half[i];
}
/** SolidTileAllowTopSlope（cs:70325） */
function solidAllowTop(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !(d.solid || SWEEP_SHEET[st.type[i]] === 380)) return false;
  const sh = SWEEP_SHEET[st.type[i]];
  const plat = PLATFORMS.has(sh);
  const bottomSlope = st.slope[i] === 3 || st.slope[i] === 4;
  return (!plat && !bottomSlope) || (plat && st.half[i] !== 0);
}
/** SolidTileAllowLeftSlope（cs:70345）/ RightSlope（cs:70365） */
function solidAllowSide(st: TileStore, x: number, y: number, side: 'L' | 'R'): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !d.solid || st.half[i]) return false;
  if (PLATFORMS.has(SWEEP_SHEET[st.type[i]])) return false;
  const sl = st.slope[i];
  return side === 'L' ? sl !== 2 : sl !== 1;
}
/** SolidTile2（cs:70178）：active && solid && slope==0 && !half && !inActive */
function solid2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  return !!d && !!d.solid && st.slope[i] === 0 && !st.half[i];
}
/** InvalidTileForPilesOrSpeleothems（cs:39005）＝Boulders 族 */
const BOULDER_SHEETS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
const invalidForPiles = (st: TileStore, x: number, y: number): boolean =>
  activeAt2(st, x, y) && BOULDER_SHEETS.has(sheetAt2(st, x, y));
/** AnchorValid(SolidTile)（cs:51866）：nactive && solid && !solidTop && !noAttach && 块型 0 */
function anchorSolidTile(st: TileStore, x: number, y: number): boolean {
  if (!nactiveAt(st, x, y)) return false;
  const sh = sheetAt2(st, x, y);
  if (sh < 0) return false;
  const d = TILE_DEFS[st.type[st.idx(x, y)]];
  if (!d || !d.solid || d.platform || NO_ATTACH.has(sh)) return false;
  return slopeOf(st, x, y) === 0 && !halfOf(st, x, y);
}

/** KillTile 生成期语义（cs:63559 + 尾部 SquareTileFrame cs:63953） */
function killTileGen(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  st.setTileSilent(x, y, 0);          // active=false+half=false+type=0（帧 -1 不可表达）
  squareTileFrame(st, ctx, x, y);
}
/** SquareTileFrame（cs:80924）：九宫列主序，中心 resetFrame=true（178 掷门，永不中） */
function squareTileFrame(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  tileFrameGen(st, ctx, x - 1, y - 1, false);
  tileFrameGen(st, ctx, x - 1, y, false);
  tileFrameGen(st, ctx, x - 1, y + 1, false);
  tileFrameGen(st, ctx, x, y - 1, false);
  tileFrameGen(st, ctx, x, y, true);
  tileFrameGen(st, ctx, x, y + 1, false);
  tileFrameGen(st, ctx, x + 1, y - 1, false);
  tileFrameGen(st, ctx, x + 1, y, false);
  tileFrameGen(st, ctx, x + 1, y + 1, false);
}
const roll3 = (ctx: SweepCtx): number => {
  if (ctx.stats) ctx.stats.roll184++;
  return ctx.rng ? ctx.rng.int(0, 2) : 0;
};
const rollRange = (ctx: SweepCtx, min: number, maxIncl: number): number => {
  if (ctx.stats) ctx.stats.rollsOther++;
  return ctx.rng ? ctx.rng.int(min, maxIncl) : min;
};

/** TileFrame 生成期（cs:82067） */
function tileFrameGen(st: TileStore, ctx: SweepCtx, x: number, y: number, _reset: boolean): void {
  // 边距 5 早退（cs:82070）；!active 清 half/slope 早退（cs:82078-82082）
  if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) { st.half[i] = 0; st.slope[i] = 0; return; }
  const sheet = SWEEP_SHEET[st.type[i]];
  if (sheet < 0) return;
  if (frameImportantDispatch(st, ctx, x, y, sheet)) return;
  // 非实心非 frameImportant：仙人掌 / 藤（cs:82102-82117）
  const d = TILE_DEFS[st.type[i]];
  if (!d?.solid) {
    if (sheet === 80) { if (checkCactusSweep(st, ctx, x, y)) return; }
    else if (IS_VINE.has(sheet)) { checkVinesSweep(st, ctx, x, y, sheet); return; }
  }
}

/** TileFrameImportant 分派（cs:85703+）——返回 true=已处理（含 no-op 族） */
function frameImportantDispatch(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): boolean {
  // frameSparse 模式跳过的读帧族（165/185/28/240族/485/72/C3X2 族——见 SweepCtx 注释）
  if (ctx.frameSparse && (
    sheet === 165 || sheet === 185 || sheet === 28 || sheet === 653 || sheet === 240
    || sheet === 440 || sheet === 485 || sheet === 72 || C3X2_TYPES.has(sheet))) {
    return true;
  }
  switch (sheet) {
    case 518: checkLilyPadSweep(st, ctx, x, y); return true;
    case 519: checkCatTailSweep(st, ctx, x, y); return true;
    case 549: checkSeaweedSweep(st, ctx, x, y); return true;
    case 571: checkBambooSweep(st, ctx, x, y); return true;
    case 72: frame72Sweep(st, ctx, x, y); return true;
    case 184: frame184Sweep(st, ctx, x, y); return true;
    case 165:
      // ShimmerPass 1:1（UpdateStalagtiteStyle 掷+杀）；reframe 钩子改走本扫全分派
      // （击杀级联的邻格 184 等须掷骰重查——彼时 165-only 的 frame165 不再等价）
      if (ctx.rng) {
        checkStalactite(st, ctx.rng, x, y, (s2, _r, xx, yy) => tileFrameGen(s2, ctx, xx, yy, false));
      }
      return true;
    case 3: case 24: case 61: case 71: case 73: case 74:
    case 110: case 113: case 201: case 637: case 703:
      plantCheckSweep(st, ctx, x, y, sheet); return true;
    case 13: case 33: case 49: case 50: case 78: case 174: case 372: case 646: case 707:
      checkOnTableSweep(st, ctx, x, y, sheet); return true;
    case 185: checkPileSweep(st, ctx, x, y); return true;
    case 28: case 653: checkPotSweep(st, ctx, x, y, sheet); return true;
    case 240: case 440: check3x3WallSweep(st, ctx, x, y); return true;
    case 485: checkSuper485Sweep(st, ctx, x, y); return true;
    case 136: frame136Sweep(st, ctx, x, y); return true;
    case 129: case 149: frame129Sweep(st, ctx, x, y); return true;
    case 529: frame529Sweep(st, ctx, x, y); return true;
    case 81: frame81Sweep(st, ctx, x, y); return true;
    case 324:
      if (!solidAllowBottom(st, x, y + 1) || invalidForPiles(st, x, y + 1)) killTileGen(st, ctx, x, y);
      return true;
    case 373: case 374: case 375: case 461: case 709: {   // IsADripTile（cs:85750）
      const up = st.idx(x, y - 1);
      if (!st.flags[up] || slopeOf(st, x, y - 1) === 3 || slopeOf(st, x, y - 1) === 4
        || !TILE_DEFS[st.type[up]]?.solid || TILE_DEFS[st.type[up]]?.platform) {
        killTileGen(st, ctx, x, y);
      }
      return true;
    }
    default:
      if (C3X2_TYPES.has(sheet)) { check3x2Sweep(st, ctx, x, y, sheet); return true; }
      return false;   // 未移植族（见文件头清单）——非 frameImportant 路径由此回落
  }
}

/** case 184（cs:85888-85952）：★num20 无条件掷 → 四向首个苔藓邻格定色定向 */
function frame184Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  if (ctx.stats) ctx.stats.mossVisited++;
  const num20 = roll3(ctx) * 18;                                 // 先掷（cs:85916）
  const side = (dx: number, dy: number): number => {
    if (!st.inBounds(x + dx, y + dy)) return -1;
    const k = st.idx(x + dx, y + dy);
    if (!st.flags[k]) return -1;
    if (dy === -1 && (slopeOf(st, x, y - 1) === 3 || slopeOf(st, x, y - 1) === 4)) return -1; // bottomSlope
    if (dy === 1 && (st.half[k] || slopeOf(st, x, y + 1) === 1 || slopeOf(st, x, y + 1) === 2)) return -1;
    return SWEEP_SHEET[st.type[k]];
  };
  const below = side(0, 1), above = side(0, -1), leftS = side(-1, 0), rightS = side(1, 0);
  const apply = (src: number, lo: number, hi: number, base: number): boolean => {
    const color = MOSS_COLOR[src];
    if (color === undefined) return false;
    st.frameX[i] = 22 * color;
    if (st.frameY[i]! < lo || st.frameY[i]! > hi) st.frameY[i] = base + num20;
    return true;
  };
  if (!(apply(below, 0, 36, 0) || apply(above, 54, 90, 54)
    || apply(leftS, 108, 144, 108) || apply(rightS, 162, 198, 162))) {
    if (ctx.stats) ctx.stats.mossKilled++;
    killTileGen(st, ctx, x, y);                                  // 无苔藓邻格 → 杀
  }
}

/** case 72（cs:86598-86620）：下非 {72,70} 杀；上≠72 且 frameX==0 掷帧 */
function frame72Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  const above = activeAt2(st, x, y - 1) ? sheetAt2(st, x, y - 1) : -1;
  const below = activeAt2(st, x, y + 1) ? sheetAt2(st, x, y + 1) : -1;
  if (below !== 72 && below !== 70) { killTileGen(st, ctx, x, y); return; }
  if (above !== 72 && st.frameX[i] === 0) {
    const n = roll3(ctx);                                        // cs:86600
    st.frameX[i] = 18;
    st.frameY[i] = n === 0 ? 0 : n === 1 ? 18 : 36;
  }
}

/** case 136（cs:85738-85803）：下实心(平/底坡)→0 / 左实心(左坡/平/梁/树干簇)→18 /
 *  右→36 / 墙→54 / 杀 */
const IS_BEAM = new Set([124, 561, 574, 575, 576, 577, 578]);          // TileID.Sets.IsBeam（:239）
const IS_TREE_TRUNK = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);  // :161
function frame136Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  const typeOf = (xx: number, yy: number): number => {
    const n = nactiveAt(st, xx, yy) ? sheetAt2(st, xx, yy) : -1;
    return n;
  };
  const below = typeOf(x, y + 1);          // 下（!half&&!顶坡 才取型）
  if (below >= 0 && st.half[st.idx(x, y + 1)]) { /* nactive 取型已含 !topSlope */ }
  const leftT = typeOf(x - 1, y), rightT = typeOf(x + 1, y);
  const solidAt = (sh: number): boolean => {
    const id = REV_SHEET_ID.get(sh);
    return id !== undefined && !!TILE_DEFS[id]?.solid && !NO_ATTACH.has(sh);
  };
  const centerOk = below >= 0 && solidAt(below) && !st.half[st.idx(x, y + 1)]
    && (slopeOf(st, x, y + 1) === 0 || slopeOf(st, x, y + 1) === 3 || slopeOf(st, x, y + 1) === 4);
  const leftOk = (leftT >= 0 && solidAt(leftT) && (slopeOf(st, x - 1, y) === 1 || slopeOf(st, x - 1, y) === 0)
    && !st.half[st.idx(x - 1, y)])
    || (leftT >= 0 && IS_BEAM.has(leftT))
    || (IS_TREE_TRUNK.has(leftT) && IS_TREE_TRUNK.has(typeOf(x - 1, y - 1)) && IS_TREE_TRUNK.has(typeOf(x - 1, y + 1)));
  const rightOk = (rightT >= 0 && solidAt(rightT) && (slopeOf(st, x + 1, y) === 2 || slopeOf(st, x + 1, y) === 0)
    && !st.half[st.idx(x + 1, y)])
    || (rightT >= 0 && IS_BEAM.has(rightT))
    || (IS_TREE_TRUNK.has(rightT) && IS_TREE_TRUNK.has(typeOf(x + 1, y - 1)) && IS_TREE_TRUNK.has(typeOf(x + 1, y + 1)));
  if (centerOk) st.frameX[i] = 0;
  else if (leftOk) st.frameX[i] = 18;
  else if (rightOk) st.frameX[i] = 36;
  else if (st.wall[i] > 0) st.frameX[i] = 54;
  else killTileGen(st, ctx, x, y);
}

/** case 129/149（cs:85727-85752）：CheckAndAdjustMultiDirectionalTile（cs:60338）失败杀 */
function frame129Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!(x >= 2 && y >= 2 && x < st.w - 2 && y < st.h - 2)) { killTileGen(st, ctx, x, y); return; }
  const valid = (xx: number, yy: number, dir: number): number => {
    if (!st.inBounds(xx, yy)) return -1;
    const ki = st.idx(xx, yy);
    const sh = SWEEP_SHEET[st.type[ki]];
    if (sh < 0 || BOULDER_SHEETS.has(sh) || sh === 10) return -1;
    if (dir === 0 && !solidAllowTop(st, xx, yy)) return -1;
    if (dir === 1 && !solidAllowBottom(st, xx, yy)) return -1;
    if (dir === 2 && !solidAllowSide(st, xx, yy, 'L')) return -1;
    if (dir === 3 && !solidAllowSide(st, xx, yy, 'R')) return -1;
    return sh;
  };
  const up = valid(x, y - 1, 0), below = valid(x, y + 1, 1);
  const leftT = valid(x - 1, y, 2), rightT = valid(x + 1, y, 3);
  const solidNS = (sh: number): boolean => {
    const id = REV_SHEET_ID.get(sh);
    return id !== undefined && !!TILE_DEFS[id]?.solid && !TILE_DEFS[id]?.platform;
  };
  const ok = (below >= 0 && solidNS(below)) || (leftT >= 0 && solidNS(leftT))
    || (rightT >= 0 && solidNS(rightT)) || (up >= 0 && solidNS(up));
  if (!ok) killTileGen(st, ctx, x, y);
}

/** case 529（cs:85954-85970）：下须实心底坡容许且沙族，否则杀 */
function frame529Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!solidAllowBottom(st, x, y + 1)) { killTileGen(st, ctx, x, y); return; }
  const g = activeAt2(st, x, y + 1) ? sheetAt2(st, x, y + 1) : -1;
  if (g < 0 || !(g === 53 || g === 112 || g === 116 || g === 234)) killTileGen(st, ctx, x, y);
}

/** case 81（cs:85753-85780）：上格活→杀；下非实心/半砖/顶坡→杀（仅判杀） */
function frame81Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (activeAt2(st, x, y - 1)) { killTileGen(st, ctx, x, y); return; }
  const below = activeAt2(st, x, y + 1) ? sheetAt2(st, x, y + 1) : -1;
  const id = below >= 0 ? REV_SHEET_ID.get(below) : undefined;
  const solidBelow = id !== undefined && !!TILE_DEFS[id]?.solid;
  if (below < 0 || !solidBelow || halfOf(st, x, y + 1)
    || (slopeOf(st, x, y + 1) === 1 || slopeOf(st, x, y + 1) === 2)) {
    killTileGen(st, ctx, x, y);
  }
}

/** PlantCheck（cs:81280-81313）：地基失配→换型或杀（含 destroyObject 置位复位） */
function plantCheckSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  x = Math.max(1, Math.min(st.w - 2, x));
  y = Math.max(1, Math.min(st.h - 2, y));
  let down = -1;
  if (y + 1 < st.h && nactiveAt(st, x, y + 1) && !halfOf(st, x, y + 1)
    && slopeOf(st, x, y + 1) === 0) down = sheetAt2(st, x, y + 1);
  if (sheet === 703) {
    if (!solidAllowBottom(st, x, y + 1)) {
      ctx.destroyObject = true; killTileGen(st, ctx, x, y); ctx.destroyObject = false;
    }
    return;
  }
  if (!plantBadMatch(down, sheet)) return;
  const i = st.idx(x, y);
  const r = plantNewType(sheet, down, st.frameX[i]!);
  if (r.type !== sheet) {
    st.type[i] = sid(r.type);
    st.frameX[i] = r.fx;
    const mushroom = (sheet === 3 || sheet === 110 || sheet === 24) && r.fx === 144
      ? true : (sheet === 201 && r.fx === 270);
    if (mushroom) st.frameX[i] = sheet === 201 ? 270 : 144;
  } else {
    ctx.destroyObject = true; killTileGen(st, ctx, x, y); ctx.destroyObject = false;
  }
}

/** CheckOnTable1x1（cs:43548） */
function checkOnTableSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (!st.inBounds(x, y + 1)) return;
  const i = st.idx(x, y + 1);
  const sl = st.slope[i];
  const bsh = SWEEP_SHEET[st.type[i]];
  if (sl === 1 || sl === 2) {  // topSlope
    if (PLATFORMS.has(bsh)) {
      // blockType（Tile.cs:232）：half→1，slope1→2（左坡），slope2→3（右坡）
      // 存活门（cs:43555-43562）：(bt!=3 || 左邻平台平帧) && (bt!=2 || 右邻平台平帧)
      const flatPlatform = (xx: number): boolean => st.inBounds(xx, y + 1)
        && activeAt2(st, xx, y + 1) && slopeOf(st, xx, y + 1) === 0
        && !halfOf(st, xx, y + 1) && PLATFORMS.has(sheetAt2(st, xx, y + 1));
      const bt = st.half[i] ? 1 : sl + 1;
      const cond1 = bt !== 3 || flatPlatform(x - 1);
      const cond2 = bt !== 2 || flatPlatform(x + 1);
      if (cond1 && cond2) killTileGen(st, ctx, x, y);
    } else {
      killTileGen(st, ctx, x, y);
    }
  } else if (st.half[i]) {
    killTileGen(st, ctx, x, y);
  } else {
    const d = TILE_DEFS[st.type[i]];
    const tableOk = nactiveAt(st, x, y + 1) && TILE_TABLE.has(bsh)
      && slopeOf(st, x, y + 1) === 0 && !halfOf(st, x, y + 1);
    if (tableOk || (st.flags[i] !== 0 && d && (d.solid && d.platform))) return;
    if (sheet === 78) {
      if (!solidAllowBottom(st, x, y + 1)) killTileGen(st, ctx, x, y);
    } else {
      killTileGen(st, ctx, x, y);
    }
  }
}

/** CheckPile（cs:46891）+ Check2x1（cs:46989）：frameY==18→2x1；支撑/地基门杀 */
function checkPileSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  if (st.frameY[i] === 18 || sheetAt2(st, x, y) === 649) {
    check2x1Sweep(st, ctx, x, y, sheetAt2(st, x, y));
    return;
  }
  if (!solidAllowBottom(st, x, y + 1)) { killTileGen(st, ctx, x, y); return; }
  const fx18 = Math.floor(st.frameX[i]! / 18);
  const belowSh = activeAt2(st, x, y + 1) ? sheetAt2(st, x, y + 1) : -1;
  if (belowSh < 0) return;
  if (fx18 >= 36 && fx18 <= 47) {
    if (belowSh !== 147 && belowSh !== 161 && belowSh !== 163 && belowSh !== 164
      && belowSh !== 200 && belowSh !== 162 && belowSh !== 224) killTileGen(st, ctx, x, y);
  } else if (fx18 >= 54 && fx18 <= 76) {
    if (!(belowSh === 53 || belowSh === 112 || belowSh === 116 || belowSh === 234
      || belowSh === 397 || belowSh === 398 || belowSh === 399 || belowSh === 402
      || belowSh === 396 || belowSh === 400 || belowSh === 401 || belowSh === 403)) {
      killTileGen(st, ctx, x, y);
    }
  }
}

/** Check2x1（cs:46989）：横 2 格完整性 + {29,103,462} 桌面门 */
function check2x1Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  let x0 = x - (Math.floor(st.frameX[i]! / 18) % 2);
  if (!st.inBounds(x0 + 1, y + 1) || !st.inBounds(x0, y + 1)) return;
  let ok = st.frameX[st.idx(x0 + 1, y)] === st.frameX[st.idx(x0, y)]! + 18
    && sheetAt2(st, x0, y) === sheet && sheetAt2(st, x0 + 1, y) === sheet
    && activeAt2(st, x0, y) && activeAt2(st, x0 + 1, y);
  if (sheet === 29 || sheet === 103 || sheet === 462) {
    for (const xx of [x0, x0 + 1]) {
      const bi = st.idx(xx, y + 1);
      if (!st.flags[bi] || !TILE_TABLE.has(SWEEP_SHEET[st.type[bi]])
        || st.half[bi] || slopeOf(st, xx, y + 1) === 1 || slopeOf(st, xx, y + 1) === 2) ok = false;
    }
  }
  if (ok) return;
  ctx.destroyObject = true;
  for (const xx of [x0, x0 + 1]) {
    if (sheetAt2(st, xx, y) === sheet && activeAt2(st, xx, y)) killTileGen(st, ctx, xx, y);
  }
  ctx.destroyObject = false;
}

/** CheckPot（cs:56807）：2x2 完整性 + 底支（653 用 SolidTileAllowBottomSlope 否则 SolidTile2） */
function checkPotSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  let num = Math.floor(st.frameX[i]! / 18);
  while (num > 1) num -= 2;
  const x0 = x - num;
  let num3 = Math.floor(st.frameY[i]! / 18);
  let num4 = 0;
  while (num3 > 1) { num3 -= 2; num4++; }
  const y0 = y - num3;
  let bad = false;
  for (let k = x0; k < x0 + 2 && !bad; k++) {
    for (let l = y0; l < y0 + 2; l++) {
      if (!st.inBounds(k, l)) { bad = true; break; }
      const ki = st.idx(k, l);
      let fx18 = Math.floor(st.frameX[ki]! / 18);
      while (fx18 > 1) fx18 -= 2;
      if (!st.flags[ki] || SWEEP_SHEET[st.type[ki]] !== sheet || fx18 !== k - x0
        || st.frameY[ki] !== (l - y0) * 18 + num4 * 36) bad = true;
    }
  }
  for (let k = x0; k < x0 + 2; k++) {
    if (sheet === 653) { if (!solidAllowBottom(st, k, y0 + 2)) bad = true; }
    else if (!solid2(st, k, y0 + 2)) bad = true;
  }
  if (!bad) return;
  ctx.destroyObject = true;
  for (let k = x0; k < x0 + 2; k++) {
    for (let l = y0; l < y0 + 2; l++) {
      if (st.inBounds(k, l) && sheetAt2(st, k, l) === sheet && activeAt2(st, k, l)) {
        killTileGen(st, ctx, k, l);
      }
    }
  }
  ctx.destroyObject = false;
}

/** Check3x3Wall（cs:44321）：3x3 墙画完整性（墙>0）失败整幅杀 */
function check3x3WallSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  const sheet = SWEEP_SHEET[st.type[i]];
  let num = 0, num2 = 0;
  let cx = Math.floor(st.frameX[i]! / 18);
  while (cx >= 3) { cx -= 3; num++; }
  const x0 = x - cx;
  let cy = Math.floor(st.frameY[i]! / 18);
  while (cy >= 3) { cy -= 3; num2++; }
  const y0 = y - cy;
  const fxBase = num * 54, fyBase = num2 * 54;
  let bad = false;
  for (let xx = x0; xx < x0 + 3 && !bad; xx++) {
    for (let yy = y0; yy < y0 + 3; yy++) {
      if (!st.inBounds(xx, yy)) { bad = true; break; }
      const ki = st.idx(xx, yy);
      if (SWEEP_SHEET[st.type[ki]] !== sheet || !st.flags[ki] || st.wall[ki] <= 0
        || st.frameX[ki] !== fxBase + (xx - x0) * 18
        || st.frameY[ki] !== fyBase + (yy - y0) * 18) bad = true;
    }
  }
  if (!bad) return;
  ctx.destroyObject = true;
  for (let xx = x0; xx < x0 + 3; xx++) {
    for (let yy = y0; yy < y0 + 3; yy++) {
      if (st.inBounds(xx, yy) && sheetAt2(st, xx, yy) === sheet && activeAt2(st, xx, yy)) {
        killTileGen(st, ctx, xx, yy);
      }
    }
  }
  ctx.destroyObject = false;
}

/** CheckSuper 485（cs:48117，Style2x2 横样式）：完整性+整底行 SolidTile 锚 */
function checkSuper485Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  const sheet = SWEEP_SHEET[st.type[i]];
  const style = Math.floor(st.frameX[i]! / 36);
  const x0 = x - (Math.floor(st.frameX[i]! / 18) % 2);
  const y0 = y - (Math.floor(st.frameY[i]! / 18) % 2);
  let bad = false;
  for (let xx = 0; xx < 2; xx++) {
    for (let yy = 0; yy < 2; yy++) {
      if (!st.inBounds(x0 + xx, y0 + yy)) { bad = true; continue; }
      const ki = st.idx(x0 + xx, y0 + yy);
      if (!st.flags[ki] || SWEEP_SHEET[st.type[ki]] !== sheet
        || st.frameX[ki] !== style * 72 + xx * 20 || st.frameY[ki] !== yy * 20) bad = true;
    }
  }
  for (let xx = 0; xx < 2; xx++) {
    if (!anchorSolidTile(st, x0 + xx, y0 + 2)) bad = true;
  }
  if (!bad) return;
  ctx.destroyObject = true;
  for (let xx = 0; xx < 2; xx++) {
    for (let yy = 0; yy < 2; yy++) {
      if (st.inBounds(x0 + xx, y0 + yy) && sheetAt2(st, x0 + xx, y0 + yy) === sheet
        && activeAt2(st, x0 + xx, y0 + yy)) killTileGen(st, ctx, x0 + xx, y0 + yy);
    }
  }
  ctx.destroyObject = false;
}

/** Check3x2（cs:49190）：3x2 完整性 + 分型支撑门 + 187 地基门/转 186 + 488 再生 */
function check3x2Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  let bad = false;
  const num3 = Math.floor(st.frameY[i]! / 36);      // 风格行（fy/36）
  const y0 = y - (Math.floor(st.frameY[i]! % 36) / 18 | 0);
  let num5 = Math.floor(st.frameX[i]! / 18);
  let num6 = 0;
  while (num5 > 2) { num5 -= 3; num6++; }
  const x0 = x - num5;
  const styleCol = num6;
  let yEnd = y0 + 2;
  for (let k = x0; k < x0 + 3; k++) {
    for (let l = y0; l < yEnd; l++) {
      if (!st.inBounds(k, l)) { bad = true; continue; }
      const ki = st.idx(k, l);
      if (!st.flags[ki] || SWEEP_SHEET[st.type[ki]] !== sheet
        || st.frameX[ki] !== (k - x0) * 18 + styleCol * 54
        || st.frameY[ki] !== (l - y0) * 18 + num3 * 36) bad = true;
    }
    if (C3X2_PLATFORM.has(sheet)) {
      const bi = st.idx(k, yEnd);
      const support = solidAllowBottom(st, k, yEnd)
        || (nactiveAt(st, k, yEnd) && TILE_DEFS[st.type[bi]]?.platform && st.frameY[bi] === 0)
        || (st.flags[bi] !== 0 && PLATFORMS.has(SWEEP_SHEET[st.type[bi]]));
      if (!support) bad = true;
    } else {
      switch (sheet) {
        case 704: case 705:
          if (!solidAllowBottom(st, k, yEnd)) bad = true;
          break;
        case 488: {
          const g = activeAt2(st, k, yEnd) ? sheetAt2(st, k, yEnd) : 0;
          const okG = g === 2 || g === 477 || g === 109 || g === 492 || g === 147
            || g === 53 || g === 60 || g === 70;
          if (!okG) bad = true;
          break;
        }
        case 26: case 695:
          if (!solidAllowBottom(st, k, yEnd) || invalidForPiles(st, k, yEnd)) bad = true;
          break;
        case 186: {
          if (!solidAllowBottom(st, k, yEnd) || invalidForPiles(st, k, yEnd)) { bad = true; break; }
          const g = activeAt2(st, k, yEnd) ? sheetAt2(st, k, yEnd) : -1;
          if (g < 0) break;
          if (styleCol >= 26 && styleCol <= 31) {
            if (g !== 147 && g !== 161 && g !== 163 && g !== 164 && g !== 200
              && g !== 162 && g !== 224) bad = true;
          } else if (styleCol >= 32 && styleCol <= 34) {
            if (g !== 59 && g !== 70) bad = true;
          }
          break;
        }
      }
      if (sheet === 187) {
        if (!solidAllowBottom(st, k, yEnd) || invalidForPiles(st, k, yEnd)) { bad = true; continue; }
        const g = activeAt2(st, k, yEnd) ? sheetAt2(st, k, yEnd) : -1;
        if (g >= 0) {
          if (styleCol <= 5) { if (g !== 59 && g !== 60 && g !== 226) bad = true; }
          else if (styleCol <= 8) { if (g !== 57 && g !== 58 && g !== 75 && g !== 76) bad = true; }
          else if (styleCol >= 29 && styleCol <= 34) {
            if (!(g === 53 || g === 112 || g === 116 || g === 234
              || g === 397 || g === 398 || g === 399 || g === 402
              || g === 396 || g === 400 || g === 401 || g === 403)) bad = true;
          }
        }
      } else if (!solidAllowBottom(st, k, yEnd)) {
        bad = true;
      }
    }
  }
  // 187 草基缺失 → 顶幅转 186（cs:49343-49360）
  if (sheet === 187 && st.inBounds(x0, y0) && st.inBounds(x0 + 2, y0 + 1)) {
    const topFx = st.frameX[st.idx(x0, y0)]!;
    const g0 = sheetAt2(st, x0, y0 + 2), g1 = sheetAt2(st, x0 + 1, y0 + 2), g2 = sheetAt2(st, x0 + 2, y0 + 2);
    if (topFx >= 756 && topFx <= 900 && g0 !== 2 && g1 !== 2 && g2 !== 2
      && g0 !== 477 && g1 !== 477 && g2 !== 477 && g0 !== 492 && g1 !== 492 && g2 !== 492) {
      for (let k = x0; k < x0 + 3; k++) {
        for (let l = y0; l < y0 + 2; l++) {
          const ki = st.idx(k, l);
          st.frameX[ki] = st.frameX[ki]! - 378;
          st.type[ki] = sid(186);
        }
      }
      return;
    }
  }
  // 488 生成期再生（cs:49361-49377）：坏且 isGenerating → 重铺整物+草皮，撤销 bad
  if (bad && sheet === 488) {
    for (let k = x0; k < x0 + 3; k++) {
      for (let l = y0; l < y0 + 2; l++) st.setTileSilent(k, l, sid(488), (k - x0) * 18, (l - y0) * 18);
      if (st.inBounds(k, y0 + 2)) {
        st.setTileSilent(k, y0 + 2, sid(2), 0, 0);
      }
    }
    return;
  }
  if (!bad) return;
  ctx.destroyObject = true;
  for (let k = x0; k < x0 + 3; k++) {
    for (let l = y0; l < yEnd; l++) {
      if (st.inBounds(k, l) && sheetAt2(st, k, l) === sheet && activeAt2(st, k, l)) {
        killTileGen(st, ctx, k, l);
      }
    }
  }
  ctx.destroyObject = false;
}

/** CheckVines（cs:85599）：上邻异种换型/失锚杀 */
function checkVinesSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  const i = st.idx(x, y);
  let up = -1;
  if (nactiveAt(st, x, y - 1) && slopeOf(st, x, y - 1) !== 3 && slopeOf(st, x, y - 1) !== 4) {
    up = sheetAt2(st, x, y - 1);
  }
  if (up === sheet) return;
  const map: Array<[Set<number>, number]> = [
    [new Set([633, 638]), 638], [new Set([70, 528]), 528], [new Set([109, 115, 492]), 115],
    [new Set([60, 226, 62]), 62], [new Set([23, 636, 661]), 636], [new Set([199, 205, 662]), 205],
    [new Set([382]), 382],
  ];
  let conv = 0;
  for (const [hosts, out] of map) if (hosts.has(up)) conv = out;
  if (up === 2 || up === 52 || up === 477) { if (sheet !== 382) conv = 52; }
  if (conv !== 0 && conv !== sheet) {
    st.type[i] = sid(conv);
    squareTileFrame(st, ctx, x, y);
    return;
  }
  let dead = up === -1;
  if ((sheet === 52 || sheet === 382) && up !== 2 && up !== 477 && up !== 192) dead = true;
  if (sheet === 62 && up !== 60 && up !== 384 && up !== 226) dead = true;
  if (sheet === 115 && up !== 109 && up !== 492) dead = true;
  if (sheet === 528 && up !== 70) dead = true;
  if (sheet === 636 && up !== 23 && up !== 661) dead = true;
  if (sheet === 205 && up !== 199 && up !== 662) dead = true;
  if (sheet === 638 && up !== 633) dead = true;
  if (dead) killTileGen(st, ctx, x, y);
}

/** CheckCactus（cs:54132）：追底杀，返回 true=已杀 */
function checkCactusSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): boolean {
  let ny = y, nx = x;
  while (st.inBounds(nx, ny) && st.flags[st.idx(nx, ny)] && sheetAt2(st, nx, ny) === 80) {
    ny++;
    if (!st.inBounds(nx, ny)) return false;
    if (!st.flags[st.idx(nx, ny)] || sheetAt2(st, nx, ny) !== 80) {
      if (activeAt2(st, nx - 1, ny) && sheetAt2(st, nx - 1, ny) === 80
        && activeAt2(st, nx - 1, ny - 1) && sheetAt2(st, nx - 1, ny - 1) === 80 && nx >= x) nx--;
      if (activeAt2(st, nx + 1, ny) && sheetAt2(st, nx + 1, ny) === 80
        && activeAt2(st, nx + 1, ny - 1) && sheetAt2(st, nx + 1, ny - 1) === 80 && nx <= x) nx++;
    }
  }
  if (!st.inBounds(nx, ny)) return false;
  const bi = st.idx(nx, ny);
  const bsh = SWEEP_SHEET[st.type[bi]];
  if (!st.flags[bi] || (st.wire[bi] & 32) || st.half[bi] || st.slope[bi] !== 0
    || (bsh !== 53 && bsh !== 112 && bsh !== 116 && bsh !== 234)) {
    killTileGen(st, ctx, x, y);
    return true;
  }
  if (nx !== x) {
    const i = st.idx(x, y);
    if ((!st.flags[st.idx(x, y + 1)] || sheetAt2(st, x, y + 1) !== 80)
      && (!st.flags[st.idx(x - 1, y)] || sheetAt2(st, x - 1, y) !== 80)
      && (!st.flags[st.idx(x + 1, y)] || sheetAt2(st, x + 1, y) !== 80)) {
      killTileGen(st, ctx, x, y);
      return true;
    }
  } else {
    const below = st.idx(x, y + 1);
    if (!st.flags[below]
      || (SWEEP_SHEET[st.type[below]] !== 80 && SWEEP_SHEET[st.type[below]] !== 53
        && SWEEP_SHEET[st.type[below]] !== 112 && SWEEP_SHEET[st.type[below]] !== 116
        && SWEEP_SHEET[st.type[below]] !== 234)) {
      killTileGen(st, ctx, x, y);
      return true;
    }
  }
  return false;
}

/** CheckLilyPad（cs:59227）：非水杀；换 frameY；上方有水再生一格 518 */
function checkLilyPadSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  if (st.liquid[i]! > 0 && st.liquidType[i] !== LIQUID_TYPE.WATER) { killTileGen(st, ctx, x, y); return; }
  let ny = y;
  while (ny < st.h - 50 && (!st.flags[st.idx(x, ny)] || !TILE_DEFS[st.type[st.idx(x, ny)]]?.solid
    || TILE_DEFS[st.type[st.idx(x, ny)]]?.platform)) ny++;
  const g = sheetAt2(st, x, ny);
  let fy = -1;
  if (g === 2 || g === 477) fy = 0;
  else if (g === 109 || g === 116) fy = 18;
  else if (g === 60) fy = 36;
  if (fy >= 0) {
    st.frameY[i] = fy;
    const up = st.idx(x, y - 1);
    if (st.liquid[up]! > 0 && !st.flags[up]) {
      st.setTileSilent(x, y - 1, sid(518), st.frameX[i]!, st.frameY[i]!);
    }
  }
}

/** CheckCatTail（cs:58764，生成期 isGeneratingOrLoadingWorld=真：Next(4) 短路为真） */
function checkCatTailSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  let flag = false;
  let num2 = y;
  while (num2 < st.h - 50 && (!st.flags[st.idx(x, num2)]
    || !TILE_DEFS[st.type[st.idx(x, num2)]]?.solid
    || TILE_DEFS[st.type[st.idx(x, num2)]]?.platform)) {
    if (st.flags[st.idx(x, num2)] && SWEEP_SHEET[st.type[st.idx(x, num2)]] !== 519) flag = true;
    if (!st.flags[st.idx(x, num2)]) break;
    num2++;
  }
  let num = num2 - 1;
  while (num > 50 && st.liquid[st.idx(x, num)]! > 0) {
    if ((st.flags[st.idx(x, num)] && SWEEP_SHEET[st.type[st.idx(x, num)]] !== 519)
      || (st.liquid[st.idx(x, num)]! > 0 && st.liquidType[st.idx(x, num)] !== LIQUID_TYPE.WATER)) flag = true;
    num--;
  }
  num++;
  const num3 = num;
  if (num2 - num3 > 40 /* catTailDistance */) flag = true;
  const g = sheetAt2(st, x, num2);
  let fy = -1;
  if (g === 2 || g === 477) fy = 0;
  else if (g === 53) fy = 18;
  else if (g === 199 || g === 234 || g === 662) fy = 36;
  else if (g === 23 || g === 112 || g === 661) fy = 54;
  else if (g === 70) fy = 72;
  else if (g === 90) fy = 90;
  if (!st.flags[st.idx(x, num2)] || (st.wire[st.idx(x, num2)] & 32)) flag = true;
  if (fy < 0) flag = true;
  if (st.inBounds(x, num2 - 1) && st.liquid[st.idx(x, num2 - 1)]! < 127) flag = true;   // 生成期恒真分支
  const ki = st.idx(x, num);
  if (st.frameX[ki]! >= 180 && st.liquid[ki]! > 127) flag = true;                       // 同上
  if (num2 > num + 4 && st.inBounds(x, num + 4) && st.inBounds(x, num + 3)
    && st.liquid[st.idx(x, num + 4)] === 0
    && SWEEP_SHEET[st.type[st.idx(x, num + 3)]] === 519) flag = true;
  if (flag) {
    let from = num3;
    if (num < num3) from = num;
    from -= 4;
    for (let yy = from; yy <= num2; yy++) {
      if (st.inBounds(x, yy) && st.flags[st.idx(x, yy)]
        && SWEEP_SHEET[st.type[st.idx(x, yy)]] === 519) {
        killTileGen(st, ctx, x, yy);
        squareTileFrame(st, ctx, x, yy);
      }
    }
  } else if (fy >= 0 && st.frameY[st.idx(x, num)] !== fy) {
    for (let yy = num; yy < num2; yy++) {
      if (st.inBounds(x, yy) && st.flags[st.idx(x, yy)]
        && SWEEP_SHEET[st.type[st.idx(x, yy)]] === 519) st.frameY[st.idx(x, yy)] = fy;
    }
  }
}

/** CheckUnderwaterPlant 549（cs:58597）：KillTile+SquareTileFrame；带外重掷 */
function checkSeaweedSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  // CanUnderwaterPlantGrowHere（cs:58680）：3 格水柱+下沙/自体+墙门
  const canGrow = (): boolean => {
    if (!(x >= 50 && y >= 50 && x < st.w - 50 && y < st.h - 50)) return false;
    for (let k = 0; k < 3; k++) {
      const wi = st.idx(x, y - k);
      if (st.liquid[wi] === 0 || st.liquidType[wi] !== LIQUID_TYPE.WATER) return false;
    }
    if (!nactiveAt(st, x, y + 1)) return false;
    const g = sheetAt2(st, x, y + 1);
    const sand = g === 53 || g === 112 || g === 116 || g === 234;
    if (!sand && g !== 549) return false;
    const wall = st.wall[st.idx(x, y)];
    if (wall !== 0 && !(wall >= 63 && wall <= 69) && wall !== 80 && wall !== 81) return false;
    return true;
  };
  const i = st.idx(x, y);
  if (!canGrow()) {
    killTileGen(st, ctx, x, y);
    squareTileFrame(st, ctx, x, y);
    return;
  }
  const above = activeAt2(st, x, y - 1) && sheetAt2(st, x, y - 1) === 549;
  const below = activeAt2(st, x, y + 1) && sheetAt2(st, x, y + 1) === 549;
  const n2 = Math.floor(st.frameX[i]! / 18);
  st.frameY[i] = 0;
  if (ctx.frameSparse) return;   // 探针缺帧：掷门不可信，跳过（生产帧完整恒 false）
  if (above) {
    if (n2 < 1 || n2 > 7) st.frameX[i] = rollRange(ctx, 1, 7) * 18;
  } else if (below) {
    if (n2 < 7 || n2 > 12) st.frameX[i] = rollRange(ctx, 7, 12) * 18;
  } else if (n2 !== 0) {
    st.frameX[i] = 0;
  }
}

/** CheckBamboo 571（cs:58466）：KillTile+SquareTileFrame；带外重掷 */
function checkBambooSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const bi = st.idx(x, y + 1);
  if (!st.inBounds(x, y + 1)) return;
  const bsh = st.flags[bi] ? SWEEP_SHEET[st.type[bi]] : -1;
  if (bsh !== 60 && bsh !== 571) {
    killTileGen(st, ctx, x, y);
    squareTileFrame(st, ctx, x, y);
    return;
  }
  const i = st.idx(x, y);
  const above = activeAt2(st, x, y - 1) && sheetAt2(st, x, y - 1) === 571;
  const below = bsh === 571;
  const n2 = Math.floor(st.frameX[i]! / 18);
  st.frameY[i] = 0;
  if (ctx.frameSparse) return;   // 探针缺帧：同 549
  if (above) {
    if (below) { if (n2 < 5 || n2 > 14) st.frameX[i] = rollRange(ctx, 5, 14) * 18; }
    else if (n2 < 1 || n2 > 4) st.frameX[i] = rollRange(ctx, 1, 4) * 18;
  } else if (below) {
    if (n2 < 15 || n2 > 19) st.frameX[i] = rollRange(ctx, 15, 19) * 18;
  } else if (n2 !== 0) {
    st.frameX[i] = 0;
  }
}

/** 最近一次 pass 的扫统计（探针读取;生产不依赖） */
export const __zzzLastStats: ZzzStats = {
  roll184: 0, mossKilled: 0, mossVisited: 0, kills184Other: 0, kills165: 0, killsPlant: 0,
  killsVine: 0, killsC3x2: 0, killsPot: 0, killsPaint: 0, kills485: 0, killsOther: 0,
  rolls165: 0, rollsOther: 0,
};

export function runFinalCleanupPass(
  st: TileStore, gs: GenState, rng?: RNG,
  opts?: { frameSparse?: boolean; stats?: ZzzStats },
): void {
  const ctx: SweepCtx = { rng, destroyObject: false, frameSparse: !!opts?.frameSparse, stats: opts?.stats ?? __zzzLastStats };
  // ★pass 头 tileSolid 翻转（cs:22306 `Main.tileSolid[484] = false`）：滚动仙人掌
  //   非实心——DesertBiome 头（cs:12537）已翻过,原版冗余重放,接线仅为时间线存档
  //   （484 生成期恒非实心,生成结束亦不还原）。写在 denySomeGeneration 门之外,
  //   原版无条件执行。
  flipGenSolid([484], false);
  const stats = ctx.stats!;
  for (const k of Object.keys(stats) as Array<keyof ZzzStats>) stats[k] = 0;
  const { w, h } = st;

  for (let i = 0; i < w; i++) {
    for (let j = 0; j < h; j++) {
      const t = st.idx(i, j);
      const type = st.type[t];

      // ③ 悬空落体柱(cs:22312-22385)
      if (st.flags[t] && !solidTile(st, i, j + 1) && SAND_FALL_BASE.has(type)) {
        if (j < gs.worldSurface + 10 && !st.flags[st.idx(i, j + 1)]
          && st.wall[st.idx(i, j + 1)] !== 191 && !oceanDepths(st, gs, i, j)) {
          // 地表带:向下生长同类型柱
          let num = 10;
          for (let k = j + 1; k <= j + 10; k++) { // 下方 10 格内有矿轨 314 则停(cs:22321-22328)
            const kk = st.idx(i, k);
            if (st.flags[kk] && st.type[kk] === TRACK) { num = 0; break; }
          }
          let num2 = j + 1;
          while (!st.flags[st.idx(i, num2)] && num > 0 && num2 < h - 50) {
            flatten(st, i, num2 - 1);
            st.setTileSilent(i, num2, type);
            flatten(st, i, num2);
            num2++;
            num--;
          }
          if (num === 0 && !st.flags[st.idx(i, num2)]) {
            // 封底(cs:22345-22368)
            st.setTileSilent(i, num2, SAND_FALL_BASE.get(type)!);
          } else {
            const below = st.idx(i, num2);
            if (st.flags[below] && tileSolidT(st.type[below])
              && !TILE_DEFS[st.type[below]]?.platform) {
              flatten(st, i, num2);
            }
          }
        } else if (tileSolidT(st.type[st.idx(i, j + 1)])
          && !TILE_DEFS[st.type[st.idx(i, j + 1)]]?.platform
          && ((st.slope[st.idx(i, j + 1)] === 1 || st.slope[st.idx(i, j + 1)] === 2)
            || st.half[st.idx(i, j + 1)] === 1)) {
          // 下方是坡面/半砖实心 → 复位(cs:22370-22376)
          flatten(st, i, j + 1);
        } else {
          // 深层悬空 → 直接转硬化沙族(cs:22377-22385)
          st.type[t] = SAND_FALL_BASE.get(type)!;
        }
        // 棕榈重帧(cs:22386)——TileFrame 跳过(帧管线负责)
      }

      // ④ 墙 187/216 液体 → 满岩浆(cs:22387-22392;remix/dualDungeons 种子门不适用)
      if ((st.wall[t] === 187 || st.wall[t] === 216) && st.liquid[t] > 0) {
        st.liquid[t] = 255;
        st.liquidType[t] = LIQUID_TYPE.LAVA;
      }

      // ⑤ 137 复位 slope/halfBrick(cs:22394-22398,注意无 active 门)
      if (type === TRAP_137) {
        flatten(st, i, j);
      }

      // ⑥ 巨石重帧+补支撑(cs:22400-22458)
      if (st.flags[t] && BOULDERS.has(type)) {
        const x0 = i - Math.floor(st.frameX[t] / 18);
        const y0 = j - Math.floor(st.frameY[t] / 18);
        let hasAltar = false;
        for (let l = 0; l < 2; l++) {
          if (st.inBounds(x0 + l, y0 - 1)) {
            const ab = st.idx(x0 + l, y0 - 1);
            if (st.flags[ab] && st.type[ab] === DEMON_ALTAR) { hasAltar = true; break; }
          }
          for (let m = 0; m < 2; m++) {
            st.setTileSilent(x0 + l, y0 + m, type, l * 18, m * 18);
          }
        }
        if (hasAltar) {
          // 上方有恶魔祭坛 → 整块替换(cs:22429-22450:484→397,其余→0)
          const repl = type === ROLLING_CACTUS ? sid(397) : 0;
          for (let n = 0; n < 2; n++) {
            for (let o = 0; o < 2; o++) {
              st.setTileSilent(x0 + n, y0 + o, repl, 0, 0);
            }
          }
        }
      }

      // ⑦ 液体中棕榈杀(cs:22460-22463;原版无 active 门,经 KillTile 内部门兜底)
      if (type === PALM_TREE && st.liquid[t] > 0) {
        killTileGen(st, ctx, i, j);   // KillTile 含尾部 SquareTileFrame 级联（ZZZ）
      }

      // ⑧ 地牢墙内液体规范化(cs:22465-22477)
      if (WALL_DUNGEON.has(st.wall[t])) {
        st.liquidType[t] = LIQUID_TYPE.WATER; // liquidType(0):原版无条件写位(液量为 0 时无实际意义)
        if (type === LAVA_DRIP) st.type[t] = WATER_DRIP;
        if (st.flags[t] && type === SPIKE) {
          killTileGen(st, ctx, i, j);  // 同上（ZZZ）
          const tt = st.idx(i, j);
          st.liquidType[tt] = LIQUID_TYPE.WATER;
          st.liquid[tt] = 255;
        }
      }

      // ⑨ 314 矿轨上下清液(cs:22479-22491:上 15 格 + 下 1 格;extraLiquid 种子门不适用)
      if (st.flags[t] && type === TRACK) {
        for (let y2 = j; j - y2 < 15; y2--) { // j, j-1 … j-14
          if (y2 >= 0) st.liquid[st.idx(i, y2)] = 0;
        }
        for (let y2 = j; y2 - j < 1; y2++) { // j(原版重复清一次)
          if (y2 < h) st.liquid[st.idx(i, y2)] = 0;
        }
      }

      // ⑩ 金币堆下方补 332(cs:22493-22498)
      if (st.flags[t] && type === COIN_PILE && !st.flags[st.idx(i, j + 1)]) {
        clearEverything(st, i, j + 1);
        st.setTileSilent(i, j + 1, COIN_PILE);
      }

      // ⑪ 地表散水清除(cs:22500-22510)
      if (i > gs.beachDistance && i < w - gs.beachDistance && j < gs.worldSurface
        && st.liquid[t] > 0 && st.liquid[t] < 255
        && st.liquid[st.idx(i - 1, j)] < 255 && st.liquid[st.idx(i + 1, j)] < 255
        && st.liquid[st.idx(i, j + 1)] < 255
        && (!st.flags[st.idx(i - 1, j)] || !CLOUDS.has(st.type[st.idx(i - 1, j)]))
        && (!st.flags[st.idx(i + 1, j)] || !CLOUDS.has(st.type[st.idx(i + 1, j)]))
        && (!st.flags[st.idx(i, j + 1)] || !CLOUDS.has(st.type[st.idx(i, j + 1)]))) {
        st.liquid[t] = 0;
      }

      // ⑫ 无墙画作继承邻墙(cs:22512-22543,继承序:左→右→上→下)
      if (st.flags[t] && type >= 0 && PAINTINGS.has(type) && st.wall[t] <= 0
        && i >= 2 && j >= 2 && i < w - 2 && j < h - 2) { // InWorld(i,j,2)
        let inherit = 0;
        if (inherit === 0 && st.wall[st.idx(i - 1, j)] > 0) inherit = st.wall[st.idx(i - 1, j)];
        if (inherit === 0 && st.wall[st.idx(i + 1, j)] > 0) inherit = st.wall[st.idx(i + 1, j)];
        if (inherit === 0 && st.wall[st.idx(i, j - 1)] > 0) inherit = st.wall[st.idx(i, j - 1)];
        if (inherit === 0 && st.wall[st.idx(i, j + 1)] > 0) inherit = st.wall[st.idx(i, j + 1)];
        if (inherit !== 0) st.wall[t] = inherit;
      }

      // TileFrame(i,j)(cs:22544)——ZZZ 批 2026-08-18 落地:生成期 1:1
      //   （掷耗+击杀写侧+苔藓帧重写;细节见文件头注释块）
      tileFrameGen(st, ctx, i, j, false);
    }
  }

  // ⑭ Dirtiest Block（cs:22546-22587）：num17 = GetWorldSize() switch
  //    （1=>6, 2=>9, _=>3；tenthAnniversary ×5 种子门不适用）；num19=3000 次预算。
  //    每迭代 Next(50,w-50)+Next(50,h-200)（上界独占）；active 且 type∈Dirt 集
  //    （TileID.Sets.Dirt=CreateBoolSet(0,668)，TileID.cs:285）→ ClearTile()+
  //    active(true)+type=668（帧/墙/液体/inActive 以外全部不动）。
  //    ★FinalCleanup 是 105 pass 末位——⑭ 前的掷耗已由上方全图扫补齐（ZZZ）；
  //    其后 genRand 消费=ShimmerCleanUp r90 块（cs:34791，每格 2×NextDouble），
  //    对普通世界终态流零外溢（pass 结束）。
  if (rng) {
    const DIRT = TILE_BY_KEY['dirt']!;
    const DIRTIEST = TILE_BY_KEY['v_668_the_dirtiest_block']!;
    const sizeId = st.w <= 4200 ? 0 : st.w <= 6400 ? 1 : 2;      // GetWorldSize（cs:6518）
    const target = sizeId === 1 ? 6 : sizeId === 2 ? 9 : 3;
    let placed = 0;
    let budget = 3000;
    while (placed < target) {
      budget--;
      if (budget <= 0) break;
      const x = rng.int(50, st.w - 51);   // Next(50, w-50)
      const y = rng.int(50, st.h - 201);  // Next(50, h-200)
      if (!st.inBounds(x, y)) continue;
      const t = st.idx(x, y);
      if (st.flags[t] && (st.type[t] === DIRT || st.type[t] === DIRTIEST)) {
        placed++;
        // ClearTile()：ClearSlope(slope=0,half=false)+active(false)+inActive(false)
        st.slope[t] = 0;
        st.half[t] = 0;
        st.wire[t] &= ~32;      // inActive 位复位（Tile.cs:153-158）
        st.flags[t] = 1;        // active(active:true)
        st.type[t] = DIRTIEST;
      }
    }
  }

  // ── ShimmerCleanUp（cs:22639→34750，⑭ 之后同 pass 尾段；ZZZ 批补）──
  //    苔藓计数平权的关键写侧：r<120 环带内 moss 块→石 1 / 184 苔藓芽+51/56/
  //    229/230/659 击杀（本种子实测 vanilla 侧 625→1×1358 + 184 杀×558）。
  //    r<90 块的 Convert(j,i,0,3)（净化 7×7 菱形）结构性 no-op：微光 pass 塑形
  //    （cs:34912-35050）已把 r90 椭圆全域写成石/空气/无墙（n5≥105>90，纵压 1.4
  //    ⇒ 纵向 reach 64<75），且 ShimmerifyArea 拒绝带 ebonsand/crimstone 的池位。
  //    之后：微光池补液 while（cs:34802-34820）+ 全图微光淹没树 5 击杀
  //    （cs:34833-34843）。LiquidCheck 全图环（cs:22645+）= 液体 sim 域，归 #49。
  if (gs.shimmerX >= 0 && gs.shimmerY >= 0) {
    const SX = gs.shimmerX, SY = gs.shimmerY;
    // ShimmerRemoveWater（cs:34859）：上半球 r<150 清非微光液体 + 162 失活
    for (let yy = SY - 150; yy <= SY + 75; yy++) {
      for (let xx = SX - 150; xx <= SX + 150; xx++) {
        if (!st.inBounds(xx, yy)) continue;
        const d = Math.hypot(xx - SX, yy - SY);
        if (d < 150) {
          const i = st.idx(xx, yy);
          if (st.liquidType[i] !== LIQUID_TYPE.SHIMMER) st.liquid[i] = 0;
          if (st.flags[i] && SWEEP_SHEET[st.type[i]] === 162) st.flags[i] = 0;
        }
      }
    }
    // r<120 环带（cs:34762-34790）：★盒=X±120×Y±120（num5/num6 均用 num=120，
    //   num2=90 只作第二半径阈；曾误读成 Y±90——339 处 moss→石漏转的根因）
    for (let yy = SY - 120; yy <= SY + 120; yy++) {
      for (let xx = SX - 120; xx <= SX + 120; xx++) {
        if (!st.inBounds(xx, yy)) continue;
        const d1 = Math.hypot(xx - SX, yy - SY);
        if (d1 < 120) {
          const i = st.idx(xx, yy);
          const sh = st.flags[i] ? SWEEP_SHEET[st.type[i]] : -1;
          if (sh === 22 || sh === 204) st.type[i] = sid(1);
          if (sh === 51 || sh === 56 || sh === 229 || sh === 230 || sh === 659) st.flags[i] = 0;
          if (sh >= 0 && CONV_MOSS.has(sh)) st.type[i] = sid(1);
          if (sh === 184) st.flags[i] = 0;
        }
        // r<90 num7 重算（cs:34791：上下半各 2×NextDouble——⑭ 之后，不回影响 ⑭ 流位）
        const squash = yy <= SY ? 1.4 : 1.2;
        const d2 = Math.trunc(Math.sqrt(
          (Math.abs(xx - SX) * (1 + (rng ? rng.next() : 0) * 0.02)) ** 2
          + (Math.abs(yy - SY) * squash * (1 + (rng ? rng.next() : 0) * 0.02)) ** 2,
        ));
        if (d2 < 90) {
          const i = st.idx(xx, yy);
          if (st.flags[i] && SWEEP_SHEET[st.type[i]] === 162) st.flags[i] = 0;
          st.wall[i] = 0;
          // Convert(j,i,0,3)：结构性 no-op（见上注）——不移植
        }
      }
    }
    // 微光池补液（cs:34802-34820）：自中心逐行下探，活性格封边
    let bx = SX, by = SY, b = 127;
    let guard = 0;
    while (st.inBounds(bx, by) && !(st.liquid[st.idx(bx, by)]! > b
      && st.liquidType[st.idx(bx, by)] === LIQUID_TYPE.SHIMMER)) {
      while (st.inBounds(bx, by) && !st.flags[st.idx(bx, by)]) {
        const i = st.idx(bx, by);
        st.liquid[i] = b;
        st.liquidType[i] = LIQUID_TYPE.SHIMMER;
        bx--;
      }
      for (bx = SX; st.inBounds(bx, by) && !st.flags[st.idx(bx, by)]; bx++) {
        const i = st.idx(bx, by);
        st.liquid[i] = b;
        st.liquidType[i] = LIQUID_TYPE.SHIMMER;
      }
      bx = SX;
      by++;
      b = 255;
      if (!st.inBounds(bx, by) || st.flags[st.idx(bx, by)] || ++guard > st.h) break;
    }
    // 全图微光淹没树击杀（cs:34833-34843）
    for (let xx = 10; xx < st.w - 10; xx++) {
      for (let yy = 10; yy < st.h - 10; yy++) {
        const i = st.idx(xx, yy);
        if (st.liquid[i]! > 0 && st.liquidType[i] === LIQUID_TYPE.SHIMMER
          && st.flags[i] && SWEEP_SHEET[st.type[i]] === 5) {
          killTileGen(st, ctx, xx, yy);
        }
      }
    }
  }
}
