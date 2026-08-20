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
import { flipGenSolid, genSolidType } from './GenSolid';
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
//   92/93/453、Check2x2 族（★CCCCC 已派发 138/411——9293480 在场成员；余
//   132/142/143/288-295/484/664/665/711/712/335/490/564/565/594/94-100/125/126/
//   173/282/287/319/621/622 维持备案）、172/360/505-527、171、376/443/444、（★YYYYY 已派发 27 向日葵/34 吊灯/5 树/752 蛋）
//   630/631、723/724。
//   ★KKKKK 批（2026-08-19）新派发三族（#101 金标 14 格击杀实证，旧"零击杀"
//   备案作废）：CheckAlch 药草 82/83/84（cs:45981）/ CheckJunglePlant
//   233/236/238/702（cs:47952）/ Check2xX 2×N 竖排家具 26 id（cs:38009）。

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
/** SolidTileAllowBottomSlope（cs:70211）：active&&(solid||solidTop)&&(!顶坡||平台正帧)&&!half&&!inActive。
 *  ★RRRR 批（2026-08-19）：tileSolid 一律走 genSolidType（Main.tileSolid 生成期镜像）——
 *  Piles pass 头翻转（cs:18906：379/229/190/196/189/717-719/202/460/484=false）期间，
 *  229 支撑上的陶罐/135 等装饰 vanilla 会被帧杀（#77 杀罐链实测），静态表查不出。 */
function solidAllowBottom(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !(genSolidType(st.type[i]) || d.platform)) return false;
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
  if (!d || !(genSolidType(st.type[i]) || SWEEP_SHEET[st.type[i]] === 380)) return false;
  const sh = SWEEP_SHEET[st.type[i]];
  const plat = PLATFORMS.has(sh);
  const bottomSlope = st.slope[i] === 3 || st.slope[i] === 4;
  return (!plat && !bottomSlope) || (plat && st.half[i] !== 0);
}
/** SolidTileAllowLeftSlope（cs:70345）/ RightSlope（cs:70365）。
 *  ★KKKKK 批修正：Left 排除 rightSlope()={1,3}、Right 排除 leftSlope()={2,4}
 *  （Tile.cs:340-355——leftSlope=slope2∨4、rightSlope=slope1∨3）。曾各漏一项
 *  （L 仅排 2、R 仅排 1）——FFFFF 在 TrackPass 本地规避，引擎本体此批补齐；
 *  影响消费端 frame178Sweep/frame129Sweep 全族（gem cave 178 斜坡锚等）。 */
function solidAllowSide(st: TileStore, x: number, y: number, side: 'L' | 'R'): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  if (!d || !genSolidType(st.type[i]) || st.half[i]) return false;
  if (PLATFORMS.has(SWEEP_SHEET[st.type[i]])) return false;
  const sl = st.slope[i];
  return side === 'L' ? sl !== 1 && sl !== 3 : sl !== 2 && sl !== 4;
}
/** SolidTile2（cs:70178）：active && tileSolid && slope==0 && !half && !inActive。
 *  ★原版 Main.tileSolid 对平台族{19,427,435-439}=true（tileSolidTop 同时真）——
 *  本仓 TILE_DEFS.platform 格 solid=false,须按 sheet 集补真（陶罐 CheckPot 实证:
 *  平台上的陶罐 vanilla 存活）。tileSolid 主体走 genSolidType（RRRR，同上）。 */
function solid2(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 32)) return false;
  const d = TILE_DEFS[st.type[i]];
  const tileSolidV = genSolidType(st.type[i]) || PLATFORMS.has(SWEEP_SHEET[st.type[i]]);
  return !!d && tileSolidV && st.slope[i] === 0 && !st.half[i];
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
  if (!d || !genSolidType(st.type[st.idx(x, y)]) || d.platform || NO_ATTACH.has(sh)) return false;
  return slopeOf(st, x, y) === 0 && !halfOf(st, x, y);
}

// ============================================================
// KillTile 尘掷表（RRRR 批 2026-08-19 实测定谳）
// ============================================================
// 生成期 KillTile 的尘埃链（cs:63747 `num13=KillTile_GetTileDustAmount(fail,tile)`
// → ×num13 次 KillTile_MakeTileDust）**部分族逐调消耗 genRand**（MakeTileDust 的
// num 择取掷——NewDust 本体 isGeneratingOrLoadingWorld 早退零掷，掷在实参求值）。
// ★DDDD 教训：反编译 num 表控制流两处皆反不可信——本表以织入探针逐掷对拍实证：
//   - 26/695 祭坛残件击杀 = 10×Next(2)（/tmp/oooo-kills.txt L50294-50305：两杀间
//     恰 10 个单参掷=KillTile_GetTileDustAmount 默认 10 × 每调 Next(2)）；
//   - 28 罐/165 钟乳/485 蚁狮/10 门/135 族击杀 = **零掷**（帧映射分支无掷，
//     同哈希流位对拍无残差）。
// 掷表（MakeTileDust 每调 1 掷，除注明外）：
//   2/477/27/243/244/204/478/641/370/171→Next(2)；26/695→frameX<54 时 Next(2)；
//   583-589→Next(10)；633→Next(6)；634→Next(10)+Next(12)；238→Next(3)；
//   385→Next(68,71)；254→Next(3/2/4)（frameX<72/<108/else）；
//   家具大族（358-364 等，见 FURNITURE_DUST）→Next(3)。
/** KillTile_GetTileDustAmount（cs:66654，fail=false 档） */
function killTileDustAmount(sheet: number, fx: number): number {
  if (sheet === 654 || sheet === 630 || sheet === 631) return 0;
  if (sheet === 125 || sheet === 138 || sheet === 172 || sheet === 287
    || (sheet >= 300 && sheet <= 308) || sheet === 354 || sheet === 355
    || (sheet >= 373 && sheet <= 376) || sheet === 461 || sheet === 484 || sheet === 499
    || sheet === 564 || sheet === 565 || sheet === 593 || sheet === 594 || sheet === 617
    || sheet === 664 || sheet === 665 || sheet === 699 || sheet === 709
    || (sheet >= 711 && sheet <= 716)) return 0;
  if (sheet === 231) return 6;
  if (sheet >= 481 && sheet <= 483) return 3;
  if (sheet === 541) return 1;
  if (sheet === 549) return 2;
  if (sheet === 534 || sheet === 536 || sheet === 539 || sheet === 625 || sheet === 627) return 5;
  if (sheet === 184) return Math.floor(fx / 22) >= 5 ? 5 : 10;
  return 10;
}
/** MakeTileDust 每调的 genRand 掷（cs:66744+ num 择取掷，实测表见上） */
const FURNITURE_DUST = new Set([
  358, 359, 360, 361, 362, 363, 364, 275, 276, 277, 278, 279, 280, 281, 282, 285, 286,
  288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 316, 317, 318, 298, 299, 309, 310,
  339, 538, 413, 414, 505, 521, 522, 523, 524, 525, 526, 527, 532, 543, 544, 550, 551,
  533, 553, 554, 555, 556, 558, 559, 542, 391, 392, 393, 394, 568, 569, 570, 582, 580,
  598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 620,
  629, 632, 640, 643, 644, 645, 710,
]);
function makeTileDustRoll(ctx: SweepCtx, sheet: number, fx: number): void {
  if (!ctx.rng) return;
  const r = ctx.rng;
  switch (sheet) {
    case 2: case 477: case 27: case 243: case 244: case 204: case 478:
    case 641: case 370: case 171:
      r.nextInt(2);
      return;
    // YYYYY：cs:67069 `(type==34||type==42) && genRand.Next(2)==0`——吊灯/棺木尘掷
    case 34: case 42:
      r.nextInt(2);
      return;
    case 26: case 695:
      if (fx < 54) r.nextInt(2);
      return;
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      r.nextInt(10);
      return;
    case 633:
      r.nextInt(6);
      return;
    case 634:
      r.nextInt(10);
      r.nextInt(12);
      return;
    case 238:
      r.nextInt(3);
      return;
    case 385:
      r.nextIntRange(68, 71);
      return;
    case 254:
      if (fx < 72) r.nextInt(3);
      else if (fx < 108) r.nextInt(2);
      else r.nextInt(4);
      return;
    default:
      if (FURNITURE_DUST.has(sheet)) r.nextInt(3);
  }
}

/** KillTile 生成期语义（cs:63559：尘埃掷循环 cs:63747-51 + 击杀写 cs:63933-65
 *  + 尾部 SquareTileFrame cs:63967） */
function killTileGen(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) return;
  const sheet = SWEEP_SHEET[st.type[i]];
  const fx = st.frameX[i]!;
  (globalThis as { __swKillCap?: (x: number, y: number, sheet: number) => void }).__swKillCap?.(x, y, sheet);
  const dust = killTileDustAmount(sheet, fx);
  for (let k = 0; k < dust; k++) makeTileDustRoll(ctx, sheet, fx);
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
/** PPPP：跨 pass 复用的生成期帧链（WorldUtils 侧 frameNeighbors 支的 1:1 入口）。
 *  vanilla 用 Actions.SetTile（setSelfFrames+setNeighborFrames 默认真）与
 *  Actions.ClearTile(frameNeighbors:true) 的所有 Gen 步骤，其邻帧 WorldGen.TileFrame
 *  会分派 frameImportant Check* 击杀链——典型：蜂蜜斑挖蜜池 ClearTile 四邻帧打到
 *  下方祭坛格 → Check3x2(26) 支撑失守 → KillTile×6 整坛坍塌（12345 链 #47 债）。
 *  - 'clearTile'：WorldUtils.ClearTile（cs:55-64）——先清本格（调用方自理）再四邻
 *    +x/-x/+y/-y，resetFrame=false；
 *  - 'setTile'：WorldUtils.TileFrame（cs:79-92）——中心 resetFrame=true 在前，
 *    四邻 resetFrame=true 在后。 */
export function genFrameNeighbors(
  st: TileStore, rng: RNG,
  x: number, y: number,
  mode: 'clearTile' | 'setTile',
): void {
  const ctx: SweepCtx = { rng, destroyObject: false, frameSparse: false, stats: undefined };
  if (mode === 'clearTile') {
    tileFrameGen(st, ctx, x + 1, y, false);
    tileFrameGen(st, ctx, x - 1, y, false);
    tileFrameGen(st, ctx, x, y + 1, false);
    tileFrameGen(st, ctx, x, y - 1, false);
  } else {
    tileFrameGen(st, ctx, x, y, true);
    tileFrameGen(st, ctx, x + 1, y, true);
    tileFrameGen(st, ctx, x - 1, y, true);
    tileFrameGen(st, ctx, x, y + 1, true);
    tileFrameGen(st, ctx, x, y - 1, true);
  }
}

/** SquareTileFrame 生成期（cs:80924，九宫、仅中心 resetFrame=true）——
 *  FrameOutAllHiveContents 的 tile 侧等消费端（cs:22544 同构邻格击杀级联） */
export function genSquareTileFrame(st: TileStore, rng: RNG, x: number, y: number): void {
  const ctx: SweepCtx = { rng, destroyObject: false, frameSparse: false, stats: undefined };
  squareTileFrame(st, ctx, x, y);
}

/** YYYYY 批新增纯导出：WorldGen.KillTile 生成期入口（尘掷表 + setTileSilent +
 *  引擎九宫级联）——Flowers 等消费端对活性击杀目标（如 27 向日葵=10×Next(2)）的
 *  掷位镜像；非活性早退零掷（与 killTileTree 语义一致处在其尘掷与全分派级联）。 */
export function genKillTile(st: TileStore, rng: RNG, x: number, y: number): void {
  const ctx: SweepCtx = { rng, destroyObject: false, frameSparse: false, stats: undefined };
  killTileGen(st, ctx, x, y);
}

/** UUUU 批新增纯导出：WorldGen.TileFrame(i, j, resetFrame:true) 单格生成期入口
 *  （DeadMansChest ActuallyPlace* 族的字面镜像——cs:532/570/617 直调单格 TileFrame
 *  而非 SquareTileFrame）。零行为新增：仅包装私有 tileFrameGen。 */
export function genTileFrame(st: TileStore, rng: RNG, x: number, y: number): void {
  const ctx: SweepCtx = { rng, destroyObject: false, frameSparse: false, stats: undefined };
  tileFrameGen(st, ctx, x, y, true);
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
function tileFrameGen(st: TileStore, ctx: SweepCtx, x: number, y: number, reset: boolean): void {
  // 边距 5 早退（cs:82070）；!active 清 half/slope/块漆早退（cs:82078-82082，
  // ClearBlockPaintAndCoating——RRRR 补块漆清）
  if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;
  const i = st.idx(x, y);
  if (!st.flags[i]) { st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0; return; }
  const sheet = SWEEP_SHEET[st.type[i]];
  if (sheet < 0) return;
  if (frameImportantDispatch(st, ctx, x, y, sheet, reset)) return;
  // 非实心非 frameImportant：仙人掌 / 藤（cs:82102-82117）
  const d = TILE_DEFS[st.type[i]];
  if (!d?.solid) {
    if (sheet === 80) { if (checkCactusSweep(st, ctx, x, y)) return; }
    else if (IS_VINE.has(sheet)) { checkVinesSweep(st, ctx, x, y, sheet); return; }
  }
}

/** TileFrameImportant 分派（cs:85703+）——返回 true=已处理（含 no-op 族） */
function frameImportantDispatch(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number, reset = false): boolean {
  // frameSparse 模式跳过的读帧族（165/185/28/240族/485/72/C3X2 族——见 SweepCtx 注释）
  //   ★CCCCC：+138/411——Check2x2 完整性门读 2×2 四格帧；探针基座（金标 typ×陈旧
  //   JS 帧嵌合）上巨石/起爆器帧不可信 → 锚反解到互指的死区 → 尾 4×4 帧与 184 杀
  //   级联互喂成无限递归（#105 实爆）。生产（frameSparse=false，帧由本管线同源写
  //   入）恒自洽不受影响；#101 的 genTileFrame 直调 ctx 同为 false（TrackPass 巷杀
  //   级联实证无爆）。
  if (ctx.frameSparse && (
    sheet === 165 || sheet === 185 || sheet === 28 || sheet === 653 || sheet === 240
    || sheet === 440 || sheet === 485 || sheet === 72 || sheet === 178 || sheet === 138
    || sheet === 411 || sheet === 752 || sheet === 5 || sheet === 596 || sheet === 616
    || sheet === 34 || sheet === 27
    || C3X2_TYPES.has(sheet)
    // KKKKK：新击杀族同列（自读帧族——嵌合基座伪杀/互喂风险，C3X2 同款处置；
    //   #101 槽 frameSparse=false 不受影响，真实行为由生产管线承载）
    || (sheet >= 82 && sheet <= 84) || sheet === 233 || sheet === 236 || sheet === 238
    || sheet === 702 || CHECK2XX_TYPES.has(sheet)
    // VVVVV：Check1x2 椅族/CheckOrb 珠族/484 巨石仙人掌同列（自读帧族）
    || sheet === 15 || sheet === 20 || sheet === 216 || sheet === 338 || sheet === 390
    || sheet === 493 || sheet === 497 || sheet === 590 || sheet === 595 || sheet === 615
    || sheet === 12 || sheet === 31 || sheet === 639 || sheet === 696 || sheet === 484)) {
    return true;   // UUUU：178 同列读帧族（sparse 模式下嵌合帧会伪杀 CheckAndAdjust）
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
    // KKKKK 批补（#101 金标 14 格击杀实证——文件头"零击杀证据"备案陈旧）：
    //   CheckAlch 药草（cs:86573 default 的 tileAlch 族）/ CheckJunglePlant 233/236/
    //   238/702（cs:86218-22）/ Check2xX 2×N 竖排家具（cs:86461-88，default 分支）
    case 82: case 83: case 84: checkAlchSweep(st, ctx, x, y, sheet); return true;
    case 233: case 236: case 238: case 702:
      checkJunglePlantSweep(st, ctx, x, y, sheet); return true;
    case 28: case 653: checkPotSweep(st, ctx, x, y, sheet); return true;
    case 240: case 440: check3x3WallSweep(st, ctx, x, y); return true;
    case 485: checkSuper485Sweep(st, ctx, x, y); return true;
    case 136: frame136Sweep(st, ctx, x, y); return true;
    case 129: case 149: frame129Sweep(st, ctx, x, y); return true;
    // UUUU 批补：178 宝石籽（cs:85844-85886）——CheckAndAdjustMultiDirectionalTile
    // 成功且 resetFrame=true 时 1×Next(3) 重掷 frameY 偏移。原引擎备案"KillTile
    // 九宫中心恒非 178 永不触发"；genTileFrame（WorldUtils.TileFrame 直调镜像，
    // MicroBiomes ActuallyPlace*/SetTile(setSelfFrames) 族）会以 resetFrame=true
    // 帧到 178 → 掷门激活（#101 span 对拍 @800 实证：薄冰 SetTile 邻格 178）。
    case 178: frame178Sweep(st, ctx, x, y, reset); return true;
    case 529: frame529Sweep(st, ctx, x, y); return true;
    case 81: frame81Sweep(st, ctx, x, y); return true;
    // RRRR 批补：门（cs:86021-86030 → CheckDoorClosed/Open cs:87176/87082）与
    // Check1x1 族（cs:86310-23：36/135/141/210/239/428/593/624/650/656/700/701）——
    // #77 KillTile 探针普查：10 门×3 格、135×1（229 非实心期支撑失守）
    case 10: checkDoorClosedSweep(st, ctx, x, y); return true;
    case 11: checkDoorOpenSweep(st, ctx, x, y); return true;
    case 36: case 135: case 141: case 210: case 239: case 428:
    case 593: case 624: case 650: case 656: case 700: case 701:
      check1x1Sweep(st, ctx, x, y); return true;
    // VVVVV 批补（cs:86278-86286 / cs:85990-85994）：Check1x2 椅族 +
    //   CheckOrb 珠族——#77 岛屋椅 15（202 日光板 Piles 期翻转）与暗影珠 31
    //   （2×2 部分残缺）金标实证（两链双根因）
    case 15: case 20: case 216: case 338: case 390: case 493:
    case 497: case 590: case 595: case 615:
      check1x2Sweep(st, ctx, x, y, sheet); return true;
    case 12: case 31: case 639: case 696:
      checkOrbSweep(st, ctx, x, y, sheet); return true;
    case 324:
      if (!solidAllowBottom(st, x, y + 1) || invalidForPiles(st, x, y + 1)) killTileGen(st, ctx, x, y);
      return true;
    // CCCCC 批补：Check2x2 双支派发——cs:86396-86403（case 335/**411**/490/564/565/
    //   594）与 cs:86672-86688（case 132/**138**/142/143/288-295/484/664/665/711/712）
    //   同归 Check2x2。本批定向补 **138+411**（9293480 #101/#105 金标在场成员：
    //   DeadMans 巨石 138 三块 + 矿爆起爆器 411 轨道巷杀级联）；其余成员维持未派发
    //   备案（零掷不可见族，见文件头清单）。
    // VVVVV 批补：+484 滚地仙人掌（m20260811 #77 金标实证 (3579,1241) 残块
    //   Check2x2 完整性杀；BOULDER_SHEETS 成员走巨石支=尘掷 0）。
    // YYYYY 批补：+752 奇莱特蛋（TileFrameImportant case 752 cs:86433 break →
    //   goto case 132 → Check2x2；12345 #97 (3127,926) 蛋下半被岩浆死杀 → 级联
    //   Check2x2 孤儿上半杀——掷流 62,050=62,050 全等，纯零掷杀差实证。同组
    //   172/360/505-527/543/568-570/580/598/620/652/654/713-716/751 同走该
    //   break-goto——生成期在场成员均为零掷族，未实证不派发（备案）。
    case 138: case 411: case 484: case 752:
      check2x2Sweep(st, ctx, x, y, sheet);
      return true;
    // YYYYY 批补（cs:86616/52826）：CheckTree 树坍塌 + CheckChand 吊灯——
    //   s22222 #97 vanilla 杀链实证（KillTile 织入：CheckTree 系 118 杀/吊灯 8 杀，
    //   引擎缺臂=JS 树 21 格存活/吊灯 3 格存活）。454 掉落掷族未实证不派发。
    case 5:
      checkTreeSweep(st, ctx, x, y);
      return true;
    // YYYYY 批补：596/616 观赏树（CheckTreeWithSettings·Vanity cs:54430）——m #90
    //   花圃 15 格 616 整树坍塌实证。583-589/634（Gem/Ash 树）未实证不派发（备案）。
    case 596: case 616:
      checkTreeSweep(st, ctx, x, y, true);
      return true;
    case 34:
      checkChandSweep(st, ctx, x, y, sheet);
      return true;
    // YYYYY 批补（cs:86381 → cs:53768）：CheckSunflower 向日葵 2×4 整组杀——
    //   m20260811 #90 花圃击杀 (3889,366) 干基 → vanilla 级联杀整株 2×4（尘掷
    //   27→Next(2)×10/格），JS 单杀=掷流 1034 处分叉全漂（掷差 307）。
    case 27:
      checkSunflowerSweep(st, ctx, x, y, sheet);
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
      if (CHECK2XX_TYPES.has(sheet)) { check2xXSweep(st, ctx, x, y, sheet); return true; }
      if (C3X2_TYPES.has(sheet)) { check3x2Sweep(st, ctx, x, y, sheet); return true; }
      return false;   // 未移植族（见文件头清单）——非 frameImportant 路径由此回落
  }
}

/** Check2x2 上方箱族豁免（cs:48483-85：BasicChest{21,467}+BasicChestFake{441,468}
 *  +88 梳妆台+470 人偶架+475 帽架；type 裸读不查 active——ghost type 保真）。
 *  （HalfBrickPass UUUU/LiquidSim 同源副本；本仓"同源副本禁 import"惯例） */
const CHEST_PROTECT_2X2 = new Set([21, 467, 441, 468, 88, 470, 475]);
/** Check2x2（cs:48405-48807）——CCCCC 批补派发（case 138 巨石/cs:86672 + case 411
 *  起爆器/cs:86396）。锚点反解=本格减帧偏移（cs:48418-33；frameX≥36 修样式列 +36）；
 *  2×2 四格 type+帧全等校验（仅内层 break，外层续跑逐列地面门——cs:48441-59）；
 *  138 走 Boulders 支=上方箱族豁免+底两格 SolidTileAllowBottomSlope 联合门
 *  （cs:48473-90）；411 走非巨石支=逐列 (k,num6+2) 地面门（cs:48460-71）。败 →
 *  destroyObject 闸内整组 KillTile（尘掷走 killTileDustAmount 表：138→0、411→10/格）
 *  + 尾 4×4 TileFrame(reset=false)（cs:48800-07）。 */
function check2x2Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                            // cs:48407
  const i0 = st.idx(x, y);
  let num2 = -Math.trunc(st.frameX[i0]! / 18);                              // cs:48418
  let num = 0;
  if (num2 < -1) { num2 += 2; num = 36; }
  num2 += x;
  let num4 = st.frameY[i0]!;
  let num5 = 0;
  while (num4 >= 36) { num4 -= 36; num5++; }                                // num3=36（type 172 除外）
  const num6 = y - Math.trunc(num4 / 18);
  const isBoulder = BOULDER_SHEETS.has(sheet);                              // 138=true / 411=false
  const inW = (k: number, l: number): boolean => k >= 0 && l >= 0 && k < st.w && l < st.h;
  let flag = false;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (!inW(k, l)) { flag = true; break; }                               // GetTileSafely 新格→失配
      const q = st.idx(k, l);
      if (!st.flags[q] || SWEEP_SHEET[st.type[q]!] !== sheet
        || st.frameX[q] !== (k - num2) * 18 + num
        || st.frameY[q] !== (l - num6) * 18 + num5 * 36) { flag = true; break; }
    }
    // cs:48460-71（非巨石支：95/126 未派发、132 除外）——411 地面门
    if (!isBoulder && sheet !== 132) {
      if (!inW(k, num6 + 2)) flag = true;
      else {
        const gi = st.idx(k, num6 + 2);
        if (!st.flags[gi]
          || !(genSolidType(st.type[gi]!) || TILE_TABLE.has(SWEEP_SHEET[st.type[gi]!] ?? -1))) flag = true;
        if (st.half[gi]) flag = true;
      }
    }
  }
  if (isBoulder) {                                                          // cs:48473-90（138 支）
    const chestAbove = (cx: number, cy: number): boolean =>
      inW(cx, cy) && CHEST_PROTECT_2X2.has(SWEEP_SHEET[st.type[st.idx(cx, cy)]] ?? -1);
    if (!chestAbove(num2, num6 - 1) && !chestAbove(num2 + 1, num6 - 1)
      && !solidAllowBottom(st, num2, num6 + 2)
      && !solidAllowBottom(st, num2 + 1, num6 + 2)) flag = true;
  }
  if (!flag) return;
  ctx.destroyObject = true;                                                 // cs:48567
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (!inW(k, l)) continue;
      const q = st.idx(k, l);
      if (st.flags[q] && SWEEP_SHEET[st.type[q]!] === sheet) killTileGen(st, ctx, k, l);
    }
  }
  ctx.destroyObject = false;                                                // cs:48800
  for (let k = num2 - 1; k < num2 + 3; k++) {
    for (let l = num6 - 1; l < num6 + 3; l++) tileFrameGen(st, ctx, k, l, false);   // cs:48801-07
  }
}

/* ── CheckChand（cs:52826）type34/454 吊灯（YYYYY 批：s22222 #97 残杀链）────
 * 3×3（34）/4×3（454）吊灯完整性 + 顶锚（num+1,num2-1 须 nactive+tileSolid+
 * !tileSolidTop）；任一破 → destroyObject 闸内整组 KillTile（x 外层序）+
 * 尾 5×4 TileFrame(reset=false) 复扫。454 掉落掷链（Main.rand.Next(9) 族）
 * 未实证不派发（备案）。锚 tileSolidTop 以 platform 近似（checkBannerGen 先例）。 */
function checkChandSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                            // cs:52831
  const num3 = sheet === 454 ? 4 : 3;
  const i0 = st.idx(x, y);
  let num = Math.trunc(st.frameX[i0]! / 18);
  let num4 = 0;
  while (num >= num3) { num4++; num -= num3; }
  const num5 = x - num;
  const num6 = 18 * num3 * num4;
  let num2 = Math.trunc(st.frameY[i0]! / 18);
  let num7 = 0;
  while (num2 >= 3) { num7++; num2 -= 3; }
  if (num6 >= 108) num7 += 37 * Math.trunc(num6 / 108);                     // 换列 → 行 +37
  const num8 = 54 * num7 - (num6 >= 108 ? 54 * Math.trunc(num6 / 108) * 37 : 0);
  const top = y - num2;
  let flag = false;
  for (let k = num5; k < num5 + num3; k++) {
    for (let l = top; l < top + 3; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }                     // 原版 null→new Tile=非活性
      const q = st.idx(k, l);
      if (!st.flags[q] || SWEEP_SHEET[st.type[q]] !== sheet
        || st.frameX[q] !== (k - num5) * 18 + num6
        || st.frameY[q] !== (l - top) * 18 + num8) flag = true;              // cs:52873-85
    }
  }
  const ay = top - 1, ax = num5 + 1;
  if (!st.inBounds(ax, ay) || !nactiveAt(st, ax, ay)) flag = true;           // cs:52888-93
  else {
    const at = st.type[st.idx(ax, ay)]!;
    const d = TILE_DEFS[at];
    if (!(genSolidType(at) && !d?.platform)) flag = true;
  }
  if (!flag) return;
  ctx.destroyObject = true;                                                  // cs:52896
  for (let m = num5; m < num5 + num3; m++) {
    for (let n = top; n < top + 3; n++) {
      if (!st.inBounds(m, n)) continue;
      const q = st.idx(m, n);
      if (st.flags[q] && SWEEP_SHEET[st.type[q]] === sheet) killTileGen(st, ctx, m, n);
    }
  }
  ctx.destroyObject = false;                                                 // cs:52988
  for (let num19 = num5 - 1; num19 < num5 + num3 + 1; num19++) {
    for (let num20 = top - 1; num20 < top + 4; num20++) tileFrameGen(st, ctx, num19, num20, false);   // cs:52990-94
  }
}

/* ── CheckTree（cs:54598-54808，YYYYY 批：s22222 #97 树杀链 118 杀）──────────
 * 与 SurfaceDecorPasses.checkTreeAt 同源 1:1（ vanity=false 支）；杀走引擎
 * killTileGen（尘掷 0）+ 引擎九宫级联。帧读写走 cfx/cfy 虚拟值（死格 -1）。
 * 583-589/596/616/634/323（Gem/Vanity/Ash/Palm 树）生成期在场成员未实证，
 * 不派发（备案）。 */
const TREE_GROUND_NORM = new Set([23, 661, 477, 60, 70, 109, 147, 199, 662, 492]);
/** VanityTreeGroundTest（cs:30474）：{2,109,477,492}——无归一化（去 23/199） */
const VANITY_GROUND = new Set([2, 109, 477, 492]);
/** vanity=true：CheckTreeWithSettings·Vanity（cs:54430-54597）分支——地面谓词换
 *  VANITY_GROUND、R3 杀后不再重帧（两版 cs 差异逐条保留，checkTreeAt 同源）。 */
function checkTreeSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, vanity = false): void {
  const k = st.idx(x, y);
  const frameX0 = st.frameX[k]!, frameY0 = st.frameY[k]!;
  const self = SWEEP_SHEET[st.type[k]];
  const typeAt = (cx: number, cy: number): number => {
    if (!st.inBounds(cx, cy)) return -1;                    // 原版 null tile → -1
    const i = st.idx(cx, cy);
    return st.flags[i] ? SWEEP_SHEET[st.type[i]]! : -1;     // inactive → -1
  };
  const num2 = typeAt(x - 1, y), num3 = typeAt(x + 1, y), num = typeAt(x, y - 1);
  let num4 = typeAt(x, y + 1);
  if (!vanity && TREE_GROUND_NORM.has(num4)) num4 = 2;      // cs:54620-54636 归一化（仅 CheckTree）
  const groundOk = vanity ? VANITY_GROUND.has(num4) : num4 === 2;
  let cfx = frameX0, cfy = frameY0;
  let dead = false;
  const kill = (): void => {
    if (dead) return;                                        // KillTile inactive 早退
    dead = true; cfx = -1; cfy = -1;
    killTileGen(st, ctx, x, y);                             // 含 cs:63967 尾九宫级联
  };
  const wr = (nfx: number, nfy: number): void => {
    cfx = nfx; cfy = nfy;
    if (!dead) { st.frameX[k] = nfx; st.frameY[k] = nfy; }
  };
  if (!groundOk && num4 !== self
    && ((cfx === 0 && cfy <= 130) || (cfx === 22 && cfy <= 130) || (cfx === 44 && cfy <= 130))) kill();   // R1
  if (cfx >= 22 && cfx <= 44 && cfy >= 132 && cfy <= 176) {
    if (!groundOk) kill();                                   // R2 根须/基座侧格
    else if ((cfx !== 22 || num2 !== self) && (cfx !== 44 || num3 !== self)) kill();
  } else if ((cfx === 88 && cfy >= 0 && cfy <= 44) || (cfx === 66 && cfy >= 66 && cfy <= 130)
    || (cfx === 110 && cfy >= 66 && cfy <= 110) || (cfx === 132 && cfy >= 0 && cfy <= 176)) {
    const n5 = cfy % 66;                                     // R2else 侧枝干身重帧
    if (num2 === self && num3 === self) wr(110, 66 + n5);
    else if (num2 === self) wr(88, n5);
    else if (num3 === self) wr(66, 66 + n5);
    else wr(0, n5);
  }
  if (cfy >= 132 && cfy <= 176 && (cfx === 0 || cfx === 66 || cfx === 88)) {
    const n6 = cfy % 66;                                     // R3 基座干身
    if (vanity) {
      if (!groundOk) kill();                                 // CheckTreeWithSettings：杀后不重帧
      else if (num2 !== self && num3 !== self) wr(0, n6);
      else if (num2 !== self) wr(0, 132 + n6);
      else if (num3 !== self) wr(66, 132 + n6);
      else wr(88, 132 + n6);
    } else {
      if (!groundOk) kill();                                 // CheckTree：杀后仍重帧（写死格对象）
      if (num2 !== self && num3 !== self) wr(0, n6);
      else if (num2 !== self) wr(0, 132 + n6);
      else if (num3 !== self) wr(66, 132 + n6);
      else wr(88, 132 + n6);
    }
  }
  if ((cfx === 66 && (cfy === 0 || cfy === 22 || cfy === 44)) || (cfx === 44 && (cfy === 198 || cfy === 220 || cfy === 242))) {
    if (num3 !== self) kill();                               // R4 侧枝贴干存活链
  } else if ((cfx === 88 && (cfy === 66 || cfy === 88 || cfy === 110)) || (cfx === 66 && (cfy === 198 || cfy === 220 || cfy === 242))) {
    if (num2 !== self) kill();
  } else if (num4 === -1) {
    kill();                                                  // cs:54747（|| num4==23 前置归一化致死代码）
  } else if (num !== self && cfy < 198 && ((cfx !== 22 && cfx !== 44) || cfy < 132)) {
    const n7 = cfy % 66;                                     // R4else3 干身孤立重帧
    if (num2 === self || num3 === self) {
      if (num4 === self) {
        if (num2 === self && num3 === self) wr(132, 132 + n7);
        else if (num2 === self) wr(132, n7);
        else wr(132, 66 + n7);
      } else {
        if (num2 === self && num3 === self) wr(154, 132 + n7);
        else if (num2 === self) wr(154, n7);
        else wr(154, 66 + n7);
      }
    } else wr(110, n7);
  }
  if (cfx !== frameX0 && cfy !== frameY0 && frameX0 >= 0 && frameY0 >= 0) {
    tileFrameGen(st, ctx, x - 1, y, false);                  // cs:54798-54806 尾部传播（双帧均变）
    tileFrameGen(st, ctx, x + 1, y, false);
    tileFrameGen(st, ctx, x, y - 1, false);
    tileFrameGen(st, ctx, x, y + 1, false);
  }
}

/* ── CheckSunflower（cs:53768）type27 向日葵 2×4（YYYYY 批：m #90 花圃杀链）──
 * 完整性（type+fx 列 mod2+fy 行）+ 双列地面门（{2,477,492,109,60,633} ∪ SolidTile）
 * → 破 → destroyObject 闸内 2×4 整组 KillTile（尘掷 27→Next(2)/格×10）。无尾扫
 * （cs:53810 destroyObject=false 即返）；Item.NewItem(63) 生成期 noItem 零掷。 */
function checkSunflowerSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                            // cs:53772
  let flag = false;
  const i0 = st.idx(x, y);
  let num = Math.trunc(st.frameX[i0]! / 18);
  const num2 = y - Math.trunc(st.frameY[i0]! / 18);
  while (num > 1) num -= 2;
  num = x - num;                                                            // num *= -1; num += i
  for (let k = num; k < num + 2; k++) {
    for (let l = num2; l < num2 + 4; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }                    // 原版 null→new Tile=非活性
      const q = st.idx(k, l);
      let num3 = Math.trunc(st.frameX[q]! / 18);
      while (num3 > 1) num3 -= 2;
      if (!nactiveAt(st, k, l) || SWEEP_SHEET[st.type[q]] !== sheet
        || num3 !== k - num || st.frameY[q] !== (l - num2) * 18) flag = true;   // cs:53792-94
    }
    if (!st.inBounds(k, num2 + 4)) { flag = true; continue; }
    const g = st.idx(k, num2 + 4);
    const gs = SWEEP_SHEET[st.type[g]];
    if (!nactiveAt(st, k, num2 + 4)
      || (gs !== 2 && gs !== 477 && gs !== 492 && gs !== 109 && gs !== 60 && gs !== 633)) flag = true;   // cs:53781
    if (!solidTile(st, k, num2 + 4)) flag = true;                           // cs:53786
  }
  if (!flag) return;
  ctx.destroyObject = true;                                                 // cs:53799
  for (let m = num; m < num + 2; m++) {
    for (let n = num2; n < num2 + 4; n++) {
      if (!st.inBounds(m, n)) continue;
      const q = st.idx(m, n);
      if (st.flags[q] && SWEEP_SHEET[st.type[q]] === sheet) killTileGen(st, ctx, m, n);
    }
  }
  ctx.destroyObject = false;                                                // cs:53810（无尾扫）
}

// ============================================================
// KKKKK 批补：#101 击杀级联三族（金标 14 格实证——文件头"零击杀证据"陈旧）
// ============================================================

/** Main.tileAlch（Main.cs:7755-57）＝{82,83,84}；CheckAlch 地基列（cs:45981） */
const ALCH_GROUND: Record<number, Set<number>> = {
  0: new Set([109, 2, 477, 492, 78, 380]),
  1: new Set([60, 78, 380]),
  2: new Set([0, 59, 78, 380]),
  3: new Set([661, 662, 199, 203, 23, 25, 78, 380]),
  4: new Set([53, 78, 380, 116]),
  5: new Set([57, 633, 78, 380]),
  6: new Set([78, 380, 147, 161, 163, 164, 200]),
};

/** CheckAlch（cs:45981-46044，dispatch default 的 tileAlch 族 cs:86573）：
 *  下格 !nactive/半砖 → 杀；frameY 无条件复位 0；switch 仅在头门通过时进入——
 *  按 frameX/18 列查地基（列外=无 case → 恒活）；lava 格恒杀；列 5 的成熟转换
 *  在 case 内部（进入 switch 即执行，不受中途 flag 影响）。 */
function checkAlchSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  const i = st.idx(x, y);
  const isLava = st.liquid[i]! > 0 && st.liquidType[i] === LIQUID_TYPE.LAVA;
  let bad = !nactiveAt(st, x, y + 1) || halfOf(st, x, y + 1);               // cs:45989-94
  st.frameY[i] = 0;                                                          // 无条件复位（cs:45996）
  const col = Math.trunc(st.frameX[i]! / 18);
  if (!bad) {                                                                // switch 进入门（cs:45997）
    const g = ALCH_GROUND[col];
    if (g) {                                                                 // 列 0-6；列外无 case
      if (!g.has(sheetAt2(st, x, y + 1))) bad = true;
      // cs:46000-46065：case 0-4/6 有 lava 门；★case 5 无岩浆枯杀款（cs:46062-65
      //   雪族阶段以 82 豁免 break + 83↔84 bloom 切换替代——YYYYY：曾全域套用岩浆
      //   必枯 → 12345 #99 (619,1071)/(3719,1093) t82@stage5 岩浆误杀，vanilla 存活）
      if (isLava && col !== 5) bad = true;
      if (col === 5) {                                                       // cs:46025-42 成熟转换
        if (sheet !== 82 && isLava) {
          if (st.liquid[i]! > 16) {
            if (sheet === 83) st.type[i] = REV_SHEET_ID.get(84)!;
          } else if (sheet === 84) st.type[i] = REV_SHEET_ID.get(83)!;
        }
      }
    }
  }
  if (bad) killTileGen(st, ctx, x, y);
}

/** CheckJunglePlant（cs:47952-48119，dispatch cs:86218-22 case 233/236/238/702）：
 *  2×2 分支（frameY≥36 或 236/238/702）：锚=frameX/18 mod2 列 + frameY/18 mod2 行，
 *  num5=样式列×36、帧基 36（233）/0（236/238/702）；完整性+逐列地面 SolidTile+type60
 *  （702 走 AllowBottomSlope）→ 整组杀。3×2 分支（frameY<36）：mod3 列锚、num14=样式×54、
 *  杀循环行数 3（num11..num11+2——原文如此）。 */
function checkJunglePlantSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  const fx = st.frameX[i]!, fy = st.frameY[i]!;
  const solidGround60 = (k: number, yy: number): boolean =>
    nactiveAt(st, k, yy) && sheetAt2(st, k, yy) === 60
    && genSolidType(st.type[st.idx(k, yy)]!) && !TILE_DEFS[st.type[st.idx(k, yy)]]?.platform
    && slopeOf(st, k, yy) === 0 && !halfOf(st, k, yy);                      // SolidTile+type60
  if (fy >= 36 || sheet === 236 || sheet === 238 || sheet === 702) {
    let num = Math.trunc(fx / 18), num2 = 0;
    while (num > 1) { num -= 2; num2++; }
    num = x - num;
    let num4 = Math.trunc(fy / 18);
    while (num4 > 1) num4 -= 2;
    num4 = y - num4;
    const num3 = (sheet === 236 || sheet === 238 || sheet === 702) ? 0 : 36;
    const num5 = num2 * 36;
    let bad = false;
    for (let k = num; k < num + 2; k++) {
      for (let l = num4; l < num4 + 2; l++) {
        if (!st.inBounds(k, l)) { bad = true; break; }
        const q = st.idx(k, l);
        if (!st.flags[q] || SWEEP_SHEET[st.type[q]!] !== sheet
          || st.frameX[q] !== (k - num) * 18 + num5
          || st.frameY[q] !== (l - num4) * 18 + num3) bad = true;           // cs:47995-48005
      }
      if (!st.inBounds(k, num4 + 2)) { bad = true; continue; }
      if (sheet === 702) { if (!solidAllowBottom(st, k, num4 + 2)) bad = true; }
      else if (!solidGround60(k, num4 + 2)) bad = true;                     // cs:48042-52
    }
    if (!bad) return;
    ctx.destroyObject = true;
    for (let n = num; n < num + 2; n++) {
      for (let m = num4; m < num4 + 2; m++) {
        if (!st.inBounds(n, m)) continue;
        const q = st.idx(n, m);
        if (st.flags[q] && SWEEP_SHEET[st.type[q]!] === sheet) killTileGen(st, ctx, n, m);
      }
    }
    ctx.destroyObject = false;
    return;
  }
  // 3×2 分支（cs:48061-48113）
  let bad2 = false;
  const num11 = y - Math.trunc(fy / 18);
  let num12 = Math.trunc(fx / 18), num13 = 0;
  while (num12 > 2) { num12 -= 3; num13++; }
  num12 = x - num12;
  const num14 = num13 * 54;
  for (let k = num12; k < num12 + 3; k++) {
    for (let l = num11; l < num11 + 2; l++) {
      if (!st.inBounds(k, l)) { bad2 = true; break; }
      const q = st.idx(k, l);
      if (!st.flags[q] || SWEEP_SHEET[st.type[q]!] !== sheet
        || st.frameX[q] !== (k - num12) * 18 + num14
        || st.frameY[q] !== (l - num11) * 18) bad2 = true;                  // cs:48080
    }
    if (!st.inBounds(k, num11 + 2)) { bad2 = true; continue; }
    if (!solidGround60(k, num11 + 2)) bad2 = true;                          // cs:48089
  }
  if (!bad2) return;
  ctx.destroyObject = true;
  for (let n = num12; n < num12 + 3; n++) {
    for (let m = num11; m < num11 + 3; m++) {                               // ★行数 3（原文）
      if (!st.inBounds(n, m)) continue;
      const q = st.idx(n, m);
      if (st.flags[q] && SWEEP_SHEET[st.type[q]!] === sheet) killTileGen(st, ctx, n, m);
    }
  }
  ctx.destroyObject = false;
}

/** Check2xX（cs:38009-38243，dispatch cs:86461-88）——2×N 竖排家具族
 *  {104,105,207,320,337,349,356,378,410,456,465,480,489,506,509,531,545,560,
 *   591,592,657,658,663,720,721,725}：完整性（2 列 × num4 行，frameY=行*18+num5、
 *  frameX 列位 +18）+ 支撑（465/531/591/592 顶锚=上格 380/平台/SolidTileAllowTopSlope
 *  + IsBelowANonHammeredPlatform num8=8 双列一致；其余底锚 AllowBottomSlope×2）
 *  → destroyObject 闸内整组杀。Item 掉落零掷（生成期 noItem 无堆叠实参）省略。 */
const CHECK2XX_TYPES = new Set([104, 105, 207, 320, 337, 349, 356, 378, 410, 456, 465,
  480, 489, 506, 509, 531, 545, 560, 591, 592, 657, 658, 663, 720, 721, 725]);
function check2xXSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  let num = x;
  let r = st.frameX[i]!;
  while (r >= 36) r -= 36;
  if (r === 18) num--;                                                      // cs:38017-19
  if (!st.inBounds(num, y)) return;
  let num3 = Math.trunc(st.frameY[st.idx(num, y)]! / 18);
  const num4 = sheet === 104 ? 5 : sheet === 207 ? 4 : 3;
  let num5 = 0;
  while (num3 >= num4) { num3 -= num4; num5 += num4 * 18; }
  const num6 = y - num3;
  if (sheet === 410 && num5 !== 0) num5 += 2;                               // cs:38040-43
  if (!st.inBounds(num, num6)) return;
  const frameX = st.frameX[st.idx(num, y)]!;
  const frameY = st.frameY[st.idx(num, y)]!;
  let bad = false;
  for (let k = 0; k < num4; k++) {
    for (const cx of [num, num + 1]) {
      if (!st.inBounds(cx, num6 + k)) { bad = true; continue; }
      const q = st.idx(cx, num6 + k);
      const wantFx = cx === num ? frameX : frameX + 18;
      if (!st.flags[q] || SWEEP_SHEET[st.type[q]!] !== sheet
        || st.frameY[q] !== k * 18 + num5 || st.frameX[q] !== wantFx) bad = true;
    }
  }
  if (sheet === 465 || sheet === 531 || sheet === 591 || sheet === 592) {    // 顶锚族（cs:38100-39）
    let num7 = -1;
    for (let l = 0; l < 2; l++) {
      let num8 = 0;
      let flag2: boolean;
      const aboveSh = st.inBounds(num + l, num6 - 1) ? sheetAt2(st, num + l, num6 - 1) : -1;
      if (sheet !== 531 && aboveSh === 380) flag2 = true;
      else if (sheet !== 531 && aboveSh >= 0 && PLATFORMS.has(aboveSh)) {
        // IsBelowANonHammeredPlatform(num+l, num6)（cs:38315）：上格平台平砖非半砖
        const up = st.inBounds(num + l, num6 - 1) ? st.idx(num + l, num6 - 1) : -1;
        if (up >= 0 && st.flags[up] && PLATFORMS.has(SWEEP_SHEET[st.type[up]] ?? -1)
          && st.half[up] === 0 && st.slope[up] === 0) num8 = 8;
        flag2 = true;
      } else flag2 = solidAllowTop(st, num + l, num6 - 1);
      if (flag2) {
        if (num7 === -1) num7 = num8;
        if (num7 !== num8) flag2 = false;
      }
      if (!flag2) { bad = true; break; }
    }
  } else {                                                                  // 底锚族（cs:38143-50）
    if (!solidAllowBottom(st, num, num6 + num4)) bad = true;
    if (!solidAllowBottom(st, num + 1, num6 + num4)) bad = true;
  }
  if (!bad) return;
  ctx.destroyObject = true;
  for (let m = 0; m < num4; m++) {
    for (const cx of [num, num + 1]) {
      if (!st.inBounds(cx, num6 + m)) continue;
      const q = st.idx(cx, num6 + m);
      if (st.flags[q] && SWEEP_SHEET[st.type[q]!] === sheet) killTileGen(st, ctx, cx, num6 + m);
    }
  }
  ctx.destroyObject = false;
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
    return id !== undefined && genSolidType(id) && !NO_ATTACH.has(sh);
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

/** case 178 宝石籽（cs:85844-85886）：CheckAndAdjustMultiDirectionalTile
 *  （cs:60338——四向锚 ValidAnchor+方向优先 下>左>右>上）成功 → 带外帧
 *  frameY = 带基 + (resetFrame ? Next(3)*18 : frameY%54)；失败 → KillTile。 */
function frame178Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number, reset: boolean): void {
  const i = st.idx(x, y);
  const frameY2 = st.frameY[i]!;
  // CheckAndAdjustMultiDirectionalTile：InWorld(i,j,2) 门
  if (!(x >= 2 && y >= 2 && x < st.w - 2 && y < st.h - 2)) { killTileGen(st, ctx, x, y); return; }
  const anchorOk = (ax: number, ay: number, dir: number): boolean => {
    if (!st.inBounds(ax, ay)) return false;
    const k = st.idx(ax, ay);
    const sh = SWEEP_SHEET[st.type[k]!] ?? -1;
    if (sh < 0 || BOULDER_SHEETS.has(sh) || sh === 10) return false;
    if (dir === 0) return solidAllowTop(st, ax, ay);
    if (dir === 1) return solidAllowBottom(st, ax, ay);
    if (dir === 2) return solidAllowSide(st, ax, ay, 'L');
    return solidAllowSide(st, ax, ay, 'R');
  };
  const solidNS = (ax: number, ay: number): boolean => {
    const k = st.idx(ax, ay);
    return genSolidType(st.type[k]!) && !TILE_DEFS[st.type[k]!]?.platform;
  };
  let dir = -1;
  if (anchorOk(x, y + 1, 1) && solidNS(x, y + 1)) dir = 0;          // 下方锚 → 带基 0
  else if (anchorOk(x - 1, y, 2) && solidNS(x - 1, y)) dir = 2;     // 左锚 → 108
  else if (anchorOk(x + 1, y, 3) && solidNS(x + 1, y)) dir = 3;     // 右锚 → 162
  else if (anchorOk(x, y - 1, 0) && solidNS(x, y - 1)) dir = 1;     // 上锚 → 54
  if (dir < 0) { killTileGen(st, ctx, x, y); return; }
  const num21 = (!reset) ? frameY2 % 54 : (ctx.rng ? ctx.rng.nextInt(3) * 18 : 0);
  let num22 = -1;
  if (dir === 0 && (frameY2 < 0 || frameY2 > 36)) num22 = 0;
  else if (dir === 1 && (frameY2 < 54 || frameY2 > 90)) num22 = 54;
  else if (dir === 2 && (frameY2 < 108 || frameY2 > 144)) num22 = 108;
  else if (dir === 3 && (frameY2 < 162 || frameY2 > 198)) num22 = 162;
  if (num22 > -1) st.frameY[i] = num22 + num21;
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
    return id !== undefined && genSolidType(id) && !TILE_DEFS[id]?.platform;
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
  const solidBelow = id !== undefined && genSolidType(id);
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
  } else if ((fx18 >= 54 && fx18 <= 59) || fx18 >= 73) {   // 54-59 ∪ 73-76（60-72 无查）
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
  // 掉落帧带读（cs:47105-47109）：左格失活 → 取右格 frameX
  let dropFx = st.frameX[st.idx(x0, y)] ?? 0;
  if (!st.flags[st.idx(x0, y)]) dropFx = st.frameX[st.idx(x0 + 1, y)] ?? 0;
  ctx.destroyObject = true;
  for (const xx of [x0, x0 + 1]) {
    if (sheetAt2(st, xx, y) === sheet && activeAt2(st, xx, y)) killTileGen(st, ctx, xx, y);
  }
  // ★KKKKK：185 内容掉落掷（cs:47135-47232）——生成期 Item.NewItem 走 noItem
  //   无产物，但 genRand 实参（堆叠数）先求值必耗掷（FFFFF 轨巷 'b 1 4' 定罪，
  //   TrackPass check2x1Track 本地表收编进引擎）。六带值域照原文：
  //   576-610 明胶×2+8 条件掷 / 612-646 银 / 648-682 金 / 684-898 六带 Next(1,4)。
  if (sheet === 185) pileDropRollsGen(ctx, dropFx);
  ctx.destroyObject = false;
  // 尾双 SquareTileFrame（cs:47366-68）——KillTile 尾级联之外的两次九宫重访
  squareTileFrame(st, ctx, x0, y);
  squareTileFrame(st, ctx, x0 + 1, y);
}

/** Check2x1 type==185 内容掉落掷（cs:47137-47232）——掷序/值域 1:1（条件掷按原值门；
 *  与 TrackPass.pileDropRolls 同源，引擎域版本） */
function pileDropRollsGen(ctx: SweepCtx, fx: number): void {
  const r = ctx.rng;
  if (!r) return;
  if (fx >= 576 && fx <= 610) {            // 明胶(71)
    r.nextIntRange(10, 100);
    r.nextIntRange(20, 100);
    if (r.nextInt(3) !== 0) r.nextIntRange(10, 100);
    if (r.nextInt(3) !== 0) r.nextIntRange(20, 100);
    if (r.nextInt(2) === 0) r.nextIntRange(10, 100);
    if (r.nextInt(2) === 0) r.nextIntRange(20, 100);
    if (r.nextInt(3) === 0) r.nextIntRange(10, 100);
    if (r.nextInt(3) === 0) r.nextIntRange(20, 100);
    if (r.nextInt(4) === 0) r.nextIntRange(10, 100);
    if (r.nextInt(4) === 0) r.nextIntRange(20, 100);
    if (r.nextInt(5) === 0) r.nextIntRange(10, 100);
    if (r.nextInt(5) === 0) r.nextIntRange(20, 100);
  } else if (fx >= 612 && fx <= 646) {     // 银(72)
    r.nextIntRange(10, 100);
    if (r.nextInt(2) === 0) r.nextIntRange(20, 100);
    if (r.nextInt(3) === 0) r.nextIntRange(30, 100);
  } else if (fx >= 648 && fx <= 682) {     // 金(73)
    r.nextIntRange(1, 6);
    if (r.nextInt(2) === 0) r.nextIntRange(2, 6);
    if (r.nextInt(3) === 0) r.nextIntRange(3, 6);
  } else if ((fx >= 684 && fx <= 718) || (fx >= 720 && fx <= 754) || (fx >= 756 && fx <= 790)
    || (fx >= 792 && fx <= 826) || (fx >= 828 && fx <= 862) || (fx >= 864 && fx <= 898)) {
    r.nextIntRange(1, 4);                  // 181/180/177/179/178/182 六带同掷
  }
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
        || st.frameX[ki] !== style * 36 + xx * 18 || st.frameY[ki] !== yy * 18) bad = true;
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

/** raw sheet 直读（原版 Main.tile[x,y].type 无 active 门——残值 type 参与判定） */
const rawSheetAt = (st: TileStore, x: number, y: number): number => {
  if (!st.inBounds(x, y)) return -1;
  return SWEEP_SHEET[st.type[st.idx(x, y)]];
};
/** Main.tileSolidTop（Main.cs:6764+ 全 86 项，U/GemPasses 同表副本——同源副本禁 import） */
const TILE_SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** WorldGen.SolidTile(Tile)（cs:70155）：active && tileSolid && !tileSolidTop && !half && slope==0 */
function solidTileV(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const sh = SWEEP_SHEET[st.type[i]];
  if (sh < 0) return false;
  return genSolidType(st.type[i]) && !TILE_SOLID_TOP.has(sh) && !st.half[i] && st.slope[i] === 0;
}

/** CheckDoorClosed（cs:87176）：1x3 门体 + 上下 SolidTile 锚；★尾无条件
 *  destroyObject=false（vanilla 原样——门检查会清全局杀位）。#77 实证 10 门×3 格。 */
function checkDoorClosedSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  const num = y - Math.floor((st.frameY[i]! % 54) / 18);
  let bad = !solidTileV(st, x, num - 1) || !solidTileV(st, x, num + 3);
  for (let k = 0; k <= 2; k++) {
    if (!activeAt2(st, x, num + k) || sheetAt2(st, x, num + k) !== 10) bad = true;
  }
  if (bad) {
    ctx.destroyObject = true;
    for (let k = 0; k <= 2; k++) {
      if (sheetAt2(st, x, num + k) === 10) killTileGen(st, ctx, x, num + k);
    }
  }
  ctx.destroyObject = false;
}

/** CheckDoorOpen（cs:87082）：2x3 开门体 + 上下 SolidTile 锚（生成期无开门，备案门） */
function checkDoorOpenSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  const fx = st.frameX[i]!;
  const num3 = y - Math.floor((st.frameY[i]! % 54) / 18);
  let num2 = x;
  switch (fx % 72) {
    case 0: num2 = x; break;
    case 18: num2 = x - 1; break;
    case 36: num2 = x + 1; break;
    case 54: num2 = x; break;
  }
  let bad = !solidTileV(st, num2, num3 - 1) || !solidTileV(st, num2, num3 + 3);
  const x0 = fx % 72 === 36 || fx % 72 === 54 ? num2 - 1 : num2;
  if (!bad) {
    for (let k = x0; k < x0 + 2 && !bad; k++) {
      for (let l = num3; l < num3 + 3; l++) {
        if (!activeAt2(st, k, l) || sheetAt2(st, k, l) !== 11) { bad = true; break; }
      }
    }
  }
  if (bad) {
    ctx.destroyObject = true;
    for (let k = x0; k < x0 + 2; k++) {
      for (let l = num3; l < num3 + 3; l++) {
        if (activeAt2(st, k, l) && sheetAt2(st, k, l) === 11) killTileGen(st, ctx, k, l);
      }
    }
  }
  ctx.destroyObject = false;
}

/** Check1x1（cs:45243）：下方非 SolidTileAllowBottomSlope 或巨石族 → 杀（624 特例门
 *  为 AbigailsFlower 运行期逻辑，生成期不触发）。#77 实证 135×1（229 支撑非实心期）。 */
function check1x1Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!st.inBounds(x, y + 1)) return;
  if (!solidAllowBottom(st, x, y + 1)) { killTileGen(st, ctx, x, y); return; }
  const below = rawSheetAt(st, x, y + 1);
  if (below >= 0 && BOULDER_SHEETS.has(below)) killTileGen(st, ctx, x, y);
}

/** Check1x2（cs:43377-43545，椅 15/苗 20/216/338/390/493/497/590/595/615）——
 *  VVVVV 批补派发（#77 岛屋椅 15 双链金标实证：Piles 头 202 日光板翻转非实心
 *  （cs:18906）→ 支撑失守 → vanilla 杀两椅格、JS 无臂永生）。
 *  锚：fy 40 进制剥行（num3=行）；余 18（下半格）→ 上移一。完整性=fy 链
 *  （40n/40n+18）+双格 raw type 匹配；支撑=!SolidTileAllowBottomSlope(num+2)
 *  且非平台族（tileSolidTop 兜底——TileID.Sets.Platforms 原文）。type 20（橡实
 *  苗——生成期无放置源，备案死支）变体重帧带 genRand.Next(3)。杀=destroyObject
 *  闸内两格 KillTile（type==type raw 门）+尾复位。掉落（GetItemDrop_Chair 纯表/
 *  216/338/390/493/497 常量 id）零掷。 */
function check1x2Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                             // cs:43380
  let num = y;
  let bad = true;
  let num2 = st.frameY[st.idx(x, num)] ?? 0;                                 // null tile → 0
  let num3 = 0;
  while (num2 >= 40) { num2 -= 40; num3++; }                                 // 40 行剥
  if (num2 === 18) num--;                                                    // cs:43398 下半锚上移
  if (st.frameY[st.idx(x, num)] === 40 * num3
    && st.frameY[st.idx(x, num + 1)] === 40 * num3 + 18
    && rawSheetAt(st, x, num) === sheet && rawSheetAt(st, x, num + 1) === sheet) bad = false;   // cs:43406
  const belowSheet = rawSheetAt(st, x, num + 2);
  if (!solidAllowBottom(st, x, num + 2) && !PLATFORMS.has(belowSheet)) bad = true;              // cs:43409
  if (sheet === 20) {                                                        // cs:43411-43463 苗变体（生成期死支，1:1 保留）
    const num5 = Math.trunc((st.frameX[st.idx(x, num)] ?? 0) / 54);
    let num6 = -1;
    switch (belowSheet) {
      case 2: case 477: num6 = 0; break;
      case 147: num6 = 1; break;
      case 60: num6 = 2; break;
      case 23: case 661: num6 = 3; break;
      case 199: case 662: num6 = 4; break;
      case 109: case 492: num6 = 5; break;
      case 53: num6 = 6; break;
      case 116: num6 = 7; break;
      case 234: num6 = 8; break;
      case 112: num6 = 9; break;
      case 633: num6 = 10; break;
      default: bad = true; break;
    }
    if (!bad && num5 !== num6 && ctx.rng) {
      const num7 = 54 * num6 + ctx.rng.nextInt(3) * 18;                      // cs:43459 genRand
      st.frameX[st.idx(x, num)] = num7;
      st.frameX[st.idx(x, num + 1)] = num7;
    }
  }
  if (!bad) return;
  ctx.destroyObject = true;                                                  // cs:43485
  if (rawSheetAt(st, x, num) === sheet) killTileGen(st, ctx, x, num);
  if (rawSheetAt(st, x, num + 1) === sheet) killTileGen(st, ctx, x, num + 1);
  ctx.destroyObject = false;                                                 // cs:43545 尾复位
}

/** CheckOrb（cs:54187-54275，12/31/639/696）——VVVVV 批补派发（#77 暗影珠 31
 *  金标实证：2×2 珠体有一格已被上游杀（g76 死格）→ 完整性破 → vanilla 杀余
 *  3 格、JS 无臂永生）。锚：fx∈{0,36} 为左列（36=猩红心左列基），否则 i-1；
 *  fy≠0 → j-1。完整性=2×2 四格 nactive+raw type 匹配；12/639 加下两格
 *  SolidTileAllowBottomSlope（31/696 无支撑门）。杀=raw type 匹配格 KillTile。
 *  掉落走 Main.rand（cs:54249 Next(5)）不耗 genRand；31 尘掷 0。 */
function checkOrbSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                             // cs:54198
  const fx = st.frameX[st.idx(x, y)] ?? 0;
  const num = (fx !== 0 && fx !== 36) ? x - 1 : x;                           // cs:54201
  const num2 = (st.frameY[st.idx(x, y)] ?? 0) !== 0 ? y - 1 : y;             // cs:54202
  let dead = false;
  for (let k = 0; k < 2; k++) {
    for (let l = 0; l < 2; l++) {
      if (!nactiveAt(st, num + k, num2 + l) || rawSheetAt(st, num + k, num2 + l) !== sheet) {
        dead = true; break;                                                  // cs:54211
      }
    }
    if (dead) break;
    if (sheet === 12 || sheet === 639) {
      if (!solidAllowBottom(st, num + k, num2 + 2)) { dead = true; break; }  // cs:54219
    }
  }
  if (!dead) return;
  ctx.destroyObject = true;                                                  // cs:54238
  for (let m = num; m < num + 2; m++) {
    for (let n = num2; n < num2 + 2; n++) {
      if (rawSheetAt(st, m, n) === sheet) killTileGen(st, ctx, m, n);        // cs:54241 raw type 门
    }
  }
  ctx.destroyObject = false;                                                 // cs:54269 尾复位
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
  // 187 草基缺失 → 顶幅转 186（cs:49343-49360）。★RRRR：vanilla 读 .type 无 active
  //  门（残值 type 同样参与），改 rawSheetAt
  if (sheet === 187 && st.inBounds(x0, y0) && st.inBounds(x0 + 2, y0 + 1)) {
    const topFx = st.frameX[st.idx(x0, y0)]!;
    const g0 = rawSheetAt(st, x0, y0 + 2), g1 = rawSheetAt(st, x0 + 1, y0 + 2), g2 = rawSheetAt(st, x0 + 2, y0 + 2);
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
  // cs:49420：击杀前捕获锚格 frameX（KillTile 会写 -1；186 金币堆掉落掷的门）
  const fxChk = st.frameX[i]!;
  ctx.destroyObject = true;
  for (let k = x0; k < x0 + 3; k++) {
    for (let l = y0; l < yEnd; l++) {
      if (st.inBounds(k, l) && sheetAt2(st, k, l) === sheet && activeAt2(st, k, l)) {
        killTileGen(st, ctx, k, l);
      }
    }
  }
  // 掉落掷（cs:49436-49855 掉落 switch 的 genRand 实参——生成期 Item.NewItem 仍
  // 急切求值掷；187→Main.rand 不耗 genRand；488 生成期再生短路不到此；其余族零掷）
  if (sheet === 186 && ctx.rng && fxChk >= 864) {
    const r = ctx.rng;
    if (fxChk <= 954) {
      r.nextIntRange(20, 100); r.nextIntRange(30, 100); r.nextIntRange(40, 100);
      const pairs: Array<[number, number, boolean]> = [
        [3, 20, true], [3, 30, true], [3, 40, true],
        [2, 20, false], [2, 30, false], [2, 40, false],
        [3, 20, false], [3, 30, false], [3, 40, false],
        [4, 20, false], [4, 30, false], [4, 40, false],
        [5, 20, false], [5, 30, false], [5, 40, false],
      ];
      for (const [denom, lo, neq] of pairs) {
        if (neq ? r.nextInt(denom) !== 0 : r.nextInt(denom) === 0) r.nextIntRange(lo, 100);
      }
    } else if (fxChk <= 1062) {
      r.nextIntRange(10, 100);
      if (r.nextInt(2) === 0) r.nextIntRange(20, 100);
      if (r.nextInt(3) === 0) r.nextIntRange(30, 100);
      if (r.nextInt(4) === 0) r.nextIntRange(40, 100);
      if (r.nextInt(5) === 0) r.nextIntRange(50, 100);
    } else if (fxChk <= 1170) {
      r.nextIntRange(1, 7);
      if (r.nextInt(2) === 0) r.nextIntRange(2, 7);
      if (r.nextInt(3) === 0) r.nextIntRange(3, 7);
      if (r.nextInt(4) === 0) r.nextIntRange(4, 7);
      if (r.nextInt(5) === 0) r.nextIntRange(5, 7);
    }
  }
  ctx.destroyObject = false;
  // 尾部 5×5 TileFrame 扫（cs:49856-49862）——邻堆递归复核（连杀）+ 苔藓芽掷
  for (let c = x0 - 1; c < x0 + 4; c++) {
    for (let r2 = y0 - 1; r2 < y0 + 4; r2++) tileFrameGen(st, ctx, c, r2, false);
  }
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
  while (ny < st.h - 50 && (!st.flags[st.idx(x, ny)] || !genSolidType(st.type[st.idx(x, ny)])
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
    || !genSolidType(st.type[st.idx(x, num2)])
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

/** FillWallHolesInSpot（cs:9888-10013）：墙洞 BFS 洪泛——≥150 格弃填；膨胀仅从
 *  "触空"格发起（本行三格或本列三格任一 !active——含自身）；周边墙型计数取众数
 *  （平票取首入序——Dictionary 严格大于）；空计分时兜底墙 2（泥墙）；只补 wall==0 格。 */
function fillWallHolesInSpot(st: TileStore, ox: number, oy: number, maxWalls: number): boolean {
  if (!(ox >= 2 && oy >= 2 && ox < st.w - 2 && oy < st.h - 2)) return false;   // InWorld(,2)
  const key = (x: number, y: number): number => x * 65536 + y;
  const inSet = new Set<number>();
  const counts = new Map<number, number>();
  const inW1 = (x: number, y: number): boolean => x >= 1 && y >= 1 && x < st.w - 1 && y < st.h - 1;
  let next: Array<[number, number]> = [[ox, oy]];
  while (next.length > 0) {
    const cur = next;
    next = [];
    while (cur.length > 0) {
      if (inSet.size >= maxWalls) return false;                     // cs:9915 阈值弃填
      const [x, y] = cur.shift()!;
      const k = key(x, y);
      if (inSet.has(k)) continue;
      if (!inW1(x, y)) continue;                                    // cs:9923 InWorld(,1)
      inSet.add(k);
      const i = st.idx(x, y);
      if (st.wall[i] !== 0) {                                       // 有墙格：计数+断流
        counts.set(st.wall[i]!, (counts.get(st.wall[i]!) ?? 0) + 1);
        continue;
      }
      let exposed = false;
      for (let dx = -1; dx <= 1 && !exposed; dx++) if (!st.flags[st.idx(x + dx, y)]) exposed = true;
      if (!exposed) for (let dy = -1; dy <= 1 && !exposed; dy++) if (!st.flags[st.idx(x, y + dy)]) exposed = true;
      if (exposed) {
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as Array<[number, number]>) {
          if (!inSet.has(key(nx, ny))) next.push([nx, ny]);
        }
      }
    }
  }
  if (inSet.size === 1) return false;                               // cs:9982 单格不填
  let best = 0, bestN = -1;
  for (const [wallId, n] of counts) if (n > bestN) { best = wallId; bestN = n; }
  if (bestN === -1) best = 2;                                       // cs:9993 空计分兜底泥墙
  for (const k of inSet) {
    const x = Math.floor(k / 65536), y = k % 65536;
    const i = st.idx(x, y);
    if (st.wall[i] === 0) st.wall[i] = best;
  }
  return true;
}

/** FillWallHolesInArea/InColumn（cs:9846-9886）：逐列扫描 [2,endY)——wall==0 且前格
 *  有墙（每次墙带后的首个洞格）触发 InSpot；x 钳 [2,w-3]。 */
function fillWallHolesInArea(st: TileStore, gs: GenState): void {
  const endY = Math.min(Math.floor(gs.worldSurface), st.h - 2);
  for (let x = 0; x < st.w; x++) {
    const cx = Math.min(Math.max(x, 2), st.w - 3);
    let hadWall = false;
    for (let y = 2; y < endY; y++) {
      if (st.wall[st.idx(cx, y)] === 0) {
        if (hadWall) { hadWall = false; fillWallHolesInSpot(st, cx, y, 150); }
      } else hadWall = true;
    }
  }
}

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
  // ② FillWallHolesInArea（cs:22307，PPPP 实装——原备案跳过；区域=[0,w)×[0,worldSurface)
  //   仅地表带）。W247 残差（(2776-2786,98) 墙 82 补洞）清偿。
  fillWallHolesInArea(st, gs);
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
