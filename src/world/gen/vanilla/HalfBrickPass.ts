// 原版 "Smooth World" + "Waterfalls" 两个生成 pass 的移植 +
// PoundTile/SlopeTile/CanPoundTile（1456 WorldGen.cs:81434-81560）。
// 半砖是原版"水浸润到方块贴图透明区"与瀑布触发（WaterfallManager 靠 halfBrick 唇缘）
// 的核心：Smooth World 把地表凸起砸成半砖/坡面，Waterfalls pass 专门在水边唇缘砸半砖。
// 坡面渲染见 VanillaTiler.drawSlopedFrame（TileDrawing.cs:1328-1360 切条 1:1）。
// 仍近似原版处（逐条对照 1456 源码后保留）：
//  - CanPoundTile 的 CanKillTile 结构检查（cs:62249）近似为 !framed
//    （黑名单/Boulders/生成期 190,30/ForbidsSloping 上方表均已 1:1，见 canPoundTile）
//  - SolidTile 的 tileSolidTop 近似为 !platform；PlaceTile 的 495 特判未移植
//  - KillTile 尾 SquareTileFrame 级联已移植（UUU 批,见 killTile 注）：非活性清
//    half/slope 残基 + 巨石族 Check2x2 整组杀;其余 TileFrameImportant 族生成期
//    本 pass 零足迹（draws 精确相等实证）未移植
import type { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS, TILE_BY_KEY } from '../../../data/tiles';
import { idsByVanillaSheet, NOT_CLEARABLE } from './TileRunner';
import { flipGenSolid, genSolidType, vanGenSolidType } from './GenSolid';

/** 各排除表按原版 vanilla tile id 构建（经 idsByVanillaSheet 转内部 id） */
const T = { // 排除表用的原版 id 集
  SWITCH: idsByVanillaSheet(136),
  STATUE: idsByVanillaSheet(137),
  /** Loop B 主排除（16661）：137 雕像/48 尖刺/232 木刺/191 活木/151 沙岩砖/274 地牢砖? /75/76 黑曜石狱石砖 */
  LOOP_B_SKIP: idsByVanillaSheet(137, 48, 232, 191, 151, 274, 75, 76),
  /** 空位补角分支排除（16600/16602/16621）：151/274（不做补角材料）与 190/48/232（旁格排除） */
  NO_FILL: idsByVanillaSheet(151, 274),
  NO_FILL_SIDE: idsByVanillaSheet(190, 48, 232),
  /** Conversion.Sand（TileID.cs:30）：沙族 → Loop B 走 Tile.SmoothSlope */
  SAND: idsByVanillaSheet(53, 112, 116, 234),
  /** 补角材料特判（cs:16605/16626）：侧邻 495 贝壳堆 → 用侧邻材料 */
  SHELL_495: idsByVanillaSheet(495),
  /** PlaceTile 草/苔安放门（cs:59400-59440）：目标格非活性时,这些类型一律拒放
   *  （草族要求活性土/泥基,苔要求活性石;补角目标恒非活性 → 全拒——曾无条件
   *  放置 → 幽灵草/苔格 + 后续 SolidTile 门禁漂移,U 批 (54,1083) 实证）。 */
  PLACE_REFUSE: idsByVanillaSheet(
    2, 23, 60, 70, 109, 199, 633, 661, 662,          // 草族（活性泥土基座要求）
    179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627),  // Main.tileMoss（Main.cs:6956-）
  /** TileID.Sets.PreventsSlopesDuringGeneration（1456 TileID.cs:323）：48/137/232/191/151/274/135/442/428 */
  PREVENTS_SLOPES: idsByVanillaSheet(48, 137, 232, 191, 151, 274, 135, 442, 428),
};

/** blockType()==0 判定（悬顶分支旁格检查用）：非活性格或整砖格（half/slope 均为 0） */
function fullOrEmpty(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  const i = st.idx(x, y);
  return !st.flags[i] || (!st.half[i] && st.slope[i] === 0);
}

/** 取证钩（U 批 half/slope 首分叉猎杀）：SlopeTile/PoundTile/KillTile/PlaceTile 调用
 *  追踪,与 vanilla exe 注入的 HsProbe.WLog 同格式对拍（默认无钩零开销） */
function swAct(fn: string, x: number, y: number, extra: number): void {
  const h = (globalThis as { __swSWAct?: (fn: string, x: number, y: number, e: number) => void }).__swSWAct;
  if (h) h(fn, x, y, extra);
}

/* ── KillTile 尘粒掷骰（U 批根因修复）──────────────────────────────────────
 * 原版 KillTile(i,j)（cs:63747-63751）每次击杀都调 KillTile_GetTileDustAmount
 * （cs:66654）× KillTile_MakeTileDust（cs:66744）——部分 tile type 的尘型选择
 * 会掷 genRand（如 633 草灰岩 Next(6)、58/76/77/684 与草族 Next(2)、595/596/
 * 615/616 Next(6)…）。这些掷值只影响尘型（世界状态无关）但**占用 RNG 流位**
 * ——此前移植漏了它们 → #53 SmoothWorld 掷数 -9k 级漂移（U 批 vanilla exe
 * RD/ST 追踪实证,详见 docs/worldgen/content-parity-vs-vanilla-2026-08-16.md
 * U 批节）。表按**原版 sheet id**（经 SHEET_OF 换算）。 */
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}
/** KillTile_GetTileDustAmount(fail=false)（cs:66654-66742） */
function killDustAmount(sheet: number): number {
  switch (sheet) {
    case 654: case 630: case 631: case 125: case 138: case 172: case 287:
    case 300: case 301: case 302: case 303: case 304: case 305: case 306:
    case 307: case 308: case 354: case 355: case 373: case 374: case 375:
    case 376: case 461: case 484: case 499: case 564: case 565: case 593:
    case 594: case 617: case 664: case 665: case 699: case 709: case 711:
    case 712: case 713: case 714: case 715: case 716:
      return 0;
    case 231: return 6;
    case 481: case 482: case 483: return 3;
    case 541: return 1;
    case 549: return 2;
    case 534: case 536: case 539: case 625: case 627: return 5;
    case 184: return -1; // frameX/22>=5?5:10（生成期被击杀极罕见,走 frame 分支）
    default: return 10;
  }
}
/** KillTile_MakeTileDust 每次调用的掷骰数（cs:66744-69226 的 genRand 位点;
 *  生成期地形族实证集 + 源码全表,掷值仅影响尘型不影响世界状态） */
function killDustRollsPer(sheet: number, frameX: number): number {
  switch (sheet) {
    // 草族/多草族（cs:69016/69020/69026/68418/68930/68999/69042/68521）
    case 23: case 24: case 661: case 25: case 27: case 32: case 2: case 477:
    case 109: case 492: case 204: case 478: case 58: case 76: case 77: case 684:
    // 其他 1 掷族（cs:67118/67225/67253/67257/68822/68759/69014）
    case 633: case 641: case 370: case 171: case 238: case 231: case 352:
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
    case 595: case 596: case 615: case 616: case 385:
      return 1;
    case 634: return 2; // Next(10)+Next(12)（cs:67125-67126）
    case 31: case 696: return frameX < 36 ? 1 : 0; // cs:69020
    case 26: case 695: return frameX < 54 ? 1 : 0; // cs:69026
    case 35: return frameX < 36 ? 1 : 0;           // cs:69064
    case 34: case 42: return 1;                    // cs:69069（条件掷,掷恒发生）
    default: return 0;
  }
}

/* ── KillTile 尾 SquareTileFrame 级联（UUU 批 2026-08-18 R0 根因修复）──────
 * 原版 KillTile 尾无条件 SquareTileFrame(i,j)（cs:63947）→ 3×3 逐格 TileFrame：
 *  ① 非活性格 → halfBrick=false + slope(0)（cs:82078-83）——击杀的 3×3 邻域内
 *     ghost slope/half 残基当场清除。R0 案 (2428,664)：K(2427,665) 的 3×3 把
 *     非活性残坡 s2 清 0（此前 JS killTile 无此尾 → slope 残差 1 格）。
 *  ② 活性巨石族（Boulders，TileID.cs:195）→ TileFrameImportant 派发 Check2x2
 *     （cs:86688 case 132/138/142/143/288-295/484/664/665/711/712）：按 frame
 *     反解 2×2 锚点，四格 type+frame 全等 + 上方无箱族 + 底部两格至少一格
 *     SolidTileAllowBottomSlope → 存活;任一破 → destroyObject=true 期间
 *     KillTile 整组 2×2 内同型格（巨石族尘掷全 0,流位不动），尾 4×4 TileFrame
 *     （cs:48799-48805）。R0 案 (2679,714)：484 伙伴被大理岩 166 顶替 →
 *     K(2680,713) 的 3×3 触发整组杀 → (2680,714) 转孤立凸起被砸半砖。
 *  其余 TileFrameImportant 族（容器/画框/49 桌上物/80 仙人掌/藤蔓）生成期在
 *  本 pass 足迹零触发——clean 重放 draws 与 vanilla 精确相等（5,097,254）实证
 *  无 RNG 消耗型级联,不移植（若未来 pass 出现尘掷级联需扩表）。
 *  LLLL 批（2026-08-18）扩表：CheckSuper 家族 485 蚁狮幼虫（零掷但**非零写**——
 *  9293480 单种子足迹恰好为零,12345 地下沙漠构型触发 (1856,476) 首分叉,见
 *  checkSuper 注）。 */
const CHEST_PROTECT_2X2 = idsByVanillaSheet(21, 467, 441, 468, 88, 470, 475);
/** WorldGen.destroyObject（Check2x2 再入闸,cs:48408/48564/48799）：
 *  级联击杀期间嵌套 TileFrame 不再发起新 Check2x2（非活性清残基不受闸限）。 */
let destroyObject = false;

/** TileFrame case 165（cs:85996 `CheckStalactite(i,j)`）注入槽：checkStalactite 住
 *  ShimmerPass（其 import 本文件 solidTile）——直接反向 import 成环,浏览器包循环
 *  依赖有 TDZ 前科,故注册制（ShimmerPass 模块体注册,生成期全部模块体先于 pass
 *  执行,时序安全）。TTTTTT 批 2026-08-23：CONST 链 LavaLayerCaverer 雕刻带内
 *  钟乳石(165)失锚——vanilla KillTile 尾 SquareTileFrame 级联经 TileFrame case165
 *  链杀,JS 漏 case → 38 格钟乳石残存（#32 末段残差,流位零差纯状态差）。 */
export type TileFrame165 = (
  st: TileStore, rng: RNG, x: number, y: number,
  reframe?: (st: TileStore, rng: RNG, x: number, y: number) => void,
) => void;
let tileFrame165: TileFrame165 | null = null;
export function registerTileFrame165(f: TileFrame165): void { tileFrame165 = f; }

/* ── Check3x2 186/187 堆支（cs:49190,TTTTTT 批 2026-08-23）──────────────────
 * killTile 级联域的 3×2 大堆复核（LargePiles 186/LargePiles2 187——TileFrameImportant
 * case 14/17/26/…/186/187 组派发,本域实证命中 187）。与 SurfaceDecorPasses.
 * check3x2PileSweep（RRRRR 批,flowers 域）/FinalCleanupPass.check3x2Sweep（引擎）
 * 三方同源副本（禁互 import 惯例）;本副本杀链走本文件 killTile（全量级联：
 * 尘掷+化石碎裂+裂砖链+SquareTileFrame→165/186/187 重查）,复扫=本文件 tileFrame。 */
const SAND_FAM_3X2 = new Set([53, 112, 116, 234, 397, 398, 402, 399, 396, 400, 403, 401]);
const ICE_SET_3X2 = new Set([161, 163, 164, 200]);
/** 原版 sheet 186/187 的本仓 tile id（惰性解析,TILE_BY_KEY 键名稳定） */
let _pile186 = -1;
function pile186Id(): number {
  if (_pile186 < 0) _pile186 = TILE_BY_KEY['v_186_decos_3x2'] ?? 0;
  return _pile186;
}

function check3x2PileKT(st: TileStore, rng: RNG, x: number, y: number, sheet: number): void {
  if (destroyObject) return;                                          // cs:49194
  const k0 = st.idx(x, y);
  const num3 = (st.frameY[k0]! / 36) | 0;
  const num4 = st.frameY[k0]! % 36;
  const top = y - ((num4 / 18) | 0);
  let num5 = (st.frameX[k0]! / 18) | 0;
  let num6 = 0;
  while (num5 > 2) { num5 -= 3; num6++; }
  num5 = x - num5;
  const num7 = num6 * 54;
  const num8 = top + 2;
  let flag = false;
  for (let k = num5; k < num5 + 3; k++) {
    for (let l = top; l < num8; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }              // null→非活性→flag
      const kk = st.idx(k, l);
      if (!st.flags[kk] || SHEET_OF[st.type[kk]] !== sheet
        || st.frameX[kk] !== (k - num5) * 18 + num7 || st.frameY[kk] !== (l - top) * 18 + num3 * 36) flag = true;
    }
    if (!st.inBounds(k, num8)) continue;                              // 越界=支撑真（cs:70214）
    const bi = st.idx(k, num8);
    if (!solidTileAllowBottomSlope(st, k, num8)) { flag = true; continue; }
    if (st.flags[bi] && BOULDERS.has(SHEET_OF[st.type[bi]] ?? -1)) { flag = true; continue; } // InvalidTileForPiles
    if (!st.flags[bi]) continue;                                      // 非活性底免材质门
    const b = SHEET_OF[st.type[bi]] ?? -1;
    if (sheet === 187) {                                              // cs:49331-49346
      const ok = num6 <= 5 ? (b === 59 || b === 60 || b === 226)
        : num6 <= 8 ? (b === 57 || b === 58 || b === 75 || b === 76)
          : num6 >= 29 ? SAND_FAM_3X2.has(b)
            : true;
      if (!ok) flag = true;
    } else {                                                          // 186（cs:49291-49323）
      const ok = num6 >= 26 && num6 <= 31 ? (b === 147 || ICE_SET_3X2.has(b) || b === 162 || b === 224)
        : num6 >= 32 ? (b === 59 || b === 70)
          : true;
      if (!ok) flag = true;
    }
  }
  // 187→186 草底降帧（cs:49348-49364）：顶行帧 756-900 且三底列全非草族（裸读 type）
  if (sheet === 187 && st.inBounds(num5, top) && st.inBounds(num5 + 2, top + 2)) {
    const kTop = st.idx(num5, top);
    if (st.frameX[kTop]! >= 756 && st.frameX[kTop]! <= 900) {
      const grassy = (k: number): boolean => {
        if (!st.flags[k]) return false;
        const s = SHEET_OF[st.type[k]] ?? -1;
        return s === 2 || s === 477 || s === 492;
      };
      if (!grassy(st.idx(num5, top + 2)) && !grassy(st.idx(num5 + 1, top + 2)) && !grassy(st.idx(num5 + 2, top + 2))) {
        for (let m = num5; m < num5 + 3; m++) {
          for (let l = top; l < top + 2; l++) {
            const kk = st.idx(m, l);
            st.frameX[kk] = st.frameX[kk]! - 378;
            st.type[kk] = pile186Id();
          }
        }
      }
    }
  }
  if (!flag) return;
  destroyObject = true;                                               // cs:49386
  for (let m = num5; m < num5 + 3; m++) {
    for (let l = top; l < num8; l++) {
      if (!st.inBounds(m, l)) continue;
      const kk = st.idx(m, l);
      if (st.flags[kk] && SHEET_OF[st.type[kk]] === sheet) killTile(st, rng, m, l);
    }
  }
  destroyObject = false;
  // cs:49856-49862：复位后 5×5 TileFrame 复扫（连锁杀邻组）
  for (let m = num5 - 1; m < num5 + 4; m++) {
    for (let l = top - 1; l < top + 4; l++) tileFrame(st, rng, m, l);
  }
}

/* ── Check3x2 非堆积家族（cs:49617；TileFrameImportant case 14/17/26/77/86/89/114/
 * 133/215/217/218/237/244/285/286/298/299/310/339/361-364/377/469/538 派发,cs:87240-70）
 * ★BBBBBBB（2026-08-24）NTB #53 定罪补件：恶魔祭坛(26)组校验整支缺失——猩红转化
 * 把祭坛 3×2 组的中间/底行格转成 25/203（残组=组内只剩角格），邻格被杀时
 * SquareTileFrame 级联 TileFrame(26) → vanilla Check3x2 判 flag → 整组活性祭坛格
 * KillTile（NTB 链 (2985,417)/(2987,417)/(2987,418) 三连杀,各 10 尘掷 Next(2)——
 * JS 无此支 → 祭坛残组滞留 + 流位差 30 掷 → #53 起 2.5 万坡度差级联）。
 * 186/187 堆积族仍走 check3x2PileKT（其 187 材质表/降帧支已批内验证,勿并轨）。 */
const CHECK3X2_SHEETS = new Set([
  14, 17, 26, 77, 86, 87, 88, 89, 114, 133, 215, 217, 218, 237, 244,
  285, 286, 298, 299, 310, 339, 361, 362, 363, 364, 377, 469, 538,
]);
/** cs:49703 首组（宽底座族）：SolidTileAllowBottomSlope ∨ 下方 solidTop 整帧 ∨ 平台 */
const CHECK3X2_WIDE_BASE = new Set([285, 286, 298, 299, 310, 339, 538, 361, 362, 363, 364, 532, 544, 533, 555, 556, 582, 619, 629]);
/** 原版 Main.tileSolidTop 全表（Main.cs tileSolidTop[X]=true 全量+435-439 循环）——
 *  与 TILE_TABLE_S(tileTable)是两张表（差 101/16/134/239/435-439），勿互用 */
const TILE_SOLID_TOP_S = new Set([
  14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376,
  380, 391, 392, 393, 394, 405, 413, 414, 427, 435, 436, 437, 438, 439, 469, 532,
  533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601,
  602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643,
  644, 645, 710,
]);

function check3x2KT(st: TileStore, rng: RNG, x: number, y: number, sheet: number): void {
  if (destroyObject) return;                                          // cs:49621
  const k0 = st.idx(x, y);
  const num3 = Math.floor(st.frameY[k0]! / 36);
  const num4 = st.frameY[k0]! % 36;
  const num = y - Math.floor(num4 / 18);                              // 组顶行
  let num5 = Math.floor(st.frameX[k0]! / 18);
  let num6 = 0;
  while (num5 > 2) { num5 -= 3; num6++; }
  num5 = x - num5;
  const num7 = num6 * 54;
  let num8 = num + 2;
  if (sheet === 14 && num6 === 25) num8--;                            // cs:49640 flag2
  let flag = false;
  for (let k = num5; k < num5 + 3; k++) {
    for (let l = num; l < num8; l++) {
      if (!st.inBounds(k, l)) { flag = true; continue; }              // null→非活性→flag
      const kk = st.idx(k, l);
      if (!st.flags[kk] || SHEET_OF[st.type[kk]] !== sheet
        || st.frameX[kk] !== (k - num5) * 18 + num7 || st.frameY[kk] !== (l - num) * 18 + num3 * 36) flag = true;
    }
    if (!st.inBounds(k, num8)) continue;                              // 越界=支撑真（cs:70214）
    const bi = st.idx(k, num8);
    const bs = SHEET_OF[st.type[bi]] ?? -1;
    const below = !!st.flags[bi];
    const nactive = below && ((st.wire[bi] >>> 5) & 1) === 0;         // active && !inActive
    if (CHECK3X2_WIDE_BASE.has(sheet)) {
      // cs:49703-49712：!底坡实心 && !(nactive&&solidTop&&frameY==0) && !(active&&平台) → flag
      const solidTopFrame0 = nactive && TILE_SOLID_TOP_S.has(bs) && st.frameY[bi] === 0;
      const platformOk = below && !!TILE_DEFS[st.type[bi]]?.platform;
      if (!solidTileAllowBottomSlope(st, k, num8) && !solidTopFrame0 && !platformOk) flag = true;
    } else if (sheet === 26 || sheet === 695) {
      // cs:49736-49744：底行须 SolidTileAllowBottomSlope 且非巨石族（★本批祭坛主靶）
      if (!solidTileAllowBottomSlope(st, k, num8)
        || (below && BOULDERS.has(bs))) flag = true;
    } else {
      // default（14/17/77/86/88/89/114/133/215/217/218/237/244/377/469）+
      // 704/705（cs:49716,不在派发族,防御同款）——底行须 SolidTileAllowBottomSlope
      if (!solidTileAllowBottomSlope(st, k, num8)) flag = true;       // cs:49840
    }
  }
  if (!flag) return;
  destroyObject = true;                                               // cs:49856
  for (let m = num5; m < num5 + 3; m++) {
    for (let l = num; l < num8; l++) {
      if (!st.inBounds(m, l)) continue;
      const kk = st.idx(m, l);
      if (st.flags[kk] && SHEET_OF[st.type[kk]] === sheet) killTile(st, rng, m, l);
    }
  }
  destroyObject = false;                                              // cs:50283
  for (let m = num5 - 1; m < num5 + 4; m++) {
    for (let l = num - 1; l < num + 4; l++) tileFrame(st, rng, m, l); // cs:50284-90 5×5 复扫
  }
}

/* ── CheckOnTable1x1（cs:43548）/ CheckBanner（cs:46103）级联支（TTTTTT 批）────
 * CONST 链定罪：Caverer 雕掉地牢书架/旗锚 → vanilla KillTile 尾级联经
 * TileFrameImportant case 50（书）/91（旗）链杀,JS 漏派发 → 7 格残存。 */
/** Main.tileTable（Main.cs:6828-6869+7983-7987 全 77 项） */
const TILE_TABLE_S = new Set([14, 18, 19, 87, 88, 101, 114, 275, 276, 277, 278, 279, 280, 281, 285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394, 405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** TileFrameImportant case 13/33/49/50/78/174/372/646/707 组（cs:86348） */
const ON_TABLE_1X1_S = new Set([13, 33, 49, 50, 78, 174, 372, 646, 707]);
/** TileID.Sets.NotReallySolid（TileID.cs:355） */
const NOT_REALLY_SOLID_S = new Set([387, 388, 10]);

function blockTypeAt(st: TileStore, i: number): number {
  if (st.half[i]) return 1;
  const s = st.slope[i]!;
  return s > 0 ? s + 1 : 0;
}
/** AnchorValid(tile, AnchorType.Table)（cs:51867）生成期子集（nactive 门内） */
function anchorValidTableKT(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 0x20)) return false;
  const t = st.type[i];
  const d = TILE_DEFS[t];
  const solid = genSolidType(t);
  const solidTop = !!(d && d.platform);
  if (solid && !solidTop && !NO_ATTACH.has(t) && blockTypeAt(st, i) === 0) return true;
  if (d && d.platform) {
    const num = Math.trunc(st.frameX[i]! / 18);
    if ((!st.half[i] && num >= 0 && num <= 7) || (num >= 12 && num <= 16) || (num >= 25 && num <= 26)) return true;
  } else if (solid && solidTop) return true;
  if (!solidTop && TILE_TABLE_S.has(SHEET_OF[t] ?? -1) && blockTypeAt(st, i) === 0) return true;
  return false;
}
/** CheckOnTable1x1（cs:43548）：下格 topSlope→平台边支/杀;halfBrick→杀;
 *  否则 AnchorValid(Table)∪tileTable 存活,78 烛台走 SolidTileAllowBottomSlope,余杀 */
function checkOnTable1x1KT(st: TileStore, rng: RNG, x: number, y: number): void {
  if (!st.inBounds(x, y + 1)) return;
  const bi = st.idx(x, y + 1);
  const bs = st.slope[bi]!;
  if (bs === 1 || bs === 2) {                                    // topSlope()
    const d = TILE_DEFS[st.type[bi]];
    if (d && d.platform) {
      const bt = blockTypeAt(st, bi);
      const edgeOk = (side: number): boolean => {
        if (!st.inBounds(x + side, y + 1)) return false;
        const si = st.idx(x + side, y + 1);
        return st.flags[si] !== 0 && blockTypeAt(st, si) === 0
          && !!(TILE_DEFS[st.type[si]]?.platform);
      };
      if ((bt !== 3 || !edgeOk(-1)) && (bt !== 2 || !edgeOk(1))) killTile(st, rng, x, y);
    } else {
      killTile(st, rng, x, y);
    }
  } else if (st.half[bi]) {
    killTile(st, rng, x, y);
  } else {
    if (anchorValidTableKT(st, x, y + 1)
      || (st.flags[bi] && TILE_TABLE_S.has(SHEET_OF[st.type[bi]] ?? -1))) return;
    if (SHEET_OF[st.type[st.idx(x, y)]] === 78) {
      if (!solidTileAllowBottomSlope(st, x, y + 1)) killTile(st, rng, x, y);
    } else {
      killTile(st, rng, x, y);
    }
  }
}
/** CheckBanner（cs:46103）：case 91 1×3 旗——三格帧完整性 + 顶锚 nactive+实心支 */
function checkBannerKT(st: TileStore, rng: RNG, x: number, j: number): void {
  if (destroyObject) return;
  const i0 = st.idx(x, j);
  let num = Math.trunc(st.frameY[i0]! / 18);
  let num2 = 0;
  while (num >= 3) { num -= 3; num2++; }
  num = j - num;
  const frameX = st.frameX[i0]!;
  const type = SHEET_OF[st.type[i0]] ?? -1;
  let flag = false;
  for (let k = 0; k < 3; k++) {
    if (!st.inBounds(x, num + k)) { flag = true; continue; }
    const ki = st.idx(x, num + k);
    if (!st.flags[ki]) flag = true;
    else if ((SHEET_OF[st.type[ki]] ?? -1) !== type) flag = true;
    else if (st.frameY[ki] !== k * 18 + num2 * 54) flag = true;
    else if (st.frameX[ki] !== frameX) flag = true;
  }
  if (st.inBounds(x, num - 1)) {
    const ti = st.idx(x, num - 1);
    if (!st.flags[ti] || (st.wire[ti] & 0x20)) {
      flag = true;                                    // !nactive()（cs:46139）
    } else {
      const tt = st.type[ti];
      const d = TILE_DEFS[tt];
      const solid = genSolidType(tt);
      const solidTop = !!(d && d.platform);
      const num3 = st.slope[ti] === 1 || st.slope[ti] === 2 || st.half[ti] !== 0 || solid;
      const flag2 = !solidTop || (solidTop && (st.half[ti] !== 0 || st.slope[ti] === 1 || st.slope[ti] === 2));
      let flag3 = num3 && flag2 && !NOT_REALLY_SOLID_S.has(SHEET_OF[tt] ?? -1)
        && !(st.slope[ti] === 3 || st.slope[ti] === 4);
      if ((d && d.platform) || (SHEET_OF[tt] ?? -1) === 380) flag3 = true;
      if (!flag3) flag = true;
    }
  } else {
    flag = true;                                      // null tile → new Tile() → !nactive
  }
  if (!flag) return;
  destroyObject = true;
  for (let k = 0; k < 3; k++) {
    if (st.inBounds(x, num + k)) {
      const ki = st.idx(x, num + k);
      if ((SHEET_OF[st.type[ki]] ?? -1) === type) killTile(st, rng, x, num + k);
    }
  }
  destroyObject = false;
  // cs:46175+ 掉落支（num4==312..315 特殊旗）——生成期 noItem 且不掷 genRand,略
}

/** TileFrame 生成期路径子集（cs:82067）：边界闸 + 非活性清 half/slope +
 *  巨石族 Check2x2。PaintClear 生成期无漆可清;液体/AddWater 段被
 *  !generatingWorld 门挡;基础块 TileFrameCosmetic 同门不跑。 */
function tileFrame(st: TileStore, rng: RNG, x: number, y: number): void {
  if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return; // cs:82069
  const i = st.idx(x, y);
  if (!st.flags[i]) { st.half[i] = 0; st.slope[i] = 0; return; }  // cs:82078-83
  if (BOULDERS.has(st.type[i])) check2x2(st, rng, x, y);
  else if (LARVA.has(st.type[i])) checkSuper(st, rng, x, y);      // cs:86437-40 case 485
  else {
    const sheet = TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1;
    if (sheet === 165 && tileFrame165) {
      // cs:39022 CheckStalactite：destroyObject 全程 true（vanilla 在 KillTile 段
      // 置位,级联内嵌套 TileFrame 不发起新 Check2x2）——reframe=完整 tileFrame
      // （vanilla KillTile→SquareTileFrame→全量 TileFrame,ZZZ 批同口径）
      destroyObject = true;
      tileFrame165(st, rng, x, y, (s, r, xx, yy) => tileFrame(s, r, xx, yy));
      destroyObject = false;
    } else if (sheet === 186 || sheet === 187) {
      check3x2PileKT(st, rng, x, y, sheet);                        // cs:86713 组→Check3x2
    } else if (CHECK3X2_SHEETS.has(sheet)) {
      check3x2KT(st, rng, x, y, sheet);                            // cs:87270 组→Check3x2（★祭坛族）
    } else if (ON_TABLE_1X1_S.has(sheet)) {
      checkOnTable1x1KT(st, rng, x, y);                            // cs:86348 组→CheckOnTable1x1
    } else if (sheet === 91) {
      checkBannerKT(st, rng, x, y);                                // cs:86438 case 91→CheckBanner
    }
  }
}

/** SquareTileFrame（cs:80924）：3×3 逐格 TileFrame,列主序与原版逐条一致。 */
function squareTileFrame(st: TileStore, rng: RNG, x: number, y: number): void {
  tileFrame(st, rng, x - 1, y - 1); tileFrame(st, rng, x - 1, y); tileFrame(st, rng, x - 1, y + 1);
  tileFrame(st, rng, x, y - 1); tileFrame(st, rng, x, y); tileFrame(st, rng, x, y + 1);
  tileFrame(st, rng, x + 1, y - 1); tileFrame(st, rng, x + 1, y); tileFrame(st, rng, x + 1, y + 1);
}

/** SolidTileAllowBottomSlope（cs:70211-70233）：!InWorld→true;active &&
 *  (tileSolid||tileSolidTop) && !topSlope(平台合法顶帧除外) && !halfBrick && !inActive()
 *  （LLL 批补致动腿,cs:70228 原文）。
 *  tileSolidTop≈d.platform（本文件既有近似口径）;PlatformProperTopFrame
 *  （cs:70198,帧宽 18）合法段 [0,7]∪[12,16]∪[25,26]。 */
function solidTileAllowBottomSlope(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (st.wire[i] & 0x20) return false; // cs:70228 !inActive()
  const t = st.type[i];
  const d = TILE_DEFS[t];
  const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
  if (topSlope && !(d?.platform && platformProperTopFrame(st.frameX[i]))) return false;
  return (vanGenSolidType(t) || !!d?.platform) && !st.half[i];
}
function platformProperTopFrame(frameX: number): boolean {
  const n = Math.floor(frameX / 18);
  if ((n < 0 || n > 7) && (n < 12 || n > 16)) return n >= 25 && n <= 26;
  return true;
}

/** Check2x2 巨石族子集（cs:48405-48805）：2×2 锚定校验 + 整组杀 + 尾 4×4 帧。
 *  锚点 num2/num6 = 本格减 frame 偏移（cs:48408-48422,frameX≥36 修样式列 +36）。 */
function check2x2(st: TileStore, rng: RNG, x: number, y: number): void {
  if (destroyObject) return; // cs:48408
  const i0 = st.idx(x, y);
  const type = st.type[i0];
  let num2 = -Math.floor(st.frameX[i0] / 18);
  let num = 0;
  if (num2 < -1) { num2 += 2; num = 36; }
  num2 += x;
  let num4 = st.frameY[i0];
  let num5 = 0;
  while (num4 >= 36) { num4 -= 36; num5++; } // num3=36（type 172 除外,巨石族恒 36）
  const num6 = y - Math.floor(num4 / 18);
  const inW = (k: number, l: number): boolean => k >= 0 && l >= 0 && k < st.w && l < st.h;
  let flag = false;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      // 越界 = GetTileSafely 新 Tile（非活性）→ 失配（cs:48443-48451）
      if (!inW(k, l)) { flag = true; break; }
      const q = st.idx(k, l);
      if (!st.flags[q] || st.type[q] !== type
        || st.frameX[q] !== (k - num2) * 18 + num
        || st.frameY[q] !== (l - num6) * 18 + num5 * 36) { flag = true; break; }
    }
  }
  // 巨石族专属：上方箱族豁免 + 底部支撑（cs:48473-48490）。type 读取不查
  // active（ghost type 保真,同原版裸读）
  const chestAbove = (cx: number, cy: number): boolean =>
    inW(cx, cy) && CHEST_PROTECT_2X2.has(st.type[st.idx(cx, cy)]);
  if (!chestAbove(num2, num6 - 1) && !chestAbove(num2 + 1, num6 - 1)
    && !solidTileAllowBottomSlope(st, num2, num6 + 2)
    && !solidTileAllowBottomSlope(st, num2 + 1, num6 + 2)) flag = true;
  if (!flag) return;
  // 整组杀（cs:48562-48574;巨石族尘掷 0 → 流位不动）+ 尾 4×4 TileFrame（cs:48799）
  destroyObject = true;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num6; l < num6 + 2; l++) {
      if (!inW(k, l)) continue;
      const q = st.idx(k, l);
      if (st.type[q] === type && st.flags[q]) killTile(st, rng, k, l);
    }
  }
  destroyObject = false;
  for (let k = num2 - 1; k < num2 + 3; k++) {
    for (let l = num6 - 1; l < num6 + 3; l++) tileFrame(st, rng, k, l);
  }
}

/* ── CheckSuper（cs:48117-48406）:LLL 批 2026-08-18 第二种子定罪补链 ──────────
 * TileFrameImportant 的 CheckSuper 家族 = case 376/443/444/485（cs:86437-40）。
 * 生成期（本 pass）在场成员仅 **485 蚁狮幼虫**：
 *  - 376 渔获箱：非 worldgen（钓鱼产物）;443 间歇泉：Traps pass（#76,本 pass 之后）;
 *  - 444 蜂巢块：仅 notTheBees 特殊种子写入（cs:20445/20494）——常态种子 #53 时点
 *    均不在场,不建模（备案:特种子移植时按 cs:48220-48256 flag3 上锚+液体门扩展）。
 * 12345 种子实锤案 (1856,476)：主扫描 K(1857,475) 尾 SquareTileFrame 触到邻格
 * 485 → CheckSuper 完整性破（2×2 组伴已被大理岩 166 顶替）→ 整组杀 + 残凸被砸
 * 半砖（P(1857,476)）——JS 无此派发 → 首分叉动作 #34276（vanilla 多两枚零掷动作,
 * 掷流恒对齐,故 9293480 单种子全绿掩盖至此;12345 地下沙漠蚁狮窝构型首触）。
 * 485 TileObjectData（TileObjectData.cs:3504-3511）：CopyFrom(Style2x2)+StyleHorizontal
 * → W=2 H=2 CW16 pad2（CFW=CFH=36,格步 18）;num4=fx/36（横排样式）,num5=0。 */
const LARVA = idsByVanillaSheet(485);
/** Main.tileSolid∩tileSolidTop（AnchorValid SolidTile 的 !solidTop 腿;含 Echo 族） */
const SOLID_AND_TOP = idsByVanillaSheet(19, 239, 380, 427, 435, 436, 437, 438, 439);
/** Main.tileNoAttach（U 批 DG_NO_ATTACH 同表,BuriedChestsPass PC_NO_ATTACH） */
const NO_ATTACH = idsByVanillaSheet(
  3, 4, 10, 13, 14, 15, 16, 17, 18, 19, 20, 21, 27, 50, 86, 87, 88, 89, 90, 91, 92, 93,
  94, 95, 96, 97, 98, 99, 101, 102, 110, 114, 134, 387, 388, 390, 427, 435, 436, 437,
  438, 439, 441, 467, 468, 469, 486, 487, 488, 489, 490, 497, 507, 564, 565, 568, 569,
  570, 572, 580, 590, 593, 594, 595, 615, 620, 704, 707);

/** WorldGen.AnchorValid(tile, AnchorType.SolidTile)（cs:51867-77）：
 *  nactive（active&&!actuator）&& tileSolid && !tileSolidTop && !tileNoAttach
 *  && blockType()==0（整砖,半砖/坡不算）。tileSolid 走 vanGenSolidType
 *  （生成期 Main.tileSolid 口径）。 */
function anchorSolidTile(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  if (!st.flags[i] || (st.wire[i] & 0x20)) return false; // nactive()
  const t = st.type[i];
  if (SOLID_AND_TOP.has(t) || NO_ATTACH.has(t)) return false;
  if (st.half[i] || st.slope[i] !== 0) return false;
  return vanGenSolidType(t);
}

/** CheckSuper 485 生成期路径（cs:48117-48406）：2×2 锚定校验 + 整组杀 + 尾 4×4 帧。
 *  锚点 num2/num3 = 本格减帧偏移（cs:48145-46）;完整性 = 四格 type+帧全等,
 *  外加 flag4 底部两腿 AnchorValid(SolidTile)（cs:48246-54）。485 生成期无
 *  物品/NPC/弹幕掷（num13=0;NPC 门被 !isGeneratingOrLoadingWorld 挡）。 */
function checkSuper(st: TileStore, rng: RNG, x: number, y: number): void {
  if (destroyObject) return; // cs:48119
  const i0 = st.idx(x, y);
  const type = st.type[i0];
  const num2 = x - Math.floor(st.frameX[i0] / 18) % 2;
  const num3 = y - Math.floor(st.frameY[i0] / 18) % 2;
  const num4 = Math.floor(st.frameX[i0] / 36);
  const inW = (k: number, l: number): boolean => k >= 0 && l >= 0 && k < st.w && l < st.h;
  let flag5 = false;
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      if (!inW(num2 + i, num3 + j)) { flag5 = true; continue; } // GetTileSafely=非活性→失配
      const q = st.idx(num2 + i, num3 + j);
      if (!st.flags[q] || st.type[q] !== type
        || st.frameX[q] !== num4 * 36 + i * 18
        || st.frameY[q] !== j * 18) flag5 = true;
    }
  }
  let flag10 = true;
  for (let k = 0; k < 2; k++) {
    if (!inW(num2 + k, num3 + 2) || !anchorSolidTile(st, num2 + k, num3 + 2)) flag10 = false;
  }
  if (!flag10) flag5 = true;
  if (!flag5) return;
  destroyObject = true;
  for (let k = num2; k < num2 + 2; k++) {
    for (let l = num3; l < num3 + 2; l++) {
      if (!inW(k, l)) continue;
      const q = st.idx(k, l);
      if (st.type[q] === type && st.flags[q]) killTile(st, rng, k, l);
    }
  }
  destroyObject = false;
  for (let k = num2 - 1; k < num2 + 3; k++) {
    for (let l = num3 - 1; l < num3 + 3; l++) tileFrame(st, rng, k, l);
  }
}

/** WorldGen.fossilBreak（cs:4361 private static bool）：碎裂链防重入位 */
let fossilBreak = false;

/** WorldGen.AttemptFossilShattering（1456 cs:63526-63553）1:1：
 *  沙漠化石(404)被 KillTile 时 3×3 邻域逐格检定,每个「非本格 && 活性 && 404」
 *  邻格掷 1 次（短路 &&,掷值只对合格邻格消耗）——maxValue：下格非实心(SolidTile)
 *  →4;下格实心且恰为本格正上方且 !fail→4;其余 15。命中 0 → 递归
 *  KillTile(k,l,noItem:true)（fossilBreak 位挡嵌套碎裂,链式清簇）。
 *  ★SolidTile=cs:70155 全谓词（active&&solid&&!solidTop&&!half&&!slope&&!inActive,
 *  OOB→false）,复用本文件 solidTile（GenSolid 生成期翻转表同源）。
 *  ★fail 形参：本仓生成期 killTile 全部 fail=false 语义（fail:true 支路 cs:63758
 *  的草族转化未移植,现无调用点）,恒 false 传入。 */
function attemptFossilShattering(st: TileStore, rng: RNG, x: number, y: number): void {
  if (fossilBreak) return;
  fossilBreak = true;
  for (let k = x - 1; k <= x + 1; k++) {
    for (let l = y - 1; l <= y + 1; l++) {
      let maxValue = 15;
      if (!solidTile(st, k, l + 1)) {
        maxValue = 4;
      } else if (k === x && l === y - 1) {
        maxValue = 4;
      }
      if (k === x && l === y) continue;
      if (!st.inBounds(k, l)) continue;
      const ni = st.idx(k, l);
      if (st.flags[ni] && SHEET_OF[st.type[ni]] === 404 && rng.nextInt(maxValue) === 0) {
        killTile(st, rng, k, l);
      }
    }
  }
  fossilBreak = false;
}

/* ── CheckTileBreakability（cs:62403）+ ShouldTileSurvive（cs:62515）──────────
 * KillTile 头部不可破坏门（TTTTTT 批 2026-08-23 补）：CONST 链 LavaLayerCaverer
 * 雕进地牢带埋箱（21）→ vanilla 箱本体 ShouldTileSurvive 存活 + 箱下砖格
 * CheckTileBreakability=2 拒毁（上邻箱=容器→scanForContainer 命中）,JS 曾照毁
 * →12 格纯状态差（流位零差：箱/砖尘段均零掷）。 */
const BASIC_CHEST_S = new Set([21, 467]);
const BASIC_DRESSER_S = new Set([88]);
const BASIC_CHEST_FAKE_S = new Set([441, 468]);
/** TileID.Sets.PreventsTileRemovalIfOnTopOfIt（TileID.cs:305） */
const PREVENTS_REMOVAL_ON_TOP = new Set([5, 323, 72, 488, 26, 583, 584, 585, 586, 587, 588, 589, 596, 616, 470, 475, 634]);

function sheetAtKT(st: TileStore, x: number, y: number): number {
  if (!st.inBounds(x, y)) return -1;
  return SHEET_OF[st.type[st.idx(x, y)]] ?? -1;
}
function activeAtKT(st: TileStore, x: number, y: number): boolean {
  return st.inBounds(x, y) && st.flags[st.idx(x, y)] !== 0;
}
/** IsLockedDoor（cs:69248）：10 门 fy∈[594,646] 且 fx<54 */
function isLockedDoorKT(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  return SHEET_OF[st.type[i]] === 10 && st.frameY[i]! >= 594 && st.frameY[i]! <= 646 && st.frameX[i]! < 54;
}
/** IsAContainer（cs:48831）：Dresser∪{470,475}∪BasicChest∪BasicChestFake */
function isAContainerKT(st: TileStore, x: number, y: number): boolean {
  const t = sheetAtKT(st, x, y);
  if (!BASIC_DRESSER_S.has(t) && t !== 470 && t !== 475 && !BASIC_CHEST_S.has(t)) return BASIC_CHEST_FAKE_S.has(t);
  return true;
}
/** CheckTileBreakability_HasReasonToReturnEarly（cs:62466）。★77 熔炉门带
 *  !Main.hardMode——生成期恒肉前 → 恒真。 */
function hasReasonToReturnEarlyKT(st: TileStore, ignoreSheet: number, tx: number, ty: number, scanForContainer: boolean): boolean {
  const t = sheetAtKT(st, tx, ty);
  if (ignoreSheet !== t) {
    if (t === 77) return true;
    if (PREVENTS_REMOVAL_ON_TOP.has(t)) return true;
  }
  if (isLockedDoorKT(st, tx, ty)) return true;
  if (scanForContainer && isAContainerKT(st, tx, ty)) return true;
  return false;
}
/** CheckBoulderChest（cs:48810）：巨石锚 2×2 顶两格容器/保护物扫 */
function checkBoulderChestKT(st: TileStore, x: number, y: number): boolean {
  const i = st.idx(x, y);
  let num = Math.trunc(st.frameX[i]! / 18) * -1;
  if (num < -1) num += 2;
  num += x;
  let num2 = st.frameY[i]!;
  for (; num2 >= 36; num2 -= 36) { /* frameY % 36 */ }
  num2 = y - Math.trunc(num2 / 18);
  const self = SHEET_OF[st.type[i]] ?? -1;
  return hasReasonToReturnEarlyKT(st, self, num, num2 - 1, true)
    || hasReasonToReturnEarlyKT(st, self, num + 1, num2 - 1, true);
}
/** CheckTileBreakability（cs:62403）：0=可毁 / 1=转 fail 支路 / 2=拒毁（零掷零写）。
 *  tileSolid 走 genSolidType（生成期翻转表,本文件 solidTile 同口径）,
 *  tileSolidTop≈d.platform（本文件既有近似口径）。 */
export function checkTileBreakability(st: TileStore, x: number, y: number): number {
  if (y < 1 || y > st.h - 1) return 0;
  const i = st.idx(x, y);
  const self = SHEET_OF[st.type[i]] ?? -1;
  if (activeAtKT(st, x, y + 1) && isLockedDoorKT(st, x, y + 1)) return 2;
  const d = TILE_DEFS[st.type[i]];
  if (!genSolidType(st.type[i]) && !(d && d.platform)) return 0;
  if (activeAtKT(st, x, y - 1)) {
    const flag = isAContainerKT(st, x, y);
    if (hasReasonToReturnEarlyKT(st, self, x, y - 1, !flag)) {
      const u = st.idx(x, y - 1);
      const ut = SHEET_OF[st.type[u]] ?? -1;
      if (TREE_TRUNK.has(st.type[u])) {                    // IsATreeTrunk（cs:62427-62437）
        const fx = st.frameX[u]!, fy = st.frameY[u]!;
        if ((fx === 66 && fy >= 0 && fy <= 44) || (fx === 88 && fy >= 66 && fy <= 110) || fy >= 198) return 0;
        return 2;
      }
      if (ut === 323) {                                    // 棕榈干（cs:62438-62443）
        const fx = st.frameX[u]!;
        if (fx === 66 || fx === 220) return 2;
        return 0;
      }
      return 2;
    }
    if (sheetAtKT(st, x, y - 1) === 80 && self !== 80) {   // 仙人掌上邻帧门（cs:62445-62451）
      const n = Math.trunc(st.frameX[st.idx(x, y - 1)]! / 18);
      if (n === 0 || n === 1 || n === 4 || n === 5) return 2;
    }
    if (self === 10 && isLockedDoorKT(st, x, y)) return 1;
    if (BOULDERS.has(st.type[i])) {
      if (checkBoulderChestKT(st, x, y)) return 1;
      return 0;
    }
  }
  if (self === 235) {                                     // 音乐盒三格扫（cs:62455-62464）
    const num2 = x - Math.trunc((st.frameX[i]! % 54) / 18);
    for (let k = 0; k < 3; k++) {
      if (activeAtKT(st, num2 + k, y - 1) && hasReasonToReturnEarlyKT(st, self, num2 + k, y - 1, true)) return 2;
    }
  }
  return 0;
}
/** CheckTileBreakability2_ShouldTileSurvive（cs:62515）生成期子集：
 *  BasicChest{21,467}/Dresser{88} → Chest.DestroyChest——生成期箱恒有物
 *  （放置即战利品填充;DungeonPass.ts CanKillTile 支同口径先例）→ 存活;
 *  470 展示娃娃/475 帽架 → TE 不存在于生成期 → IsBreakable=true → 不存活。 */
function shouldTileSurviveKT(st: TileStore, x: number, y: number): boolean {
  const t = SHEET_OF[st.type[st.idx(x, y)]] ?? -1;
  return BASIC_CHEST_S.has(t) || t === 88;
}

/** 原版 KillTile(i,j) 生成期路径的完整掷骰模型 + 击杀（type=0 清型）。
 *  生成期 noItem=true 无掉落掷;isGeneratingOrLoadingWorld=true 时尘段恒跑
 *  （cs:63747 dust 段在 effectOnly 早退之前,无 netMode 门）。
 *  ★PPPPP（2026-08-22）导出复用：WavyCaverer（cs:12335 KillTile）与
 *  LavaLayerCaverer（cs:74066 KillTile）的雕刻支同模型——尘掷流位+尾
 *  SquareTileFrame 级联必须一致，勿在新 pass 重写近似版。 */
export function killTile(st: TileStore, rng: RNG, x: number, y: number): void {
  // ★KKKKKKK 诊断钩（用后即删）：killTile 尝试日志
  const kkp = (globalThis as { __kkkKT?: (x: number, y: number) => void }).__kkkKT;
  if (kkp) kkp(x, y);
  const i = st.idx(x, y);
  if (!st.flags[i]) return;                    // cs:63568 !active 早退（零掷零写）
  const sheet = SHEET_OF[st.type[i]] ?? -1;
  // cs:63579-63581 CheckTileBreakability（TTTTTT 批 2026-08-23 补）：
  //   2=拒毁（零掷零写早退,尘段之前）;1=转 fail 支路（存活+转化+级联）
  const brk = checkTileBreakability(st, x, y);
  const fail = brk === 1;
  if (brk === 2) return;
  const n = killDustAmount(sheet);
  const amt = n === -1 ? (st.frameX[i] / 22 >= 5 ? 5 : 10) : n;
  const per = killDustRollsPer(sheet, st.frameX[i]);
  swAct('K', x, y, 0);   // 原版 WLog 在 KillTile 入口（尘掷之前）
  for (let k = 0; k < amt; k++) for (let r = 0; r < per; r++) rng.nextInt(6);
  // cs:63756 AttemptFossilShattering（TTTTTT 批 2026-08-23 补）：沙漠化石(404)被击杀
  //   时 3×3 邻域连锁碎裂——CONST 链 LavaLayerCaverer 雕进地下沙漠化石簇即从该列
  //   流移（vanilla 每个活性 404 邻格掷 1 次 Next(15)/Next(4),命中 0 连锁击杀;
  //   404 尘段 10 次迭代零 genRand → 流上只见碎裂掷不见尘掷,定罪铁证）。
  //   原版序：尘段(cs:63747) → 本掷(cs:63756) → fail 支(cs:63758) → 蛛网掷(cs:63904)。
  if (sheet === 404) attemptFossilShattering(st, rng, x, y);
  if (fail) {
    // cs:63758-63776 fail 支路：ShakeTree（IsShakeable=树族,gen 域 fail 仅
    //   锁门(10)/巨石箱顶(Boulders)两源,树族不可达 → 略）+ 草族转化表
    //   （2/23/109/199/477/492→0、633→57、60/661/662/70→59——gen 域 fail 源
    //   10/Boulders 与转化表零交集,备案不移植;tileMoss/tileMossBrick 同）。
    //   存活语义=仅 SquareTileFrame 级联。
    squareTileFrame(st, rng, x, y);
    return;
  }
  // cs:63840-63894 裂砖(481-483)连锁（TTTTTT 批 2026-08-23 补）：8 邻域逐格掷
  //   Next(6)（正上邻 num17=3——仅 case2 减半,正下/斜向恒 6）,掷对「活性邻格」
  //   发生（短路 && 在 type 检查**之前**——非裂砖活性邻格也占掷位）;命中 0 且
  //   邻格是 481-483 → 本格先 active(false)（链期间成 ghost 型）再递归 KillTile
  //   （嵌套链无防重入位,原版如此;尘段 3 迭代零 genRand → 流上只见链掷）。
  //   尾 projectile(736-738) 生成期不入档且不掷 genRand,略。
  //   ★CONST 链定罪：LavaLayerCaverer 雕进地牢裂砖带（x≈3620 列）vanilla 多掷
  //   3×Next(6) 而 JS 零掷,流移即此。
  if (sheet >= 481 && sheet <= 483) {
    for (let m = 0; m < 8; m++) {
      let num17 = 6;
      let nx = x;
      let ny = y;
      switch (m) {
        case 0: nx--; break;
        case 1: nx++; break;
        case 2: ny--; num17 = 3; break;
        case 3: ny++; break;
        case 4: nx--; ny--; break;
        case 5: nx++; ny--; break;
        case 6: nx--; ny++; break;
        case 7: nx++; ny++; break;
      }
      if (!st.inBounds(nx, ny)) continue; // 原版此处 OOB 即崩;裂砖不入世界边缘,实践不可达
      const qi = st.idx(nx, ny);
      const qs = SHEET_OF[st.type[qi]] ?? -1;
      if (st.flags[qi] && rng.nextInt(num17) === 0 && qs >= 481 && qs <= 483) {
        st.flags[i] = 0;                 // tile.active(active:false)（cs:63871）
        killTile(st, rng, nx, ny);
      }
    }
  }
  // cs:63900 CheckTileBreakability2_ShouldTileSurvive（TTTTTT 批 2026-08-23 补）：
  //   有物箱/梳妆台免毁（尘段之后——尘掷已耗,箱族尘 10 迭代零掷故流位不变）
  if (shouldTileSurviveKT(st, x, y)) return;
  // cs:63904：蛛网(51)带蜘蛛墙(62) → Next(4)（结果只改 noItem,生成期恒 noItem=true）。
  // ★PPPPP（2026-08-22）勘误：原版此掷在尘段**之后**（cs:63904 > cs:63748 尘环）——
  //   曾前置 → 掷序错,CONST 链 LavaLayerCaverer 雕到蛛网+蜘蛛墙即从该点流移
  if (sheet === 51 && st.wall[i] === 62) rng.nextInt(4);
  // cs:63941：地狱石(58) 击杀于 UnderworldLayer(=h-200) 之下 → 灌岩浆 128
  if (sheet === 58 && y > st.h - 200) { st.liquid[i] = 128; st.liquidType[i] = 2; }
  st.setTileSilent(x, y, 0);
  // cs:63947 尾 SquareTileFrame(i,j)：3×3 TileFrame 级联（见上 UUU 批注）
  squareTileFrame(st, rng, x, y);
}

/** WorldGen.SolidTile(i, j, false) 等价（WorldGen.cs:70155）：
 *  active && tileSolid && !tileSolidTop && !halfBrick && slope==0 && **!inActive()**
 *  —— 半砖/坡面格不算实心;致动（actuator）格也不算实心（cs:70170 尾腿,LLL 批
 *  12345 定罪:vanilla 地牢穹顶立柱自带致动位 234 格,漏此腿则穹壳角/立柱顶的
 *  悬顶坡面分支 (3396,158) 等 6 格错写 slope——9293480 无致动柱故单种子全绿掩盖）。
 *  这对 PoundTile（toggle 语义）至关重要：已砸的半砖不会被后续 pass 再"砸回"整砖。
 *  ★tileSolid 走 GenSolid（生成期 Main.tileSolid 翻转表）：SmoothWorld 期间 137
 *  陷阱（cs:16212 起非实心）/190 荧光菇块（cs:16693 起非实心）/484 滚动仙人掌
 *  （cs:12537 起非实心）等不再被当实心地面——与原版 SolidTile 读可变数组一致 */
export function solidTile(st: TileStore, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= st.w || y >= st.h) return false;
  const i = st.idx(x, y);
  // 原版 SolidTile 检查 active()（=flags）：TileRunner 幽灵 tile（有 type 无 flags）
  // 不得当实心——曾致补角分支实体化天空幽灵块成浮空半砖（2583 个）
  if (!st.flags[i]) return false;
  if (st.wire[i] & 0x20) return false; // cs:70170 !inActive()（致动位=wire bit5）
  const t = st.type[i];
  if (t === 0) return false;
  const d = TILE_DEFS[t];
  return genSolidType(t) && !!d && !d.platform && !st.half[i] && st.slope[i] === 0;
}

/** 可砸判定（1456 WorldGen.cs:81434 CanPoundTile 1:1 表）：
 *  ① type 黑名单（cs:81448）：10 门/48 尖刺/137 陷阱/232 木刺/380 花盆箱/387 陷阱门/
 *    388 高闸/476 高尔夫洞/484 滚动仙人掌
 *  ② TileID.Sets.Boulders（TileID.cs:195）：138/484/664/665/711-716
 *  ③ 生成期追加：190 荧光菇块 / 30 木平台（cs:81462-81471）
 *  ④ 上格 ForbidsSloping（cs:81494）：21 箱/26 祭坛/77 熔炉/88/235 传送器/237 蜥蜴祭坛/
 *    441 假箱/467 箱2/468/470 模型/475 帽架/488 倒木/597 传送塔
 *  ⑤ CanKillTile 结构检查（cs:62249）——仍为近似（生成期主要拦截宝箱/巨石邻接，
 *    ①②④已覆盖生成期实际命中面）
 *  ★UUU 批源码考古定论：原版 CanPoundTile 对本格 type 裸读（switch/Boulders/
 *    生成期 190,30 均不查 active,ghost type 参与判定）,但兜底 `return CanKillTile`
 *    ——CanKillTile 首门 `!tile.active() → false`（cs:62265）⇒ 非活性格两种走法
 *    同为 false,本函数的 flags 早退与原版**结果等价**（QQQ 头号嫌疑排除）。
 *    真正的近似残差是尾部 genSolidType/!platform/!framed 三门——CanKillTile 不查
 *    实心/平台/框架,活性非实心非框架格（草木/根须族）原版可砸而本仓拒——pass 53
 *    足迹零命中（clean 重放 0 差实证）,保留备案 */
const POUND_BLACKLIST = idsByVanillaSheet(10, 48, 137, 232, 380, 387, 388, 476, 484);
const BOULDERS = idsByVanillaSheet(138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
const POUND_GEN_SKIP = idsByVanillaSheet(190, 30);
const FORBIDS_SLOPING = idsByVanillaSheet(21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597);

/** TileID.Sets.IsATreeTrunk（TileID.cs:161）：树干族——CanKillTile 上格早退门 */
const TREE_TRUNK = idsByVanillaSheet(5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634);

export function canPoundTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false; // 同 solidTile：幽灵 tile 不可砸
  const t = st.type[i];
  if (t === 0) return false;
  if (POUND_BLACKLIST.has(t)) return false;
  if (BOULDERS.has(t)) return false;
  if (POUND_GEN_SKIP.has(t)) return false;
  // ④ 上格 ForbidsSloping（cs:81475-81478：上格 active 且禁坡物 → 不可砸）
  if (st.inBounds(x, y - 1)) {
    const up = st.idx(x, y - 1);
    if (st.flags[up] && FORBIDS_SLOPING.has(st.type[up])) return false;
    // ⑤' cs:62270-62281 CanKillTile 树干族早退：上格 active 且 IsATreeTrunk
    //    {5,72,583-589,596,616,634} 且与本格异型 且帧门全过（非(66,0..44) 非
    //    (88,66..110) 且 frameY<198——frameY<0 于 u16 不可能）→ false。
    //    ★IIIII 定罪（12345 #54 单差）：(3845,1045) AshGrass(633) 顶 TreeAsh(634)
    //    ——vanilla CanKillTile false → PoundTile 返 false 不砸（WFProbe PH 3610
    //    PR=0 织入实证；JS 近似漏此腿砸出 half=1）。9293480 #53/#54 全绿 ⇒ 该腿
    //    在彼链零命中（回归护栏）。
    if (st.flags[up] && TREE_TRUNK.has(st.type[up]) && st.type[up] !== t
      && (st.frameX[up] !== 66 || st.frameY[up]! > 44)
      && (st.frameX[up] !== 88 || st.frameY[up]! < 66 || st.frameY[up]! > 110)
      && st.frameY[up]! < 198) return false;
  }
  const d = TILE_DEFS[t];
  // !framed ≈ CanKillTile 的框架物拦截（箱/罐/雕像等不可砸半砖）——CanKillTile 整体仍近似
  // tileSolid 走 GenSolid（同 solidTile：生成期翻转表）
  return genSolidType(t) && !!d && !d.platform && !d.framed;
}

/** 坡面(WorldGen.cs:81507 SlopeTile 的生成期路径):清 half、写 slope(0-4)。
 *  slope1=左高右低 / 2=右高左低 / 3=左低右高 / 4=右低左高 */
function slopeTile(st: TileStore, x: number, y: number, dir: number): boolean {
  swAct('S', x, y, dir);
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = 0;
  st.slope[i] = dir;
  return true;
}

/** WorldGen.TileEmpty（70037）：无活性格即空（生成期无 inActive 致动） */
function tileEmpty(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return true;
  return !st.flags[st.idx(x, y)];
}

/** WorldGen.SolidOrSlopedTile（70046）：active && tileSolid && !tileSolidTop（坡面算实心）
 *  && !inActive()（LLL 批同 solidTile 补致动腿——cs:70050-53 原文即有）。
 *  tileSolid 走 GenSolid（生成期翻转表,同 solidTile） */
export function solidOrSlopedTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  if (!st.flags[i]) return false;
  if (st.wire[i] & 0x20) return false; // cs:70052 !inActive()
  const d = TILE_DEFS[st.type[i]];
  return genSolidType(st.type[i]) && !!d && !d.platform;
}

/** Tile.SmoothSlope（1456 Tile.cs:822-880, applyToNeighbors=false 生成期路径,sync 段为联机略）：
 *  按四邻实心位形自整砖/半砖/坡面 1-4 推导。num 位序:上<<3 下<<2 左<<1 右。
 *  case10(上左)→slope3;case9(上右)→slope4;case6(下左)→slope1;case5(下右)→slope2;
 *  case4(仅下)→半砖;其余→整砖。
 *  导出供 DesertHive.PlaceClusters 后置 Smooth（DesertHive.cs:213-222 postEffectMap）
 *  与沙漠入口 Actions.Smooth 复用——坡面/半砖会改写后续 SolidTile 族门禁
 *  （AddTileVariance 酥化判定 + 485/484/187/165 摆放锚点），绝不可按
 *  「哈希无关副作用」省略（#19 残余 7448 act 的根因）。 */
export function smoothSlope(st: TileStore, x: number, y: number): void {
  const i = st.idx(x, y);
  if (!canPoundTile(st, x, y) || !solidOrSlopedTile(st, x, y)) return;
  const flag = !tileEmpty(st, x, y - 1);                                  // 上方有物
  const flag2 = !solidOrSlopedTile(st, x, y - 1) && flag;                 // 上方非实心
  const flag3 = solidOrSlopedTile(st, x, y + 1);                          // 下方实心
  const flag4 = solidOrSlopedTile(st, x - 1, y);                          // 左实心
  const flag5 = solidOrSlopedTile(st, x + 1, y);                          // 右实心
  const num = ((flag ? 1 : 0) << 3) | ((flag3 ? 1 : 0) << 2) | ((flag4 ? 1 : 0) << 1) | (flag5 ? 1 : 0);
  switch (num) {
    case 10: if (!flag2) { st.half[i] = 0; st.slope[i] = 3; } break;
    case 9:  if (!flag2) { st.half[i] = 0; st.slope[i] = 4; } break;
    case 6:  st.half[i] = 0; st.slope[i] = 1; break;
    case 5:  st.half[i] = 0; st.slope[i] = 2; break;
    case 4:  st.slope[i] = 0; st.half[i] = 1; break;
    default: st.half[i] = 0; st.slope[i] = 0; break;
  }
}

/** 砸半砖（1456 WorldGen.cs:81544 PoundTile 生成期路径）：切换 halfBrick 位。
 *  导出供蜂巢蜂蜜坠落凹槽（HiveBiome.CreateDentForHoneyFall）等 pass 复用 */
export function poundTile(st: TileStore, x: number, y: number): boolean {
  swAct('P', x, y, 0);
  if (!canPoundTile(st, x, y)) return false;
  const i = st.idx(x, y);
  st.half[i] = st.half[i] ? 0 : 1;
  if (st.half[i]) st.slope[i] = 0;
  return true;
}

/** 原版 pass "Smooth World"（1456 WorldGen.cs:16507-16687）：地表凸起 → 坡面/半砖/削除 */
export function runSmoothWorldPass(st: TileStore, rng: RNG, _gs: GenState): void {
  // ★pass 头 tileSolid 翻转（cs:16510 `SetCrackedBrickSolidity(solid: true)` →
  //   481/482/483 短暂回实心）：本仓 TILE_DEFS 已把 481-483 预翻为 solid:false
  //   （数据不可动）,GenSolid 可表达该 true 窗口——SmoothWorld 期间裂纹砖按实心处理,
  //   尾部 cs:16695 翻回 false（见函数尾）。
  flipGenSolid([481, 482, 483], true);
  const { w, h } = st;
  // —— 第一遍：主凸起模式（16511-16652）——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      (globalThis as { __swSWCell?: (x: number, y: number) => void }).__swSWCell?.(i, j);
      // 主门禁（1456 cs:16516）：本格与上格均"非活性 或 不在 PreventsSlopesDuringGeneration"
      const okSlope = (yy: number): boolean => {
        if (!st.inBounds(i, yy)) return true;
        const k = st.idx(i, yy);
        return !st.flags[k] || !T.PREVENTS_SLOPES.has(st.type[k]);
      };
      if (!okSlope(j) || !okSlope(j - 1)) continue;
      // 16518 复合门：上方空 && 左右邻非活性开关(136)。★悬顶 else-if 挂在本复合门
      //（vanilla cs:16638）——上格活性 **或** 136 邻活性都进悬顶掷骰段;曾误挂
      // 「仅上格活性」漏 136 邻分支的 Next(2) 掷。
      const noSwitchL = !T.SWITCH.has(st.type[st.idx(i - 1, j)]) || !st.flags[st.idx(i - 1, j)];
      const noSwitchR = !T.SWITCH.has(st.type[st.idx(i + 1, j)]) || !st.flags[st.idx(i + 1, j)];
      if (!st.flags[st.idx(i, j - 1)] && noSwitchL && noSwitchR) {
        // 上方无块：对凸起顶端做半砖/削除（16520 还要求 CanBeClearedDuringGeneration）
        if (solidTile(st, i, j) && !NOT_CLEARABLE.has(t)) {
          // 16520 旁格门 = `(!active || blockType()==0)`（Tile.cs:232 blockType 纯
          //  half/slope 不查 active）⇒ 非活性邻格**短路通过**（残坡/残半砖幽灵格
          //  不拦）——曾裸读 half/slope → 幽灵残坡邻格把整段凸起/立柱削除门误关
          //  （NOTRAPS #53 (1258,1016) 首差：vanilla 16594 立柱削除照跑/JS 被右侧
          //  幽灵 slope1 邻格拦截，尘 10 迭代零掷但状态差 → 后续掷流级联相移）。
          if (fullOrEmpty(st, i - 1, j) && fullOrEmpty(st, i + 1, j)) {
            if (solidTile(st, i, j + 1)) {
              // 模式 A（16526-16535）：左凸 → slope2/半砖；模式 B（16537-16546）：右凸 → slope1/半砖
              if (!solidTile(st, i - 1, j) && !st.half[st.idx(i - 1, j + 1)]
                && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
                && !st.flags[st.idx(i + 1, j - 1)]) {
                if (rng.int(0, 1) === 0) slopeTile(st, i, j, 2); else poundTile(st, i, j); // Next(2)==0
              } else if (!solidTile(st, i + 1, j) && !st.half[st.idx(i + 1, j + 1)]
                && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
                && !st.flags[st.idx(i - 1, j - 1)]) {
                if (rng.int(0, 1) === 0) slopeTile(st, i, j, 1); else poundTile(st, i, j); // Next(2)==0
              } else if (solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j + 1)
                && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i - 1, j)]) {
                // 孤立凸起（16548）：直接半砖
                poundTile(st, i, j);
              }
              // 悬空支脚削除 + 补坡（16552-16592）：先复检（可能已被 slope/pound 改形）
              if (solidTile(st, i, j)) {
                if (solidTile(st, i - 1, j) && solidTile(st, i + 1, j + 2)
                  && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i + 1, j + 1)]
                  && !st.flags[st.idx(i - 1, j - 1)]) {
                  killTile(st, rng, i, j); // KillTile（含尘掷）
                } else if (solidTile(st, i + 1, j) && solidTile(st, i - 1, j + 2)
                  && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i - 1, j + 1)]
                  && !st.flags[st.idx(i + 1, j - 1)]) {
                  killTile(st, rng, i, j); // KillTile（含尘掷）
                } else if (!st.flags[st.idx(i - 1, j + 1)] && !st.flags[st.idx(i - 1, j)]
                  && solidTile(st, i + 1, j) && solidTile(st, i, j + 2)) {
                  // 三路（16562-16576）：Next(5)==0 删 → Next(5)==0 半砖 → 否则 slope2
                  if (rng.int(0, 4) === 0) killTile(st, rng, i, j);
                  else if (rng.int(0, 4) === 0) poundTile(st, i, j);
                  else slopeTile(st, i, j, 2);
                } else if (!st.flags[st.idx(i + 1, j + 1)] && !st.flags[st.idx(i + 1, j)]
                  && solidTile(st, i - 1, j) && solidTile(st, i, j + 2)) {
                  // 镜像三路（16577-16591）：否则 slope1
                  if (rng.int(0, 4) === 0) killTile(st, rng, i, j);
                  else if (rng.int(0, 4) === 0) poundTile(st, i, j);
                  else slopeTile(st, i, j, 1);
                }
              }
            }
            // 顶部单格立柱（16594）：两侧皆空 → 删
            if (solidTile(st, i, j) && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i + 1, j)]) {
              killTile(st, rng, i, j);
            }
          }
        } else if (!st.flags[ti] && solidTile(st, i, j + 1)) {
          // 空位补角（16600-16639）：下方实心（151/274 不做材料）+ 单侧实心 → 补块 + slope/半砖
          const bi = st.idx(i, j + 1);
          const belowType = st.type[bi];
          if (!T.NO_FILL.has(belowType)) {
            if (!T.NO_FILL_SIDE.has(st.type[st.idx(i + 1, j)])
              && solidTile(st, i - 1, j + 1) && solidTile(st, i + 1, j)
              && !st.flags[st.idx(i - 1, j)] && !st.flags[st.idx(i + 1, j - 1)]) {
              // 16605：右邻 495（贝壳堆）→ 用右邻材料而非下方材料
              const mat = T.SHELL_495.has(st.type[st.idx(i + 1, j)]) ? st.type[st.idx(i + 1, j)] : belowType;
              swAct('T', i, j, mat);
              if (!T.PLACE_REFUSE.has(mat)) st.setTileSilent(i, j, mat);
              if (rng.int(0, 1) === 0) slopeTile(st, i, j, 2); else poundTile(st, i, j);
            }
            if (!T.NO_FILL_SIDE.has(st.type[st.idx(i - 1, j)])
              && solidTile(st, i + 1, j + 1) && solidTile(st, i - 1, j)
              && !st.flags[st.idx(i + 1, j)] && !st.flags[st.idx(i - 1, j - 1)]) {
              // 16626：左邻 495 → 用左邻材料
              const mat = T.SHELL_495.has(st.type[st.idx(i - 1, j)]) ? st.type[st.idx(i - 1, j)] : belowType;
              swAct('T', i, j, mat);
              if (!T.PLACE_REFUSE.has(mat)) st.setTileSilent(i, j, mat);
              if (rng.int(0, 1) === 0) slopeTile(st, i, j, 1); else poundTile(st, i, j);
            }
          }
        }
      } else if (!st.flags[st.idx(i, j + 1)] && rng.int(0, 1) === 0
        && solidTile(st, i, j) && solidTile(st, i, j - 1)
        // 旁格 blockType()==0（16642：整砖或非活性;half/slope 均须为 0）
        && fullOrEmpty(st, i - 1, j) && fullOrEmpty(st, i + 1, j)) {
        // 悬顶坡面（16642-16652）：下方空 + 上方实心 → 依左右实心出 slope3/4
        if (solidTile(st, i - 1, j) && !solidTile(st, i + 1, j) && solidTile(st, i - 1, j - 1)) {
          slopeTile(st, i, j, 3);
        } else if (solidTile(st, i + 1, j) && !solidTile(st, i - 1, j) && solidTile(st, i + 1, j - 1)) {
          slopeTile(st, i, j, 4);
        }
      }
    }
  }

  // —— 第二遍（16656-16687）：斜坡补坡 + 沙族 SmoothSlope + 无支撑坡面回落 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      const t = st.type[ti];
      // 主门禁（16661）：Next(2)==0 + 上方空 + 排除 137/48/232/191/151/274/75/76
      if (rng.int(0, 1) === 0 && !st.flags[st.idx(i, j - 1)] && !T.LOOP_B_SKIP.has(t)
        && solidTile(st, i, j)
        // 两侧检查仅针对 137 雕像（16661 原文只列 137;右侧是 (active || type!=137) 原版怪式）
        && (!T.STATUE.has(st.type[st.idx(i - 1, j)]) || !st.flags[st.idx(i - 1, j)])
        && (st.flags[st.idx(i + 1, j)] || !T.STATUE.has(st.type[st.idx(i + 1, j)]))) {
        if (solidTile(st, i, j + 1) && solidTile(st, i + 1, j) && !st.flags[st.idx(i - 1, j)]) {
          slopeTile(st, i, j, 2);
        }
        if (solidTile(st, i, j + 1) && solidTile(st, i - 1, j) && !st.flags[st.idx(i + 1, j)]) {
          slopeTile(st, i, j, 1);
        }
      }
      // 沙族平滑（16672-16675）：Conversion.Sand → Tile.SmoothSlope(applyToNeighbors=false)
      if (st.flags[ti] && T.SAND.has(t)) smoothSlope(st, i, j);
      // 无支撑坡面回落（16676-16685）：slope1 左侧悬空 / slope2 右侧悬空 → 复位再砸半砖
      if (st.slope[ti] === 1 && !solidTile(st, i - 1, j)) {
        slopeTile(st, i, j, 0);
        poundTile(st, i, j);
      }
      if (st.slope[ti] === 2 && !solidTile(st, i + 1, j)) {
        slopeTile(st, i, j, 0);
        poundTile(st, i, j);
      }
    }
  }
  // ★pass 尾 tileSolid 翻转族（cs:16692-16695,逐条 1:1）：
  //   137=true   还原 JungleShrines 尾（cs:16212）的翻非实心
  //   190=false  荧光菇块自此非实心（Piles 尾 cs:19591 还原）
  //   192=false  活树叶翻回非实心（沙上清水 cs:16324 曾短暂翻 true）
  //   481/482/483=false  裂纹砖翻回非实心（本 pass 头 cs:16510 曾翻 true）
  flipGenSolid([137], true);
  flipGenSolid([190, 192], false);
  flipGenSolid([481, 482, 483], false);
}

/** 原版 pass "Waterfalls"（WorldGen.cs:7697-7743）：水边唇缘砸半砖（瀑布触发的来源） */
export function runWaterfallLipPass(st: TileStore, rng: RNG, _gs: GenState): void {
  // IIIII：#54 单格定罪探针（与 vanilla WFProbe 织入逐行对拍；无钩零开销）
  const __wf = (globalThis as { __swWfLog?: (s: string) => void }).__swWfLog;
  // ★pass 头 tileSolid 翻转（cs:16702 `Main.tileSolid[191] = false`）——活木非实心,
  //   pass 尾 cs:16753 还原 true（见函数尾）。
  flipGenSolid([191], false);
  const { w, h } = st;
  // ★cs:16702 `Main.tileSolid[191] = false`：本 pass 期间活木(191)视为非实心（否则
  //   活木会被当实心水边唇缘砸半砖）——原为 pass 内局部 NON_SOLID 表,已迁移到
  //   GenSolid 统一翻转（pass 尾 cs:16753 还原 true）。solidTile 本身已读 GenSolid,
  //   此处直接用 solidWF = solidTile。
  const solidWF = (x: number, y: number): boolean => solidTile(st, x, y);
  // cs:16723-16726 特判素材：75=黑曜石砖 / 76=狱石砖——旁水唇缘砸半砖前 1/10 才放行
  const OBSIDIAN_HELL = idsByVanillaSheet(75, 76);
  // —— 第一遍（L7701-7723）：实心顶格、左右空、侧旁有水 → 砸半砖 ——
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      if (!solidWF(i, j)) continue;
      const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
      // cs:16709:左右邻须 !active(曾误用 type!==0 → 幽灵格侧邻漏砸半砖)
      if (st.flags[li] !== 0 || st.flags[ri] !== 0) continue;
      if (!solidWF(i, j + 1)) continue;
      if (st.liquid[li] === 0 && st.liquid[ri] === 0) continue;
      // 上方 8-20 格内已有半砖则跳过（原版防连续砸穿）；
      // 掷骰 = genRand.Next(8,20) ×2（8+trunc(Sample*12) 与 Next(8,20) 同分布同流位）
      // ★cs:16719 判据 = active() && halfBrick() 双门——幽灵格（失活但 half 残留 1）
      // 不算（曾只查 half → 12345 (3845,1045) 窗内幽灵半砖误拦砸击 = #54 Hf=1 单差）
      let flag = true;
      const num3 = 8 + Math.floor(rng.next() * 12), num4 = 8 + Math.floor(rng.next() * 12);
      for (let k = j - num3; k <= j + num4; k++) {
        if (k >= 0 && k < h) {
          const ki = st.idx(i, k);
          if (st.flags[ki] !== 0 && st.half[ki]) flag = false;
        }
      }
      // ★cs:16723-16726 `(type==75||type==76) && Next(10)!=0` → flag=false：
      //   黑曜石/狱石砖旁的唇缘只有 1/10 概率被砸半砖。&& 左短路——仅 75/76 格
      //   才掷 Next(10)；原版此处不查 flag 状态，即使 flag 已 false 也掷（保流位）
      const obRoll = OBSIDIAN_HELL.has(st.type[ti]) ? rng.nextInt(10) : -1;
      if (obRoll >= 0 && obRoll !== 0) flag = false;
      if (flag) { const pok = poundTile(st, i, j); __wf?.(`P1 ${i},${j} ok=${pok ? 1 : 0} n3=${num3} n4=${num4} ob=${obRoll}`); }
      else __wf?.(`C ${i},${j} f=0 n3=${num3} n4=${num4} ob=${obRoll}`);
    }
  }
  // —— 第二遍（L7725-7741）：唇缘向相邻实心格扩展半砖 ——
  // ★cs:16733-16740 半砖邻格判 = active() && halfBrick() 双门（幽灵半砖不触发），
  //   曾只查 half → 失活残留半砖误触发扩展砸击
  for (let i = 20; i < w - 20; i++) {
    for (let j = 20; j < h - 20; j++) {
      const ti = st.idx(i, j);
      if (!solidWF(i, j) || !solidWF(i, j + 1)) continue;
      const li = st.idx(i - 1, j), ri = st.idx(i + 1, j);
      if (!solidWF(i + 1, j) && st.flags[li] !== 0 && st.half[li] && st.liquid[st.idx(i - 2, j)] > 0) {
        const pok = poundTile(st, i, j); __wf?.(`P2 ${i},${j} ok=${pok ? 1 : 0}`);
      }
      if (!solidWF(i - 1, j) && st.flags[ri] !== 0 && st.half[ri] && st.liquid[st.idx(i + 2, j)] > 0) {
        const pok = poundTile(st, i, j); __wf?.(`P2 ${i},${j} ok=${pok ? 1 : 0}`);
      }
    }
  }
  // ★pass 尾还原（cs:16753 `Main.tileSolid[191] = true`）
  flipGenSolid([191], true);
}
