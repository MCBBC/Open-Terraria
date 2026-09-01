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
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';
import { checkStalactite } from './ShimmerPass';
import { runFinishNoTraps } from './FinishNoTrapsPass';
import { improveAllChestContents } from './TenthAnniversaryImprove';
// ★YYYYYY（2026-08-23）：KillTile 头部不可破坏门——NOTRAPS #58 神庙锁门三格拒毁
// （cs:63579 `num==2 → return` 在尘段之前,零掷零写;1:1 实现已在 HalfBrickPass,
//  TTTTTT 批移植含 isLockedDoorKT cs:69248 全同帧门/下方锁门门/HasReasonToReturnEarly 全支）
import { checkTileBreakability } from './HalfBrickPass';
// ★TTTTTTT：tileCut 生长门为 1457 新增（1456 WorldGen.cs:22317/22341 无此支）——
//   双态门随 hfIs1457
import { hfIs1457 } from './HellFortPass';
// ★UUUUUU（2026-08-23）：notTheBees 终转化（调用位 cs:22602-22605——⑭ 之后）
import { runNotTheBees, runFinishNotTheBees } from './NotTheBeesPass';
// ★SSS-CELEB（2026-08-27）：FinishTenthAnniversaryWorld 全家（1458 cs:24502-24554）
import { growTree } from './TreePass';
// ★IIIII106：sandy britches 表层沙漠化核心（cs:2363 第二半；调用位 :22343）
import { convertWithSize, doSurfaceIsDesertCore } from './SecretSeedDoEndsPass';   // ★IIIII107b 净化菱形 Convert(j,i,0,3)

const __swProcessEnv: Record<string, string | undefined> = (typeof process !== 'undefined') ? (process as unknown as { env?: Record<string, string | undefined> }).env ?? {} : {};


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

/** Main.tileCut（1457 Main.cs:7918 族全量 41 项）——③ 悬空落体柱生长的「可穿过」
 *  谓词第二支（TTTTTTT 批：const/s22222 #105 T53>28/T53>397/T0>28 残差定罪——
 *  原版入口门与 while 均为 `(!active || tileCut[type])`,JS 曾只查 !active →
 *  生长撞上陶罐(28∈tileCut)/草花等可切格即提前停柱,并把末写格经重扫转成
 *  硬化沙(397),vanilla 则直接覆写可切格续柱）。同源副本惯例不 import。 */
const TILE_CUT_FC = new Set([
  3, 24, 28, 32, 51, 52, 61, 62, 69, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 201,
  205, 231, 236, 254, 352, 382, 444, 454, 484, 485, 518, 519, 528, 529, 549, 636, 637,
  638, 654, 655, 711,
]);
/** 生成期 tileCut 读数（活性才有效;非活性格走 !active 支短路,残型不参与）。
 *  ★双态门：1456 口径无 tileCut 支（恒 false）——冻结 g12345 线零扰动。 */
function tileCutAt(st: TileStore, x: number, y: number): boolean {
  if (!hfIs1457()) return false;
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  const sh = SWEEP_SHEET[st.type[i]];
  return sh >= 0 && TILE_CUT_FC.has(sh);
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
//   132/142/143/288-295/484/664/665/711/712/335/490/564/565/594 维持备案；
//   ★IIIII99d 主组 14 成员 94/95/97/98/99/100/125/126/173/282/287/319/621/622
//   经 C2X2_MAIN_GROUP 全集派发 + Check3x4 书架族 101/102/463/617 +
//   Check4x2 床浴缸组 79/90/487 三臂同步启用——写侧帧公式同批清偿）、172/360/505-527、171、376/443/444、（★YYYYY 已派发 27 向日葵/34 吊灯/5 树/752 蛋；
//   ★DDDDDD +751 龟；★IIIII33 +654 TNT 桶——notraps #98 Settle_Liquids_Again
//   沉降域在场实证，Traps 域半段已由 PilesPass.pilesSupplementAfterSquareFrame 补臂清偿 #77）
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
/** InvalidTileForPilesOrSpeleothems（cs:36001：Boulders ∪ {26 祭坛, 237}）——
 *  AAAAAA：引擎 Check2x1 的 185 支补用 */
const INVALID_PILES = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716, 26, 237]);
/** 185 堆变体带 25-30 的底格族（cs:47073：Snow ∪ Ice ∪ {162,224}） */
const PILE_SNOW_ICE = new Set([147, 161, 162, 163, 164, 200, 224]);
/** 185 堆变体带 41-46/62-64 的底格族（cs:47085：Sand ∪ HardenedSand ∪ Sandstone） */
const PILE_SAND = new Set([53, 112, 116, 234, 396, 397, 398, 399, 400, 401, 402, 403]);
/** Main.tileStone（Main.cs:7378/7902-7921）：平台连接判定的"石质"归一 id 集 */
const TILE_STONE = new Set([63, 64, 65, 66, 67, 68, 130, 131, 566]);
/** ForbidsSloping（cs:81484）：裸 type（ghost 含）查 */
const FORBIDS_SLOPING = new Set([21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597]);
/** sheet id → 生成期 Main.tileSolid（vanGenSolidType 的 sheet 直查版；无内部实装的
 *  sheet 用原版碰撞表语义兜底 true（连接 id 只来自实心邻格，罕见）） */
const SOLID_BY_SHEET = new Map<number, boolean>();
{
  let seen = -1;
  for (let q = 0; q < TILE_DEFS.length; q++) {
    const s2 = SWEEP_SHEET[q];
    if (s2 === undefined || s2 === seen) continue;
    seen = s2;
    SOLID_BY_SHEET.set(s2, vanGenSolidType(q));
  }
}
const genSolidSheet = (sh: number): boolean => SOLID_BY_SHEET.get(sh) ?? true;

/** 平台连接帧（TileFrameImportant Platforms 支，cs:86110-86230 生成期零 culling 镜像）。
 *  num9=左邻/num8=右邻连接 id（同型平台→type 自身；石质→1；其余实心→其 type；非实心→-1）；
 *  连接码写入 frameX（0/18/36/54/72/90/108/126/144/180/216/234/252/270/288/342/360/
 *  378/396/414/432/450/468）。HandleRopeEndFraming 尾调用（cs:82022）生成期柱内无
 *  绳族/380/314 邻 → no-op 备案。 */
function framePlatformSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  void ctx;
  const i = st.idx(x, y);
  const sh = SWEEP_SHEET[st.type[i]]!;
  const at = (dx: number, dy: number): { act: boolean; sh2: number; half: boolean; slope: number } => {
    if (!st.inBounds(x + dx, y + dy)) return { act: false, sh2: -1, half: false, slope: 0 };
    const k = st.idx(x + dx, y + dy);
    return { act: !!st.flags[k], sh2: SWEEP_SHEET[st.type[k]] ?? -1, half: !!st.half[k], slope: st.slope[k]! };
  };
  const L = at(-1, 0), R = at(1, 0), BL = at(-1, 1), BR = at(1, 1), TL = at(-1, -1), TR = at(1, -1);
  let num9 = -1, num8 = -1;                                     // 左/右连接 id
  if (L.act) num9 = TILE_STONE.has(L.sh2) ? 1 : (!PLATFORMS.has(L.sh2) ? L.sh2 : sh);
  if (R.act) num8 = TILE_STONE.has(R.sh2) ? 1 : (!PLATFORMS.has(R.sh2) ? R.sh2 : sh);
  if (num8 >= 0 && !genSolidSheet(num8)) num8 = -1;             // !Main.tileSolid
  if (num9 >= 0 && !genSolidSheet(num9)) num9 = -1;
  if (num9 === sh && L.half !== !!st.half[i]) num9 = -1;
  if (num8 === sh && R.half !== !!st.half[i]) num8 = -1;
  if (num9 !== -1 && num9 !== sh && st.half[i]) num9 = -1;
  if (num8 !== -1 && num8 !== sh && st.half[i]) num8 = -1;
  if (num9 === -1 && TL.act && TL.sh2 === sh && TL.slope === 1) num9 = sh;
  if (num8 === -1 && TR.act && TR.sh2 === sh && TR.slope === 2) num8 = sh;
  if (num9 === sh && L.slope === 2 && num8 !== sh) num8 = -1;
  if (num8 === sh && R.slope === 1 && num9 !== sh) num9 = -1;
  const forbids = FORBIDS_SLOPING.has(at(0, -1).sh2);           // ForbidsSloping(x, y-1) 裸 type
  const selfSlope = st.slope[i]!;
  let fx: number;
  if (selfSlope === 1) {
    if (PLATFORMS.has(R.sh2) && R.slope === 0 && !R.half) fx = 468;
    else if (forbids) fx = 468;
    else if (!BR.act && (!PLATFORMS.has(BR.sh2) || BR.slope === 2)) {
      fx = (L.act || (PLATFORMS.has(TL.sh2) && TL.slope === 1)) ? 360 : 432;
    } else {
      fx = (L.act || (PLATFORMS.has(TL.sh2) && TL.slope === 1)) ? 180 : 396;
    }
  } else if (selfSlope === 2) {
    if (PLATFORMS.has(L.sh2) && L.slope === 0 && !L.half) fx = 450;
    else if (forbids) fx = 450;
    else if (!BL.act && (!PLATFORMS.has(BL.sh2) || BL.slope === 1)) {
      fx = (R.act || (PLATFORMS.has(TR.sh2) && TR.slope === 2)) ? 342 : 414;
    } else {
      fx = (R.act || (PLATFORMS.has(TR.sh2) && TR.slope === 2)) ? 144 : 378;
    }
  } else if (num9 === sh && num8 === sh) {
    fx = L.slope === 2 && R.slope === 1 ? 252 : L.slope === 2 ? 216 : R.slope === 1 ? 234 : 0;
  } else if (num9 === sh && num8 === -1) {
    fx = L.slope !== 2 ? 18 : 270;
  } else if (num9 === -1 && num8 === sh) {
    fx = R.slope !== 1 ? 36 : 288;
  } else if (num9 !== sh && num8 === sh) {
    fx = 54;
  } else if (num9 === sh && num8 !== sh) {
    fx = 72;
  } else if (num9 !== sh && num9 !== -1 && num8 === -1) {
    fx = 108;
  } else if (num9 !== -1 || num8 === sh || num8 === -1) {
    fx = 90;
  } else {
    fx = 126;
  }
  st.frameX[i] = fx;
}
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
/** PlantCheck_TryGetNewType（1457 cs:81886-81928）：按地基换型+帧折叠。
 *  ★1457 对齐档 2（2026-08-23）：isMushroom 判据族=**3|61|110|24**（1457 cs:81889
 *  扩入 61;1456 cs:81351 是 3|110|24——KKKKKK 批曾随 1456 基准删）。按【入口帧】
 *  判定——C# 在折叠前读 frameX,故 down∈{60,226} 把 144 折成 18、down=70 折成 72
 *  的场景仍判 true（回写 144）。spore 随返回值交调用方（回写键见 plantCheckSweep 注）。 */
function plantNewType(sheet: number, down: number, fx: number): { type: number; fx: number; spore: boolean } {
  let type = sheet, nfx = fx;
  let spore = false;
  if (type === 3 || type === 61 || type === 110 || type === 24) spore = nfx === 144;   // 入口帧（1457 cs:81889 判据族含 61）
  if (type === 201) spore = nfx === 270;                                               // 入口帧
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
  return { type, fx: nfx, spore };
}

/** 扫描上下文：destroyObject 原版全局位（各 Check 首查尾清）；
 *  frameSparse=true（仅 _wwwrep 对拍探针用）：跳过击杀谓词读帧的族——
 *  探针基座的 frames 边界只覆盖 JS 管线写过的格（165 族 32%/陶罐 55%），
 *  金标基座上这些族缺帧 → 完整性/样式门必然误杀。生产管线（WorldGen.ts）
 *  恒 false（分布式帧完整）。 */
interface SweepCtx { rng: RNG | undefined; destroyObject: boolean; frameSparse: boolean; stats?: ZzzStats }
/** ZZZ 开发统计钩子（探针用;生产恒缺省） */

/** ★IIII71b 取证钩（门控零开销） */
function segProbe77(n: string): void {
  const g0 = globalThis as { __swSeg?: (name: string, detail?: unknown) => void };
  try { g0.__swSeg?.(n); } catch { /* probe */ }
}
/** ★IIII71b：RNG 样本计（仪具注入） */
function rc77(): number {
  const g0 = globalThis as { __swMbDraws?: () => number };
  try { return g0.__swMbDraws?.() ?? 0; } catch { return 0; }
}

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
/** AnchorValid(tile, AnchorType.Table)（1457 cs:52294-52340,Table 单独位）：
 *  nactive && ( 平台正帧（!half 且 fx/18∈[0,7],或 fx/18∈[12,16]∪[25,26],PlatformFrameWidth
 *  =TileObjectData._data[19].CoordinateFullWidth=18） || solid∩solidTop ||
 *  (!平台∩tileTable∩blockType()==0) ）。Check2x1 case103 逃生门消费（cs:47417-47430）。
 *  blockType（Tile.cs:232）：half→1,slope1→2,slope2→3,其余 0。 */
function anchorValidTable(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y) || !nactiveAt(st, x, y)) return false;
  const i = st.idx(x, y);
  const ti = st.type[i];
  const sh = SWEEP_SHEET[ti];
  const d = TILE_DEFS[ti];
  if (PLATFORMS.has(sh)) {
    const n = Math.floor(st.frameX[i]! / 18);
    if ((!st.half[i] && n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26)) return true;
  } else if (genSolidType(ti) && d && d.platform) return true;   // tileSolid ∩ tileSolidTop
  if (!PLATFORMS.has(sh) && TILE_TABLE.has(sh) && !st.half[i]
    && slopeOf(st, x, y) !== 1 && slopeOf(st, x, y) !== 2) return true;   // blockType()==0
  return false;
}
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
  (globalThis as { __swTagDie?: (t: string) => void }).__swTagDie?.('K'); // IIII56 dormant 细分骰标签
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
    // ★III122（cs:68850-6873）：type254 南瓜——原实现档位整体错一档（曾 fx<72→
    //   Next(3)，其余顺移）：真文是 **fx<72 零掷**（num=3 恒定），≥72 才有
    //   单次判掷（<108 Next(3) / <144 Next(2) / else Next(4)），外层 GetTileDustAmount
    //   默认 10 次/格循环不变（cs:67127 无 254 特例=default 10）。pumpkin 链 mile8
    //   #90 花域受理门族首差定罪：小南瓜（PlacePumpkin 头变异 fx∈{0,36} 常态）
    //   每杀多耗 10 样本 ⇒ 花圃锚窗内骰流早漂， placements/升级 ±Next(3) 全错位。
    case 254:
      if (fx >= 72) {
        if (fx < 108) r.nextInt(3);
        else if (fx < 144) r.nextInt(2);
        else r.nextInt(4);
      }
      return;
    default:
      if (FURNITURE_DUST.has(sheet)) r.nextInt(3);
  }
}

/** KillTile 生成期语义（cs:63559：CheckTileBreakability 头门 cs:63579 + 尘埃掷循环
 *  cs:63747-51 + 击杀写 cs:63933-65 + 尾部 SquareTileFrame cs:63967） */
function killTileGen(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  const i = st.idx(x, y);
  __swFnt39('KT', x, y);   // IIII100e2：K 分解镜像（rig KillTile 入口 KT 同位）
  // IIII68b：KillTile 入口时序探针（x86 KTPRE 同位；无钩零开销）
  try {
    const gt = (globalThis as unknown as { __swShimTargets?: Set<string> }).__swShimTargets;
    if (gt !== undefined && gt.has(x + ',' + y)) {
      const s2 = 'a' + st.flags[i] + 't' + SWEEP_SHEET[st.type[i]] + 'fx' + st.frameX[i] + 'fy' + st.frameY[i];
      const stk = (new Error().stack ?? '').split('\n').slice(2, 7);
      const who = stk.map((s) => { const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/); return m ? `${m[1]!.split('/').pop()}:${m[2]}` : ''; })
        .filter(Boolean).join('<');
      (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('KTPRE @' + x + ',' + y + ' st=' + s2 + ' by=' + who);
    }
  } catch { /* noop */ }
  if (!st.flags[i]) return;
  // ★YYYYYY（2026-08-23）NOTRAPS #58：cs:63579 `num==2 → return`（尘段之前,零掷零写）
  //   ——神庙锁门三格拒毁（下方格活性锁门门 cs:62422-625 / HasReasonToReturnEarly
  //   →IsLockedDoor cs:62433+62504-507）。只拒杀不加支：fail 支（num==1,锁门顶格
  //   存活+级联）gen 域不可达于现绿链（构造保证）,备案残差见账本 YYYYY 批。
  //   ★同门连带清偿 CONST #49 Settle_Liquids L=2089（XXXXX 移交液体域债）——
  //   LiquidSim.killTileAt 沉降期 KillTile（WaterCheck 死亡表/LiquidCheck 植物裁切）
  //   走本引擎,拒毁差经尘掷流位+瞬时支撑态扰动 254→255 Next(30) 均分掷 → 纯 L 通道
  //   差（A/T/W 末态零差）。__swBrkRefuse=永久零开销探针钩（__swKillCap 同款）。
  if (checkTileBreakability(st, x, y) === 2) {
    try { const g2 = globalThis as unknown as { __swShimTargets?: Set<string>; __swSeg?: (n: string, d?: unknown) => void };
      if (g2.__swShimTargets?.has(x + ',' + y)) g2.__swSeg?.('REFUSE ' + x + ',' + y + ' t' + st.type[i]); } catch { /* noop */ }
    (globalThis as { __swBrkRefuse?: (x: number, y: number, sheet: number) => void }).__swBrkRefuse?.(x, y, SWEEP_SHEET[st.type[i]]);
    return;
  }
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
  __swFnt39('SQ', x, y);
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

/** AAAAAA 批新增纯导出：WorldGen.RangeFrame(startX, startY, endX, endY)（cs:81139）
 *  生成期入口——(startX-1..endX+1)×(startY-1..endY+1) 逐格 TileFrame(resetFrame=false)。
 *  GrowTreeWithSettings 尾扫（cs:30999）等消费端：区域帧扫触发的 184 苔芽 Next(3)
 *  掷（每访恒掷）与 CheckTreeWithSettings 重帧此前整缺（#103 (734,760) 宝石树
 *  尾 5×Next(3) 掷流差实证）。Framing.WallFrame(i,j) 侧 resetFrame=false 恒零掷
 *  （cs:81147→Framing.cs:386 仅 resetFrame 时 Next(0,3)），墙帧通道不模拟。 */
export function genRangeFrame(st: TileStore, rng: RNG, x0: number, y0: number, x1: number, y1: number): void {
  const ctx: SweepCtx = { rng, destroyObject: false, frameSparse: false, stats: undefined };
  for (let x = x0 - 1; x <= x1 + 1; x++) {
    for (let y = y0 - 1; y <= y1 + 1; y++) {
      tileFrameGen(st, ctx, x, y, false);
    }
  }
}

const roll3 = (ctx: SweepCtx): number => {
  if (ctx.stats) ctx.stats.roll184++;
  return ctx.rng ? ctx.rng.int(0, 2) : 0;
};
const rollRange = (ctx: SweepCtx, min: number, maxIncl: number): number => {
  if (ctx.stats) ctx.stats.rollsOther++;
  return ctx.rng ? ctx.rng.int(min, maxIncl) : min;
};


/** IIII39 级联族标定（probe 钩；无钩零开销） */
function __swFnt39(tag: string, x: number, y: number, mid?: string): void {
  const G = globalThis as unknown as { __swFntProbeI39?: { emit?: (l: string) => void; rc?: () => number } | null };
  const pr = G.__swFntProbeI39;
  const em = pr?.emit;
  if (!em) return;
  if (mid === undefined) em(tag + '|' + x + ',' + y + '|' + (pr?.rc ? pr.rc() : -1));
  else em(tag + '|' + x + ',' + y + '|' + mid + '|' + (pr?.rc ? pr.rc() : -1));
}

/** TileFrame 生成期（cs:82067） */
function tileFrameGen(st: TileStore, ctx: SweepCtx, x: number, y: number, reset: boolean): void {
  // IIII68b：时序线探针（与 x86 JJHook.Fc 事件同词表；无钩零开销）
  try {
    const gt = (globalThis as unknown as { __swShimTargets?: Set<string> }).__swShimTargets;
    if (gt !== undefined && gt.has(x + ',' + y)) {
      const q = st.inBounds(x, y) ? st.idx(x, y) : -1;
      const s2 = q >= 0 ? 'a' + st.flags[q] + 't' + SWEEP_SHEET[st.type[q]] + 'fx' + st.frameX[q] + 'fy' + st.frameY[q] : 'oob';
      const stk = (new Error().stack ?? '').split('\n').slice(2, 7);
      const who = stk.map((s) => { const m = s.match(/\(?([^\s()/]*\.ts):(\d+):\d+/); return m ? `${m[1]!.split('/').pop()}:${m[2]}` : ''; })
        .filter(Boolean).join('<');
      (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('TF @' + x + ',' + y + ' st=' + s2 + ' by=' + who);
    }
  } catch { /* noop */ }
  __swFnt39('TF', x, y);
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
  __swFnt39('TI', x, y, String(sheet));
  // frameSparse 模式跳过的读帧族（165/185/28/240族/485/72/C3X2 族——见 SweepCtx 注释）
  //   ★CCCCC：+138/411——Check2x2 完整性门读 2×2 四格帧；探针基座（金标 typ×陈旧
  //   JS 帧嵌合）上巨石/起爆器帧不可信 → 锚反解到互指的死区 → 尾 4×4 帧与 184 杀
  //   级联互喂成无限递归（#105 实爆）。生产（frameSparse=false，帧由本管线同源写
  //   入）恒自洽不受影响；#101 的 genTileFrame 直调 ctx 同为 false（TrackPass 巷杀
  //   级联实证无爆）。
  if (ctx.frameSparse && (
    sheet === 165 || sheet === 185 || sheet === 28 || sheet === 653 || sheet === 240
    || sheet === 440 || sheet === 485 || sheet === 72 || sheet === 178 || sheet === 138
    || sheet === 376 || sheet === 443 || sheet === 444   // DDDDDD：CheckSuper 读帧族同列（485 同款）
    || sheet === 245 || sheet === 246 || sheet === 241 || sheet === 242   // DDDDDD：画作墙检读帧族（240/440 同款）
    || sheet === 411 || sheet === 752 || sheet === 751 || sheet === 654   // IIII33：Check2x2 自读帧族同列（138 同款）
    || sheet === 5 || sheet === 596 || sheet === 616
    || sheet === 34 || sheet === 27
    || sheet === 254   // IIII103c：Check2x2Style 自读帧族同列（sparse 免疫，27/34 同款）
    || C3X2_TYPES.has(sheet)
    // KKKKK：新击杀族同列（自读帧族——嵌合基座伪杀/互喂风险，C3X2 同款处置；
    //   #101 槽 frameSparse=false 不受影响，真实行为由生产管线承载）
    || (sheet >= 82 && sheet <= 84) || sheet === 233 || sheet === 236 || sheet === 238
    || sheet === 702 || CHECK2XX_TYPES.has(sheet) || C2X2_MAIN_GROUP.has(sheet)
    // IIII99d：Check3x4/Check4x2 自读帧族同列（101-族/床浴缸组，138 同款处置）
    || CHECK3X4_TYPES.has(sheet) || CHECK4X2_TYPES.has(sheet)
    // VVVVV：Check1x2 椅族/CheckOrb 珠族/484 巨石仙人掌同列（自读帧族）
    || sheet === 15 || sheet === 20 || sheet === 216 || sheet === 338 || sheet === 390
    || sheet === 493 || sheet === 497 || sheet === 590 || sheet === 595 || sheet === 615
    || sheet === 12 || sheet === 31 || sheet === 639 || sheet === 696 || sheet === 484
    || sheet === 91)) {   // IIIIIII3：CheckBanner 组帧校验自读帧族（91 同列 sparse 免疫）
    return true;   // UUUU：178 同列读帧族（sparse 模式下嵌合帧会伪杀 CheckAndAdjust）
  }
  // ★AAAAAA：平台连接帧（TileFrameImportant 的 Platforms 早支，cs:86110-86230）——
  //   生成期 GetTileMergeCulling 恒全 false（invisibleBlock 位），按零 culling 镜像。
  if (PLATFORMS.has(sheet)) {
    framePlatformSweep(st, ctx, x, y);
    return true;
  }
  // ★IIIII99b：Check2x2 主组（cs(1458 rigsrc):87340-56 直调列）——置于 switch 前，
  //   与 654/TNT 桶同式（vanilla 该组经 goto case 132 并入 Check2x2）
  if (!((__swProcessEnv ?? {}).SW_I08_NODISPATCH === '1') && C2X2_MAIN_GROUP.has(sheet)) {
    check2x2Sweep(st, ctx, x, y, sheet);
    return true;
  }
  switch (sheet) {
    case 4: checkTorchSweep(st, ctx, x, y); return true;    // AAAAAA：CheckTorch（TileID.Sets.Torches={4}）
    // IIIIIII3 批补（1457 cs:86979-81 派发 case 91 → CheckBanner cs:46493）：旗帜 1×3
    //   竖组完整性 + 上锚门整组杀——g #105 (564,328) 孤儿旗帜实证（此前仅 LiquidSim
    //   前置扫镜像覆盖沉降级联，引擎主臂缺席）。稀疏模式同列豁免见上方 frameSparse 清单。
    case 91: checkBannerSweep(st, ctx, x, y); return true;
    case 518: checkLilyPadSweep(st, ctx, x, y); return true;
    case 519: checkCatTailSweep(st, ctx, x, y); return true;
    case 549: checkSeaweedSweep(st, ctx, x, y); return true;
    case 571: checkBambooSweep(st, ctx, x, y); return true;
    case 72: frame72Sweep(st, ctx, x, y); return true;
    case 184: frame184Sweep(st, ctx, x, y); return true;
    case 165:
      // ShimmerPass 1:1（UpdateStalagtiteStyle 掷+杀）；reframe 钩子改走本扫全分派
      // （击杀级联的邻格 184 等须掷骰重查——彼时 165-only 的 frame165 不再等价）
      // ★IIIII68b（定罪锚：1458 CheckStalactite 四支 `destroyObject=true; KillTile…;
      //   destroyObject=false` 字面对（cs:39640-46/39676-82/39715-27/39759-79）+
      //   KillTile 尾 SquareTileFrame 九邻重帧（cs:64461）+ Check2x2 头门
      //   `if(destroyObject) return`（cs:49022-25）+ 尾扫 cs:48800-07 在窗**外**）
      //   ——窗口载体改传 ctx.destroyObject，ShimmerPass 内做与原版同构的**字面**
      //   赋值对（开窗包 kill+级联、支尾无条件 false 关窗，不恢复 prev）。
      //   x86 实证两形态：Site A 单杀无嵌套 165 ⇒ 邻格巨石全程窗口内免检存活
      //   （@1806,487 三连伪杀根因）；Site B 双杀的内层支尾提前关窗 ⇒ 外层环剩余
      //   兄弟帧 d=false 自由分派 ⇒ Check2x2 实查整组灭（@1650,652 与原版一致）。
      if (ctx.rng) {
        checkStalactite(st, ctx.rng, x, y, (s2, _r, xx, yy) => tileFrameGen(s2, ctx, xx, yy, false), ctx);
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
    // DDDDDD 批补（cs:86233-40）：画作墙检族 245=Check2x3Wall/246=Check3x2Wall/
    //   241=Check4x3Wall/242=Check6x4Wall——引擎缺派发 → FinalCleanup 大循环
    //   TileFrame 不查画幅墙洞（m20260811 #105 残 6 格：245 画 (3269,1374) 背墙
    //   (3270,1375) w0 洞，vanilla 整幅杀、JS 因 ⑫ 继承先行补墙存活）。
    case 245: case 246: case 241: case 242:
      checkWallArtSweep(st, ctx, x, y, sheet);
      return true;
    // DDDDDD 批补（cs:86437-40 → CheckSuper cs:48117）：376 渔笼/443 间歇泉/
    //   444 蜂巢块——LLLL"不在场"备案陈旧（杀账铁证 KL t444×12/t443×1），485
    //   并入通用臂（原专臂语义等价+补尾 4×4 TileFrame 重扫 cs:48395）。
    case 376: case 443: case 444: case 485:
      checkSuperSweep(st, ctx, x, y, sheet);
      return true;
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
    //   break-goto——生成期在场成员均为零掷族，未实证不派发（备案；654 后由
    //   IIII33 派发收口，余者维持备案）。
    //   DDDDDD 批：+751 沙漠龟（同 break-goto 组；12345 #105 (1711,743) 2×2 组
    //   底锚蛛网 51 → FinalCleanup 大循环 TileFrame 派发 Check2x2 整组杀实证）。
    // IIII33 批补：+654 TNT 桶（同 break-goto 组）——notraps(1896728457,EVIL1 noTraps)
    //   mile8 #98 Settle_Liquids_Again @槽末 T0>654×8 @(1487,716)+(1489,761)：二次沉降域
    //   沉降击杀带走的支座其 KillTile 尾九宫（LiquidSim.killTileGen → 本文件
    //   genSquareTileFrame 全分派）帧到桶格，vanilla 由 cs:86947-86972 空支出栈经
    //   cs:87208 `goto case 132` 并入 cs:87209-26 直调列=与巨石族同走 Check2x2
    //   （非巨石支逐列地面门 cs:48460-71 判失 → 整组杀）；引擎此前落空支无派发。
    //   Traps 域半段（Piles 头 SetBoulderSolidity(false) 失效窗）已由
    //   PilesPass.pilesSupplementAfterSquareFrame 补臂清偿 #77——本行收口后该事件窗
    //   补臂与引擎主臂语义重合（同源自 Check2x2），失效面两处合一。五链 x86 dump 扫描：
    //   654 仅 notraps 在场 ⇒ g/s22222/m/const/ntb 天然空转；族尘掷全零档
    //   （killDustAmount cs:66654）⇒ RNG 流位无移。
    case 138: case 411: case 484: case 752: case 751: case 654:
    // ★IIIII110b(涂装链)：+巨石家族余员 664/665/711/712/713/714/715/716——
    //   1457 cs:87209-26 直调列（case 132/138/142/143/288-295/**484/664/665/711/712**
    //   → Check2x2）与 cs:86965-69+87208 break-goto 列（654/713-716/751/752 空支出栈
    //   `goto case 132` 并入）双臂全员=Check2x2。WHO 取证（i144p-rig JJHook.Who,
    //   SW_KTWHO 盒式调用者栈）实证 invisibleplane #097 微群系窗：轨巷 KT(2088,575)
    //   尾 SquareTileFrame→TileFrameImportant(714)→Check2x2 整组杀蛛石 714 四格
    //   （WHO 2087,573/574+2088,573/574 t=714 | Check2x2←TileFrameImportant←
    //   TileFrame←SquareTileFrame←KillTile←TrackGenerator.PlacePath）。族尘掷全零档
    //   （killTileDustAmount 664/665/711-716→0）⇒ 派发 RNG 流零移；isBoulder 支与
    //   138/484 同码路（上方箱族豁免+底两格 SolidTileAllowBottomSlope 联合门）。
    //   生成期在场成员=invisibleplane 蛛石 714（Traps pass placeTrap 侧所产）。
    case 664: case 665: case 711: case 712: case 713: case 714: case 715: case 716:
      check2x2Sweep(st, ctx, x, y, sheet);
      return true;
    // ★IIIII99d 批补（cs(1458):87030-33 → Check3x4 cs:50526；case 87035-38 →
    //   Check4x2 cs:47825）：书架族 + 床/浴缸/野餐桌——写侧帧债（place3x4D 裸写/
    //   place4x2D fx0 算而未用+style 行缺失）本批清偿后随写侧同批派发，
    //   #105 大循环 TileFrame 对这些族的完整性校验与原版同流。463/617/102/487
    //   本仓生成域暂无写入方（零在场=零效应），照原版全组收录备案。
    case 101: case 102: case 463: case 617:
      if ((__swProcessEnv ?? {}).SW_I99D_NODISP !== '1') { check3x4Sweep(st, ctx, x, y); }
      return true;
    case 79: case 90: case 487:
      if ((__swProcessEnv ?? {}).SW_I99D_NODISP !== '1') { check4x2Sweep(st, ctx, x, y, sheet); }
      return true;
    // YYYYY 批补（cs:86616/52826）：CheckTree 树坍塌 + CheckChand 吊灯——
    //   s22222 #97 vanilla 杀链实证（KillTile 织入：CheckTree 系 118 杀/吊灯 8 杀，
    //   引擎缺臂=JS 树 21 格存活/吊灯 3 格存活）。454 掉落掷族未实证不派发。
    // ★IIII71b 主案定罪：case323 棕榈（cs:87199 → CheckPalmTree cs:54829）——
    //   引擎缺派发 ⇒ TileFrame 到棕榈恒 no-op，KillTile(液体棕榈根 cs:22460)/
    //   沙族处理尾上邻棕榈重帧(cs:22516) 的支撑级联杀在 JS 全部落空。
    //   DRUNK 终清理残差 T0>323×9+A×9 @(3530,116..124) 实锤；重帧掷门
    //   Next(7,10)*22（num!=type 且 frameX<=44 时）一并落地保流位对齐。
    case 323:
      checkPalmTreeSweep(st, ctx, x, y);
      return true;
    case 5:
      checkTreeSweep(st, ctx, x, y);
      return true;
    // YYYYY 批补：596/616 观赏树（CheckTreeWithSettings·Vanity cs:54430）——m #90
    //   花圃 15 格 616 整树坍塌实证。
    case 596: case 616:
      checkTreeSweep(st, ctx, x, y, true);
      return true;
    // ★AAAAAA：583-589/634（Gem/Ash 树，cs:86627-86652）——genRangeFrame 尾扫
    //   （GrowTreeWithSettings cs:30999）与 #105 终扫的 CheckTreeWithSettings 重帧
    //   此前缺派发（s634 18 格帧债：灰烬树基座干身 fx 66→0 重帧实证）。
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      checkTreeSweep(st, ctx, x, y, false, GEM_TREE_GROUND);
      return true;
    case 634:
      checkTreeSweep(st, ctx, x, y, false, ASH_TREE_GROUND);
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
    // ★IIIII103c（cs:87239-42 → Check2x2Style cs:52761）：南瓜 254 派发落地——
    //   pumpkin 链 mile8 #90 首差定罪根因（详见函数头）。 PumpkinSeeds 成员仅此型。
    case 254:
      check2x2StyleSweep(st, ctx, x, y);
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

/** CheckBanner 上锚 NotReallySolid 族（TileID.Sets.NotReallySolid={387,388,10}，
 *  cs:46541 消费——LiquidSim 前置扫同源常量；本仓"同源副本禁 import"惯例） */
const NOT_REALLY_SOLID_BANNER = new Set([387, 388, 10]);

/** CheckBanner（1457 cs:46493-46658，派发 cs:86979 case 91）——IIIIII3 批补引擎主臂。
 *  1×3 竖排旗帜：frameY/18 反解组顶（样式段=3 行/样式）+ 三格组 type/帧全等校验
 *  + 上格锚门（nactive + 实心族 + 平台特例）→ 任一破 destroyObject 整组 KillTile。
 *  帧反解 num=j-row、组帧基 k*18+num2*54 与锚门五连判逐句镜像 LiquidSim.checkBannerGen
 *  （s22222/g 链沉降级联已验证的近似口径：tileSolid≈solid||platform、tileSolidTop≈
 *  platform、TileID.Sets.Platforms≈platform）。生成期 Item.NewItem 掉落支不移植（无实体）；
 *  越界格视作 new Tile()（组失配恒杀）。KillTile 二次调用撞 !flags 早退=零掷零写。 */
function checkBannerSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;                                     // cs:46495 头闸
  const i0 = st.idx(x, y);
  const selfType = st.type[i0]!;                                     // cs:46494 派发参（字节捕获）
  let row = Math.trunc(st.frameY[i0]! / 18);
  let style = 0;
  while (row >= 3) { row -= 3; style++; }                            // 样式段
  const top = y - row;                                               // 组顶 y（cs:46503）
  const fx0 = st.frameX[i0]!;
  let bad = false;
  for (let k = 0; k < 3; k++) {                                      // cs:46505-23 组校验
    const yy = top + k;
    if (yy < 0 || yy >= st.h) { bad = true; continue; }              // Main.tile==null → 新 Tile→失配
    const q = st.idx(x, yy);
    if ((st.flags[q] & 1) === 0) bad = true;
    else if (st.type[q] !== selfType) bad = true;
    else if (st.frameY[q] !== k * 18 + style * 54) bad = true;
    else if (st.frameX[q] !== fx0) bad = true;
  }
  const ay = top - 1;                                                // 上锚（cs:46532-53）
  if (ay < 0 || ay >= st.h) { bad = true; }
  else {
    const a = st.idx(x, ay);
    if ((st.flags[a] & 1) === 0 || (st.wire[a] >>> 5) & 1) { bad = true; }   // !nactive
    else {
      const at = st.type[a];
      const d = TILE_DEFS[at];
      const topSlope = st.slope[a] === 1 || st.slope[a] === 2;
      const halfBrick = st.half[a] !== 0;
      const bottomSlope = st.slope[a] === 3 || st.slope[a] === 4;
      // ★IIIII110b(涂装链)：tileSolid 改读生成期 Main.tileSolid 镜像（vanGenSolidType）
      //   ——Piles 槽头覆写列（cs:18906-18916：379/229/190/196/189/717-719/202/460/484
      //   置非实心,runPilesPass 经 flipGenSolid 接线）期间,202 类锚格在原版读「非实心」
      //   ⇒ num3=false ⇒ flag3=false ⇒ CheckBanner 整旗杀。JS 曾读 TILE_DEFS 静态
      //   solid ⇒ 锚恒"实心" ⇒ neg #077 (2933,114) T0>91×3 横幅三连不杀（x86
      //   WHO 取证：CheckBanner←TileFrameImportant←SquareTileFrame←PlaceTile(186)）。
      const tileSolid = vanGenSolidType(at);
      const tileSolidTop = !!d?.platform;
      const isPlatformFamily = !!d?.platform;
      const anchorSolid = topSlope || halfBrick || tileSolid;        // cs:46541 num3
      const anchorTopOk = !tileSolidTop || (isPlatformFamily && (halfBrick || topSlope));
      let ok = anchorSolid && anchorTopOk
        && !NOT_REALLY_SOLID_BANNER.has(SWEEP_SHEET[at] ?? -1)
        && !bottomSlope;
      if (isPlatformFamily || SWEEP_SHEET[at] === 380) ok = true;    // cs:46544 平台/花盆箱特例
      if (!ok) bad = true;
    }
  }
  if (!bad) return;
  ctx.destroyObject = true;                                          // cs:46556
  for (let k = 0; k < 3; k++) {
    const yy = top + k;
    if (yy < 0 || yy >= st.h) continue;
    const q = st.idx(x, yy);
    if (st.type[q] === selfType) killTileGen(st, ctx, x, yy);   // cs:46560 不查 active（vanilla 同）
  }
  ctx.destroyObject = false;                                         // cs:46657
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
    // cs:49055-59（95/126 上锚支：num6-1 行须 active+solid 非 solidTop——
    //   ★IIIII99b 随主组补全落地；此前该组未派发故此支从未走通）
    if (sheet === 95 || sheet === 126) {
      if (!inW(k, num6 - 1)) flag = true;
      else {
        const ai = st.idx(k, num6 - 1);
        const ad = TILE_DEFS[st.type[ai]!];
        if (!st.flags[ai] || !genSolidType(st.type[ai]!) || !!ad?.platform) flag = true;
      }
    }
    // cs:48460-71（非巨石支：132 除外）——411/751/752/654 地面门
    //   （★IIIII33：654 TNT 桶=break-goto 组成员，vanilla 同走本支 cs:86947→87208）
    else if (!isBoulder && sheet !== 132) {
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

/* ── Check3x4（cs(1458):50526）书架族 101/102/463/617（IIIII99d 批补派发）──
 * 3×4 带页完整性：锚反解=frameX/18 列带（54px 页步）+ frameY/18 行带（72px 页步，
 * Tiles_102 类纵排多页表）；12 格 type+两轴帧位全等 + 逐列 (k,oy+4) 地面门
 * SolidTileAllowBottomSlope。败 → destroyObject 闸内整组 KillTile（尘掷默认 10/
 * 格、dice 零档——cs KillTile_MakeTileDust 无 case 101-617 分支实测）+ item 掉落
 * 不建模（生成域惯例备案）+ 尾 [ox-1..ox+3]×[oy-1..oy+3) TileFrame 复扫
 * （cs:50598-605）。写侧=DungeonPass.place3x4D/HellFortPass.place3x4HF（同批帧公式
 * 对拍成立）。 */
const CHECK3X4_TYPES = new Set([101, 102, 463, 617]);
function check3x4Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;                                            // cs:50529
  const i0 = st.idx(x, y);
  const type = SWEEP_SHEET[st.type[i0]!] ?? -1;
  let num3 = 0, num4 = 0;
  let num5 = Math.trunc(st.frameX[i0]! / 18);                               // cs:50540
  let num6 = Math.trunc(st.frameY[i0]! / 18);
  while (num5 >= 3) { num3++; num5 -= 3; }                                  // cs:50542-47
  while (num6 >= 4) { num4++; num6 -= 4; }
  const ox = x - num5;
  const oy = y - num6;
  let flag = false;
  for (let k = ox; k < ox + 3; k++) {                                       // cs:50549（无 break 短路）
    for (let l = oy; l < oy + 4; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }                    // null→new Tile→!active
      const qi = st.idx(k, l);
      if (!st.flags[qi] || (SWEEP_SHEET[st.type[qi]!] ?? -1) !== type
        || st.frameX[qi] !== num3 * 54 + (k - ox) * 18
        || st.frameY[qi] !== num4 * 72 + (l - oy) * 18) flag = true;        // cs:50555-56
    }
    if (!st.inBounds(k, oy + 4)) { flag = true; continue; }
    if (!solidAllowBottom(st, k, oy + 4)) flag = true;                      // cs:50561-62
  }
  if (!flag) return;                                                        // cs:50564-67
  ctx.destroyObject = true;                                                 // cs:50569
  for (let m = ox; m < ox + 3; m++) {
    for (let n = oy; n < oy + 4; n++) {
      if (!st.inBounds(m, n)) continue;
      const qi = st.idx(m, n);
      if ((SWEEP_SHEET[st.type[qi]!] ?? -1) === type && st.flags[qi]) killTileGen(st, ctx, m, n);
    }
  }
  ctx.destroyObject = false;                                                // cs:50597
  for (let n7 = ox - 1; n7 < ox + 4; n7++) {
    for (let n8 = oy - 1; n8 < oy + 4; n8++) tileFrameGen(st, ctx, n7, n8, false);   // cs:50598-605
  }
}

/* ── Check4x2（cs(1458):47825）床79/浴缸90/野餐桌487（IIIII99d 批补派发）──────
 * 4×2 完整性：非 487 锚反解=i-frameX/18（fx≥72 镜像页再 +4，cs:47838-40）、行带
 * 2 行/36px 步（num3=样式页序）；期望 fx 非 487=(k-num)*18、镜像支 (k-num+4)*18、
 * fy=(l-top)*18+num3*36；逐列地面门 SolidTileAllowBottomSlope ∪ active&&Platforms
 * （床可立平台，cs:47906-17 与 Check2x2 的纯实心门互异）。败 → destroyObject 整组杀
 * （尘掷 dice 零档，amount 默认 10/格）+ GetItemDrop_* 掉落不建模 + 尾
 * [num-1..num+4)×[top-1..top+4) TileFrame 复扫（cs:47920-29）。写侧=
 * DungeonPass.place4x2D/HellFortPass.place4x2HF（镜像 72 基与样式行同批落地）。 */
const CHECK4X2_TYPES = new Set([79, 90, 487]);
function check4x2Sweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                            // cs:47828
  const i0 = st.idx(x, y);
  let num = x + Math.trunc(st.frameX[i0]! / 18) * -1;                       // cs:47837（type≠487）
  if ((sheet === 79 || sheet === 90) && st.frameX[i0]! >= 72) num += 4;     // cs:47838-41 镜像页锚
  let num2v = Math.trunc(st.frameY[i0]! / 18);
  let num3 = 0;
  while (num2v > 1) { num2v -= 2; num3++; }                                 // cs:47842-47（2 行/带）
  const top = y - num2v;
  const mirrored = sheet !== 487 && st.frameX[i0]! >= 72;                   // 79/90 镜像判定（487 走自身式）
  let flag = false;
  for (let k = num; k < num + 4; k++) {                                     // cs:47856（无 break 短路）
    for (let l = top; l < top + 2; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }                    // null→new Tile→!active
      const qi = st.idx(k, l);
      let wantFx = (k - num) * 18;                                          // cs:47859-65
      if (mirrored) wantFx = (k - num + 4) * 18;
      else if (sheet === 487) wantFx += num3 * 72;
      const wantFy = sheet === 487 ? (l - top) * 18 : (l - top) * 18 + num3 * 36;
      if (!st.flags[qi] || (SWEEP_SHEET[st.type[qi]!] ?? -1) !== sheet
        || st.frameX[qi] !== wantFx || st.frameY[qi] !== wantFy) flag = true;
    }
    // 地面门（cs:47906-17）：SolidTileAllowBottomSlope(k,top+2) ∨ active&&Platforms——
    // 床/浴缸/野餐桌允许平台支撑（TileID.Sets.Platforms 下垫），与 Check2x2 门互异
    if (!st.inBounds(k, top + 2)) { flag = true; continue; }
    if (!solidAllowBottom(st, k, top + 2)) {
      const gi = st.idx(k, top + 2);
      if (!(st.flags[gi] && PLATFORMS.has(SWEEP_SHEET[st.type[gi]!] ?? -1))) flag = true;
    }
  }
  if (!flag) return;                                                        // cs:47922-25
  ctx.destroyObject = true;                                                 // cs:47927
  for (let m = num; m < num + 4; m++) {
    for (let n = top; n < top + 3; n++) {                                   // 三行窗（含地面行,type 过滤兜底）
      if (!st.inBounds(m, n)) continue;
      const qi = st.idx(m, n);
      if ((SWEEP_SHEET[st.type[qi]!] ?? -1) === sheet && st.flags[qi]) killTileGen(st, ctx, m, n);
    }
  }
  ctx.destroyObject = false;                                                // cs:47918
  for (let n6 = num - 1; n6 < num + 4; n6++) {
    for (let n7 = top - 1; n7 < top + 4; n7++) tileFrameGen(st, ctx, n6, n7, false);   // cs:47920-29
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
 *  VANITY_GROUND、R3 杀后不再重帧（两版 cs 差异逐条保留，checkTreeAt 同源）。
 *  groundSet（AAAAAA）：CheckTreeWithSettings 的自定义 GroundTest 谓词集
 *  （583-589 宝石树=GemTreeGroundTest cs:30455 Stone∪Moss 换算表；634 灰烬树=
 *  AshTreeGroundTest cs:30480 {633}）。 */
const GEM_TREE_GROUND = new Set([1, 25, 117, 203, 182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);
const ASH_TREE_GROUND = new Set([633]);
/** ★IIII71b：CheckPalmTree（cs:54829-54879）1:1 —— 掷面：re-root 分支 Next(7,10)。 */
function checkPalmTreeSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const idxOf = (xx: number, yy: number): number => st.idx(xx, yy);
  const at = (xx: number, yy: number): boolean => st.inBounds(xx, yy) && st.flags[idxOf(xx, yy)] !== 0;
  const shOf = (xx: number, yy: number): number => SWEEP_SHEET[st.type[idxOf(xx, yy)]];
  const t0 = idxOf(x, y);
  const type = SWEEP_SHEET[st.type[t0]];
  const frameX0 = st.frameX[t0];
  const frameY0 = st.frameY[t0];
  let num = -1;
  let num2 = -1;
  if (at(x, y - 1)) num = SWEEP_SHEET[st.type[idxOf(x, y - 1)]];
  if (at(x, y + 1)) num2 = SWEEP_SHEET[st.type[idxOf(x, y + 1)]];
  if (num2 === 234 || num2 === 116 || num2 === 112) num2 = 53;
  if (num2 !== 53 && num2 !== type) killTileGen(st, ctx, x, y);            // cs:54850-54852
  if ((st.frameX[t0] === 66 || st.frameX[t0] === 220) && num2 !== 53) {
    killTileGen(st, ctx, x, y);                                            // cs:54854-54856
  }
  if (num !== type && st.frameX[t0] <= 44) {
    st.frameX[t0] = (ctx.rng ? ctx.rng.int(7, 9) : 7) * 22;                 // Next(7,10)*22
  } else if (num !== type && st.frameX[t0] === 66) {
    st.frameX[t0] = 220;
  }
  if (st.frameX[t0] !== frameX0 && st.frameY[t0] !== frameY0 && frameX0 >= 0 && frameY0 >= 0) {
    tileFrameGen(st, ctx, x - 1, y, false);
    tileFrameGen(st, ctx, x + 1, y, false);
    tileFrameGen(st, ctx, x, y - 1, false);
    tileFrameGen(st, ctx, x, y + 1, false);
  }
}

function checkTreeSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, vanity = false,
  groundSet?: Set<number>): void {
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
  if (!vanity && !groundSet && TREE_GROUND_NORM.has(num4)) num4 = 2;   // cs:54620-54636 归一化（仅 CheckTree）
  const groundOk = groundSet ? groundSet.has(num4) : vanity ? VANITY_GROUND.has(num4) : num4 === 2;
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

/* ── Check2x2Style（cs:52761-52898）——★IIIII103c：case254 南瓜派发落地 ──
 * 花域受理门族 mile8 #90 定罪根因之一：南瓜=2×2 多格物（PlacePumpkin cs:52902
 * fx∈{0,18}+fy=Next(6)*36+{0,18}），任意成员格被杀后其 SquareTileFrame 邻帧
 * TileFrame→case254→Check2x2Style 完整性/支撑门失配 → destroyObject 整组杀
 * + **case254 尾 ITEM 掷（生成期照常消费 genRand！）**：
 *   fx<72 零掷；72..107 Next(2) 中签再 Next(1,3)；108..143 Next(2,6)；
 *   ≥144 Next(5,11)+(!halloween 短路免 200 面)。JS 此前缺整条臂 → 花圃锚窗内
 *   上层瓜悬空残留在 JS（x86 已杀）→ 同窗后续受理面/掷流全错位（本批单窗重放
 *   实证 x86-only 杀@(3572..3573,241)/(3596..3597,243) 与 ±Next(3) 升级帧漂移）。
 * 反解/完整性逐句镜像；地面门=SolidTileAllowBottomSlope(cs:70706，solidAllowBottom
 * 助手既有)+type==254 支柱草族 {2,109,477,492} 门（cs:52804-13）。尾扫
 * [left-1..left+3)×[top-1..top+3) 列主序（cs:52895-97）；group 内其他类型维持
 * 未派发备案（in-gen 在场成员唯 254）。 */
function check2x2StyleSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (ctx.destroyObject) return;                                            // cs:52763
  let flag = false;
  const i0 = st.idx(x, y);
  const top = y - (Math.trunc(st.frameY[i0]! / 18) & 1);                    // 组顶行 cs:52765-70（fy18 单位奇偶归一）
  let colU = Math.trunc(st.frameX[i0]! / 18);
  let style = 0;
  while (colU > 1) { colU -= 2; style++; }                                  // cs:52771-77（style 基=36px 步）
  const left = x - colU;
  const fxBase = style * 36;
  for (let k = left; k < left + 2; k++) {
    for (let l = top; l < top + 2; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }                    // null→new Tile=失配
      const q = st.idx(k, l);
      if (!st.flags[q] || SWEEP_SHEET[st.type[q]] !== 254 || st.frameX[q] !== (k - left) * 18 + fxBase) flag = true;   // cs:52788-90
    }
    if (!st.inBounds(k, top + 2)) { flag = true; continue; }
    if (!solidAllowBottom(st, k, top + 2)) { flag = true; }                 // cs:52792 SolidTileAllowBottomSlope
    else {
      const g = st.idx(k, top + 2);
      const gs = SWEEP_SHEET[st.type[g]];
      if (gs !== 2 && gs !== 109 && gs !== 477 && gs !== 492) flag = true;  // cs:52797-13（活性草族门）
    }
  }
  if (!flag) return;
  const fxSelf = st.frameX[i0]!;                                            // cs:52823 杀前捕获（尾掷档位）
  ctx.destroyObject = true;                                                 // cs:52824
  for (let m = left; m < left + 2; m++) {
    for (let n = top; n < top + 2; n++) {
      if (!st.inBounds(m, n)) continue;
      const q = st.idx(m, n);
      if (st.flags[q] && SWEEP_SHEET[st.type[q]] === 254) killTileGen(st, ctx, m, n);
    }
  }
  {                                                                         // case 254 尾掷（Item.NewItem 不建模但 genRand 照耗，cs:52841-67）
    if (fxSelf >= 72) {
      if (fxSelf < 108) {
        if (ctx.rng?.nextInt(2) === 0) ctx.rng?.nextIntRange(1, 3);         // cs:52846-51
      } else if (fxSelf < 144) {
        ctx.rng?.nextIntRange(2, 6);                                        // cs:52853-57
      } else {
        ctx.rng?.nextIntRange(5, 11);                                       // cs:52858-61
        if (HALLOWEEN_GEN && ctx.rng) ctx.rng.nextInt(200);                 // Main.halloween 短路面（生成期缺省 false）
      }
    }
  }
  ctx.destroyObject = false;                                                // cs:52891
  for (let cx2 = left - 1; cx2 < left + 3; cx2++) {                         // cs:52893-97 列主序尾扫
    for (let cy2 = top - 1; cy2 < top + 3; cy2++) tileFrameGen(st, ctx, cx2, cy2, false);
  }
}
/** Main.halloween 缺省 false（rig 世界生成期与 SW 一致）；若未来接入季节门在此接 */
const HALLOWEEN_GEN = false;

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

/* ★IIIII99b（2026-08-31）：Check2x2 主组补全——rigsrc(1458) WorldGen.cs:87340-56
 *   TileFrameImportant case 94/95/97/98/99/100/125/126/173/282/287/319/621/622 →
 *   Check2x2(i,j,type)。引擎此前仅派发 {138,411,484,751,752,654}∪CHECK2XX_TYPES，
 *   Keg 组整缺 ⇒ toadstool #98 Settle_Liquids_Again：埋屋 Keg(94) 底排被沉降期岩浆
 *   WaterCheck 死亡支杀掉后，KillTile 尾 SquareTileFrame 九邻重帧到孤儿上半时无臂
 *   落空 → T0>94×2 @(2712..2713,905) 残差（x86 ktlog 栈实证全链：
 *   WaterCheck→KillTile←SquareTileFrame←TileFrameImportant←case94 Check2x2）。
 *   96=Check2x2Style 独立支仍未派发（cs:87357 备案：未观测族）。95/126 上锚支
 *   （cs:49055-59=上格 solid 非平台门）按原文落地于 check2x2Sweep 内 k 列循环。 */
/* ★IIIII99b 收口裁剪（2026-08-31 批窗时点）：真值全集=上注 14 成员，但当时
 *   DungeonPass.place2x2D 写侧裸 dgWr 全 f0,0（烛台 item2664-66→style22-24 帧带
 *   缺失）⇒ 派发即误杀（g 链 #105 T100>0×8 @(441,729) 复归实证）。keg(94) 的本仓
 *   放置侧自洽故先单开 94 收口 toad #98/#99。★IIIII99d：写侧帧公式三族清偿
 *   （place2x2D/place3x4D/place4x2D）+ 消费者 Check3x4/Check4x2 两臂补齐后，
 *   主组全集与书架族/床浴缸族一并启用。 */
// ★IIIII99d：Check2x2 主组全集派发（cs(1458):87074-87 直调列 case 94/95/97/98/99/
//   100/125/126/173/282/287/319/621/622）。烛台 100 写侧帧债本批清偿
//   （DungeonPass.place2x2D frameY=style*36+row*18，cs:51872-81 同式）→ 派发后
//   #105 大循环 TileFrame 对烛台的完整性校验与原版同流（g/s22222/m 终清理残差
//   T100×8 组=vanilla 由本臂判杀而 JS 落空支无派发的杀链面）。
//   SW_I99D_NODISP=1 = 回退哨兵（A/B 定域仪：恢复 99b 收口态 [94]，配
//   tools/_iii116ab 对拍隔离本批消费者面的四通道贡献，缺省零开销）。
const C2X2_MAIN_GROUP = (__swProcessEnv ?? {}).SW_I99D_NODISP === '1'
  ? new Set<number>([94])
  : new Set<number>([94, 95, 97, 98, 99, 100, 125, 126, 173, 282, 287, 319, 621, 622,
    484]);   // ★IIIII112：+484 RollingCactus（cs:83677-83684 case 132 组→Check2x2）——
             // errorWorld 深岛写把 2×2 滚刺组右列覆成云后，TileFrame 触发整组杀；
             // JS 缺派发曾残 (1775,550-551) 2 格。
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
  __swFnt39('TR184', x, y);
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
    __swFnt39('TR72', x, y);
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

/** case 4 火把（CheckTorch cs:86838-86922）：附着向 fx = 基(0/66)+{地板0,左22,右44}；
 *  墙挂=基；无附着 → 杀。★AAAAAA 新增（曾无火把帧分派 = s4 184 格帧债）。 */
function checkTorchSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  const num = st.frameX[i]! >= 66 ? 66 : 0;
  const typeOf = (xx: number, yy: number): number => (nactiveAt(st, xx, yy) ? sheetAt2(st, xx, yy) : -1);
  const solidOf = (sh: number): boolean => {
    const id = REV_SHEET_ID.get(sh);
    return id !== undefined && genSolidType(id);
  };
  // num2 下格取型（cs:86873：平台族 TopEdgeCanBeAttachedTo(=solidAllowBottom) 或 非半砖非顶坡）
  let num2 = -1;
  if (nactiveAt(st, x, y + 1)) {
    const bs = sheetAt2(st, x, y + 1);
    if ((PLATFORMS.has(bs) && solidAllowBottom(st, x, y + 1))
      || (!st.half[st.idx(x, y + 1)] && slopeOf(st, x, y + 1) !== 1 && slopeOf(st, x, y + 1) !== 2)) num2 = bs;
  }
  // num3 左 / num4 右取型（cs:86877/86881：slope==0 或 %2 不等于侧号）
  let num3 = -1, num4 = -1;
  if (nactiveAt(st, x - 1, y)) {
    const sl = slopeOf(st, x - 1, y);
    if (sl === 0 || sl % 2 !== 1) num3 = sheetAt2(st, x - 1, y);
  }
  if (nactiveAt(st, x + 1, y)) {
    const sl = slopeOf(st, x + 1, y);
    if (sl === 0 || sl % 2 !== 0) num4 = sheetAt2(st, x + 1, y);
  }
  if (num2 >= 0 && solidOf(num2) && (!NO_ATTACH.has(num2) || PLATFORMS.has(num2))) {
    st.frameX[i] = num;
    return;
  }
  if ((num3 >= 0 && solidOf(num3) && !NO_ATTACH.has(num3)) || (num3 >= 0 && IS_BEAM.has(num3))
    || (IS_TREE_TRUNK.has(num3) && IS_TREE_TRUNK.has(typeOf(x - 1, y - 1)) && IS_TREE_TRUNK.has(typeOf(x - 1, y + 1)))) {
    st.frameX[i] = 22 + num;
    return;
  }
  if ((num4 >= 0 && solidOf(num4) && !NO_ATTACH.has(num4)) || (num4 >= 0 && IS_BEAM.has(num4))
    || (IS_TREE_TRUNK.has(num4) && IS_TREE_TRUNK.has(typeOf(x + 1, y - 1)) && IS_TREE_TRUNK.has(typeOf(x + 1, y + 1)))) {
    st.frameX[i] = 44 + num;
    return;
  }
  if (st.wall[i] > 0) { st.frameX[i] = num; return; }
  killTileGen(st, ctx, x, y);
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
  if (reset && ctx.rng) __swFnt39('TR178', x, y);
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
    // ★1457 对齐档 2（2026-08-23,cs:81871-81880）：spore 判定用入口帧（TryGetNewType
    //   出参）不变,回写分支查 **type2（转化后类型）==201 → 270,否则 144**——1456
    //   cs:81300-81310 查入口 type（KKKKKK 批曾随 1456 基准回滚）。1457 语义：入口
    //   3/61/110/24(fx144)+down 199/662 → 转化成 201 → 写 270（1456 写 144）。
    if (r.spore) st.frameX[i] = r.type === 201 ? 270 : 144;
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
  __swFnt39('CP', x, y, st.frameY[i]! + ',' + st.type[i]);   // IIII100e2：K 分解镜像
  if (st.frameY[i] === 18 || sheetAt2(st, x, y) === 649) {
    check2x1Sweep(st, ctx, x, y, sheetAt2(st, x, y));
    return;
  }
  if (!solidAllowBottom(st, x, y + 1)) { killTileGen(st, ctx, x, y); return; }
  const fx18 = Math.floor(st.frameX[i]! / 18);
  __swFnt39('CPN', x, y, fx18 + ',' + st.type[i]);   // IIII100e2：组号+型（rig CPN 同位）
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
  if (sheet === 103) {
    // ★1457 对齐档 2（2026-08-23,cs:47417-47430）：case103 独立支=桌面门【或】
    //  AnchorValid(Table) 逃生门（两底格各判,短路序同原版）——碗底为平台正帧/
    //  solid∩solidTop/tileTable 且 blockType 0 时存活。1456（cs:47019-47033）的
    //  case103 与 29/462 同支=纯桌面门（KKKKKK 批曾随 1456 基准并回）。
    for (const xx of [x0, x0 + 1]) {
      const bi = st.idx(xx, y + 1);
      const tableGate = !st.flags[bi] || !TILE_TABLE.has(SWEEP_SHEET[st.type[bi]])
        || st.half[bi] || slopeOf(st, xx, y + 1) === 1 || slopeOf(st, xx, y + 1) === 2;
      if (tableGate && !anchorValidTable(st, xx, y + 1)) ok = false;
    }
  } else if (sheet === 29 || sheet === 462) {
    // 纯桌面门（1456≡1457 同支,cs:47431-47442）：两底格各判非活性/非 tileTable/
    // halfBrick/topSlope → flag
    for (const xx of [x0, x0 + 1]) {
      const bi = st.idx(xx, y + 1);
      if (!st.flags[bi] || !TILE_TABLE.has(SWEEP_SHEET[st.type[bi]])
        || st.half[bi] || slopeOf(st, xx, y + 1) === 1 || slopeOf(st, xx, y + 1) === 2) ok = false;
    }
  } else if (!solidAllowBottom(st, x0, y + 1) || !solidAllowBottom(st, x0 + 1, y + 1)) {
    // ★AAAAAA：cs:47039-47048 else 支——非桌族（含 185/16/18…）双底格
    //   SolidTileAllowBottomSlope 支撑门曾整缺（#105 (2776,526) 沙堆右底 dirt 不实
    //   → 金标杀/本仓存活 8 格实证）。
    ok = false;
  }
  if (sheet === 185) {
    // cs:47051-47058：草地变体转化（fx∈[1368,1458] 且双底格非草族{2,477,492} → -1368）
    const li = st.idx(x0, y), ri = st.idx(x0 + 1, y);
    if (st.frameX[li]! >= 1368 && st.frameX[li]! <= 1458) {
      const bl = SWEEP_SHEET[st.type[st.idx(x0, y + 1)]], br = SWEEP_SHEET[st.type[st.idx(x0 + 1, y + 1)]];
      if (bl !== 2 && br !== 2 && bl !== 477 && br !== 477 && bl !== 492 && br !== 492) {
        st.frameX[li] -= 1368;
        st.frameX[ri] -= 1368;
      }
    }
    // cs:47060-47090：变体带号（fx/36 + (fy/18-1)*52）→ 底格雪/沙族门
    const num5 = Math.floor(st.frameX[li]! / 36) + (Math.floor(st.frameY[li]! / 18) - 1) * 52;
    for (let j = x0; j <= x0 + 1; j++) {
      if (INVALID_PILES.has(SWEEP_SHEET[st.type[st.idx(j, y + 1)]])) { ok = false; break; }
      const bi = st.idx(j, y + 1);
      if (!st.flags[bi]) continue;
      const b2 = SWEEP_SHEET[st.type[bi]];
      if (num5 >= 25 && num5 <= 30) {
        if (!PILE_SNOW_ICE.has(b2)) ok = false;
      } else if ((num5 >= 41 && num5 <= 46) || (num5 >= 62 && num5 <= 64)) {
        if (!PILE_SAND.has(b2)) ok = false;
      }
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
  // ★DDDDDD 批（2026-08-21）：CheckPot 尾 Gore 掷表（cs:56896-56966）——生成期
  //   SpawnThingsFromPot 头 isGeneratingOrLoadingWorld 早退（cs:57185）零掷、
  //   653 大罐 Item 分支零掷，唯 Gore switch 的三档照掷（genRand 显式）：
  //   num4 25-27→2×Next(217,220)；28-30→2×Next(315,317)；31-33→Next(2,5)+次×Next(6)。
  //   m20260811 #101 首分叉实锤：标准轨巷杀 (2086-2087,922-923) 罐群后 vanilla 掷
  //   'b 2 5+a 6×4'（span @312312），JS 零掷 → 后续轨位全漂（A=26083 债主）。
  if (ctx.rng) {
    if (num4 >= 25 && num4 <= 27) {
      ctx.rng.nextIntRange(217, 220);
      ctx.rng.nextIntRange(217, 220);
    } else if (num4 >= 28 && num4 <= 30) {
      ctx.rng.nextIntRange(315, 317);
      ctx.rng.nextIntRange(315, 317);
    } else if (num4 >= 31 && num4 <= 33) {
      const goreCount = ctx.rng.int(2, 4);
      for (let q = 0; q < goreCount; q++) ctx.rng.nextInt(6);
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

// ── CheckSuper（cs:48117-48406）通用臂：376/443/444/485（TileFrameImportant
//    cs:86437-40 四 case 共用）——DDDDDD 批 2026-08-21 ────────────────────────
// 引擎此前仅派 485（checkSuper485Sweep）。LLLL 批"444 仅 notTheBees 在场/376 非
// worldgen/443 属 Traps pass"备案**陈旧**：444=蜂巢块（Beehives pass 常态种子
// 写入）、376 渔笼=微群系宝箱战利品写入、443 间歇泉=HellFort/Traps 早期 pass——
// s22222/12345 #101 杀账铁证（KL t444×12 / t443×1 / t485×8，/tmp/cccccc-out）。
// TileObjectData（TileObjectData.cs addTile 376=3621/443=2854/444=3567/485=3511）：
//   376=Style2x2 横排+CoordinateHeights{16,18}（CFW=36,CFH=38）；443=Style2x1 横排
//   （H=1,CFW=36,CFH=18）；444=Style2x2 **竖排**（StyleHorizontal=false,CFW=CFH=36）；
//   485=Style2x2 横排。格步恒 18（CW=16+pad2 / CH[0]=16+pad2）。
// 尘掷：376→killTileDustAmount 零档；443/444→10×0 掷（非 FURNITURE_DUST）；485→0
//   ——四 case 击杀全零掷（s22222 掷流 967,192=967,192 全等实证）。
// 掉落（376→style 表/443→3722）、444→655 弹（!flag6）、485→582 NPC（!gen 门）——
//   生成期 Item.NewItem/Projectile/NPC 全不耗 genRand 且不入世界态，不建模。
/** AnchorType 位（Terraria.Enums/AnchorType.cs）——CheckSuper 锚腿用 */
const AN_SOLID_TILE = 1, AN_SOLID_WITH_TOP = 2, AN_SOLID_SIDE = 8, AN_SOLID_BOTTOM = 0x80;
/** TileID.Sets.NotReallySolid（TileID.cs:355）——SolidBottom 腿排除 */
const NOT_REALLY_SOLID = new Set([387, 388, 10]);
/** WorldGen.AnchorValid(tile, anchor)（cs:51866-51913）：CheckSuper 443 双向锚/
 *  444 顶锚/485 底锚。腿序=原版（SolidTile→SolidBottom→SolidWithTop/Table→
 *  Table→SolidSide，!flag 短路）；tileSolid 走 genSolidType（生成期镜像 RRRR）、
 *  tileSolidTop 走 TILE_SOLID_TOP、noAttach 走 NO_ATTACH；
 *  blockType: half→1 / slope s→s+1 / 整砖 0（Tile.cs:232）。 */
function anchorValidSweep(st: TileStore, x: number, y: number, mask: number): boolean {
  if (!nactiveAt(st, x, y)) return false;      // EmptyTile 位四 case 均不用
  const i = st.idx(x, y);
  const t = st.type[i];
  const sh = SWEEP_SHEET[t];
  if (sh < 0) return false;
  const solid = genSolidType(t);
  const solidTop = TILE_SOLID_TOP.has(sh);
  const sl = st.slope[i]!;
  const bt = st.half[i] ? 1 : sl > 0 ? sl + 1 : 0;
  const plat = PLATFORMS.has(sh);
  let flag = false;
  if ((mask & AN_SOLID_TILE) !== 0 && solid && !solidTop && !NO_ATTACH.has(sh) && bt === 0) flag = true;
  if ((mask & AN_SOLID_BOTTOM) !== 0) {
    const topSlope = sl === 1 || sl === 2;
    const bottomSlope = sl === 3 || sl === 4;
    if (((solid && (!solidTop || (plat && (st.half[i] !== 0 || topSlope)))) || topSlope || st.half[i] !== 0)
      && !NOT_REALLY_SOLID.has(sh) && !bottomSlope) flag = true;
  }
  if (!flag && (mask & (AN_SOLID_WITH_TOP | 4)) !== 0) {
    if (plat) {
      const n = Math.floor(st.frameX[i]! / 18);
      if ((st.half[i] === 0 && n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26)) flag = true;
    } else if (solid && solidTop) flag = true;
  }
  if (!flag && (mask & 4) !== 0 && !plat && TILE_TABLE.has(sh) && bt === 0) flag = true;
  if (!flag && (mask & AN_SOLID_SIDE) !== 0 && solid && !solidTop && (bt === 4 || bt === 5)) flag = true;
  return flag;
}

/** Check2x3Wall/Check3x2Wall/Check4x3Wall/Check6x4Wall（cs:44628/44785/44908/44994）
 *  画作族完整性（type+活性+墙>0+帧全等）→ 败整幅 KillTile。DDDDDD 批补派发。
 *  零掷：掉落=固定 id Item.NewItem（无 genRand；生成期不入档）；样式轴 245 在
 *  frameX（wrap2）/246 在 frameY（wrap2）/241 在 frameY（wrap3）/242 双轴合成。 */
function checkWallArtSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;
  const i = st.idx(x, y);
  const tid = st.type[i];
  const fx = st.frameX[i]!, fy = st.frameY[i]!;
  let w: number, h: number, fxBase = 0, fyBase = 0, x0: number, y0: number;
  if (sheet === 245) {
    let s = Math.floor(fx / 18), n = 0;
    while (s >= 2) { s -= 2; n++; }
    x0 = x - s; y0 = y - Math.floor(fy / 18); fxBase = n * 36; w = 2; h = 3;
  } else if (sheet === 246) {
    let s = Math.floor(fy / 18), n = 0;
    while (s >= 2) { s -= 2; n++; }
    y0 = y - s; x0 = x - Math.floor(fx / 18); fyBase = n * 36; w = 3; h = 2;
  } else if (sheet === 241) {
    let s = Math.floor(fy / 18), n = 0;
    while (s >= 3) { s -= 3; n++; }
    y0 = y - s; x0 = x - Math.floor(fx / 18); fyBase = n * 54; w = 4; h = 3;
  } else {
    const fx18 = Math.floor(fx / 18), fy18 = Math.floor(fy / 18);
    const n = 27 * Math.floor(fx18 / 6) + (fy18 >> 2);
    y0 = y - (fy18 % 4); x0 = x - (fx18 % 6);
    fyBase = (n % 27) * 72; fxBase = Math.floor(n / 27) * 108; w = 6; h = 4;
  }
  let bad = false;
  for (let k = x0; k < x0 + w && !bad; k++) {
    for (let l = y0; l < y0 + h; l++) {
      if (!st.inBounds(k, l)) { bad = true; break; }
      const q = st.idx(k, l);
      if (st.type[q] !== tid || !st.flags[q] || st.wall[q] <= 0
        || st.frameX[q] !== fxBase + (k - x0) * 18
        || st.frameY[q] !== fyBase + (l - y0) * 18) { bad = true; break; }
    }
  }
  if (!bad) return;
  (globalThis as { __swWallArt?: (s2: string) => void }).__swWallArt?.(`KILL s=${sheet} visit(${x},${y}) grp(${x0},${y0}) fx0=${fx} fy0=${fy}`);
  ctx.destroyObject = true;
  for (let k = x0; k < x0 + w; k++) {
    for (let l = y0; l < y0 + h; l++) {
      if (st.inBounds(k, l)) {
        const q = st.idx(k, l);
        if (st.type[q] === tid && st.flags[q]) killTileGen(st, ctx, k, l);
      }
    }
  }
  ctx.destroyObject = false;
}

/** CheckSuper 通用（cs:48117）：多格完整性 + 类型专属锚（376 底行 solid/table
 *  且非半砖 / 443 底行 SolidTile|SolidWithTop|SolidSide 或顶行 SolidBottom 双向、
 *  过检时重写 frameX 样式基（cs:48212-27，帧写零掷）/ 444 顶行 SolidTile+组内
 *  液体拒 / 485 底行 SolidTile）；败 → 整组 KillTile + 尾 (w+2)×(h+2) TileFrame
 *  重扫（cs:48395-48405，destroyObject 复位后）。 */
function checkSuperSweep(st: TileStore, ctx: SweepCtx, x: number, y: number, sheet: number): void {
  if (ctx.destroyObject) return;                                     // cs:48119
  const i0 = st.idx(x, y);
  const tid = st.type[i0];
  const fx0 = st.frameX[i0]!, fy0 = st.frameY[i0]!;
  const width = 2;
  const height = sheet === 443 ? 1 : 2;
  const cfw = 36;
  const cfh = sheet === 376 ? 38 : sheet === 443 ? 18 : 36;
  const horiz = sheet !== 444;                                       // StyleHorizontal
  const num = sheet === 444 ? 0 : Math.floor(fx0 / 36);              // cs:48125-35
  const num4 = horiz ? Math.floor(fx0 / cfw) : 0;                    // cs:48151-58
  const num5 = horiz ? 0 : Math.floor(fy0 / cfh);
  const num2 = x - (Math.floor(fx0 / 18) % width);                   // cs:48143-47
  const num3 = y - (Math.floor(fy0 / 18) % height);
  let flag5 = false;
  for (let i = 0; i < width; i++) {
    for (let j = 0; j < height; j++) {
      if (!st.inBounds(num2 + i, num3 + j)) { flag5 = true; continue; }   // GetTileSafely 非活性
      const q = st.idx(num2 + i, num3 + j);
      if (!st.flags[q] || st.type[q] !== tid
        || st.frameX[q] !== num4 * cfw + i * 18
        || st.frameY[q] !== num5 * cfh + j * 18) flag5 = true;            // cs:48163-75
    }
  }
  let flag6 = false;
  if (sheet === 376) {                                               // cs:48177-90
    for (let k = 0; k < width; k++) {
      const ax = num2 + k, ay = num3 + height;
      const ai = st.inBounds(ax, ay) ? st.idx(ax, ay) : -1;
      const ash = ai >= 0 ? SWEEP_SHEET[st.type[ai]] : -1;
      if (ai < 0 || !st.flags[ai] || (!genSolidType(st.type[ai]) && !TILE_TABLE.has(ash))) flag5 = true;
      if (ai >= 0 && st.half[ai] !== 0) flag5 = true;
    }
  }
  if (sheet === 443) {                                               // cs:48192-48227
    let flag7 = true, flag8 = true;
    for (let l = 0; l < width; l++) {
      if (!anchorValidSweep(st, num2 + l, num3 + height, AN_SOLID_TILE | AN_SOLID_WITH_TOP | AN_SOLID_SIDE)) flag8 = false;
      if (!anchorValidSweep(st, num2 + l, num3 - 1, AN_SOLID_BOTTOM)) flag7 = false;
    }
    if (!flag7 && !flag8) flag5 = true;
    if (!flag5) {
      if (flag8) {
        for (let m = 0; m < width; m++) st.frameX[st.idx(num2 + m, num3)] = m * 18 + Math.floor(num / 2) * 36;
      } else {
        for (let n = 0; n < width; n++) st.frameX[st.idx(num2 + n, num3)] = n * 18 + Math.floor((num - 2) / 2) * 36 + 72;
      }
    }
  }
  if (sheet === 444) {                                               // cs:48229-56
    let flag9 = true;
    for (let k = 0; k < width; k++) {
      if (!anchorValidSweep(st, num2 + k, num3 - 1, AN_SOLID_TILE)) flag9 = false;
    }
    if (!flag9) flag5 = true;
    for (let k = 0; k < width; k++) {
      for (let l = 0; l < height; l++) {
        if (st.inBounds(num2 + k, num3 + l) && st.liquid[st.idx(num2 + k, num3 + l)]! > 0) { flag5 = true; flag6 = true; }
      }
    }
  }
  if (sheet === 485) {                                               // cs:48258-66
    for (let k = 0; k < width; k++) {
      if (!anchorValidSweep(st, num2 + k, num3 + height, AN_SOLID_TILE)) flag5 = true;
    }
  }
  if (!flag5) return;                                                // cs:48269
  ctx.destroyObject = true;
  for (let k = 0; k < width; k++) {
    for (let l = 0; l < height; l++) {
      if (st.inBounds(num2 + k, num3 + l)) {
        const q = st.idx(num2 + k, num3 + l);
        if (st.type[q] === tid && st.flags[q]) killTileGen(st, ctx, num2 + k, num3 + l);
      }
    }
  }
  ctx.destroyObject = false;                                         // cs:48392（掉落/弹幕/NPC 不建模）
  for (let k = -1; k < width + 1; k++) {                             // cs:48395-48405 尾重扫
    for (let l = -1; l < height + 1; l++) {
      tileFrameGen(st, ctx, num2 + k, num3 + l, false);
    }
  }
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
  {
    const bl = st.type[st.idx(x, y + 1)] ?? -1;
    const bol = BOULDER_SHEETS.has(SWEEP_SHEET[bl] ?? -1) ? 1 : 0;
    const sab = solidAllowBottom(st, x, y + 1) ? 1 : 0;
    __swFnt39('C1V', x, y, bol + '' + sab);
  }
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
  (globalThis as unknown as { __swAltarDbg?: (msg: string) => void }).__swAltarDbg
    ?.(`C32 ${x},${y} sh=${sheet} fx=${st.frameX[i]} fy=${st.frameY[i]} grp=[${x0},${y0}] yEnd=${yEnd}`);
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
          // ★IIIII81（GFB-B #46 定罪案）：vanilla cs:49730-49738——祭坛支撑门只有
          //   「底格非实心 ‖ 底格活性且为 Boulder(138/484/664/665/711-716)」两支，
          //   **没有** InvalidTileForPilesOrSpeleothems 检查（那是 case186 专属）。
          //   JS 曾误挂 invalidForPiles → zenith 蜂蜜斑挖池 ClearTile 后 honey(229)
          //   ∈invalid 表 ⇒ 支撑判死 → 整组祭坛 KillTile + 尘掷滚流，蜂窝带
          //   x86-vs-JS 写面错位（rig RD trace @+60 骰六连跳实锤）。按原文字面修。
          {
            const _okB = solidAllowBottom(st, k, yEnd);
            const _bs = activeAt2(st, k, yEnd) ? sheetAt2(st, k, yEnd) : -1;
            const _bad = !_okB || (_bs >= 0 && BOULDER_SHEETS.has(_bs));
            const _dbg = (globalThis as unknown as { __swAltarDbg?: (msg: string) => void }).__swAltarDbg;
            _dbg?.(`BAD=${_bad} col=${k} yEnd=${yEnd} okBottom=${_okB ? 1 : 0} underSheet=${_bs}`);
            if (_bad) bad = true;
          }
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
  { // ★IIIII81：击杀前网格台账
    const _g = (globalThis as unknown as { __swAltarDbg?: (msg: string) => void }).__swAltarDbg;
    if (_g && (sheet === 26 || sheet === 695)) {
      const g2 = (xq: number, yq: number): string => {
        if (!st.inBounds(xq, yq)) return 'oob';
        const iq = st.idx(xq, yq);
        return `${SWEEP_SHEET[st.type[iq]]}/${st.flags[iq]}/${st.frameX[iq]}/${st.frameY[iq]}`;
      };
      let acc = '';
      for (let lq = y0 - 1; lq <= yEnd; lq++) {
        for (let kq = x0 - 1; kq <= x0 + 3; kq++) acc += `[${kq},${lq}]=${g2(kq, lq)} `;
        acc += '\\n';
      }
      _g(`KILLGRID ${x},${y} sh=${sheet} grp=[${x0},${y0}] ${acc}`);
    }
  }
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
/** CheckLilyPad 全量版（IIIII105 批落地；反编译逐句锚 1457 WorldGen.cs:59694-59788
 *  ＝rigsrc 计数 cs:58967-59085，下同）——派发 TileFrameImportant case 518
 *  （cs:86246，经 SquareTileFrame/TileFrame 级联与 FinalCleanup 全图重帧扫到达；
 *  Liquid.DelWater 尾臂在 LiquidSim.checkLilyPad 运行时域独立承载）。
 *  四支全镜像：【非水 KillTile / 上浮整株（新格写入+paint 拷贝+自身失活+
 *  SquareTileFrame(resetFrame:false) 级联）/ 自身含水维持 / 下沉一格】
 *  +【地基失配整杀 / 下方失配 KillTile】。
 *  ★IIIII99b 曾试修全量后回退：当时树静性未证（后续 DFC/DFH 战役定性该批
 *  「Piles(3696,566)/Stalac 二次漂移」为并行车道 WIP 混流伪影，XIII 章
 *  『单次回归不可采信』），本批于静默窗以冻结基座反演重放重证后正式接线。 */
function checkLilyPadSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  const i = st.idx(x, y);
  // ① liquidType() != 0 → KillTile（cs 头门，与液量无关；本仓 +1 编码下位形即
  //   LAVA/HONEY/SHIMMER——NONE/WATER 位形均放行）
  const lt = st.liquidType[i];
  if (lt !== LIQUID_TYPE.NONE && lt !== LIQUID_TYPE.WATER) { killTileGen(st, ctx, x, y); return; }
  // ② 下潜找地基（active ∧ tileSolid ∧ 非 tileSolidTop 停；上界 maxY-50）
  let num = y;
  for (;;) {
    if (!(num < st.h - 50)) break;                       // cs 循环限位支
    const q = st.idx(x, num);
    // ★C# 循环体 null 早退（Main.tile[x,num]==null return）：此处映射为越界即停，
    //   底缘受 h-50 上界保护实践中不可达（catTail 同款守卫惯例）
    if (!st.inBounds(x, num)) return;
    if (!(!st.flags[q] || !genSolidType(st.type[q]) || !!TILE_DEFS[st.type[q]]?.platform)) break;
    num++;
  }
  // ③ 地基 sheet → frameY 行表（{2,477}→0、{109,116}→18、{60}→36；147/1456 反编译
  //   有 `type==109||type==109||type==116` 重言式，语义≡单组 {109,116}）
  const sh = SWEEP_SHEET[st.type[st.idx(x, num)]];
  let num2 = -1;
  if (sh === 2 || sh === 477) num2 = 0;
  else if (sh === 109 || sh === 116) num2 = 18;
  else if (sh === 60) num2 = 36;
  if (num2 < 0) { killTileGen(st, ctx, x, y); return; }  // 地基失配 → 整杀（else 支）
  if (st.frameY[i] !== num2) st.frameY[i] = num2;         // frameY 归位（带 net 发送，gen 免）
  // ④ 上浮整株：上方空且含水 → 整垫上移（half/slope 清零 + paint 拷贝）
  if (st.inBounds(x, y - 1)) {
    const up = st.idx(x, y - 1);
    if (st.liquid[up]! > 0 && !st.flags[up]) {
      st.setTileSilent(x, y - 1, sid(518), st.frameX[i]!, st.frameY[i]!);
      st.half[up] = 0; st.slope[up] = 0;
      st.paint[up] = st.paint[i];                        // color(cur.color())（cs 逐字段）
      st.flags[i] = 0; st.type[i] = 0;                   // 自身失活（paint/half/slope/wall 保留=原版置 active(false)+type=0）
      squareTileFrameAtFalse(st, ctx, x, y - 1);         // SquareTileFrame(x,y-1,false)
      return;
    }
  } else {
    return;                                              // 顶缘不设垫（C# 此处 NRE 不可达，守卫防御化）
  }
  if (st.liquid[i] !== 0) return;                        // 自格含水维持（⑤维持原位）
  // ⑥ 下沉一格：GetTileSafely(x,y+1) 非活跃 → 下移（写序同④）
  const dn = st.idx(x, y + 1), dAct = !!(st.inBounds(x, y + 1) && st.flags[dn]);
  if (!dAct) {
    st.setTileSilent(x, y + 1, sid(518), st.frameX[i], st.frameY[i]);
    st.half[dn] = 0; st.slope[dn] = 0;
    st.paint[dn] = st.paint[i];
    st.flags[i] = 0; st.type[i] = 0;
    squareTileFrameAtFalse(st, ctx, x, y + 1);
    return;
  }
  // ⑦ 下方失配杀：tileSafely.active() && !Platforms[t] && (!tileSolid[t] ||
  //   tileSolidTop[t])（cs 逐字面）——Platforms=TileID.Sets.Platforms{19,427,435-439}
  //   （Main.cs 连接帧表两处同源）；tileSolidTop 以 defs.platform 近似
  //   （catTail 等 gen 扫既定约定；solid∧solidTop 家族 Main.cs 手赋仅 239/380，
  //   二者入 defs 后并入 platform 位族）；tileSolid 走 genSolid 覆写表
  if (st.inBounds(x, y + 1)) {
    const bt = st.type[dn];
    if (!PLATFORMS.has(SWEEP_SHEET[bt])
      && (!genSolidType(bt) || !!TILE_DEFS[bt]?.platform)) {
      killTileGen(st, ctx, x, y);
    }
  }
}

/** SquareTileFrame(i,j,resetFrame:false)（cs:80924 九宫；TileFrame 缺省参=false 实证
 *  cs:82605 ⇒ 八邻本就走 resetFrame:false，仅中心受实参——睡莲移动臂落点级联专用，
 *  与 squareTileFrame(中心恒 true,178 掷门注释) 唯一差异在中心复位旗 */
function squareTileFrameAtFalse(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  tileFrameGen(st, ctx, x - 1, y - 1, false);
  tileFrameGen(st, ctx, x - 1, y, false);
  tileFrameGen(st, ctx, x - 1, y + 1, false);
  tileFrameGen(st, ctx, x, y - 1, false);
  tileFrameGen(st, ctx, x, y, false);
  tileFrameGen(st, ctx, x, y + 1, false);
  tileFrameGen(st, ctx, x + 1, y - 1, false);
  tileFrameGen(st, ctx, x + 1, y, false);
  tileFrameGen(st, ctx, x + 1, y + 1, false);
}


/** CheckCatTail（1457 cs:59231-59404，派发 cs:86248 case 519）——IIIIII3 批全量 1:1
 *  重写。此前整缺「组顶反解」段（cs:59355-59371：num 先复位 num2-1、格失活时向上
 *  回扫首个活跃 519、再连续上行到组顶）→ 水门 b/d 读到「最高含水格」而非「组顶」，
 *  孤儿香蒲列判 valid 漏杀 ×7（g #105 x=2864 列：rederive 后闸 d 读 (735/734) 正中
 *  stem 带 → 整列杀）。另补 frameX>18 中段门（cs:59393-401：num2-1 帧窗 [36,72]、
 *  组顶 fx≥90 门与 108≤fx≤162 → fx=90 归位【写】）。生成期 isGeneratingOrLoadingWorld
 *  ⇒ 两处 `|| genRand.Next(4)==0` 恒走真支（零掷）。★AAAAAA 批钉值保持：
 *  catTailDistance=8（cs:4318）+ 地基档位表 2/477→0、53→18、199/234/662→54、
 *  23/112/661→72、70→90。Main.tile null 早退点以 inBounds 守卫镜像。 */
function checkCatTailSweep(st: TileStore, ctx: SweepCtx, x: number, y: number): void {
  if (!st.inBounds(x, y)) return;
  let flag = false;
  let num2 = y;
  while (num2 < st.h - 50 && (!st.flags[st.idx(x, num2)]
    || !genSolidType(st.type[st.idx(x, num2)])
    || TILE_DEFS[st.type[st.idx(x, num2)]]?.platform)) {
    if (st.flags[st.idx(x, num2)] && SWEEP_SHEET[st.type[st.idx(x, num2)]] !== 519) flag = true;
    if (!st.flags[st.idx(x, num2)]) break;
    num2++;
    if (!st.inBounds(x, num2)) return;                                 // cs:59245 null 早退
  }
  let num = num2 - 1;
  if (!st.inBounds(x, num)) return;
  while (num > 50 && st.liquid[st.idx(x, num)]! > 0) {                 // cs:59251 liquid>0 且 >50
    const q = st.idx(x, num);
    if ((st.flags[q] && SWEEP_SHEET[st.type[q]] !== 519)
      || (st.liquid[q]! > 0 && st.liquidType[q] !== LIQUID_TYPE.WATER)) flag = true;
    num--;
    if (!st.inBounds(x, num)) return;                                  // cs:59257 null 早退
  }
  num++;
  if (!st.inBounds(x, num)) return;
  const num3 = num;
  if (num2 - num3 > 8 /* catTailDistance cs:59322 */) flag = true;
  const g = sheetAt2(st, x, num2);
  let fy = -1;
  if (g === 2 || g === 477) fy = 0;
  else if (g === 53) fy = 18;
  else if (g === 199 || g === 234 || g === 662) fy = 54;
  else if (g === 23 || g === 112 || g === 661) fy = 72;
  else if (g === 70) fy = 90;
  if (!st.flags[st.idx(x, num2)] || (st.wire[st.idx(x, num2)] & 32)) flag = true;   // !nactive
  if (fy < 0) flag = true;
  // ── 组顶反解段（cs:59355-59371）──
  num = num2 - 1;
  if (!st.inBounds(x, num)) return;
  if (!st.flags[st.idx(x, num)]) {                                     // 地基上方格失活 → 回扫组内首株
    for (let q = num; q >= num3; q--) {
      if (!st.inBounds(x, q)) return;
      const qi = st.idx(x, q);
      if (st.flags[qi] && SWEEP_SHEET[st.type[qi]] === 519) { num = q; break; }
    }
  }
  while (st.inBounds(x, num) && st.flags[st.idx(x, num)]
    && SWEEP_SHEET[st.type[st.idx(x, num)]] === 519) num--;            // 连续上行过组体
  num++;                                                              // 收敛到最顶端 519
  if (!st.inBounds(x, num)) return;
  // ── 生成期水门（Next(4) 全部短路为零掷；顺序逐句对齐 cs:59374-59401）──
  if (st.inBounds(x, num2 - 1) && st.liquid[st.idx(x, num2 - 1)]! < 127) flag = true;
  const topi = st.idx(x, num);
  if (st.frameX[topi]! >= 180 && st.liquid[topi]! > 127) flag = true;  // 花头没水
  if (st.frameX[topi]! > 18) {                                         // 中段帧门（此前整缺）
    const fm1 = st.inBounds(x, num2 - 1) ? st.frameX[st.idx(x, num2 - 1)]! : -1;
    if (fm1 < 36 || fm1 > 72) flag = true;
    else if (st.frameX[topi]! < 90) flag = true;
    else if (st.frameX[topi]! >= 108 && st.frameX[topi]! <= 162) st.frameX[topi] = 90;   // 归位写
  }
  if (num2 > num + 4 && st.inBounds(x, num + 4) && st.inBounds(x, num + 3)
    && st.liquid[st.idx(x, num + 4)] === 0
    && SWEEP_SHEET[st.type[st.idx(x, num + 3)]] === 519) flag = true;   // 头探出水面
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
  opts?: { frameSparse?: boolean; stats?: ZzzStats; chests?: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;
    beforeShimmer?: () => void },
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
  // ★IIIII106 cs:22341-22343：sandy britches 表层沙漠化第二臂（NormalFunction 门=单旗标
  //   恒真；noSurface 组合臂不在消费面）。原版位在 FillWallHoles 之后、主清扫循环之前。
  if (rng && !!gs.seedFlags.surfaceIsDesert && !gs.seedFlags.noSurface) {
    doSurfaceIsDesertCore(st, rng, gs);
  }
  const stats = ctx.stats!;
  for (const k of Object.keys(stats) as Array<keyof ZzzStats>) stats[k] = 0;
  const { w, h } = st;

  // IIII68b：目标列穿越标记（时序线归段用）
  let fcTgtCols: Set<string> | null = null;
  try {
    const gt = (globalThis as unknown as { __swShimTargets?: Set<string> }).__swShimTargets;
    if (gt !== undefined) {
      fcTgtCols = new Set();
      for (const k of gt) fcTgtCols.add(k.split(',')[0]!);
    }
  } catch { /* noop */ }

  for (let i = 0; i < w; i++) {
    if (fcTgtCols?.has(String(i))) {
      try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.('FCCOL ' + i); } catch { /* noop */ }
    }
    for (let j = 0; j < h; j++) {
      const t = st.idx(i, j);
      const type = st.type[t];

      // ③ 悬空落体柱(cs:22312-22385)
      if (st.flags[t] && !solidTile(st, i, j + 1) && SAND_FALL_BASE.has(type)) {
        // ★TTTTTTT：入口门第二支 `|| Main.tileCut[type]`（cs:22317）——可切格
        //   （陶罐 28/草花族）视同空格,柱可直接长入并覆写
        if (j < gs.worldSurface + 10 && (!st.flags[st.idx(i, j + 1)] || tileCutAt(st, i, j + 1))
          && st.wall[st.idx(i, j + 1)] !== 191 && !oceanDepths(st, gs, i, j)) {
          // 地表带:向下生长同类型柱
          let num = 10;
          for (let k = j + 1; k <= j + 10; k++) { // 下方 10 格内有矿轨 314 则停(cs:22321-22328)
            const kk = st.idx(i, k);
            if (st.flags[kk] && st.type[kk] === TRACK) { num = 0; break; }
          }
          let num2 = j + 1;
          // ★TTTTTTT：while 谓词同门 `(!active || tileCut[type])`（cs:22341）——
          //   曾漏第二支 → 柱停在陶罐/可切格前,末写格被主循环重扫转硬化沙
          while ((!st.flags[st.idx(i, num2)] || tileCutAt(st, i, num2)) && num > 0 && num2 < h - 50) {
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
        // ★IIII71b 主案定罪：cs:22516-22520 沙族处理尾（仍在沙族外层 if 内）——
        // 上格(i,j-1)为棕榈 323 时无条件 TileFrame（可触发 CheckPalmTree 支撑级联
        // 杀整株）。旧 JS 整缺 ⇒ DRUNK 终清理未杀 x86 已杀的棕榈列
        // （mile8 #105 T0>323×9/A×9 实锤）。
        if (j > 0 && SWEEP_SHEET[st.type[st.idx(i, j - 1)]] === 323) {
          segProbe77(`FC PTF ${i},${j - 1} rc=${rc77()}`);
          tileFrameGen(st, ctx, i, j - 1, false);
        }
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
      try { const gp2 = globalThis as unknown as { __swShimTargets?: Set<string>; __swSeg?: (n: string, d?: unknown) => void };
        if (gp2.__swShimTargets?.has(i + ',' + j)) gp2.__swSeg?.('BCHECK ' + i + ',' + j + ' fl=' + st.flags[t] + ' t=' + type); } catch { /* noop */ }
      if (st.flags[t] && BOULDERS.has(type)) {
        const x0 = i - Math.floor(st.frameX[t] / 18);
        const y0 = j - Math.floor(st.frameY[t] / 18);
        try { const gp = globalThis as unknown as { __swShimTargets?: Set<string>; __swSeg?: (n: string, d?: unknown) => void };
          if (gp.__swShimTargets?.has(i + ',' + j)) gp.__swSeg?.('BANCHOR ' + i + ',' + j + ' fx=' + st.frameX[t] + ' fy=' + st.frameY[t] + ' a=' + x0 + ',' + y0); } catch { /* noop */ }
        let hasAltar = false;
        for (let l = 0; l < 2; l++) {
          if (st.inBounds(x0 + l, y0 - 1)) {
            const ab = st.idx(x0 + l, y0 - 1);
            if (st.flags[ab] && st.type[ab] === DEMON_ALTAR) { hasAltar = true; break; }
          }
          for (let m = 0; m < 2; m++) {
            st.setTileSilent(x0 + l, y0 + m, type, l * 18, m * 18);
            // ★DDDDDD：slope(0)/halfBrick(false)（cs:22419-21）——setTileSilent 只在
            //   type==0 时清坡/半砖，巨石重帧 type 不变 → JS 曾残留 slope=1
            //   （12345 #105 (1818,551)/(1796,755) 两格 Sl=2 债主）
            const ri = st.idx(x0 + l, y0 + m);
            st.slope[ri] = 0;
            st.half[ri] = 0;
          }
        }
        if (hasAltar) {
          // 上方有恶魔祭坛 → 整块替换(cs:22429-22450:484→397,其余→0)
          const repl = type === ROLLING_CACTUS ? sid(397) : 0;
          for (let n = 0; n < 2; n++) {
            for (let o = 0; o < 2; o++) {
              st.setTileSilent(x0 + n, y0 + o, repl, 0, 0);
              const ri2 = st.idx(x0 + n, y0 + o);
              st.slope[ri2] = 0;
              st.half[ri2] = 0;
            }
          }
        }
      }

      // ⑦ 液体中棕榈杀(cs:22460-22463;原版无 active 门,经 KillTile 内部门兜底)
      if (type === PALM_TREE && st.liquid[t] > 0) {
        segProbe77(`FC PKILL ${i},${j} liq=${st.liquid[t]} rc=${rc77()}`);
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
    const MUD_TILE = TILE_BY_KEY['mud']!;   // ★UUUUUU：TileID.Sets.Mud={59}（NTB 命中集扩展）
    const DIRTIEST = TILE_BY_KEY['v_668_the_dirtiest_block']!;
    const sizeId = st.w <= 4200 ? 0 : st.w <= 6400 ? 1 : 2;      // GetWorldSize（cs:6518）
    // ★SSS-CELEB（1458 cs:22587-22589）：tenth → 数量 ×5（15/30/45）
    const target0 = sizeId === 1 ? 6 : sizeId === 2 ? 9 : 3;
    const target = gs.seedFlags.tenthAnniversary ? target0 * 5 : target0;
    let placed = 0;
    let budget = 3000;
    while (placed < target) {
      budget--;
      if (budget <= 0) break;
      const x = rng.int(50, st.w - 51);   // Next(50, w-50)
      const y = rng.int(50, st.h - 201);  // Next(50, h-200)
      if (!st.inBounds(x, y)) continue;
      const t = st.idx(x, y);
      // ★UUUUUU：notTheBees 门扩展命中集（cs:22573-22576 `if (notTheBees) flag2 =
      //   flag2 || TileID.Sets.Mud[tile7.type]`——Mud={59}；命中集变化直接改变
      //   迭代数=后续 FinishNotTheBees 的掷流起点，勿删）
      if (st.flags[t] && (st.type[t] === DIRT || st.type[t] === DIRTIEST
        || (gs.seedFlags.notTheBees && st.type[t] === MUD_TILE))) {
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

  // ── FinishNoTraps（cs:22622-22625 调用位：⑭ 之后、ShimmerCleanUp 之前）──
  //    ★SSSSSS-NOTRAPS 批新增（实现体在 FinishNoTrapsPass.ts）：noTrapsWorldGen
  //    专属 Finish 子段（生命水晶巨石化/雕像·死箱接驳/炸药埋点/残箱退金箱/
  //    Gas Trap 塞箱）。掷流位次敏感（ShimmerCleanUp r90 块每格 2×NextDouble
  //    在其后）——勿移动调用位。
  if (gs.seedFlags.noTraps && opts?.chests && rng) {
    runFinishNoTraps(st, rng, gs, opts.chests);
  }

  // ── FinishTenthAnniversaryWorld（1458 cs:22637-22640 调用位：NoTraps 之后、
  //    Drunk/NTB/GG/Remix 之前；实现体见下方 runFinishTenthAnniversaryWorld）──
  //    ★SSS-CELEB 批新增：ConvertSkyIslands(2) 神圣化 + 六族 Paint + 巨石 138→665。
  if (gs.seedFlags.tenthAnniversary && !gs.seedFlags.skyblock && rng) {
    runFinishTenthAnniversaryWorld(st, rng, gs, opts?.chests);
  }

  // ── NotTheBees + FinishNotTheBees（cs:22602-22605 调用位：⑭ 之后、
  //    ShimmerCleanUp 之前；原版序=FinishNoTraps/Tenth/Drunk 之后、GG 之前）──
  //    ★UUUUUU 批新增（实现体在 NotTheBeesPass.ts）：notTheBees 专属终转化
  //    （NotTheBees 第七次全域重扫 + FinishNotTheBees 云线/雪冰带/幼虫/重种树/
  //    OverGrownDungeon）。掷流位次敏感——勿移动调用位。
  const g24 = globalThis as { __swFCMark?: (tag: string) => void };
  if (gs.seedFlags.notTheBees && !gs.seedFlags.skyblock && rng) {
    runNotTheBees(st, rng, gs);              // x86 CALLBEGIN/CALLEND 7（NtbCap in/out）
    try { g24.__swFCMark?.('FNTBIN'); } catch { /* probe */ }
    runFinishNotTheBees(st, rng, gs);        // x86 FNTBIN..FNTBOUT 域（IIII24 对拍仪）
    try { g24.__swFCMark?.('FNTBOUT'); } catch { /* probe */ }
  }

  // ── FinishGetGoodWorld（1458 cs:22630-22632 调用位：NTB 之后、Remix 之前；
  //    实现体 runFinishGetGoodWorld——本文件尾）★★IIIII50 FTW 漏接整函数：
  //    掷流(初始 Next(13,25)+列扫描地牢砖色选+全图 Ash Next(15)+箱 678 注入
  //    Next(10)×N)与写面(Ash→熔岩/Dirt→23 系)双双缺失 → #105 尾段大族差。
  if (gs.seedFlags.getGoodWorld && !gs.seedFlags.skyblock && rng) {
    runFinishGetGoodWorld(st, rng, gs, opts?.chests);
  }

  // ── ShimmerCleanUp（cs:22639→34750，⑭ 之后同 pass 尾段；ZZZ 批补）──
  //    ★TTTTTTT：原版序=…NotTheBees → GG/Remix → vampire 块 →
  //    SecretSeed.FinalizeSecretSeeds()（cs:22666,内含无条件 FinalSeedCleanup
  //    :692/:695 悬空 Falling 块静态化）→ TenthPaintTrees → ShimmerCleanUp。
  //    本仓 FinalSeedCleanup 曾挂在 generateWorld 尾（finalize 之后）——时点晚于
  //    dump #105 快照位,mile8 槽 57 对拍把静态化差全记在 #105（const/s22222
  //    T1>332×11 假债）。opts.beforeShimmer 钩子由 WorldGen 接线 FinalSeedCleanup。
  try { g24.__swFCMark?.('FSIN'); } catch { /* probe */ }
  opts?.beforeShimmer?.();
  try { g24.__swFCMark?.('FSOUT'); } catch { /* probe */ }
  // ★SSS-CELEB（1458 cs:22668-22670）：FinishTenthAnniversaryWorldPaintTreesAndMushrooms
  //   ——FinalizeSecretSeeds 之后、ShimmerCleanUp 之前（原序 cs:22666→22668→22671）。
  if (gs.seedFlags.tenthAnniversary && !gs.seedFlags.skyblock && rng) {
    const sp2 = (nm: string): void => { try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.(nm); } catch { /* noop */ } };
    sp2('PT-A');
    paintTheTreesTenth(st, rng, gs);
    sp2('P-Trees');
    paintTheMushroomsTenth(st, rng, gs);
    sp2('P-Mush');
  }
  //    苔藓计数平权的关键写侧：r<120 环带内 moss 块→石 1 / 184 苔藓芽+51/56/
  //    229/230/659 击杀（本种子实测 vanilla 侧 625→1×1358 + 184 杀×558）。
  //    r<90 块的 Convert(j,i,0,3)（净化 7×7 菱形）结构性 no-op：微光 pass 塑形
  //    （cs:34912-35050）已把 r90 椭圆全域写成石/空气/无墙（n5≥105>90，纵压 1.4
  //    ⇒ 纵向 reach 64<75），且 ShimmerifyArea 拒绝带 ebonsand/crimstone 的池位。
  //    之后：微光池补液 while（cs:34802-34820）+ 全图微光淹没树 5 击杀
  //    （cs:34833-34843）。LiquidCheck 全图环（cs:22645+）= 液体 sim 域，归 #49。
  try { g24.__swFCMark?.('SCIN'); } catch { /* probe */ }
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
          // ★IIIII107b（2026-09-01）：Convert(j,i,0,3) 净化菱形真值入列——旧注「结构性
          //   no-op 不移植」只对非感染种子成立。purifythis(worldIsInfected) 链 mile8 #105
          //   T1>25×17803 定谳：FinalizeSecretSeeds 内 DoWorldIsInfected(cs:2023-2060)
          //   先全域腐化（石/tileMoss 族→25），随后本菱形把 GenVars.shimmerPosition 周边
          //   压椭体 r<90 内腐化族反演回净化态（25→1/23→2/112→53/163→161/398→397/
          //   400→396 + 荆棘 32 杀、r120 moss 环同理）——x86 实测残石区=以池心为中心的
          //   压椭环带（横半轴 ~90 / 纵 1.4·1.2 压比），与 ShimmerMakeBiome 激活带共同
          //   裁剪出非几何齐整的可视边界。普通种子仍零外溢：塑形后 r90 可转内容集空、
          //   wall 已归零，convertCell 各支早退不掷。掷序=外层 k(col) 升序 × 内层
          //   l(row) 升序照抄 cs:55555-55560；rng 缺省模式（诊断仪旧调用）维持跳过。
          if (rng) convertWithSize(st, rng, gs, xx, yy, 0, 3);
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
    // ★SSS-CELEB（1458 cs:35171-35195）：tenth 巨化带——X±170 × Y+40..h-430 内
    //   373/374/375→709（滴虫→异晶块），墙 86 豁免；非微光/蜂蜜液体 → Shimmerator
    //   洪泛转微光（RECON-CELEB「微光池 x±170 巨化」）。
    if (gs.seedFlags.tenthAnniversary && rng) {
      const actxA = new Set<number>();
      for (let k = SX - 170; k <= SX + 170; k++) {
        for (let l = SY + 40; l < st.h - 330 - 100; l++) {
          if (!st.inBounds(k, l)) continue;
          const i = st.idx(k, l);
          if (st.wall[i] === 86) continue;
          const sh = SWEEP_SHEET[st.type[i]];
          if (sh === 375 || sh === 374 || sh === 373) st.type[i] = sid(709);
          if (st.liquid[i]! > 0 && st.liquidType[i] !== LIQUID_TYPE.SHIMMER
            && st.liquidType[i] !== LIQUID_TYPE.HONEY) {
            shimmeratorTenth(st, rng, k, l, actxA, ctx);
          }
        }
      }
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
  try { g24.__swFCMark?.('SCOUT'); } catch { /* probe */ }
}

// ═══════════════ SSS-CELEB 批（2026-08-27）：FinishTenthAnniversaryWorld 全家 ═══════════════
// 1458 WorldGen.cs:24502-24554 + Paint 族 24555-24947 + ConvertSkyIslands 24947-24986。
// 掷流登记：ImproveAllChestContents（cs:24989-25047，前缀引擎 Item.Prefix(-3)）本批
// 未移植 → 其后的 PaintTrees/PaintMushrooms 颜色带掷骰位次相对 vanilla 有位移
// （仅涂色色相分布差，无格子几何差；备案=SSS-CELEB 遗留#1）。

const CRACKED_BRICKS = idsByVanillaSheet(48, 487);
const TILE_DUNGEON_FC = idsByVanillaSheet(41, 43, 44, 677, 678, 679);
const RAINBOW_BASE = 13;                       // GetRainbowPaintIDForPosition 基色
const rainbowPaintIdAt = (x: number, y: number): number => (x % 44 + y % 44) % 11 + RAINBOW_BASE;
const rainbowPaintIdWiggly = (x: number, y: number): number => {
  const wx = x + Math.trunc(Math.sin((y % 50) / 50 * Math.PI * 2) * 10) - 5;
  return (wx % 44) % 11 + RAINBOW_BASE;
};

/** FinishTenthAnniversaryWorld（1458 cs:24508-24553）：纯 celeb 路径
 *  （remix/gg/drunk/ntb/dontStarve 组合域支不移植，各自线另案）。 */
function runFinishTenthAnniversaryWorld(st: TileStore, rng: RNG, gs: GenState, chests?: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>): void {
  // IIII67：x86 tenth-tail 段账镜像（同名 MARK 行）
  const __mbD2 = (): number => ((globalThis as unknown as { __swMbDraws?: () => number }).__swMbDraws?.() ?? 0);
  void __mbD2;
  const sp = (nm: string): void => { try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.(nm); } catch { /* noop */ } };
  sp('FTW-A');
  sp('CSI-A');
  convertSkyIslandsTenth(st, rng, gs);          // ConvertSkyIslands(2, growTrees:true)
  sp('CSI-Z');
  paintTheDungeonTenth(st, gs, 24, 24);
  sp('P-Dungeon');
  paintTheLivingTreesTenth(st, gs, 12, 12);
  sp('P-LivingTrees');
  paintTheTempleTenth(st, gs, 10, 5);
  sp('P-Temple');
  paintTheCloudsTenth(st, gs, 12, 12);
  sp('P-Clouds');
  paintTheSandTenth(st, rng, gs, 7, 7);
  sp('P-Sand');
  paintThePyramidsTenth(st, gs, 12, 12);
  sp('P-Pyramids');
  // —— 巨石 138→665 生命水晶巨石（cs:24530-24544）：全图扫 [50,w-50)×[50,h-50)，
  //    Next(4) **每格无条件消耗**（&&链首项），命中锚格(frameX/Y==0 → JS 用
  //    左/上同型邻格不存在判定)才改写 2×2。
  const b138s = sid(138), b665s2 = sid(665);
  for (let i = 50; i < st.w - 50; i++) {
    for (let j = 50; j < st.h - 50; j++) {
      if (rng.int(0, 3) !== 0) continue;
      const t = st.idx(i, j);
      const sh = SWEEP_SHEET[st.type[t]];
      if (!st.flags[t] || sh !== 138) continue;
      // 锚格近似：vanilla frameX==0 && frameY==0（JS 生成期无帧通道）
      const anchor = !(i > 0 && SWEEP_SHEET[st.type[st.idx(i - 1, j)]] === 138)
        && !(j > 0 && SWEEP_SHEET[st.type[st.idx(i, j - 1)]] === 138);
      if (!anchor) continue;
      st.type[t] = b665s2;
      if (j + 1 < st.h) st.type[st.idx(i, j + 1)] = b665s2;
      if (i + 1 < st.w) st.type[st.idx(i + 1, j)] = b665s2;
      if (i + 1 < st.w && j + 1 < st.h) st.type[st.idx(i + 1, j + 1)] = b665s2;
    }
  }
  sp('MOSS-END');
  void b138s;
  // ★EEEEE 批（1458 cs:24552-24554）：ImproveAllChestContents——巨石扫之后、
  //  Finish 子段最后一步（掷流位次在此，勿前移）。实现体 TenthAnniversaryImprove.ts。
  sp('IMPROVE-A');
  improveAllChestContents(chests, rng);
  sp('IMPROVE-Z');
}

/** ConvertSkyIslands(2, growTrees:true)（1458 cs:24947-24986）。
 *  带上界=num=`从 y=20 下扫首个含云族的行`（Skyblock denyAllGeneration 门恒过）。 */
function convertSkyIslandsTenth(st: TileStore, rng: RNG, gs: GenState): void {
  let num = 0;
  // ★IIIII67 定罪（1458 cs:25058-25068）：原版云线扫描【内层 break 只跳出本行】，
  //  外层 i 一路扫到 worldSurface ⇒ num=最后一个含云行（最低浮岛基座），非首个。
  //  曾用 outer·break=取最高岛云线 ⇒ 转换域整体上收、hallowed 化/树苗 growTrees
  //  全体少掷（celeb 实测 CSI 段 0 vs van 765 掷，岛屿草未 hallowed/trees 未种）。
  for (let i = 20; i < gs.worldSurface; i++) {
    for (let j = 20; j < st.w - 20; j++) {
      const ti = st.idx(j, i);
      if (st.flags[ti] && CLOUDS.has(st.type[ti])) { num = i; }
    }
  }
  const ctxF: SweepCtx = { rng, destroyObject: false, frameSparse: false };
  const GRASS2 = sid(2), HALLOW109 = sid(109), SAPLING596 = sid(596), SAPLING616 = sid(616);
  for (let k = 20; k <= st.w - 20; k++) {
    for (let l = 20; l < num; l++) {
      const t2 = st.idx(k, l);
      if (!st.flags[t2] || st.type[t2] !== GRASS2) continue;
      const t3 = st.idx(k, l - 1);
      const sh3 = SWEEP_SHEET[st.type[t3]];
      if (sh3 === 596 || sh3 === 616) killTileGen(st, ctxF, k, l - 1);       // 树苗杀
      // Convert(k,l,2)：grass→hallowed grass 109（TryConverting… 对树上 109 放行=不杀）
      if (SWEEP_SHEET[st.type[t2]] === 2 && SWEEP_SHEET[st.type[t2]] !== 109) st.type[t2] = HALLOW109;
      void SAPLING596; void SAPLING616;
      if ((sh3 === 82 || sh3 === 83 || sh3 === 185 || sh3 === 186 || sh3 === 187 || sh3 === 227)) {
        killTileGen(st, ctxF, k, l - 1);                                     // 向日葵/药草族杀
      }
      // ★IIIII67（PlantCheck_TryGetNewType，1458 cs:82152+）：Convert 把格转为
      //   神圣草 109 后，上方植物走 PlantCheck 重映射 3→110 / 73→113——
      //   曾漏重映射 ⇒ 岛链残留 17 格普通植物（celeb 实测）。
      if (SWEEP_SHEET[st.type[t2]] === 109) {
        const ta = st.idx(k, l - 1);
        if (st.flags[ta]) {
          const sha = SWEEP_SHEET[st.type[ta]];
          if (sha === 3 || sha === 110 || sha === 24) {
            const downNow = SWEEP_SHEET[st.type[t2]];
            let ntype = sha;
            if (downNow === 109 || downNow === 492) ntype = (sha === 73 ? 113 : 110);
            st.type[ta] = sid(ntype);
          } else if (sha === 73) {
            st.type[ta] = sid(113);
          }
        }
      }
      if (rng.int(0, 2) === 0) growTree(st, rng, gs, k, l);                  // TryGrowingTreeByType(5)
    }
  }
}

/** PaintTheDungeon(24,24)（1458 cs:24849-24883）：tileDungeon∪CrackedBricks 上漆；
 *  tile19 火把支依赖 frameY/18 分型，生成期无帧通道 → 备案跳过（火把不可漆成临洞。 */
function paintTheDungeonTenth(st: TileStore, _gs: GenState, tc: number, wc: number): void {
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.flags[i]) {
        const sh = SWEEP_SHEET[st.type[i]];
        if (TILE_DUNGEON_FC.has(st.type[i]) || CRACKED_BRICKS.has(st.type[i])) st.paint[i] = tc & 31;
        void sh;
      }
      if (WALL_DUNGEON.has(st.wall[i])) st.paintWall[i] = wc & 31;
    }
  }
}

/** PaintTheLivingTrees(12,12)（1458 cs:24778-24848）。 */
function paintTheLivingTreesTenth(st: TileStore, _gs: GenState, tc: number, wc: number): void {
  const isVineSheet = (sh: number) => sh === 52 || sh === 62 || sh === 382;
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.flags[i]) {
        const wl = st.wall[i];
        if (wl === 244) st.paint[i] = tc & 31;
        else {
          const sh = SWEEP_SHEET[st.type[i]];
          if (sh === 192 || sh === 191) st.paint[i] = tc & 31;
          else if (isVineSheet(sh)) {
            // GetVineTop（cs:63941-63954）：沿藤上行至非藤格，锚为 192 才漆
            let ty = y;
            while (ty > 20 && isVineSheet(SWEEP_SHEET[st.type[st.idx(x, ty)]])) ty--;
            if (SWEEP_SHEET[st.type[st.idx(x, ty)]] === 192) st.paint[i] = tc & 31;
          } else if (sh === 187) {
            let dy = 0;
            while (SWEEP_SHEET[st.type[st.idx(x, Math.min(st.h - 1, y + dy))]] === 187) dy++;
            if (SWEEP_SHEET[st.type[st.idx(x, Math.min(st.h - 1, y + dy))]] === 192) st.paint[i] = tc & 31;
          }
        }
      }
      if (st.wall[i] === 244) st.paintWall[i] = wc & 31;
    }
  }
}

/** PaintTheTemple(10,5)（1458 cs:24707-24748）。137 支 frameY/18∈[1..4] 无帧通道
 *  → 仅 226/61 两支（蜥蜴砖/其上门帘类），帧支备案跳过。 */
function paintTheTempleTenth(st: TileStore, _gs: GenState, tc: number, wc: number): void {
  const T226 = sid(226), T61 = sid(61);
  for (let x = 10; x < st.w - 10; x++) {
    for (let y = 10; y < st.h - 10; y++) {
      const i = st.idx(x, y);
      if (st.flags[i]) {
        const sh = SWEEP_SHEET[st.type[i]];
        if (sh === 226) st.paint[i] = tc & 31;
        else if (sh === 61 && st.type[st.idx(x, y + 1)] === T226) st.paint[i] = tc & 31;
      }
      if (st.wall[i] === 87) st.paintWall[i] = wc & 31;
    }
  }
}

/** PaintTheClouds(12,12)（1458 cs:24751-24767）。 */
function paintTheCloudsTenth(st: TileStore, _gs: GenState, tc: number, wc: number): void {
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] && CLOUDS.has(st.type[i])) st.paint[i] = tc & 31;
      if (st.wall[i] === 73) st.paintWall[i] = wc & 31;
    }
  }
}

/** PaintTheSand(7,7)（1458 cs:24556-24581）：沙族 {53,396,397} 上漆 + 地表下滴虫
 *  165/185-187 邻格继承 + 墙 187/216。 */
function paintTheSandTenth(_st: TileStore, _rng: RNG, _gs: GenState, _tc: number, _wc: number): void {
  const st = _st;
  for (let x = 20; x < st.w - 20; x++) {
    for (let y = 20; y < st.h - 20; y++) {
      const i = st.idx(x, y);
      if (st.flags[i]) {
        const sh = SWEEP_SHEET[st.type[i]];
        if (sh === 53 || sh === 396 || sh === 397) {
          st.paint[i] = _tc & 31;
          if (y > _gs.worldSurface) {
            for (const [dx, dy, only165] of [[0, -1, false], [0, -2, false], [0, 1, true], [0, 2, true]] as const) {
              const shN = sheetAt2Safe(st, x + dx, y + dy);
              const hit = only165 ? shN === 165 : (shN === 165 || shN === 185 || shN === 186 || shN === 187);
              if (hit) st.paint[st.idx(x + dx, y + dy)] = _tc & 31;
            }
          }
        }
      }
      if (st.wall[i] === 187 || st.wall[i] === 216) st.paintWall[i] = _wc & 31;
    }
  }
}

/** PaintThePyramids(12,12)（1458 cs:24685-24704）：151 沙岩砖 + 墙 34。 */
function paintThePyramidsTenth(st: TileStore, _gs: GenState, tc: number, wc: number): void {
  const T151 = sid(151);
  for (let x = 0; x < st.w; x++) {
    for (let y = 0; y < st.h; y++) {
      const i = st.idx(x, y);
      if (st.flags[i] && st.type[i] === T151) st.paint[i] = tc & 31;
      if (st.wall[i] === 34) st.paintWall[i] = wc & 31;
    }
  }
}

function sheetAt2Safe(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return -1;
  return SWEEP_SHEET[st.type[st.idx(x, y)]];
}

/** PaintTheTrees（1458 cs:24622-24650）：竖列树族染色——首掷 Next(1,13)，
 *  列内命中 5/323/596/616 即 color(b)；列扫完 `flag&&!flag2` 时 b++ 循环 1..12。
 *  ★掷流位置依赖 ImproveAllChestContents（未移植）→ 相对 vanilla 有位差（备案）。 */
function paintTheTreesTenth(st: TileStore, rng: RNG, _gs: GenState): void {
  let b = rng.int(1, 12);                      // Next(1,13)
  let flag = false;
  for (let i = 20; i < st.w - 20; i++) {
    let flag2 = false;
    for (let j = 20; j < st.h - 20; j++) {
      const i2 = st.idx(i, j);
      if (!st.flags[i2]) continue;
      const sh = SWEEP_SHEET[st.type[i2]];
      if (sh === 5 || sh === 323 || sh === 596 || sh === 616) {
        st.paint[i2] = b & 31;
        flag2 = true;
        flag = true;
      }
    }
    if (flag && !flag2) {
      flag = false;
      b++;
      if (b > 12) b = 1;
    }
  }
}

/** PaintTheMushrooms（1458 cs:24555-24621）：蘑菇草族 {70,578,190,71,528,519fy90}
 *  全图扫 Next(1,13) 起点 + 每列消耗计数 num3（==0 时 b+=Next(1,3) 回卷）；
 *  wall 80/74 同步。remix 支组合域不移植。 */
function paintTheMushroomsTenth(st: TileStore, rng: RNG, _gs: GenState): void {
  const num = st.h - 20;
  const MUSH_SHEETS = new Set([70, 578, 190, 71, 528]);
  let b = rng.int(1, 12);
  let num3 = 0;
  for (let k = 20; k < st.w - 20; k++) {
    for (let l = 20; l < num; l++) {
      const i2 = st.idx(k, l);
      if (!st.flags[i2]) continue;
      const sh = SWEEP_SHEET[st.type[i2]];
      // ★IIIII67：原版对 519 巨菇要求 frameY==90（cs:24566）——生成期帧通道在！
      //  曾按「无帧通道」近似全量匹配 ⇒ 列段 num3=10 复位点偏移、Next(1,3) 掷数差。
      if (MUSH_SHEETS.has(sh) || (sh === 519 && st.frameY[i2] === 90)) {
        st.paint[i2] = b & 31;
        num3 = 10;
      }
      if (st.wall[i2] === 80 || st.wall[i2] === 74) {
        st.paintWall[i2] = b & 31;
        num3 = 10;
      }
    }
    num3--;
    if (num3 === 0) {
      try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.(`PMB ${k}`); } catch { /* noop */ }
      b += rng.int(1, 2);                      // Next(1,3)
      if (b > 12) b = 1;
    }
  }
}

/** Shimmerator（1458 cs:35487-35528：洪泛收集 + Shimminate）。
 *  maxTileCount=300（GlobalGems 段 cs:17545 最后写值，celeb ×1.5 不变该常量）。 */
// ★IIIII67 定罪（1458 cs:22309 AddSpikeCaves 尾 maxTileCount=3500）：FinalCleanup 时点
//   全局帽=3500 而非 GlobalGems 遗留 300——SpikeCaves pass（FinalCleanup 前注册）尾写。
//   旧 300 ⇒ celeb ±170 洪泛每源最多 300 格，池右缘缺 27 列/底部 47 行未转微光。
const SHIMMERATOR_CAP = 3500;
function shimmeratorTenth(
  st: TileStore, _rng: RNG, x0: number, y0: number,
  _countedGlobal: Set<number>, ctx: SweepCtx,
): void {
  // ★IIIII67 定罪（1458 WorldGen.cs:35667-35716）：原版 Shimmerator 每调用
  //  清空 CountedTiles、递归 DFS（左→右→上→下）、入口谓词=WorldGen.SolidTile
  //  （active+tileSolid+!top+!half+slope0+!inActuator 全项）＋OOB 恒置满额放弃。
  //  旧实现=持久全局 Set + 显式栈右先 ⇒ 分区顺序错位 + 经由半砖/坡面渗漏，
  //  celeb 微光池右缘缺 27 列、边缘水格未转微光（fc4 分账 541+103+94 型差）。
  let num = 0;
  const counted = new Set<number>();
  const rec = (x: number, y: number): void => {
    if (num >= SHIMMERATOR_CAP) return;
    if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) { num = SHIMMERATOR_CAP; return; }
    const key = st.idx(x, y);
    if (counted.has(key)) return;
    const i = key;
    try { const g = globalThis as unknown as { __swShimTargets?: Set<string>; __swSeg?: (n: string, d?: unknown) => void };
      if (g.__swShimTargets?.has(x + ',' + y)) g.__swSeg?.('TVISIT ' + x + ',' + y + ' n=' + num); } catch { /* noop */ }
    const solidVan = !!st.flags[i] && !!TILE_DEFS[st.type[i]]?.solid
      && !PC_SOLID_TOP_F10.has(SWEEP_SHEET[st.type[i]])
      && st.half[i] === 0 && st.slope[i] === 0 && (st.wire[i] & 32) === 0;
    const liquidOk = !solidVan && st.liquidType[i] !== LIQUID_TYPE.SHIMMER && st.liquid[i]! > 0;
    const block56 = st.flags[i] && SWEEP_SHEET[st.type[i]] === 56;
    if (!(liquidOk || block56)) return;
    counted.add(key);
    num++;
    rec(x - 1, y);
    rec(x + 1, y);
    rec(x, y - 1);
    rec(x, y + 1);
  };
  rec(x0, y0);
  try { (globalThis as unknown as { __swSeg?: (n: string, d?: unknown) => void }).__swSeg?.(`SHIMA ${x0},${y0} n=${num}`); } catch { /* noop */ }
  if (num > 0 && num < SHIMMERATOR_CAP) {
    for (const key of counted) {
      const i = key;
      try { const g = globalThis as unknown as { __swShimTargets?: Set<string>; __swSeg?: (n: string, d?: unknown) => void };
        if (g.__swShimTargets?.has((i % st.w) + ',' + ((i / st.w) | 0))) g.__swSeg?.('TCOUNT'); } catch { /* noop */ }
      st.liquidType[i] = LIQUID_TYPE.SHIMMER;
      st.liquid[i] = 255;
      const sh = SWEEP_SHEET[st.type[i]];
      if (sh === 5 || sh === 56 || (TILE_CUT_FC.has(sh) && sh !== 28)) killTileGen(st, ctx, i % st.w, (i / st.w) | 0);
    }
  }
}

/** PC_SOLID_TOP_F10：Main.tileSolidTop 集（桌族等,同 MicroBiomesPass DG_SOLID_TOP） */
const PC_SOLID_TOP_F10 = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281]);

function isSolidTileFC(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  return !!st.flags[i] && !!TILE_DEFS[st.type[i]]?.solid;
}

// ═══════════════ IIII50 批：FinishGetGoodWorld（1458 cs:26074-26262）1:1 ═══════════════
// 调用位 cs:22630-22632（NTB 之后、Remix 之前）。八通道可见面＝Ash→熔岩注液(⑧)与
// 地表 Dirt→23 系腐蚀转化(⑨)；其余为 paint 域(paint/paintWall 通道)与箱内 678 注入。
// 掷流序＝①初始 Next(13,25) ②逐列地牢砖色选(仅首个含砖列,列内**全行扫完**) ③全图
// Ash Next(15) ④箱循环 Next(10)×N——位次敏感，勿移动。
const CLOUD_SHEETS_FGG = new Set([189, 196, 460, 717, 718, 719]);   // TileID.Sets.Clouds
const DUNGEON_BRICKS_FGG = new Set([41, 43, 44, 677, 678, 679]);    // Main.tileDungeon
const CRACKED_FGG = new Set([48, 487]);                             // CrackedBricks
const KILL_ABOVE_FGG = new Set([3, 73, 27, 596, 616, 82, 83, 186, 187, 185, 227]);

export function runFinishGetGoodWorld(
  st: TileStore, rng: RNG, gs: GenState,
  chests?: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>,
): void {
  const { w, h } = st;
  // ① 云线基准 num（cs:26077-26092）：行外层 i∈[20,worldSurface)，列内层 j——命中云族
  //    记 num=i 且 break **内层**（外层继续，num 取最后一行）。
  let cloudRow = 0;
  for (let i = 20; i < gs.worldSurface; i++) {
    for (let j = 20; j < w - 20; j++) {
      const t = st.idx(j, i);
      if (st.flags[t] && CLOUD_SHEETS_FGG.has(SWEEP_SHEET[st.type[t]])) { cloudRow = i; break; }
    }
  }
  // ② 初始色 + 列扫描（cs:26093-26133）：b=Next(13,25) 恒掷一次；k 全列扫，l **不提前
  //    break**（每颗地牢砖/44/43/41 都照掷），首含砖列扫完后 break k 循环。
  let b = rng.nextIntRange(13, 25);
  for (let k = 0; k < w; k++) {
    let flag = false;
    for (let l = 0; l < h; l++) {
      const t = st.idx(k, l);
      if (!st.flags[t]) continue;
      const sh = SWEEP_SHEET[st.type[t]];
      if (!DUNGEON_BRICKS_FGG.has(sh)) continue;
      if (st.paint[t] === 14) { flag = true; b = 14; continue; }
      if (sh === 44) {
        flag = true;
        b = rng.nextIntRange(13, 15);
        if (rng.nextIntRange(0, 2) === 0) b = rng.nextIntRange(23, 25);
      }
      if (sh === 43) { flag = true; b = rng.nextIntRange(15, 19); }
      if (sh === 41) { flag = true; b = rng.nextIntRange(19, 23); }
    }
    if (flag) break;
  }
  // ③④⑤⑥⑦ 全图涂色 + Ash 熔岩化 + Dirt 腐蚀化（cs:26134-26234）
  const sidStoneGrass = sid(2);   // Dirt(2)
  const convTo = gs.crimson ? sid(199) : sid(23);   // cs:26193-26199 crimson 分支
  for (let m = 10; m < w - 10; m++) {
    for (let n = 10; n < h - 10; n++) {
      const t = st.idx(m, n);
      if (st.flags[t] && (DUNGEON_BRICKS_FGG.has(SWEEP_SHEET[st.type[t]]) || CRACKED_FGG.has(SWEEP_SHEET[st.type[t]]))) {
        st.paint[t] = b;
      }
      if (st.paintWall[t] !== undefined && st.wall[t] !== 0) {
        // wallDungeon 表={7,8,9,94..99}+1458 扩；GT 表近似= DG_DUNGEON_WALLS 同源集
        const wl = st.wall[t];
        if ((wl >= 94 && wl <= 99) || wl === 7 || wl === 8 || wl === 9) {
          if (!gs.seedFlags.drunkWorld && !gs.seedFlags.notTheBees) st.paintWall[t] = b;
        }
        if (wl === 87) st.paintWall[t] = 25;
      }
      if (st.flags[t] && !gs.seedFlags.notTheBees) {
        const sh = SWEEP_SHEET[st.type[t]];
        // cs:26162-26176：226 本格 / 草60 且**下格**(n+1)为 226 / 石板137 style1-4
        const belowT = st.idx(m, Math.min(h - 1, n + 1));
        const shBelow = SWEEP_SHEET[st.type[belowT]];
        if (sh === 226) st.paint[t] = 17;
        else if (sh === 60 && shBelow === 226) st.paint[t] = 17;
        else if (sh === 137) {
          const sty = Math.trunc(st.frameY[t]! / 18);
          if (sty >= 1 && sty <= 4) st.paint[t] = 17;
        }
      }
      if (!st.flags[t]) continue;
      // ⑧ Ash→熔岩（!remix 门；Next(15)==0 每灰烬格恒掷）
      if (!gs.seedFlags.remix && SWEEP_SHEET[st.type[t]] === 57 && rng.nextIntRange(0, 15) === 0) {
        const above = st.idx(m, Math.max(0, n - 1));
        if (SWEEP_SHEET[st.type[above]] === 57) st.flags[t] = 0;
        st.liquid[t] = 255;
        st.liquidType[t] = 2;                      // lava(true)（JS +1 基）
      }
      // ⑨ 近地表 Dirt→腐化草（!tenth&&!ntb&&n<cloudRow）
      if (!gs.seedFlags.tenthAnniversary && !gs.seedFlags.notTheBees && n < cloudRow
        && st.type[t] === sidStoneGrass) {
        st.type[t] = convTo;
        const above = st.idx(m, Math.max(0, n - 1));
        const shAbove = SWEEP_SHEET[st.type[above]];
        if (shAbove === 3) st.flags[above] = 0;
        else if (KILL_ABOVE_FGG.has(shAbove)) genKillTile(st, rng, m, n - 1);
      }
    }
  }
  // ⑩ 宝箱 678 注入（cs:26236-26258）：至多前 8000 箱，chest==null 即 break；
  //    Next(10)!=0 或 item[1].stack==0 → continue（**掷照耗**）；首个空槽写 678。
  if (chests) {
    for (let c = 0; c < 8000; c++) {
      const ch = chests[c];
      if (!ch) break;
      if (rng.nextIntRange(0, 10) !== 0) continue;
      const slot1 = ch.items[1];
      if (!slot1 || slot1.stack === 0) continue;
      for (let s = 1; s < ch.items.length; s++) {
        const it = ch.items[s];
        if (!it || it.stack === 0) { ch.items[s] = { id: 678, stack: 1 }; break; }
      }
    }
  }
}
