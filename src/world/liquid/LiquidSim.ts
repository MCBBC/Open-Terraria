// 液体模拟：Terraria 1.4.5.6（Terarria1456/Terraria/Liquid.cs）一比一移植。
// 核心结构（对照原版行号）：
//  - 活动液体列表 liquids[{x,y,kill,delay}] + checkingLiquid/skipLiquid 位图（Liquid.cs:37-40）
//  - UpdateLiquid() 分片调度 + kill 清扫（Liquid.cs:691-833）
//  - Update() 单格流程：实心格/地狱蒸发/岩浆蜂蜜降速与交互/下灌/侧向均流/kill 维护（Liquid.cs:298-674）
//  - LavaCheck/HoneyCheck：水+岩浆→黑曜石(56)、岩浆+蜂蜜→脆蜂蜜块(230)、水+蜂蜜→蜂蜜块(229)（Liquid.cs:888-1115）
//  - QuickWater/SettleWaterAt 读档沉降搬运（Liquid.cs:85-212）+ WaterCheck 重建列表（1456 WorldGen.cs:81154-81225 / 1457 :81692-81763）
// liquidType 编码沿用本仓库 store 约定：1=水 2=岩浆 3=蜂蜜 4=微光（原版 0/1/2/3）。
//  微光语义（1456 Liquid.cs，liquidType 4）：
//  - 流动性与水完全一致（无岩浆/蜂蜜的 delay 降速），Update 分支 Liquid.cs:543-565
//  - 交互表（GetLiquidMergeTypes Liquid.cs:1385-1453）：微光 + 水/岩浆/蜂蜜 任一 →
//    Aetherium 块 659；岩浆/蜂蜜遇微光同样 → 659（shimmer 优先级最高，后写覆盖）
//  - DelWater 尾部 shimmerCheck（Liquid.cs:1576-1579）、SettleWaterAt 落地
//    AttemptToMoveShimmer（Liquid.cs:285/386-432）
//  - 生成期 QuickWater 首尾 ShimmerRemoveWater（Liquid.cs:107/137 + WorldGen.cs:34859）：
//    以太腔 150 半径内清除非微光液体，防沉降期水/岩浆灌入把微光转化成 Aetherium
// 偏离原版处（无法直译的周边系统，均有注释标注）：
//  - tilesIgnoreWater 的 boulder/树 tile 动态固态（379/546/10 等）：无对应系统
//  - 交互落块的 ReplaceTile 掉落/PlayLiquidChangeSound 走 Game 注入钩子
//    （killTile=掉落+帧刷新；liquidChangeSound=音效；NetMessage 广播=多人层未接）
//  - 生成/读档期（isGeneratingOrLoadingWorld）不落块：CreateLiquidMergeTile 走
//    LiquidOverwriteStrip 分支（Liquid.cs:1359-1377），运行期才 ReplaceTile+PlaceTile
//  - DelWater 尾 CheckAlch/睡莲(518)：已 1:1（WorldGen.CheckAlch/CheckLilyPad）；
//    SquareTileFrame 帧刷新分支为无操作（本仓库帧由渲染期派生）
// 1456 对齐修正（相对旧 1.4.0.5 移植）：banker's rounding（C# Math.Round），
// 蜂蜜交互阈值 32→24（LiquidCheck 统一），AddWater/WaterCheck 的水死/岩浆死表
// （Main.cs:7182+ 提取），panic 模式（Liquid.cs:1040-1070），岩浆 3×3 烧草精确 type 映射
import { TILE_DEFS, TILE_BY_KEY } from '../../data/tiles';
import { UnifiedRandom } from '../../core/rng';
import type { World } from '../World';
import type { RNG } from '../../core/rng';
import { genSquareTileFrame } from '../gen/vanilla/FinalCleanupPass';
import { genSolidType } from '../gen/vanilla/GenSolid';

interface LiquidEntry { x: number; y: number; kill: number; delay: number; }

const OBSIDIAN = TILE_BY_KEY['obsidian'];
const HONEY_BLOCK = TILE_BY_KEY['v_229_honey_block'];
const CRISPY_HONEY = TILE_BY_KEY['v_230_crispy_honey_block'];
const AETHERIUM = TILE_BY_KEY['v_659_aetherium_block'];
const THIN_ICE = TILE_BY_KEY['thin_ice'];

/** C# Math.Round = banker's rounding（.5 取偶；JS Math.round 是四舍五入）——1456 均
 *  分全程使用，直接换 Math.round 会在 x.5 时偏离 1 */
function csRound(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

import { TILE_OBJECT_DEATH, type TodEntry } from './tile-object-death-table';
/** Main.tileWaterDeath 表（Main.cs:7182-7240 区段提取，vanilla tile id） */
const WATER_DEATH_SHEETS = new Set([215, 4, 51, 697, 93, 98, 552, 405, 646, 372]);
/** Main.tileLavaDeath 表（Main.cs 同区段，vanilla tile id） */
const LAVA_DEATH_SHEETS = new Set([630, 631, 571, 579, 591, 538, 544, 629, 550, 551, 533, 553, 554, 555, 556, 558, 559, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 632, 640, 643, 644, 645, 710, 568, 569, 570, 580, 582, 619, 620, 572, 560, 564, 567, 565, 654, 529, 530, 705, 484, 3, 5, 10, 11, 12, 13, 14, 469, 486, 488, 704, 487, 489, 490, 15, 497, 16, 17, 18, 19, 24, 27, 28, 29, 32, 33, 34, 35, 36, 42, 49, 50, 707, 51, 697, 52, 55, 61, 703, 62, 69, 655, 71, 72, 73, 74, 79, 80, 81, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 100, 101, 102, 103, 104, 106, 110, 113, 115, 125, 126, 128, 149, 172, 173, 174, 184, 201, 205, 209, 210, 212, 213, 353, 215, 216, 217, 218, 219, 642, 220, 227, 228, 233, 236, 702, 238, 240, 241, 242, 243, 244, 245, 246, 247, 254, 269, 270, 271, 581, 698, 660, 275, 413, 276, 277, 278, 279, 280, 281, 282, 283, 285, 286, 287, 288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 532, 316, 317, 318, 319, 354, 355, 699, 499, 323, 335, 338, 339, 528, 636, 352, 382, 425, 453, 456, 463, 464, 465, 485, 511, 510, 547, 548, 552, 573, 621, 622, 623, 624, 700, 656, 701, 493, 395, 520, 471, 405, 406, 452, 457, 454, 494, 387, 386, 388, 389, 646, 372, 639, 668, 324, 427, 390]);
/** 岩浆 3×3 烧除（1456 DelWater L1557+）：草族 tile → 空气；蘑菇草族 → 泥土 */
const LAVA_BURN_TO_AIR = new Set([2, 23, 109, 199, 477, 492]);
const LAVA_BURN_TO_DIRT = new Set([60, 70, 661, 662]);
/** Main.tileObsidianKill（Main.cs:8214-8259）= tileLavaDeath 全表 ∪ 附加表 − {88}：
 *  交互落块时"可被黑曜石顶掉"的 tile（火把/植物/草药/幼虫/丛林蜥蜴祭坛石等）。
 *  旧实现按 decor 近似——decor 不含 lavaDeath 全表（门/宝箱顶的实心格反而该拒绝） */
const OBSIDIAN_KILL_EXTRA_SHEETS = new Set([546, 77, 78, 82, 83, 84, 85, 105, 129, 132, 133, 134, 135, 136, 139, 165, 178, 185, 186, 187, 231, 337, 349, 506, 314]);
/** Main.tileCut 全表（Main.cs 逐条提取）：情形 B"下方裁切植物"在合并门之前先 KillTile 掉落
 *  （Liquid.cs:1289-1295）——掉落语义，不是单纯清格 */
const CUT_SHEETS = new Set([654, 518, 519, 549, 529, 637, 231, 484, 711, 201, 3, 24, 28, 32, 51, 52, 61, 62, 69, 655, 71, 73, 74, 82, 83, 84, 110, 113, 115, 184, 205, 352, 382, 528, 636, 638, 444, 485, 454, 254, 236]);
/** TileID.Sets.IsAContainer（TileID.cs:405）：情形 B 的"上方是容器而下方不是"放行标志 */
const CONTAINER_SHEETS = new Set([21, 467, 88]);
/** Main.tileAlch（Main.cs:7755-7757）：DelWater 尾 CheckAlch 的草药族 */
const ALCH_SHEETS = new Set([82, 83, 84]);
/** CheckAlch 各生长阶段（frameX/18）可依附的下方泥土 sheet（WorldGen.cs:45994-46102 switch 表） */
const ALCH_SOIL_SHEETS: Array<Set<number>> = [
  new Set([109, 2, 477, 492, 78, 380]),            // case 0：草族/泥土 + 花盆/Planter
  new Set([60, 78, 380]),                          // case 1：蘑菇草
  new Set([0, 59, 78, 380]),                       // case 2：空气/泥 + 花盆
  new Set([661, 662, 199, 203, 23, 25, 78, 380]),  // case 3：猩红/腐化草
  new Set([53, 78, 380, 116]),                     // case 4：沙族
  new Set([57, 633, 78, 380]),                     // case 5：雪族
  new Set([78, 380, 147, 161, 163, 164, 200]),     // case 6：冰族
];
/** CheckLilyPad 水底泥土 sheet → 睡莲 frameY 行（WorldGen.cs:59251-59259；
 *  原版 109 写两次属上游笔误，此处补 116 保持集合语义） */
const LILY_FLOOR_ROWS: Array<[Set<number>, number]> = [
  [new Set([2, 477]), 0],
  [new Set([109, 116]), 18],
  [new Set([60]), 36],
];
/** solid∧solidTop∧非平台族（CheckLilyPad 59305 kill 支;Main.cs:9798/9800） */
const LILY_SOLIDTOP_KILL = new Set([239, 380]);

// ── KillTile 尘粒掷骰族（与 HalfBrickPass U 批同源表；原版 sheet id 键）────────
// 原版 KillTile(i,j)（cs:63747-63751）每次击杀调 KillTile_GetTileDustAmount（cs:66654）
// × KillTile_MakeTileDust（cs:66744）——部分 tile type 的尘型选择掷 genRand
//（633 草灰岩 Next(6)/草族与 583-589 等各 1 掷/634 两掷）。生成期 isGeneratingOr
// LoadingWorld=true 时 Dust.NewDust 早退（Dust.cs:89 零掷）但**掷骰在 NewDust
// 之前**、尘段无 netMode 门 → 掷骰恒占用 genRand 流位（= pass 链流，gen 期
// Main.rand≡genRand 同对象）。沉降期 KillTile 族（#97 vanilla 实测 844 格：
// 藤62/丛草植物61/蛛网51/苔藓184/陶罐28/69/233/12/83/84/火把4）尘掷本身为 0，
// 唯一实掷 = 蛛网51带蜘蛛墙62 的 Next(4)（cs:63904）。
/** KillTile_GetTileDustAmount(fail=false)（cs:66654-66742；-1=按 frameX/22>=5 取 5:10） */
const KILL_DUST_ZERO_SHEETS = new Set([654, 630, 631, 125, 138, 172, 287, 300, 301, 302, 303, 304, 305, 306, 307, 308, 354, 355, 373, 374, 375, 376, 461, 484, 499, 564, 565, 593, 594, 617, 664, 665, 699, 709, 711, 712, 713, 714, 715, 716]);
const KILL_DUST_FIVE_SHEETS = new Set([534, 536, 539, 625, 627]);
function killDustAmount(sheet: number): number {
  if (KILL_DUST_ZERO_SHEETS.has(sheet)) return 0;
  if (sheet === 231) return 6;
  if (sheet === 481 || sheet === 482 || sheet === 483) return 3;
  if (sheet === 541) return 1;
  if (sheet === 549) return 2;
  if (KILL_DUST_FIVE_SHEETS.has(sheet)) return 5;
  if (sheet === 184) return -1; // frameX/22>=5 ? 5 : 10
  return 10;
}
/** KillTile_MakeTileDust 每次调用的掷骰数（cs:66744-69226 的 genRand 位点；
 *  掷值只影响尘型不影响世界状态 → 统一以 nextInt(6) 占位（流位等价，U 批实证） */
const KILL_DUST_ONE_ROLL_SHEETS = new Set([23, 24, 661, 25, 27, 32, 2, 477, 109, 492, 204, 478, 58, 76, 77, 684, 633, 641, 370, 171, 238, 231, 352, 583, 584, 585, 586, 587, 588, 589, 595, 596, 615, 616, 385, 34, 42]);
function killDustRollsPer(sheet: number, frameX: number): number {
  if (sheet === 634) return 2; // Next(10)+Next(12)（cs:67125-67126）
  if (sheet === 31 || sheet === 696) return frameX < 36 ? 1 : 0; // cs:69020
  if (sheet === 26 || sheet === 695) return frameX < 54 ? 1 : 0; // cs:69026
  if (sheet === 35) return frameX < 36 ? 1 : 0;                   // cs:69064
  return KILL_DUST_ONE_ROLL_SHEETS.has(sheet) ? 1 : 0;
}
/** 内部 tile id → 原版 sheet id（尘掷族表键；-1=无映射，走 default 档） */
const SHEET_OF = new Int32Array(TILE_DEFS.length).fill(-1);
for (let q = 0; q < TILE_DEFS.length; q++) {
  const s = TILE_DEFS[q]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[q] = s;
}
/** PlatformProperTopFrame（cs:70197）：帧列号 ∈[0,7]∪[12,16]∪[25,26]
 *  （Check1xXGen 地基锚的平台特例用；TrapsPass 同款副本） */
function platformProperTopFrameL(fx: number): boolean {
  const num = Math.floor(fx / 18);
  if ((num < 0 || num > 7) && (num < 12 || num > 16)) {
    if (num >= 25) return num <= 26;
    return false;
  }
  return true;
}

/* ── gen 期 KillTile 尾 SquareTileFrame 锚点级联 ──────────────────────────────
 * XXXXX 批（2026-08-20）改派 FinalCleanupPass 引擎后，本模块的私有四臂副本
 * （Check2x2/CheckSuper/CheckStalactite，YYY/DDDD 批）与配套常量退役；CheckBanner
 * 臂因 FCP 引擎缺 case 91 以 checkBannerGen 前置扫保留。历史机制注记见
 * docs/worldgen/content-parity-vs-vanilla-2026-08-16.md（YYY/DDDD/XXXXX 批三章）。 */

/** TileID.Sets.NotReallySolid（TileID.cs:355，sheet id）——CheckBanner 锚门的
 *  排除族（开门10/高门387/闸门388） */
const NOT_REALLY_SOLID_SHEETS = new Set([387, 388, 10]);
/** ★VVV 批：Check1x2Top 坐具族（cs:87107 派发 case 表——椅42/金椅270/银椅271/
 *  王座座族572/浴桶581/金马桶660；698=死亡展示罐走绳锚特支）。FCP 引擎缺该臂，
 *  按 CheckBanner/check1xXGen 前置扫惯例在 LiquidSim 就地实现。 */
const CHECK_1X2TOP_SHEETS = new Set([42, 270, 271, 572, 581, 660, 698]);
/** Main.tileRope（绳索族，sheet id）：锚支仅 698 用（本世界地狱域无罐，惰性） */
const ROPE_SHEETS = new Set([77, 213]);

export class LiquidSim {
  world: World;
  /** 活动液体条目（原版 Main.liquid[]，dense 数组 + swap-remove） */
  private liquids: LiquidEntry[] = [];
  /** 联机变化格收集（原版 Liquid.NetSendLiquid 的 sink 形态——AddWater/DelWater
   *  两时刻记格，Liquid.cs:1189/:1583；null=单机/访客（不模拟）零开销）。
   *  60ms 节流上报见 net/syncModules.ts module0 注 */
  netChangeSink: ((x: number, y: number) => void) | null = null;
  /** 诊断观察钩：3 格均分晋升掷触点（UUU 批液体域定罪用；生产恒 undefined） */
  r30Trace?: (x: number, y: number, v: number, num1: number, lq: number, rq: number, self: number) => void;
  /** UUU 批：模块级 R30 触点槽——settle 内部新建 sim 实例也能被探针捕获 */
  static r30Sink: ((x: number, y: number, v: number, num1: number, lq: number, rq: number, self: number) => void) | null = null;
  /** WWWWWWW 批：盒内逐 Update 分支签名迹（与 rig SW_TRKBOX 同位标；生产 null 关闭零开销） */
  static trkProbe: ((iter: number, x: number, y: number, sig: number, amtA: number, ltyA: number, kill: number, delay: number, pre: { amt: number; lty: number }) => void) | null = null;
  static trkBox: { x0: number; x1: number; y0: number; y1: number } | null = null;
  /** 当前迭代号（包装层在调用 updateLiquid 前写入；迹数值仅作参考，对拍按出现序） */
  static trkIterCur = 0;
  /** ★IIIII70b 取证钩：SettleWaterAt 落点写回盒内观察（drunk #49 反演；生产恒 null
   *  零开销）——记 (origin→落点, 携带量/类型/下落标志)，盆域写入审计用 */
  static settleProbe: ((phase: string, ox: number, oy: number, x: number, y: number, amt: number, lty: number, fell: boolean, wall: number) => void) | null = null;
  static settleBox: { x0: number; x1: number; y0: number; y1: number } | null = null;
  /** ★IIIII70b：SettleWaterAt 全量事件流（S=入场携带/L=落点写回，与 x86 rig
   *  SW_SETLLOG 同格式同序——首分叉逐行对拍用；生产恒 null 零开销） */
  static settleEv: ((kind: 'S' | 'L', tag: string) => void) | null = null;
  // ★IIIII84 刀②：UpdateLiquid 尾盒迹回调（SW_LIQBOX 对照；缺省 null 零开销）
  static liqBoxSink: ((st: unknown) => void) | null = null;
  /** 微观测辅助（仪具注入：trOn+trX/trY 指定观测 origin；trSeq 步进计数） */
  static trOn = false;
  static trX = -1;
  static trY = -1;
  static trSeq = 0;
  private inSettleBox(x: number, y: number): boolean {
    const b = LiquidSim.settleBox;
    return b !== null && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }
  private trkSig = 0;
  private preAmt = 0;
  private preLty = 0;
  private inTrkBox(x: number, y: number): boolean {
    const b = LiquidSim.trkBox;
    return b !== null && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  }
  numLiquid = 0;
  /** tile.checkingLiquid / tile.skipLiquid 位图 */
  private checking: Uint8Array;
  private skip: Uint8Array;
  /** 调度参数：默认 10 = Liquid 静态初值/ReInit 态（Liquid.cs:24 `cycles = 10`——
   *  生成期 Reset 调 ReInit 维持 10；WorldGen.cs:11242）。运行期由 Main.cs:12240-43
   * 画质档改写（单机高质量 17-10*1=7）——Game 构造后调 setRuntimeCycles()。
   * ★曾默认 7：生成期沉降轮分片错序（每 7 次一全量片 vs 原版每 10 次）→
   * round0 更新次序/侧流事件全漂移（#97 x86 实证 wc 后首分叉） */
  private cycles = 10;
  private curMaxLiquid = 25000;
  /** kill 阈（单机 8;服务器 10+玩家/3,applyServerTuning 刷新——Liquid.cs:995/1008） */
  private serverKillThreshold = 8;
  private wetCounter = 0;
  /** 读档沉降：quickSettle=true 时 cycles=1 全量处理、下灌快速补满（WorldFile.cs:365-389 / Main.cs:12251） */
  quickSettle = false;
  private quickFall = false;
  private stuck = false;
  private stuckCount = 0;
  private stuckAmount = 0; // 原版 ReInit 置 0（Liquid.cs:69）
  private disposed = false;
  /** LiquidBuffer 溢出缓冲（Liquid.cs:840-843 入队 / 799-807 清扫轮回灌，上限 49998）。
   *  LiquidBuffer.cs 逐行镜像：AddBuffer 尾接（!checkingLiquid 门）/ DelBuffer(0)
   *  swap-remove（num--; buf[0]=buf[num]——尾元素补头位，非 FIFO）。★DDDDD 批
   *  （2026-08-19）：m 链（中世界）r0 唤醒链把活动列表顶到 curMaxLiquid-1=24999，
   *  缓冲器首次介入（maxBuf=1535）——曾用 head/tail 环形 FIFO + 回灌量=空余量
   *  min(curMax-numLiquid, bufLen)，与原版（回灌量=当前活动数 numLiquid，
   *  cs:1134 恒等式 curMaxLiquid-(curMaxLiquid-numLiquid)，1405/1456 双版一致；
   *  DelBuffer swap-remove 出序 A,C,B…）双重错位 → 回灌时序整体漂移 → 全图湖面
   * 蝴蝶薄膜高度差（#49 L=11707 全部 475 条单行薄膜带，小世界缓冲从不介入故全绿）。
   *  swap-remove O(1) 无需压缩——O(n²) 热点教训照旧成立 */
  private static readonly BUFFER_CAP = 49998;
  private bufX = new Int32Array(LiquidSim.BUFFER_CAP);
  private bufY = new Int32Array(LiquidSim.BUFFER_CAP);
  private bufCount = 0;  // LiquidBuffer.numLiquidBuffer
  /** 实心判定 LUT(热路径查表替代 TILE_DEFS 属性链;定义同源=构造时用原判定式逐 id 预计算):
   *  solidNP[id]=solid&&!platform(blocksLiquid/addWater/waterCheck 用);
   *  solidFull[id]=solid&&!platform&&!half&&!slope(solidTileFull 用) */
  private solidNP!: Uint8Array;
  private solidFull!: Uint8Array;
  /** 水死/岩浆死内部 tile id 集（Main.tileWaterDeath/tileLavaDeath 经 sheet 反查） */
  private readonly waterDeathIds: Set<number>;
  private readonly lavaDeathIds: Set<number>;
  /** TileObjectData 死亡真值表（内部 id → [lavaDeath,waterDeath]|null(=glob 回退)） */
  private readonly todDeath: Map<number, [boolean, boolean] | null> = new Map();
  private readonly lavaBurnAirIds: Set<number>;
  private readonly lavaBurnDirtIds: Set<number>;
  /** Main.tileObsidianKill（sheet 反查；lavaDeath ∪ 附加 − 88） */
  private readonly obsidianKillIds: Set<number>;
  /** Main.tileCut / IsAContainer / tileAlch（sheet 反查） */
  private readonly cutIds: Set<number>;
  private readonly containerIds: Set<number>;
  private readonly alchIds: Set<number>;
  private readonly alchSoilIds: Array<Set<number>>;
  /** 草药三态（sheet 82/83/84）与睡莲（518）内部 id——DelWater 尾复查用 */
  private readonly herbSproutId: number;
  private readonly herbMatureId: number;
  private readonly herbBloomId: number;
  private readonly lilyPadId: number;
  /** 液体冲毁方块（原版 AddWater 尾 KillTile）：Game 注入 breakTile（掉落+帧刷新） */
  killTile: ((x: number, y: number) => void) | null = null;
  /** 生成管线 pass 链掷骰钩（WorldGenerator.cs:497 pass 头 Main.rand=new UR(seed)，
   *  gen 期 genRand≡Main.rand 同对象）：gen 模式沉降的 254→255 Next(30)（Liquid.cs:898）
   *  与 KillTile 尘掷族必须走 pass 链——vanilla #97 SettleLiquidsAgain 沉降自身耗掷
   *  55,987（passchain stream 定标）。null=私有 mulberry32（运行期/读档兼容路径，
   *  掷值不回流 pass 链——pass 头重播掩盖，不跨界传染） */
  passRand: ((max: number) => number) | null = null;
  /** XXXXX 批：级联帧引擎（genSquareTileFrame）的掷骰源——与 passRand 同一 RNG
   *  实例（settleWorldLiquids 同时接线；int/nextInt/next 均逐样本同流）。null=
   *  私有流路径（运行期/读档兼容），引擎 ctx.rng=undefined → 掷骰占位为 0 值 */
  passRng: RNG | null = null;
  /** 泥块（lava 3×3 烧除 60/70/661/662 → 59 的写入目标，cs:1562） */
  private readonly mudId: number;
  /** 交互落块音效（WorldGen.PlayLiquidChangeSound Liquid.cs:1379）：Game 注入；
   *  参数 = (x, y, thisLiquidType, mergeType)（本仓库液体编码 1水/2岩浆/3蜂蜜/4微光） */
  liquidChangeSound: ((x: number, y: number, thisType: number, mergeType: number) => void) | null = null;
  /** WorldGen.isGeneratingOrLoadingWorld（WorldGen.cs:11089 / WorldFile.cs:738）：
   *  世界生成期与读档沉降期为 true——CreateLiquidMergeTile 走 LiquidOverwriteStrip
   *  分支不落块；运行期（Game.liquid）保持 false 走 ReplaceTile+PlaceTile。
   *  由 settle.ts 按模式置位 */
  isGeneratingOrLoadingWorld = false;
  /** LiquidCheck 的 createMergeTilesDuringGen（WorldGen.cs:22647 生成收尾全图检查用）：
   *  生成期常规交互不落块，唯独收尾那次允许落块 */
  private createMergeTilesDuringGen = false;
  /** 确定性随机（原版 3 格分支用 WorldGen.genRand 而非 Main.rand——Liquid.cs:639。
   *  ★R8-20:运行期回退流 = UnifiedRandom(world.seed) 专用持久流（vanilla 运行期
   *  UpdateLiquid 挂 SwapRandom("UpdateLiquid") → Main.cs:3300-3311 每会话一建
   *  `new UnifiedRandom(Seed)` 只被本 pass 消费;读档沉降原版吃全局 Main.rand,
   *  本仓无全局流,同用本流——登记偏差）。曾用 mulberry32=与 vanilla 流位不同构 */
  private runtimeRand: UnifiedRandom | null = null;
  private genRand(): number {
    if (!this.runtimeRand) this.runtimeRand = new UnifiedRandom(this.world.seed);
    return this.runtimeRand.nextDouble();
  }

  /** genRand.Next(max)（Liquid.cs:898 / KillTile 尘掷族）：pass 链钩优先，
   *  缺省回退种子派生 UnifiedRandom 专流（R8-20） */
  private roll(max: number): number {
    if (this.passRand) return this.passRand(max);
    return Math.floor(this.genRand() * max);
  }

  /** 生成/读档期 KillTile（cs:63559 生成路径：noItem=true 无掉落掷；尘段无
   *  netMode 门恒跑——Dust.NewDush 在 isGeneratingOrLoadingWorld 下早退零副作用，
   *  仅掷骰占流位；active(false)+type=0 清格，液体保留）。grid 语义与
   *  HalfBrakePass/TileCleanupPass 的生成期 killTile 同口径（setTileSilent） */
  private killTileGen(x: number, y: number): void {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return;
    const i = this.idx(x, y);
    if (!st.flags[i]) return; // cs:63574 !active() 早退
    // YYYYY 批：杀事件探针钩（x86 KT 织入对拍用；未注册零开销）
    (globalThis as { __swLqKill?: (x: number, y: number, sheet: number, fx: number, fy: number, liq: number, lty: number) => void })
      .__swLqKill?.(x, y, SHEET_OF[st.type[i]] ?? -1, st.frameX[i] ?? 0, st.frameY[i] ?? 0, st.liquid[i], st.liquidType[i]);
    const sheet = SHEET_OF[st.type[i]] ?? -1;
    // cs:63904：蛛网(51)带蜘蛛墙(62) → Next(4)（结果只改 noItem，生成期本就 true）
    if (sheet === 51 && st.wall[i] === 62) this.roll(4);
    const n = killDustAmount(sheet);
    const amt = n === -1 ? (st.frameX[i] / 22 >= 5 ? 5 : 10) : n;
    const per = killDustRollsPer(sheet, st.frameX[i]);
    for (let k = 0; k < amt; k++) for (let r = 0; r < per; r++) this.roll(6);
    // cs:63941：地狱石(58) 击杀于 UnderworldLayer(=h-200) 之下 → 灌岩浆 128
    if (sheet === 58 && y > st.h - 200) { st.liquid[i] = 128; st.liquidType[i] = 2; }
    st.setTileSilent(x, y, 0);
    // cs:63947 尾 SquareTileFrame(i,j)：3×3 TileFrame 锚点级联（YYY 批，见
    // CHECK2X2_SHEETS 总注）——巨石族 Check2x2 / 485 CheckSuper 整组拆除
    this.squareTileFrameGen(x, y);
  }

  /** KillTile 分发：运行期走 Game 注入钩子（掉落+帧刷新）；生成/读档沉降期
   *  （钩子缺位）走 killTileGen——原版 WaterCheck(:81172-81187 死亡表击杀)/
   *  LiquidCheck(:1288-1295 非水本格+下方裁切植物)/CreateLiquidMergeTile(:1370)
   *  三条触发链在沉降期同样生效（#97 vanilla 实测 KillTile 844 格） */
  private killTileAt(x: number, y: number): void {
    if (this.killTile) { this.killTile(x, y); return; }
    if (this.isGeneratingOrLoadingWorld) this.killTileGen(x, y);
  }

  /* ── KillTile 尾 SquareTileFrame 锚点级联 ────────────────────────────────────
   * XXXXX 批（2026-08-20）：整段改派 FinalCleanupPass 引擎（genSquareTileFrame
   * 纯导出——cs:80924/82067/85703 全量 TileFrameImportant 分派）。旧私有四臂
   * 副本（Check2x2/CheckSuper/CheckStalactite/CheckBanner，YYY/DDDD 批）退役：
   *  #97 二次沉降 x86 织入对拍实证——wcfirst 首差掷 25 vs JS 2，缺的 23 掷即
   *  引擎级 TileFrameImportant 分支：case 184 苔藓芽**每帧恒掷 Next(3)**（cs:85948，
   *  帧值可弃但流位必占——旧副本零臂）+ PlantCheck（3/24/61/71/73/74/110/113/
   *  201/637/703 支撑亡杀——cs:85990）/ CheckOrb（12/31/639/696 完整性——cs:85990，
   *  生命水晶堆叠对坍塌）/ CheckAlch（82/83/84 药草锚亡杀）/ CheckJunglePlant
   *  （233/236/238/702）等在场成员杀链。掷走 ctx.rng=passRng（pass 链流，
   *  genRand≡Main.rand 同对象）。
   *  与 HalfBrickPass.ts 的 UUU 批副本同源惯例终止：引擎单源多消费端
   *  （FrameOutAllHiveContents/DeadMansChest 同入口），副本漂移面归零。
   *  ★case 91 旗帜：FCP 引擎缺该臂（无 checkBannerSweep）——DDDDD 批镜像
   *  checkBannerGen 就地保留为前置扫（s22222 #49 A=2 债主，回归实证 15:21）。
   *  引擎补臂后本前置可撤。 */

  /** WorldGen.destroyObject 再入闸（cs:86442 头闸——旗帜组杀期间嵌套帧不发新查） */
  private destroyObj = false;

  /** SquareTileFrame（cs:80924）：九宫列主序 + 中心 resetFrame=true，FCP 引擎
   *  全分派（含 184 恒掷/PlantCheck/CheckOrb 等）+ 旗帜前置扫（引擎缺臂过渡）。
   *  液体唤醒段（cs:82083-86）生成期被 !generatingWorld 门挡（FCP tileFrameGen
   *  不唤醒——读档口径备案维持）。 */
  private squareTileFrameGen(x: number, y: number): void {
    const st = this.world.store;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= st.w || ny >= st.h) continue;
        const ni = this.idx(nx, ny);
        if ((st.flags[ni]! & 1) && SHEET_OF[st.type[ni]!] === 91) this.checkBannerGen(nx, ny, st.type[ni]!);
        // ★MMMMMMM：case 92/93/453 → Check1xX（cs:87030）——FCP 引擎缺臂过渡前置扫
        else if ((st.flags[ni]! & 1) && (SHEET_OF[st.type[ni]!] === 92 || SHEET_OF[st.type[ni]!] === 93
          || SHEET_OF[st.type[ni]!] === 453)) this.check1xXGen(nx, ny, st.type[ni]!);
        // ★VVV 批：case {42,270,271,572,581,660,698} → Check1x2Top（cs:87107）——
        //   FCP 引擎缺臂前置扫（g#98 初轮 12 格椅/罐级联 x86 K-probe 实证）
        else if ((st.flags[ni]! & 1) && CHECK_1X2TOP_SHEETS.has(SHEET_OF[st.type[ni]!] ?? -1)) {
          this.check1x2TopGen(nx, ny, SHEET_OF[st.type[ni]!]!);
        }
      }
    }
    // 签名要求 RNG 非空但 SweepCtx.rng 实为 RNG|undefined（null 路径=掷骰占位 0）
    genSquareTileFrame(st, this.passRng as RNG, x, y);
  }

  /** Check1x2Top（WorldGen.cs:46719-46827，1×2 竖排坐具完整性；引 cs 行号为 1456）：
   *  组顶反解（frameY/18 → 组内行 num2、样式段 num3=num2/2）+ 双格帧校验 +
   *  上锚三支（坐具=平台∪380 可；698=绳可；通用=nactive∧tileSolid∧!tileSolidTop）→
   *  任一破 → destroyObject 闸内整组杀（只杀 type 相符格）。掉落支生成期不产实体。 */
  private check1x2TopGen(x: number, y: number, sheet: number): void {
    if (this.destroyObj) return;                                     // cs:46722 头闸
    const st = this.world.store;
    const num2raw = Math.trunc((st.frameY[this.idx(x, y)] ?? 0) / 18); // cs:46728 /18
    let num2 = num2raw, num3 = 0;
    while (num2 >= 2) { num2 -= 2; num3++; }                          // 样式段（cs:46731-35）
    let num = y - num2;                                               // 组顶格 y（cs:46736）
    num2 = num3 * 36;                                                 // cs:46737
    // ★SSSSSSSS2（2026-08-27）域一致性修复：cell 类型比较必须落在与形参 sheet 相同的
    //  原版 sheet 域。旧实现 readCell 直接用内部 id 与 sheet 硬比——本仓映射后内部 id
    //  早期段与 sheet 恒等故 {270,271,572,581,660} 等族 historically 成立，唯独吊灯
    //  42↔内部77 不等号：整组完整性判定恒假（=永远判坏），但成员杀支同样用错域
    //  （ty===sheet 恒假）→ destroyObject 闸开合而无一格被杀 → 组员永不级联。
    //  g#98 初轮 WC 相位实证：(2749,{1100,1101}) 吊灯组底格岩浆直杀后，其尾
    //  SquareTileFrame 邻访本臂对顶格 no-op；原版同相 KillTile 清 type(=0,cs:64405)
    //  后级联 Check1x2Top 整组破格 → KillTile(顶格)+尘掷 10 —— 正是「初始 WC
    //  Δ10」的首插入分歧源（x86 KLOG idx 109025439→449 台阶）。修=统一转换到
    //  sheet 域（SHEET_OF），不影响 {internal≡sheet} 的其余六族逐位行为。
    const readCell = (cx: number, cy: number): { act: boolean; sh: number; fy: number; ty: number } => {
      if (cx < 0 || cy < 0 || cx >= st.w || cy >= st.h) return { act: false, sh: -1, fy: -1, ty: -1 };
      const q = this.idx(cx, cy);
      return { act: st.flags[q] !== 0, sh: SHEET_OF[st.type[q]] ?? -1, fy: st.frameY[q] ?? 0, ty: st.type[q] };
    };
    const top = readCell(x, num), bot = readCell(x, num + 1);
    let flag = true;
    if (top.fy === num2 && bot.fy === num2 + 18 && top.sh === sheet && bot.sh === sheet) flag = false; // cs:46749-55
    const anc = readCell(x, num - 1);
    let flag2 = false, flag3 = false;
    if ([42, 270, 271, 572, 581, 660].includes(sheet)) flag2 = true;   // cs:46757-74 坐具族
    else if (sheet === 698) { flag2 = true; flag3 = true; }
    const isPlatOr380 = anc.act && (() => {
      if (anc.ty < 0) return false;
      return !!TILE_DEFS[anc.ty]?.platform || (TILE_DEFS[anc.ty]?.vanilla?.sheet ?? -1) === 380;
    })();
    const isRope = anc.act && ROPE_SHEETS.has(TILE_DEFS[anc.ty]?.vanilla?.sheet ?? -1);
    const anchorGenericFail = this.check1x2TopAnchorFail(x, num - 1);
    if (((!flag2 || !isPlatOr380) && (!flag3 || !isRope)) && anchorGenericFail) flag = true;  // cs:46780
    if (!flag) return;
    this.destroyObj = true;
    if (top.sh === sheet) this.killTileGen(x, num);                    // cs:46807-15 只杀同型格
    if (bot.sh === sheet) this.killTileGen(x, num + 1);
    this.destroyObj = false;                                           // 掉落支：生成期无实体，备案
  }

  /** Check1x2Top 通用锚支（cs:46781）：锚格 active ∧ tileSolid ∧ !tileSolidTop。
   *  solid 走 solidNP（含生成期 GenSolid 注入）；tileSolidTop≈platform 近似（本仓
   *  全文件同口径）。越界=原版 new Tile() 零值 → 无效。 */
  private check1x2TopAnchorFail(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    if (!st.flags[i]) return true;
    const t = st.type[i];
    return this.solidNP[t] !== 1;
  }

  /** CheckBanner（cs:86442 派发 → WorldGen.CheckBanner cs:46105）：1×3 竖排旗帜，
   *  frameY/18 反解顶格 + 3 格组帧校验 + 上方锚（nactive + 实心族门 + 平台特例
   *  380/Platforms）→ 任一破整组杀。tileSolid/tileSolidTop/Platforms 用
   *  solid||platform / platform 近似（UUU 批同口径：平台族 vanilla 双 true） */
  private checkBannerGen(x: number, j: number, type: number): void {
    if (this.destroyObj) return;                                     // cs:86442 头闸
    const st = this.world.store;
    const i0 = this.idx(x, j);
    let row = Math.trunc((st.frameY[i0] ?? 0) / 18);
    let num2 = 0;
    while (row >= 3) { row -= 3; num2++; }                           // 样式段（3 行/样式）
    const num = j - row;                                             // 组顶格 y
    const frameX = st.frameX[i0] ?? 0;
    let bad = false;
    for (let k = 0; k < 3; k++) {
      const yy = num + k;
      if (yy < 0 || yy >= st.h) { bad = true; continue; }            // 越界=新 Tile→失配
      const q = this.idx(x, yy);
      if (st.flags[q] === 0 || st.type[q] !== type
        || st.frameY[q] !== k * 18 + num2 * 54
        || st.frameX[q] !== frameX) bad = true;                      // cs:86452-86464
    }
    const ay = num - 1;
    if (ay < 0 || ay >= st.h) bad = true;                            // 锚越界=新 Tile
    else {
      const q = this.idx(x, ay);
      const act = st.flags[q] !== 0;
      if (!act) bad = true;                                          // cs:86469 !nactive
      else {
        const t = st.type[q]!;
        const d = TILE_DEFS[t];
        const topSlope = st.slope[q] === 1 || st.slope[q] === 2;
        const halfBrick = st.half[q] !== 0;
        const bottomSlope = st.slope[q] === 3 || st.slope[q] === 4;
        const tileSolid = !!(d && (d.solid || d.platform));          // vanilla tileSolid
        const solidTop = !!d?.platform;                              // ≈ tileSolidTop
        const isPlatform = !!d?.platform;                            // ≈ Sets.Platforms
        const num3 = topSlope || halfBrick || tileSolid;             // cs:86471
        const flag2 = !solidTop || (isPlatform && (halfBrick || topSlope));
        let flag3 = num3 && flag2
          && !NOT_REALLY_SOLID_SHEETS.has(SHEET_OF[t] ?? -1) && !bottomSlope;
        if (isPlatform || SHEET_OF[t] === 380) flag3 = true;         // cs:86479 平台/花盆箱特例
        if (!flag3) bad = true;                                      // cs:86481
      }
    }
    if (!bad) return;
    this.destroyObj = true;
    for (let k = 0; k < 3; k++) {
      const yy = num + k;
      if (yy < 0 || yy >= st.h) continue;
      if (st.type[this.idx(x, yy)] === type) this.killTileGen(x, yy);
    }
    this.destroyObj = false;
    // cs:86491+ 的 type==91 掉落支（Item.NewItem 5673/...）：生成期不产实体，备案
  }

  /** ★MMMMMMM（2026-08-25）const #49 定罪修复：Check1xX（cs:38169,派发 cs:87030
   *  case 92/93/453）——吊灯92(6 行)/灯93·武器架453(3 行) 的 1×N 竖排家具完整性：
   *  组帧逐格校验 + 底格下 SolidTileAllowBottomSlope(cs:70698) 地基锚 → 任一破
   *  destroyObject 整组杀。FCP 引擎"未移植族"备案含 92/93/453（引擎只 import 禁区,
   *  按 CheckBanner 前置扫同款惯例就地保留;引擎补臂后可撤）。
   *  const 链 #49 Settle_Liquids (3335,772)：水淹灯93 底格 → vanilla Check1xX
   *  整组三格全杀,JS 曾只杀浸水单格 → 孤儿两格 T0>93×2。零掷骰（KillTile 尘掷
   *  由 killTileGen 常规承载）。 */
  private check1xXGen(x: number, j: number, type: number): void {
    if (this.destroyObj) return;                                     // cs:38171 头闸
    const st = this.world.store;
    const num = type === 92 ? 6 : 3;                                 // cs:38177（吊灯 6 行）
    const i0 = this.idx(x, j);
    const fy = st.frameY[i0] ?? 0;
    const seg = Math.trunc(fy / (18 * num));                         // 样式段（C# while 减法同构）
    const rem = fy - seg * 18 * num;
    const top = j - Math.trunc(rem / 18);                            // num5 = j - num2/18
    const frameX = st.frameX[i0] ?? 0;
    let bad = false;
    for (let k = 0; k < num; k++) {
      const yy = top + k;
      if (yy < 0 || yy >= st.h) { bad = true; continue; }            // 越界=null Tile→失配
      const q = this.idx(x, yy);
      if (st.flags[q] === 0 || st.type[q] !== type
        || st.frameY[q] !== k * 18 + seg * 18 * num
        || st.frameX[q] !== frameX) bad = true;                      // cs:38195-38208
    }
    if (!this.solidAllowBottomSlopeGen(x, top + num)) bad = true;    // cs:38213 地基锚
    if (!bad) return;
    this.destroyObj = true;
    for (let k = 0; k < num; k++) {
      const yy = top + k;
      if (yy < 0 || yy >= st.h) continue;
      if (st.type[this.idx(x, yy)] === type) this.killTileGen(x, yy); // cs:38220-38225
    }
    this.destroyObj = false;
  }

  /** SolidTileAllowBottomSlope（cs:70698）：越界/null=true；active && tileSolid∪solidTop
   *  && (!topSlope ∨ 平台正顶帧) && !half && !inActive。tileSolid 用 genSolidType
   *  （生成期动态表）、solidTop/平台按 UUU 口径 d.platform 近似（与上方 banner 锚同款）。 */
  private solidAllowBottomSlopeGen(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    if (!st.flags[i]) return false;
    const t = st.type[i]!;
    const d = TILE_DEFS[t];
    const sheet = SHEET_OF[t] ?? -1;
    const topSlope = st.slope[i] === 1 || st.slope[i] === 2;
    const isPlatform = !!d?.platform;
    return (genSolidType(t) || isPlatform)
      && (!topSlope || (isPlatform && platformProperTopFrameL(st.frameX[i] ?? 0)))
      && !st.half[i] && ((st.wire[i] >>> 5) & 1) === 0;
  }

  // ---- panic 模式（Liquid.cs:975-1070）：缓冲长期超限 → 逐行 QuickWater 强制收敛 ----
  private panicMode = false;
  private panicCounter = 0;
  private panicY = 0;
  // ---- 微光（生成期 QuickWater 首尾 ShimmerRemoveWater 用，WorldGen.cs:34859）----
  /** 原版 WorldGen.generatingWorld：仅世界生成期为 true（读档 isGeneratingOrLoading
   *  但 generatingWorld=false，ShimmerRemoveWater 自身早退） */
  generatingWorld = false;
  /** 原版 GenVars.shimmerPosition：以太生物群系中心（无微光世界为 null） */
  shimmerCenter: { x: number; y: number } | null = null;
  /** 生成期 QuickWater 落水越线转岩浆（Liquid.cs:177-190）：非蜜/微光液体下落到
   *  y > GenVars.waterLine → 类型置岩浆（世界生成期深洞岩浆池的来源——曾整段
   *  漏接，#28 Underworld 债主因之一）。null=不接线（保持旧行为） */
  genWaterLine: number | null = null;
  /** ★IIIII58 REMIX 落水分型规则（Liquid.cs:182-185 首臂）：真则忽略 waterLine
   *  规则，改用 (lavaLine, rockLayer−80, maxTilesY−350, oceanDepths) 四条件带——
   *  入带→岩浆、出带→强制归水。接线值由 GenState 侧注入 */
  remixWaterRule = false;
  remixLavaLine = Number.MAX_SAFE_INTEGER;
  remixRockLevel = -1;
  remixOceanLevel = -1;
  /** ★IIIII62：原版 WorldGen.remixWorldGen（Liquid.cs:1457 LavaCheck 沙漠 blast 门）
   *  与 Main.dualDungeonsSeed——生成期沉降/LavaCheck 类门按原版逐字对齐接线 */
  remixWorldGen = false;
  dualDungeonsSeed = false;
  /** 地牢豁免（Liquid.cs:186-188：InAnyPotentialDungeonBounds(x,y) 且 origin 格墙
   *  为地牢墙族 → 保持水）。QuickWater 调用方按需接线；未接线=null 不豁免 */
  dungeonWaterExempt: ((x: number, y: number, originWall: number) => boolean) | null = null;
  /** tilesIgnoreWater 家族（Liquid.cs:68-72 → WorldGen.SetBoulderSolidity cs:11026）：
   *  138 巨石 / 484 滚动仙人掌 / 664 / 711-716（1.4.5 巨石家族）+ 546。
   *  QuickWater/WaterCheck/UpdateLiquid 全程全局置非实心（原版直接改写 Main.tileSolid——
   *  SettleWaterAt 通行门与 LiquidCheck 的 WorldGen.SolidTile 等一切读者同步生效；
   *  ★WaterCheck（WorldGen.cs:81156）与 UpdateLiquid（Liquid.cs:993）同样首尾包裹，
   *  缺此=沉降轮期巨石家族被当墙 → 液体列表构成/侧流路径整体错位）。484 活性格在
   *  地下沙漠大量存在：缺此翻转=沙漠水池沉降路径整体错位（#28 复验实测 430 格）。 */
  private readonly boulderFamilyIds: Set<number>;
  private readonly id546: number;
  private readonly id379: number;
  private solidNPBackup: Uint8Array | null = null;
  /** worldGenTilesIgnoreWater 家族（Liquid.cs:74-79）：10 关闭门 / 190 发光蘑菇块 /
   *  191 活木块 / 192 活叶块——生成期两次沉降 pass（49/97）全程非实心（雪屋冰屋门、
   *  蘑菇生物群系、活树腔体的液体可穿过）。缺此=#97 二次沉降首分叉（雪屋 y=1140
   *  60 深水洼不合并，x86 实证 SettleProbe qw 相位 317 格）。读档/运行期不翻转 */
  private readonly worldGenIgnoreIds: Set<number>;
  private solidNPBackupWG: Uint8Array | null = null;

  constructor(world: World) {
    this.world = world;
    const st = world.store;
    this.checking = new Uint8Array(st.w * st.h);
    this.skip = new Uint8Array(st.w * st.h);
    // sheet → 内部 id 反查（死亡表/烧除表用）
    const bySheet = (sheets: Set<number>): Set<number> => new Set(
      TILE_DEFS.reduce<number[]>((acc, d, id) => { if (d.vanilla && sheets.has(d.vanilla.sheet)) acc.push(id); return acc; }, []),
    );
    this.waterDeathIds = bySheet(WATER_DEATH_SHEETS);
    // TileObjectData 对象感知死亡表（内部 id → [lavaDeath, waterDeath|null]）——
    // 见 diesIn。★96 格地牢家具（vanilla 不杀/旧全局表误杀）由此归位；
    // 32 格上游帧债：JS 生成管线中部分家具 frameX/frameY 未写（默认 0）→ style
    // 解析按 0 档——这些格仍按 style0 档判定（备案，见报告 2-C 节）。
    const TOD_BY_ID = new Map<number, [boolean, boolean] | null>();
    for (const [sheet, rec] of Object.entries(TILE_OBJECT_DEATH)) {
      const id = SHEET_OF.indexOf(Number(sheet));
      if (id < 0) continue;
      TOD_BY_ID.set(id, rec.d === null ? null : [rec.d[0] === 1, rec.d[1] === 1]);
    }
    this.todDeath = TOD_BY_ID;
    this.lavaDeathIds = bySheet(LAVA_DEATH_SHEETS);
    this.lavaBurnAirIds = bySheet(LAVA_BURN_TO_AIR);
    this.lavaBurnDirtIds = bySheet(LAVA_BURN_TO_DIRT);
    this.mudId = TILE_BY_KEY['mud'];
    // tileObsidianKill = lavaDeath ∪ 附加 − {88}（Main.cs:8214-8220，88=梳妆台显式豁免）
    const okKill = bySheet(OBSIDIAN_KILL_EXTRA_SHEETS);
    for (const id of this.lavaDeathIds) okKill.add(id);
    for (const id of bySheet(new Set([88]))) okKill.delete(id);
    this.obsidianKillIds = okKill;
    this.cutIds = bySheet(CUT_SHEETS);
    this.containerIds = bySheet(CONTAINER_SHEETS);
    this.alchIds = bySheet(ALCH_SHEETS);
    this.alchSoilIds = ALCH_SOIL_SHEETS.map((s) => bySheet(s));
    this.herbSproutId = bySheet(new Set([82])).values().next().value ?? 0;
    this.herbMatureId = bySheet(new Set([83])).values().next().value ?? 0;
    this.herbBloomId = bySheet(new Set([84])).values().next().value ?? 0;
    this.lilyPadId = bySheet(new Set([518])).values().next().value ?? 0;
    this.boulderFamilyIds = bySheet(new Set([138, 484, 664, 711, 712, 713, 714, 715, 716]));
    this.worldGenIgnoreIds = bySheet(new Set([10, 190, 191, 192]));
    this.id546 = bySheet(new Set([546])).values().next().value ?? -1;
    this.id379 = bySheet(new Set([379])).values().next().value ?? -1;
    // 挖掘/放置唤醒：原版 SquareTileFrame 会对 3×3 内每格 TileFrame→AddWater
    // （TileFrame cs:82083-82086）。★该 AddWater 带 !generatingWorld 门——
    //  生成期两次沉降（#49/#97）里烧除/落块/睡莲的 setTile 一律不唤醒液体；
    //  缺此门 = 每次岩浆烧除 3×3 唤醒把已沉降岩浆重新入列 → kill 累计 8 →
    //  再烧除级联（#49 T60>59×264 根因：vanilla 77 次合法烧 ⊂ JS 341 次）。
    //  读档沉降（WorldFile.cs:738 只置 isGeneratingOrLoadingWorld，generatingWorld
    //  恒 false）与运行期挖掘放置仍走唤醒——门必须是 generatingWorld 而非
    //  isGeneratingOrLoadingWorld
    st.onTileChanged((x, y) => {
      if (this.disposed || this.generatingWorld) return;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) this.addWater(x + dx, y + dy);
    });
    // 液体直接写入（水桶等）：唤醒目标及四邻
    st.onLiquidChanged((x, y) => {
      if (this.disposed) return;
      this.addWater(x, y);
      this.addWater(x, y - 1); this.addWater(x, y + 1);
      this.addWater(x - 1, y); this.addWater(x + 1, y);
    });
    // 实心 LUT(零风险:TILE_DEFS 构造后不变;逐 id 用原判定式预计算)。
    // solidFull 不可整体预计算——half/slope 是格级属性,仅把 TILE_DEFS 链换成 LUT。
    const NT = TILE_DEFS.length;
    this.solidNP = new Uint8Array(NT);
    for (let id = 0; id < NT; id++) {
      const d = TILE_DEFS[id];
      if (d && d.solid && !d.platform) this.solidNP[id] = 1;
    }
    // ★R8-18:泡泡 379 在液体域全程=实心（Liquid.cs:453 Update 头/QuickWater :114
    // `Main.tileSolid[379]=true`;仅实体段 Main.cs:17936 置 false、:17982 进
    // UpdateWorld 前置回——本 LUT 只被液体域消费,恒 1 即原版液体窗口口径）。
    // 缺此=水自由穿过泡泡机、被封液体不出列、AddWater 拒收失效
    if (this.id379 >= 0) this.solidNP[this.id379] = 1;
  }

  /** 溢出缓冲长度（Game 的生成期轮上限计算用，原版 LiquidBuffer.numLiquidBuffer） */
  get bufferLen(): number { return this.bufCount; }

  /** 运行期画质档分片数（Main.cs:12240-12243：17-10*gfxQuality；高质量单机=7）。
   *  生成/读档沉降保持 ReInit 态 10（构造默认）——Game 在创建运行实例后调用 */
  setRuntimeCycles(c = 7): void { this.cycles = c; }

  /** 服务器档调参（Liquid.cs:995-1013 netMode==2）：cycles=10+玩家/3、
   *  curMaxLiquid=25000−玩家×250、kill 阈=10+玩家/3。单机保持 7/25000/8
   *  （Main.cs:17256-17257）。SimHost 房主按活跃玩家数每 tick 刷新 */
  applyServerTuning(activePlayers: number): void {
    this.cycles = 10 + Math.floor(activePlayers / 3);
    this.curMaxLiquid = 25000 - activePlayers * 250;
    this.serverKillThreshold = 10 + Math.floor(activePlayers / 3);
  }

  /** 丢弃模拟器：预沉降临时实例调用，停止响应唤醒 */
  dispose() {
    this.disposed = true;
    this.liquids.length = 0;
    this.numLiquid = 0;
  }

  private idx(x: number, y: number): number { return y * this.world.store.w + x; }

  /** 格子是否阻挡液体（原版逐字：nactive() && tileSolid && !tileSolidTop）。
   *  ★IIIII70b 修正（2026-08-30）：原版 Tile.nactive()=`(sTileHeader&0x60)==32`
   *  （Tile.cs:242-248）= **active && !inActive(致动位)**，与 checkingLiquid
   *  （bTileHeader3 bit3，另一字节）完全无关！旧实现把 checking 半边并进通行性
   *  谓词是 EEEEEEE 批的误读——常规七链无致动格时零差，DRUNK 世界地牢入口
   * （DungeonCrawler 预埋触发器机构,actuator-off 的 PinkDungeonBrick 等）在
   * #49 沉降被判当墙：水塔穿顶失败→10,455 单位屋顶假池（rig P-trace 实证：
   * probe(3801..3806,500) aheadT=44 abl=0 而 JS=1）。
   *  检查位的真实用途=C# 各处的 tile.checkingLiquid() 直读（AddWater 头 cs:1172
   *  早退、Update/DelWater 在列自判等），本仓库由 this.checking 位图独立承担，
   *  不再混入本谓词。liquidType==4 与 nactive 无关。幽灵 type（flags=0）视为空气。 */
  private blocksLiquid(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    if (!st.flags[i]) return false;                    // active 位
    if ((st.wire[i] >>> 5) & 1) return false;          // !inActive()（Tile.cs:608-611 bit6）
    return this.solidNP[st.type[i]] === 1;
  }

  /** WorldGen.SolidTile 语义（1456 WorldGen.cs:70155-70176）：实心 && !solidTop &&
   *  !半砖 && !坡面 && **!inActive**（致动位；null/越界=真）。仅 LavaCheck/HoneyCheck/
   *  ShimmerCheck 入口使用——半砖格允许发生交互（Liquid.cs:898/1020）。★EEEEEEE 补
   *  inActive 半边（wire bit5=WIRE_ACTUATED）：生成期无常驻致动格=零世界效应，
   *  运行期电路致动格不再被交互检查当实心墙 */
  private solidTileFull(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    if (!st.flags[i]) return false;
    if (st.wire[i] & 32) return false; // !inActive()（Tile.cs:672-674 sTileHeader bit8）
    return this.solidNP[st.type[i]] === 1 && !st.half[i] && st.slope[i] === 0;
  }

  // ================= AddWater（Liquid.cs:835-872） =================

  addWater(x: number, y: number) {
    const st = this.world.store;
    if (x >= st.w - 5 || y >= st.h - 5 || x < 5 || y < 5) return;
    const i = this.idx(x, y);
    if (this.checking[i] || st.liquid[i] === 0) return;
    const t = st.type[i];
    if (t !== 0 && st.flags[i]) {
      // Liquid.cs:1172：nactive() && tileSolid && type!=546 && !tileSolidTop——
      // ★IIIII70b 补 !inActive 半边（致动格恒可入列,原版同字面）
      if (this.solidNP[t] === 1 && t !== this.id546 && !(st.wire[i] >>> 5 & 1)) return;
    }
    if (this.numLiquid >= this.curMaxLiquid - 1) {
      // LiquidBuffer.AddBuffer（cs:840-843 → LiquidBuffer.cs:12-19）：尾接 +
      // 入队即置 checkingLiquid（重复入队门；!checkingLiquid 半边由本函数头部
      // 早退保证——AddBuffer 的唯一调用点在 addWater 内）
      if (this.bufCount < LiquidSim.BUFFER_CAP) {
        this.bufX[this.bufCount] = x;
        this.bufY[this.bufCount] = y;
        this.bufCount++;
        this.checking[i] = 1;
      }
      return;
    }
    this.checking[i] = 1;
    this.skip[i] = 0;
    // AddWater L1182-1185：kill/delay 显式清零（1456 反编译实证——池对象复用但
    // 三字段全写，勿改成残留语义）
    this.liquids[this.numLiquid] = { x, y, kill: 0, delay: 0 };
    this.numLiquid++;
    // NetSendLiquid（Liquid.cs:1188-1190：netMode==2 且入列成功才记——缓冲路径
    // 此处未达，回灌出列再入时会补记）
    this.netChangeSink?.(x, y);
    // 1456 AddWater 尾部（L1196-1211）：岩浆/水冲毁可死亡方块（火把/植物等 KillTile）。
    //  与 blocksLiquid 同理走 nactive（幽灵 type 不算实心）。★isGeneratingOrLoading
    //  World 门槛（L1199 `!tile.active() || isGeneratingOrLoadingWorld → return`）：
    //  生成/读档沉降期此链不发击杀（击杀走 WaterCheck/LiquidCheck 两链）
    if (!this.isGeneratingOrLoadingWorld && t !== 0 && st.flags[i]) {
      const isLava = st.liquidType[i] === 2;
      const dies = this.diesIn(t, st.frameX[i]!, st.frameY[i]!, isLava);
      if (dies) this.killTileAt(x, y);
    }
  }

  // ================= UpdateLiquid 调度（Liquid.cs:691-833） =================

  /** 每 2 个逻辑 tick 调一次（原版 WorldGen.UpdateWorld 内 skipCount 节流） */
  step() { this.updateLiquid(); }

  updateLiquid() {
    const st = this.world.store;
    // 单机 num=8（1456 Liquid.cs:995）；服务器档由 applyServerTuning 刷新（:999-1012）
    const killThreshold = this.serverKillThreshold;
    // Liquid.cs:993：整个调度首尾 tilesIgnoreWater(true/false)——巨石家族/546 在
    // 轮期内可通行（含快速沉降轮；panic 早退路径原版不恢复,靠下次调用入口自愈）
    this.tilesIgnoreWater(true);
    try {
      this.updateLiquidInner();
    } finally {
      this.tilesIgnoreWater(false);
    }
    // ★IIIII84 刀②盒迹仪：每次 UpdateLiquid 尾把 store 交给探针（x86 rig
    //   JJHook.OnUpdateLiquid→BoxDiff 同位同口径；缺省 null 零开销）
    LiquidSim.liqBoxSink?.(this.world.store);
  }

  private updateLiquidInner() {
    const st = this.world.store;
    const killThreshold = this.serverKillThreshold;
    // panic 模式（1456 Liquid.cs:1019-1070）：缓冲 ≥45000 持续 3600 次未解 →
    // 自底向上逐行 QuickWater 强制沉降，每次调用处理 5 行，到顶后 WaterCheck 退出
    if (!this.quickSettle) {
      if (!this.panicMode) {
        if (this.bufCount >= 45000) {
          this.panicCounter++;
          if (this.panicCounter > 3600) {
            this.panicMode = true;
            this.panicCounter = 0;
            this.panicY = st.h - 3;
            this.liquids.length = 0;
            this.numLiquid = 0;
            this.bufCount = 0;   // StartPanic 清 LiquidBuffer（cs:980）
          }
        } else {
          this.panicCounter = 0;
        }
      }
      if (this.panicMode) {
        let n = 0;
        while (this.panicY >= 3 && n < 5) {
          n++;
          this.quickWater(this.panicY, this.panicY);
          this.panicY--;
        }
        if (this.panicY < 3) {
          this.panicMode = false;
          this.panicCounter = 0;
          this.waterCheck();
        }
        return;
      }
    }
    const quickSettle = this.quickSettle;
    // quickFall 跟随 quickSettle（Liquid.cs:752-755，未受 gen 门限）；但 cycles=1 的
    // Main.cs:12251 分支被 !WorldGen.gen 限定——读档沉降期 gen=true 不生效，保持分片
    this.quickFall = quickSettle;
    const cycles = this.cycles;
    this.wetCounter++;
    const slice = Math.floor(this.curMaxLiquid / cycles);
    const start = slice * (this.wetCounter - 1);
    let end = slice * this.wetCounter;
    if (this.wetCounter === cycles) end = this.numLiquid;
    if (end > this.numLiquid) { end = this.numLiquid; this.wetCounter = cycles; }
    if (this.quickFall) {
      for (let l = start; l < end; l++) {
        const e = this.liquids[l];
        e.delay = 10;
        this.update(e);
        this.skip[this.idx(e.x, e.y)] = 0;
      }
    } else {
      for (let l = start; l < end; l++) {
        const e = this.liquids[l];
        const i = this.idx(e.x, e.y);
        if (!this.skip[i]) this.update(e);
        else this.skip[i] = 0;
      }
    }
    if (this.wetCounter >= cycles) {
      this.wetCounter = 0;
      // 清扫：kill 累积达标 → 254 补满 255 后出列（Liquid.cs:790-798）
      for (let l = this.numLiquid - 1; l >= 0; l--) {
        const e = this.liquids[l];
        if (e.kill >= killThreshold) {
          const i = this.idx(e.x, e.y);
          if (st.liquid[i] === 254) st.liquid[i] = 255;
          this.delWater(l);
        }
      }
      // LiquidBuffer 回灌（Liquid.cs:799-807 / 1405 :796-806）：回灌量
      //  num8 = curMaxLiquid - (curMaxLiquid - numLiquid) = **numLiquid**（当前
      //  活动数，反编译恒等式双版一致）——与空余量无关；满载时 AddWater 把弹出的
      //  格重新尾接入队，与 DelBuffer(0) 的 swap-remove 构成同格轮转（净空转），
      //  卸载后按 swap 序 A,C,B… 回灌。★曾按 FIFO 头指针 + 空余量上限（DDDDD 批
      //  根因：中世界首触缓冲带，回灌时序整体错位）
      if (this.bufCount > 0) {
        const n = Math.min(this.numLiquid, this.bufCount);
        for (let k = 0; k < n; k++) {
          const bx = this.bufX[0];
          const by = this.bufY[0];
          this.checking[this.idx(bx, by)] = 0;
          this.addWater(bx, by);
          // DelBuffer(0)（LiquidBuffer.cs:24-29）：swap-remove——在 AddWater 之后
          //（cs:1144-1147 顺序；重入队的同格被尾元素换回头位）
          this.bufCount--;
          this.bufX[0] = this.bufX[this.bufCount];
          this.bufY[0] = this.bufY[this.bufCount];
        }
      }
      // 卡死检测：活动量长期不变 → 清空列表靠唤醒自愈（Liquid.cs:808-824）
      if (this.numLiquid > 0 && this.numLiquid > this.stuckAmount - 50 && this.numLiquid < this.stuckAmount + 50) {
        this.stuckCount++;
        if (this.stuckCount >= 10000) {
          this.stuck = true;
          for (let l = this.numLiquid - 1; l >= 0; l--) this.delWater(l);
          this.stuck = false;
          this.stuckCount = 0;
        }
      } else {
        this.stuckCount = 0;
        this.stuckAmount = this.numLiquid;
      }
    }
  }

  // ================= 单格流程 Update（Liquid.cs:298-674） =================

  private update(e: LiquidEntry) {
    const st = this.world.store;
    const w = st.w, h = st.h;
    const x = e.x, y = e.y;
    const i5 = this.idx(x, y);
    const trkOn = LiquidSim.trkProbe !== null && this.inTrkBox(x, y);
    if (trkOn) {
      this.trkSig = 0;
      this.preAmt = st.liquid[i5];
      this.preLty = Math.max(0, st.liquidType[i5] - 1);
      LiquidSim.trkProbe!(LiquidSim.trkIterCur, x, y, -1, 0, 0, 0, 0, { amt: this.preAmt, lty: this.preLty });
    }
    // 1) 本格被实心方块占据 → 下轮必删（Liquid.cs:306-310）
    if (this.blocksLiquid(x, y)) {
      if (trkOn) { this.trkSig |= 1; this.trkPost(e); }
      e.kill = 999; return;
    }
    const startAmt = st.liquid[i5];
    // 2) 地狱蒸发：水每 tick -2（Liquid.cs:314-320；UnderworldLayer ≈ h-200）
    if (y > h - 200 && st.liquidType[i5] === 1 && st.liquid[i5] > 0) {
      st.liquid[i5] = Math.max(0, st.liquid[i5] - 2);
    }
    if (st.liquid[i5] === 0) {
      if (trkOn) { this.trkSig |= 2; this.trkPost(e); }
      e.kill = 999; return;
    }
    const myType = st.liquidType[i5];
    // 3) 岩浆/蜂蜜：先交互检查，再降速（Liquid.cs:327-373）
    if (myType === 2) {
      this.trkSig |= 4;
      this.lavaCheck(x, y);
      if (!this.quickFall) {
        if (e.delay < 5) { e.delay++; return; }
        e.delay = 0;
      }
    } else {
      // 水格：唤醒岩浆邻居，让对方自己的 Update 处理交互（Liquid.cs:342-349）。
      // 标量展开(2026-08 审计 G4):元组数组+迭代器在此热路径 ≈2.5M 对象/s
      // ★DDDDDDD（2026-08-24）受理门对齐：原版唤醒门=tile.lava() 裸型位
      //   （Tile.cs:375 `(bTileHeader&0x60)==32`，无 liquid>0 前置）——JS 曾多加
      //   `liquid>0` 门 → 干格残型（液退净型位保留,BBBBBBB 同族）的唤醒调用整段
      //   缺席。世界效应=零（AddWater 头 `tile.liquid==0` 早退,Liquid.cs:1171），
      //   但 acceptance 对拍流里 vanilla 侧恒多 120 条拒收调用（CCCC 批 87 次漂移
      //   的主源）→ 对齐后双流逐行可比。
      for (let t = 0; t < 4; t++) {
        const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
        const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = this.idx(nx, ny);
        if (st.liquidType[ni] === 2) this.addWater(nx, ny);
      }
      // ★G2#98：嵌套分支判定须重读现值——vanilla 在 Liquid.cs:357-365 的
      //   else-if 链逐句取 tile5.honey()/shimmer() 现场位，本格可能已被上方
      //   Lava/Honey/ShimmerCheck 的归零支改写。
      const myTypeNest = st.liquidType[i5];
      if (myTypeNest === 3) {
        this.trkSig |= 8;
        this.honeyCheck(x, y);
        if (!this.quickFall) {
          if (e.delay < 10) { e.delay++; return; }
          e.delay = 0;
        }
      } else {
        // 唤醒蜂蜜邻居（Liquid.cs:365-372）——标量展开,同上（裸型位,见上注）
        for (let t = 0; t < 4; t++) {
          const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
          const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = this.idx(nx, ny);
          if (st.liquidType[ni] === 3) this.addWater(nx, ny);
        }
        const myTypeNest2 = st.liquidType[i5];
        if (myTypeNest2 === 4) {
          this.trkSig |= 0x10;
          // 微光格：自检交互（Liquid.cs:543-546 tile5.shimmer() → ShimmerCheck），
          // 无降速 delay——流动性与水一致
          this.shimmerCheck(x, y);
        } else {
          // 水格：唤醒微光邻居，让对方自己的 Update 处理交互（Liquid.cs:549-564）
          // （裸型位,见上注）
          for (let t = 0; t < 4; t++) {
            const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
            const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = this.idx(nx, ny);
            if (st.liquidType[ni] === 4) this.addWater(nx, ny);
          }
        }
      }
    }
    // 4) 向下全量下灌（Liquid.cs:375-397）
    {
      const bi = this.idx(x, y + 1);
      const belowAmt = st.liquid[bi];
      const belowBlocks = y + 1 >= h ? true : this.blocksLiquid(x, y + 1);
      // ★G2#98：下灌门逐语句取 tile5.liquidType() 现场值（Liquid.cs:568 等）；
      //   Lava/Honey/ShimmerCheck 归零把本格改成水型位后，零转移的 pour 支照样
      //   进入并无条件 addWater(x,y+1)+skip 双标+左右唤醒（g 链 it131 wrap 带
      //   (1215,869) 单格回灌分歧的真源）。函数头快照使该支整体静默跳过。
      const myTypeLive = st.liquidType[i5];
      const belowType = st.liquidType[bi];
      if (!belowBlocks && (belowAmt <= 0 || belowType === myTypeLive) && belowAmt < 255) {
        this.trkSig |= 0x20;
        let t = 255 - belowAmt;
        if (t > st.liquid[i5]) t = st.liquid[i5];
        // 原版边界特性：缺口 1 且本格满格时不扣源（Liquid.cs:381-384）
        const flag = t === 1 && st.liquid[i5] === 255;
        if (!flag) st.liquid[i5] -= t;
        st.liquid[bi] += t;
        st.liquidType[bi] = myTypeLive;
        this.addWater(x, y + 1);
        this.skip[bi] = 1;
        this.skip[i5] = 1;
        if (this.quickSettle && st.liquid[i5] > 250) st.liquid[i5] = 255;
        else if (!flag) { this.addWater(x - 1, y); this.addWater(x + 1, y); }
      }
    }
    // 5) 侧向均流（Liquid.cs:398-651）
    if (st.liquid[i5] > 0) { this.trkSig |= 0x40; this.sideFlow(x, y, i5); }
    // 6) kill 维护（Liquid.cs:652-671）
    if (st.liquid[i5] !== startAmt) {
      if (st.liquid[i5] === 254 && startAmt === 255) {
        if (this.quickSettle) st.liquid[i5] = 255;
        e.kill++;
      } else {
        this.addWater(x, y - 1);
        e.kill = 0;
      }
    } else {
      e.kill++;
    }
    if (trkOn) this.trkPost(e);
  }

  private trkPost(e: LiquidEntry): void {
    const st = this.world.store;
    LiquidSim.trkProbe?.(LiquidSim.trkIterCur, e.x, e.y, this.trkSig, st.liquid[this.idx(e.x, e.y)], Math.max(0, st.liquidType[this.idx(e.x, e.y)] - 1), e.kill, e.delay, { amt: this.preAmt, lty: this.preLty });
  }

  /** 侧向均流：参与格全体写平均值（Liquid.cs:398-651，逐分支照抄） */
  private sideFlow(x: number, y: number, i5: number) {
    const st = this.world.store;
    const myType = st.liquidType[i5];
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, im2 = i5 - 2, ip2 = i5 + 2, im3 = i5 - 3, ip3 = i5 + 3;
    const lq = st.liquid[il], rq = st.liquid[ir];
    // flag1 左可流 / flag2 右可流 / flag3 左 2 格延伸 / flag4 右 2 格延伸
    let f1 = true, f2 = true, f3 = true, f4 = true;
    if (this.blocksLiquid(x - 1, y)) f1 = false;
    else if (lq > 0 && st.liquidType[il] !== myType) f1 = false;
    else if (this.blocksLiquid(x - 2, y)) f3 = false;
    else if (st.liquid[im2] === 0) f3 = false;
    else if (st.liquidType[im2] !== myType) f3 = false;
    if (this.blocksLiquid(x + 1, y)) f2 = false;
    else if (rq > 0 && st.liquidType[ir] !== myType) f2 = false;
    else if (this.blocksLiquid(x + 2, y)) f4 = false;
    else if (st.liquid[ip2] === 0) f4 = false;
    else if (st.liquidType[ip2] !== myType) f4 = false;
    let num1 = 0;
    if (st.liquid[i5] < 3) num1 = -1;         // 薄层蒸发偏置（Liquid.cs:424-426）
    if (st.liquid[i5] > 250) { f3 = false; f4 = false; }
    if (f1 && f2) {
      this.trkSig |= (f3 && f4) ? 0x100 : 0x200;
      if (f3 && f4) {
        // ±3 延伸判定（Liquid.cs:436-449）
        let f5 = true, f6 = true;
        if (this.blocksLiquid(x - 3, y)) f5 = false;
        else if (st.liquid[im3] === 0) f5 = false;
        else if (st.liquidType[im3] !== myType) f5 = false;
        if (this.blocksLiquid(x + 3, y)) f6 = false;
        else if (st.liquid[ip3] === 0) f6 = false;
        else if (st.liquidType[ip3] !== myType) f6 = false;
        if (f5 && f6) {
          // 7 格均分（Liquid.cs:452-515）
          const m = csRound((lq + rq + st.liquid[im2] + st.liquid[ip2] + st.liquid[im3] + st.liquid[ip3] + st.liquid[i5] + num1) / 7); // 1456 Math.Round=取偶
          let same = 0;
          if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else { st.liquidType[il] = myType; same++; }
          if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else { st.liquidType[ir] = myType; same++; }
          if (st.liquid[im2] !== m) { st.liquidType[im2] = myType; st.liquid[im2] = m; this.addWater(x - 2, y); } else { st.liquidType[im2] = myType; same++; }
          if (st.liquid[ip2] !== m) { st.liquidType[ip2] = myType; st.liquid[ip2] = m; this.addWater(x + 2, y); } else { st.liquidType[ip2] = myType; same++; }
          if (st.liquid[im3] !== m) { st.liquidType[im3] = myType; st.liquid[im3] = m; this.addWater(x - 3, y); } else { st.liquidType[im3] = myType; same++; }
          if (st.liquid[ip3] !== m) { st.liquidType[ip3] = myType; st.liquid[ip3] = m; this.addWater(x + 3, y); } else { st.liquidType[ip3] = myType; same++; }
          // 补偿唤醒：中心可能保持原值，邻居需按"邻居≠均值或中心≠均值"重唤醒（Liquid.cs:502-513）
          if (st.liquid[il] !== m || st.liquid[i5] !== m) this.addWater(x - 1, y);
          if (st.liquid[ir] !== m || st.liquid[i5] !== m) this.addWater(x + 1, y);
          if (st.liquid[im2] !== m || st.liquid[i5] !== m) this.addWater(x - 2, y);
          if (st.liquid[ip2] !== m || st.liquid[i5] !== m) this.addWater(x + 2, y);
          if (st.liquid[im3] !== m || st.liquid[i5] !== m) this.addWater(x - 3, y);
          if (st.liquid[ip3] !== m || st.liquid[i5] !== m) this.addWater(x + 3, y);
          // 中心例外：六邻全等于均值且上方有液 → 保持原值（Liquid.cs:514）
          if (same !== 6 || st.liquid[iu] <= 0) st.liquid[i5] = m;
        } else {
          // 5 格均分（Liquid.cs:519-562）
          const m = csRound((lq + rq + st.liquid[im2] + st.liquid[ip2] + st.liquid[i5] + num1) / 5); // 1456 Math.Round=取偶
          let same = 0;
          if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else { st.liquidType[il] = myType; same++; }
          if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else { st.liquidType[ir] = myType; same++; }
          if (st.liquid[im2] !== m) { st.liquidType[im2] = myType; st.liquid[im2] = m; this.addWater(x - 2, y); } else { st.liquidType[im2] = myType; same++; }
          if (st.liquid[ip2] !== m) { st.liquidType[ip2] = myType; st.liquid[ip2] = m; this.addWater(x + 2, y); } else { st.liquidType[ip2] = myType; same++; }
          // 补偿唤醒（Liquid.cs:553-560）
          if (st.liquid[il] !== m || st.liquid[i5] !== m) this.addWater(x - 1, y);
          if (st.liquid[ir] !== m || st.liquid[i5] !== m) this.addWater(x + 1, y);
          if (st.liquid[im2] !== m || st.liquid[i5] !== m) this.addWater(x - 2, y);
          if (st.liquid[ip2] !== m || st.liquid[i5] !== m) this.addWater(x + 2, y);
          if (same !== 4 || st.liquid[iu] <= 0) st.liquid[i5] = m;
        }
      } else if (f3) {
        this.trkSig |= 0x400;
        // 4 格：左延伸（Liquid.cs:567-587）。类型写在条件判断之前（原版 L568 无条件写）
        const m = csRound((lq + rq + st.liquid[im2] + st.liquid[i5] + num1) / 4); // 1456 Math.Round=取偶
        st.liquidType[il] = myType;
        if (lq !== m || st.liquid[i5] !== m) { st.liquid[il] = m; this.addWater(x - 1, y); }
        st.liquidType[ir] = myType;
        if (rq !== m || st.liquid[i5] !== m) { st.liquid[ir] = m; this.addWater(x + 1, y); }
        st.liquidType[im2] = myType;
        if (st.liquid[im2] !== m || st.liquid[i5] !== m) { st.liquid[im2] = m; this.addWater(x - 2, y); }
        st.liquid[i5] = m;
      } else if (f4) {
        this.trkSig |= 0x800;
        // 4 格：右延伸（Liquid.cs:590-609）。类型写在条件判断之前（原版 L591 无条件写）
        const m = csRound((lq + rq + st.liquid[ip2] + st.liquid[i5] + num1) / 4); // 1456 Math.Round=取偶
        st.liquidType[il] = myType;
        if (lq !== m || st.liquid[i5] !== m) { st.liquid[il] = m; this.addWater(x - 1, y); }
        st.liquidType[ir] = myType;
        if (rq !== m || st.liquid[i5] !== m) { st.liquid[ir] = m; this.addWater(x + 1, y); }
        st.liquidType[ip2] = myType;
        if (st.liquid[ip2] !== m || st.liquid[i5] !== m) { st.liquid[ip2] = m; this.addWater(x + 2, y); }
        st.liquid[i5] = m;
      } else {
        this.trkSig |= 0x1000;
        // 3 格均分（Liquid.cs:613-628）：随机 254→255 补满
        let m = csRound((lq + rq + st.liquid[i5] + num1) / 3); // 1456 Math.Round=取偶
        // 原版 WorldGen.genRand.Next(30)==0 晋升（gen 期走 pass 链流）。
        // LiquidSim.r30Sink=诊断观察槽（UUU 批液体域对拍注入；生产恒 null 零开销）
        if (m === 254) {
          const v30 = this.roll(30);
          LiquidSim.r30Sink?.(x, y, v30, num1, lq, rq, st.liquid[i5]);
          if (v30 === 0) m = 255;
        }
        if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else st.liquidType[il] = myType;
        if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else st.liquidType[ir] = myType;
        st.liquid[i5] = m;
      }
    } else if (f1) {
      this.trkSig |= 0x2000;
      // 2 格：向左（Liquid.cs:633-639）
      const m = csRound((lq + st.liquid[i5] + num1) / 2); // 1456 Math.Round=取偶
      if (lq !== m) st.liquid[il] = m;
      st.liquidType[il] = myType;
      if (st.liquid[i5] !== m || st.liquid[il] !== m) this.addWater(x - 1, y);
      st.liquid[i5] = m;
    } else if (f2) {
      this.trkSig |= 0x4000;
      // 2 格：向右（Liquid.cs:643-649）
      const m = csRound((rq + st.liquid[i5] + num1) / 2); // 1456 Math.Round=取偶
      if (rq !== m) st.liquid[ir] = m;
      st.liquidType[ir] = myType;
      if (st.liquid[i5] !== m || st.liquid[ir] !== m) this.addWater(x + 1, y);
      st.liquid[i5] = m;
    }
  }

  // ================= 液体交互（Liquid.cs:888-1115 + GetLiquidMergeTypes 1385-1453） =================
  // 合并产物优先级（GetLiquidMergeTypes 逐段覆盖，后写胜出）：
  //   水 > 岩浆 > 蜂蜜 > 微光——任一方是微光 → Aetherium 块 659；
  //   否则 蜂蜜在场 → 229/230，只剩水岩组合 → 黑曜石 56

  /** CreateLiquidMergeTile（Liquid.cs:1355-1384）：
   *  生成/读档期 → LiquidOverwriteStrip（整行液体类型统一，不落块）；
   *  运行期 → PlayLiquidChangeSound + ReplaceTile/KillTile+PlaceTile（掉落走 killTile 钩子） */
  private createMergeTile(x: number, y: number, tileType: number, thisType: number, mergeType: number) {
    const st = this.world.store;
    if (this.isGeneratingOrLoadingWorld && !this.createMergeTilesDuringGen) {
      // Liquid.cs:1360-1377：产物 → 源类型（229→水 230/56→岩浆 659→微光），
      // 地狱层强制岩浆；两处调用点目标格已预先清零 → strip 实为空操作，仅保留原版结构
      let stripType = -1;
      if (tileType === HONEY_BLOCK) stripType = 1;
      else if (tileType === CRISPY_HONEY || tileType === OBSIDIAN) stripType = 2;
      else if (tileType === AETHERIUM) stripType = 4;
      if (y >= st.h - 200) stripType = 2; // y >= UnderworldLayer
      if (stripType >= 0) this.liquidOverwriteStrip(x, y, stripType);
      return;
    }
    this.liquidChangeSound?.(x, y, thisType, mergeType); // WorldGen.PlayLiquidChangeSound
    const i = this.idx(x, y);
    if (st.flags[i]) this.killTileAt(x, y); // ReplaceTile：KillTile_DropItems（火把/植物掉落）；生成收尾=尘掷
    st.setTile(x, y, tileType);
  }

  /** LiquidOverwriteStrip（Liquid.cs:1338-1352）：从 (x,y) 起向两侧延伸，
   *  把同行连续液体段的类型统一为 stripType */
  private liquidOverwriteStrip(x: number, y: number, stripType: number) {
    const st = this.world.store;
    for (let nx = x; nx >= 0 && st.liquid[this.idx(nx, y)] > 0; nx--) st.liquidType[this.idx(nx, y)] = stripType;
    for (let nx = x; nx < st.w && st.liquid[this.idx(nx, y)] > 0; nx++) st.liquidType[this.idx(nx, y)] = stripType;
  }

  /** 生成收尾全图 LiquidCheck(createMergeTilesDuringGen:true)（WorldGen.cs:22639-22650）：
   *  常规生成期交互不落块（strip 分支），唯独收尾这一次允许把残余接触转成块。
   *  ★原版此处对湿格直接调 Liquid.LiquidCheck(x,y,liquidType(),...)——岩浆格
   *  不走 LavaCheck 包装（无 7×7 沙漠 blast 前导），故 t==2 以 desertBlast=false。
   *  ★DDDDDD 批（2026-08-21）：水格（t==1）此前整缺——原版无 WaterCheck 包装，
   *  LiquidCheck(x,y,0) 只在这次全图扫出现（运行期沉降只从岩浆/蜂蜜/微光侧触发，
   *  水侧合并从未发生）。12345 #105 残 A=45/L=74 主债主（水岩界面 vanilla 双侧
   *  落黑曜石、JS 只有岩浆侧）。 */
  finalGenMergeCheck() {
    const st = this.world.store;
    this.createMergeTilesDuringGen = true;
    try {
      for (let y = 1; y < st.h - 1; y++) {
        const row = y * st.w;
        for (let x = 1; x < st.w - 1; x++) {
          const i = row + x;
          if (st.liquid[i] === 0) continue;
          const t = st.liquidType[i];
          if (t === 1) this.waterLiquidCheck(x, y);
          else if (t === 2) this.lavaCheck(x, y, false);
          else if (t === 3) this.honeyCheck(x, y);
          else if (t === 4) this.shimmerCheck(x, y);
        }
      }
    } finally {
      this.createMergeTilesDuringGen = false;
    }
  }

  /** UndergroundDesertCheck（Liquid.cs:1217-1231）：(x,y) 周围 7×7 有地下沙漠墙
   *  （187 沙岩墙 / 216 硬化沙墙）即真。dump027 实证本时点沙漠墙 18.5 万格。 */
  private undergroundDesertCheck(x: number, y: number): boolean {
    const st = this.world.store;
    for (let j = y - 3; j <= y + 3; j++) {
      for (let i = x - 3; i <= x + 3; i++) {
        if (i < 0 || j < 0 || i >= st.w || j >= st.h) continue; // InWorld(fluff=0)
        const wv = st.wall[this.idx(i, j)];
        if (wv === 187 || wv === 216) return true;
      }
    }
    return false;
  }

  /** LiquidCheck 水侧（Liquid.cs:1233-1320，thisLiquidType=0）——生成收尾全图扫
   *  （WorldGen.cs:22647）对水格直调，无 WaterCheck 包装（运行期 WaterCheck=
   *  容器死亡检查，另一物）。水+岩浆→黑曜石 56 / 水+蜂蜜→蜂蜜块 229 /
   *  水+微光→Aetherium 659（GetLiquidMergeTypes this=0 行，微光>蜂蜜>岩浆）。
   *  ★case A 邻型旗用 anyX（liquid>0 门，Liquid.cs:1252-55）；异种清零不加门
   *  （cs:1257-67 干格残型字节也走零写）；case B 水侧跳过下方裁切植物杀
   *  （`thisLiquidType != 0` 门，Liquid.cs:1289）。 */
  private waterLiquidCheck(x: number, y: number) {
    const st = this.world.store;
    if (this.solidTileFull(x, y)) return; // WorldGen.SolidTile：半砖/坡面放行（Liquid.cs:1236）
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, id = i5 + st.w;
    const lq = st.liquid[il], rq = st.liquid[ir], uq = st.liquid[iu], dq = st.liquid[id];
    const lt = st.liquidType[il], rt = st.liquidType[ir], ut = st.liquidType[iu], dt = st.liquidType[id];
    if ((lq > 0 && lt !== 1) || (rq > 0 && rt !== 1) || (uq > 0 && ut !== 1)) {
      // 情形 A：左右/上方有非水液体 → 汇总清零，产物生成在水格（Liquid.cs:1250-73）
      let sum = 0;
      if (lt !== 1) { sum += lq; st.liquid[il] = 0; }
      if (rt !== 1) { sum += rq; st.liquid[ir] = 0; }
      if (ut !== 1) { sum += uq; st.liquid[iu] = 0; }
      // GetLiquidMergeTypes(this=0)（Liquid.cs:1437-52）：岩浆邻→56、蜂蜜邻→229、
      // 微光邻→659（后写覆盖）；mergeType 恒异于 0 → `mergeType != this` 门恒过
      const type = ((lq > 0 && lt === 4) || (rq > 0 && rt === 4) || (uq > 0 && ut === 4)) ? AETHERIUM
        : ((lq > 0 && lt === 3) || (rq > 0 && rt === 3) || (uq > 0 && ut === 3)) ? HONEY_BLOCK
        : OBSIDIAN;
      const mergeType = type === AETHERIUM ? 4 : type === HONEY_BLOCK ? 3 : 2;
      if (sum < 24) return;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      // ★BBBBBBB（CONST #49 定罪修复）：vanilla 合并支只清 liquid **不清 liquidType**
      //   （Liquid.cs:1271 `tile5.liquid = 0`，无 liquidType(0)）——干格残型是原版
      //   动力学输入（Update 邻居唤醒门 `tile.lava()` 裸读型位,Liquid.cs:497-510）。
      //   JS 曾清型 → 干格残型丢失 → 唤醒集/交互集分歧（ul0 beat1161 (689,786)
      //   v t1/j t0 首差）→ 队列 ±1（ql0 row82 v4920/j4919）→ 沉降级联。
      st.liquid[i5] = 0;
      this.createMergeTile(x, y, type, 1, mergeType);
    } else {
      if (dq <= 0 || dt === 1) return;
      // 情形 B：仅下方有异种液体 → 产物生成在下方格（Liquid.cs:1275-1317）
      const selfAct = st.flags[i5] !== 0;
      const selfT = st.type[i5];
      const belowAct = st.flags[id] !== 0;
      const belowT = st.type[id];
      // flag：本格容器而下方不是（Liquid.cs:1285-88）——容器内液体允许向下合并
      const containerOk = selfAct && this.containerIds.has(selfT) && !(belowAct && this.containerIds.has(belowT));
      // 水侧无下方裁切植物杀（`thisLiquidType != 0` 门，Liquid.cs:1289 水恒假）
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 1; return; } // ★G2#98：vanilla liquidType(0) 即水型位（Tile.cs:220 case0 清 bits5-6）；JS 1 基水=1，曾写 0 使归零后本格类型域不自洽，下灌门类型等值比较永假
      const type = dt === 4 ? AETHERIUM : dt === 3 ? HONEY_BLOCK : OBSIDIAN;
      // ★BBBBBBB 同修 1：合并支类型保留（Liquid.cs:1319-1320 只清 liquid）
      st.liquid[i5] = 0;
      st.liquid[id] = 0;
      this.createMergeTile(x, y + 1, type, 1, dt);
    }
  }

  /** 岩浆格与水/蜂蜜/微光接触 → 黑曜石 56 / 脆蜂蜜块 230 / Aetherium 659（阈值 24）。
   *  desertBlast=false = 跳过头部沙漠分支（生成收尾全图检查口径，见分支注释） */
  private lavaCheck(x: number, y: number, desertBlast = true) {
    const st = this.world.store;
    // ★IIIII87 取证钩（缺省零开销）：LavaCheck 触发坐标流（kill-带归属用）
    (globalThis as unknown as { __swI87K?: ((ev: string, x: number, y: number) => void) | undefined }).__swI87K?.('lc', x, y);
    // LavaCheck 头部沙漠分支（Liquid.cs:1457-1465）：`!remixWorldGen &&
    // !Main.dualDungeonsSeed && generatingWorld && UndergroundDesertCheck(x,y)` 时
    // 7×7 液体**类型**转岩浆（lava(true) 不动量）——地下沙漠底岩浆池来源。
    // ★IIIII62 定罪补门：remix/dualDungeons 下原版恒跳过本支；JS 曾缺前两道门，
    //   remix 世界的每次 AttemptToMoveLava 都在沙石墙(187/216)带喷洒 7×7 岩浆型位
    //   ⇒ 下游异种相遇/合并/裁切族结算全面漂移（REMIX #28 七枚滚动仙人掌 cut-kill
    //   缺失 + Y/L 场差 2223 格的直接根因，rig SevSnap 窗对拍逐事件实证：
    //   首分歧 k=724 @(1733,682) js 单调多 spray 一批 (0,0,lt0→lt1) 型位写）。
    // ★此分支只属于 LavaCheck 包装——原版生成收尾全图检查（WorldGen.cs:22639-22650）
    //   对湿格直接调 Liquid.LiquidCheck(x,y,type,createMergeTilesDuringGen:true)，
    //   **不带本前导**（finalGenMergeScan 以 desertBlast=false 走此口径）：密闭岩浆格
    //   在原版沉降全程无人调 LavaCheck；若收尾全扫带 blast，会把 7×7 内异型液体
    //   （如对角密闭水袋）整片转岩浆（12345 链 #49 Lt=1 @ (1982,661) 根因）。
    // 门序按原版：旗标门在 SolidTile 门之前。
    if (desertBlast && this.generatingWorld && !this.remixWorldGen && !this.dualDungeonsSeed
      && this.undergroundDesertCheck(x, y)) {
      for (let j = y - 3; j <= y + 3; j++) {
        for (let i = x - 3; i <= x + 3; i++) {
          if (i < 0 || j < 0 || i >= st.w || j >= st.h) continue;
          st.liquidType[this.idx(i, j)] = 2;
        }
      }
    }
    if (this.solidTileFull(x, y)) return; // WorldGen.SolidTile：半砖/坡面放行（Liquid.cs:898）
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, id = i5 + st.w;
    const lq = st.liquid[il], rq = st.liquid[ir], uq = st.liquid[iu], dq = st.liquid[id];
    const lt = st.liquidType[il], rt = st.liquidType[ir], ut = st.liquidType[iu], dt = st.liquidType[id];
    if ((lq > 0 && lt !== 2) || (rq > 0 && rt !== 2) || (uq > 0 && ut !== 2)) {
      // 情形 A：左右/上方有非岩浆液体 → 生成在岩浆格（Liquid.cs:905-959）
      let sum = 0;
      let type = OBSIDIAN;
      let mergeType = 1;
      if (lt !== 2) { sum += lq; st.liquid[il] = 0; }
      if (rt !== 2) { sum += rq; st.liquid[ir] = 0; }
      if (ut !== 2) { sum += uq; st.liquid[iu] = 0; }
      // ★R8-19:anyX 旗标一律带 liquid>0 门(Tile.cs:402-431 anyHoney/anyShimmer)——
      // 残型字节(空格清液不清型,waterCheckInner≡WG57:81707)不得选产物
      if ((lq > 0 && lt === 3) || (rq > 0 && rt === 3) || (uq > 0 && ut === 3)) { type = CRISPY_HONEY; mergeType = 3; }
      if ((lq > 0 && lt === 4) || (rq > 0 && rt === 4) || (uq > 0 && ut === 4)) { type = AETHERIUM; mergeType = 4; } // 微光优先级最高（L1443-1451）
      if (sum < 24) return;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill（火把/植物被顶掉，非 decor 近似）
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      // ★BBBBBBB 同 lavaCheck：合并支类型保留（Liquid.cs:1271 只清 liquid）
      st.liquid[i5] = 0;
      this.createMergeTile(x, y, type, 2, mergeType);
    } else {
      if (dq <= 0 || dt === 2) return;
      // 情形 B：仅下方有水/蜂蜜/微光 → 生成在下方格（Liquid.cs:961-1014）
      const selfAct = st.flags[i5] !== 0;
      const selfT = st.type[i5];
      const belowAct = st.flags[id] !== 0;
      const belowT = st.type[id];
      // flag：本格容器而下方不是（Liquid.cs:1285-1288）——容器内液体允许向下合并
      const containerOk = selfAct && this.containerIds.has(selfT) && !(belowAct && this.containerIds.has(belowT));
      // 下方裁切植物 → 先 KillTile 掉落（Liquid.cs:1287 `thisLiquidType != 0 &&
      // tileCut`——岩浆/蜂蜜/微光三路恒真,水路无此支;★R8-23 曾误译 selfT!==1）
      if (belowAct && this.cutIds.has(belowT)) { (globalThis as unknown as { __swCutProbe?: (x: number, y: number, t: number) => void }).__swCutProbe?.(x, y + 1, belowT); this.killTileAt(x, y + 1); }
      // 落块门（Liquid.cs:1294）：下方空 / tileObsidianKill / 容器位 三者其一
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 1; return; } // ★G2#98：vanilla liquidType(0) 即水型位（Tile.cs:220 case0 清 bits5-6）；JS 1 基水=1，曾写 0 使归零后本格类型域不自洽，下灌门类型等值比较永假
      const type = dt === 4 ? AETHERIUM : dt === 3 ? CRISPY_HONEY : OBSIDIAN;
      // ★BBBBBBB 同 lavaCheck：合并支类型保留（Liquid.cs:1319-1320 只清 liquid）
      st.liquid[i5] = 0;
      st.liquid[id] = 0;
      this.createMergeTile(x, y + 1, type, 2, dt);
    }
  }

  /** 蜂蜜格与水/岩浆/微光接触 → 蜂蜜块 229 / 脆蜂蜜块 230 / Aetherium 659（阈值 24）。
   *  触发门 = 任一邻格液体类型非蜂蜜（LiquidCheck L1244 `liquidType() != thisLiquidType`），
   *  此前只识别水邻——岩浆/微光邻漏触发，1456 对齐补齐 */
  private honeyCheck(x: number, y: number) {
    const st = this.world.store;
    (globalThis as unknown as { __swI87K?: ((ev: string, x: number, y: number) => void) | undefined }).__swI87K?.('hc', x, y);
    if (this.solidTileFull(x, y)) return; // WorldGen.SolidTile：半砖/坡面放行（Liquid.cs:1020）
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, id = i5 + st.w;
    const lq = st.liquid[il], rq = st.liquid[ir], uq = st.liquid[iu], dq = st.liquid[id];
    const lt = st.liquidType[il], rt = st.liquidType[ir], ut = st.liquidType[iu], dt = st.liquidType[id];
    if ((lq > 0 && lt !== 3) || (rq > 0 && rt !== 3) || (uq > 0 && ut !== 3)) {
      let sum = 0;
      if (lt !== 3) { sum += lq; st.liquid[il] = 0; }
      if (rt !== 3) { sum += rq; st.liquid[ir] = 0; }
      if (ut !== 3) { sum += uq; st.liquid[iu] = 0; }
      if (sum < 24) return; // 1456 LiquidCheck 统一阈值 24
      // ★R8-19:产物旗标带 liquid>0 门（GetLiquidMergeTypes L1386+ anyLava/anyShimmer）
      const type = ((lq > 0 && lt === 4) || (rq > 0 && rt === 4) || (uq > 0 && ut === 4)) ? AETHERIUM
        : ((lq > 0 && lt === 2) || (rq > 0 && rt === 2) || (uq > 0 && ut === 2)) ? CRISPY_HONEY : HONEY_BLOCK;
      const mergeType = ((lq > 0 && lt === 4) || (rq > 0 && rt === 4) || (uq > 0 && ut === 4)) ? 4
        : ((lq > 0 && lt === 2) || (rq > 0 && rt === 2) || (uq > 0 && ut === 2)) ? 2 : 1;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      // ★BBBBBBB 同 lavaCheck：合并支类型保留（Liquid.cs:1271 只清 liquid）
      st.liquid[i5] = 0;
      this.createMergeTile(x, y, type, 3, mergeType);
    } else {
      if (dq <= 0 || dt === 3) return;
      const selfAct = st.flags[i5] !== 0;
      const selfT = st.type[i5];
      const belowAct = st.flags[id] !== 0;
      const belowT = st.type[id];
      const containerOk = selfAct && this.containerIds.has(selfT) && !(belowAct && this.containerIds.has(belowT));
      // 下方裁切植物 → 先 KillTile 掉落（Liquid.cs:1287 `thisLiquidType != 0 &&
      // tileCut`——岩浆/蜂蜜/微光三路恒真,水路无此支;★R8-23 曾误译 selfT!==1）
      if (belowAct && this.cutIds.has(belowT)) { (globalThis as unknown as { __swCutProbe?: (x: number, y: number, t: number) => void }).__swCutProbe?.(x, y + 1, belowT); this.killTileAt(x, y + 1); }
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 1; return; } // ★G2#98：vanilla liquidType(0) 即水型位（Tile.cs:220 case0 清 bits5-6）；JS 1 基水=1，曾写 0 使归零后本格类型域不自洽，下灌门类型等值比较永假 // 1456 统一 24
      const type = dt === 4 ? AETHERIUM : dt === 2 ? CRISPY_HONEY : HONEY_BLOCK;
      // ★BBBBBBB 同 lavaCheck：合并支类型保留（Liquid.cs:1319-1320 只清 liquid）
      st.liquid[i5] = 0;
      st.liquid[id] = 0;
      this.createMergeTile(x, y + 1, type, 3, dt);
    }
  }

  /** 微光格与水/岩浆/蜂蜜任一接触 → Aetherium 块 659（Liquid.cs:1475-1478 →
   *  LiquidCheck(thisLiquidType=3)；GetLiquidMergeTypes L1437-1452 微光行恒为 659） */
  private shimmerCheck(x: number, y: number) {
    (globalThis as unknown as { __swI87K?: ((ev: string, x: number, y: number) => void) | undefined }).__swI87K?.('sc', x, y);
    const st = this.world.store;
    if (this.solidTileFull(x, y)) return;
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, iu = i5 - st.w, id = i5 + st.w;
    const lq = st.liquid[il], rq = st.liquid[ir], uq = st.liquid[iu], dq = st.liquid[id];
    const lt = st.liquidType[il], rt = st.liquidType[ir], ut = st.liquidType[iu], dt = st.liquidType[id];
    if ((lq > 0 && lt !== 4) || (rq > 0 && rt !== 4) || (uq > 0 && ut !== 4)) {
      // 情形 A：左右/上方有非微光液体 → 汇总清零，产物生成在微光格（Liquid.cs:1250-1273）
      let sum = 0;
      if (lt !== 4) { sum += lq; st.liquid[il] = 0; }
      if (rt !== 4) { sum += rq; st.liquid[ir] = 0; }
      if (ut !== 4) { sum += uq; st.liquid[iu] = 0; }
      // ★R8-19:mergeType != this 门（L1269）真值 = 三邻中有水/岩浆/蜂蜜（anyX 带
      // liquid>0 门）——GetLiquidMergeTypes(this=微光)对水/岩浆/蜂蜜各置 mergeType
      // 0/1/2（L1437-1470 后写覆盖），全无则 mergeType 恒 this → 不产块。
      // 此前误译成"三邻有微光则弃"（恒假门）。mergeType = 水→岩浆→蜂蜜定序最后命中
      const wNear = (lq > 0 && lt === 1) || (rq > 0 && rt === 1) || (uq > 0 && ut === 1);
      const lNear = (lq > 0 && lt === 2) || (rq > 0 && rt === 2) || (uq > 0 && ut === 2);
      const hNear = (lq > 0 && lt === 3) || (rq > 0 && rt === 3) || (uq > 0 && ut === 3);
      if (sum < 24 || (!wNear && !lNear && !hNear)) return;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      // ★BBBBBBB 同 lavaCheck：合并支类型保留（Liquid.cs:1271 只清 liquid）
      st.liquid[i5] = 0;
      this.createMergeTile(x, y, AETHERIUM, 4, hNear ? 3 : lNear ? 2 : 1);
    } else {
      if (dq <= 0 || dt === 4) return;
      // 情形 B：仅下方有异种液体 → 产物生成在下方格（Liquid.cs:1275-1317）
      const selfAct = st.flags[i5] !== 0;
      const selfT = st.type[i5];
      const belowAct = st.flags[id] !== 0;
      const belowT = st.type[id];
      const containerOk = selfAct && this.containerIds.has(selfT) && !(belowAct && this.containerIds.has(belowT));
      // 下方裁切植物 → 先 KillTile 掉落（Liquid.cs:1287 `thisLiquidType != 0 &&
      // tileCut`——岩浆/蜂蜜/微光三路恒真,水路无此支;★R8-23 曾误译 selfT!==1）
      if (belowAct && this.cutIds.has(belowT)) { (globalThis as unknown as { __swCutProbe?: (x: number, y: number, t: number) => void }).__swCutProbe?.(x, y + 1, belowT); this.killTileAt(x, y + 1); }
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 1; return; } // ★G2#98：vanilla liquidType(0) 即水型位（Tile.cs:220 case0 清 bits5-6）；JS 1 基水=1，曾写 0 使归零后本格类型域不自洽，下灌门类型等值比较永假
      // ★BBBBBBB 同 lavaCheck：合并支类型保留（Liquid.cs:1319-1320 只清 liquid）
      st.liquid[i5] = 0;
      st.liquid[id] = 0;
      this.createMergeTile(x, y + 1, AETHERIUM, 4, dt);
    }
  }

  // ================= DelWater（Liquid.cs:1117-1213） =================

  private delWater(l: number) {
    const st = this.world.store;
    const e = this.liquids[l];
    const x = e.x, y = e.y;
    const i5 = this.idx(x, y);
    const il = i5 - 1, ir = i5 + 1, id = i5 + st.w;
    const amt = st.liquid[i5];
    if (amt < 2) {
      // 残量清零 + 邻居唤醒（Liquid.cs:1125-1137）
      st.liquid[i5] = 0;
      if (st.liquid[il] < 2) st.liquid[il] = 0; else this.addWater(x - 1, y);
      if (st.liquid[ir] < 2) st.liquid[ir] = 0; else this.addWater(x + 1, y);
    } else if (amt < 20) {
      // 水膜抹除：邻格更低或下方不满（Liquid.cs:1138-1142）
      const lq = st.liquid[il], rq = st.liquid[ir], dq = st.liquid[id];
      if ((lq < amt && !this.blocksLiquid(x - 1, y)) ||
          (rq < amt && !this.blocksLiquid(x + 1, y)) ||
          (dq < 255 && !this.blocksLiquid(x, y + 1))) {
        st.liquid[i5] = 0;
      }
    } else if (st.liquid[id] < 255 && !this.blocksLiquid(x, y + 1) && !this.stuck && !this.blocksLiquid(x, y)) {
      e.kill = 0; // 下方未满：留在列表继续流（Liquid.cs:1143-1147）
      return;
    }
    if (st.liquid[i5] < 250 && st.liquid[i5 - st.w] > 0) this.addWater(x, y - 1);
    if (st.liquid[i5] === 0) {
      st.liquidType[i5] = 1; // ★G2#98：vanilla DelWater 尾 `tile4.liquidType(0)` 同为水型位回写（Liquid.cs:1576）
    } else {
      const rq = st.liquid[ir], lq = st.liquid[il];
      if (rq > 0 && rq < 250 && !this.blocksLiquid(x + 1, y) && st.liquid[i5] !== rq) this.addWater(x + 1, y);
      if (lq > 0 && lq < 250 && !this.blocksLiquid(x - 1, y) && st.liquid[i5] !== lq) this.addWater(x - 1, y);
      if (st.liquidType[i5] === 2) {
        this.lavaCheck(x, y);
        // 岩浆 3×3 烧除（1456 DelWater L1557-1587）：草族(2/23/109/199/477/492)→空气；
        // 蘑菇草族(60/70/661/662)→泥土 59——经 sheet 反查内部 id 精确映射
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 1 || ny < 1 || nx >= st.w - 1 || ny >= st.h - 1) continue;
            const ni = this.idx(nx, ny);
            // cs:1547 `if (!tile5.active()) continue`——只烧活性格。本仓非活性
            // 幽灵格 type 残留（如被杀植物的 60 丛林草），若只挡 type===0 会把
            // 幽灵格复活成活性泥并连坐液体路径（#49 T0>59×234/Y2>0×211 根因）
            if (!(st.flags[ni] & 1) || st.type[ni] === 0) continue;
            const t = st.type[ni];
            if (this.lavaBurnAirIds.has(t)) {
              st.setTile(nx, ny, 0);
              // cs:1557/1562：每次转化尾随 SquareTileFrame(i,j)——3×3 帧扫把上方
              // 依附植物（61 丛草植物等）经 PlantCheck 锚亡杀链收割（XXXXX 批：
              // (3580,895) 三格 vanilla 杀 JS 漏=此级联缺失；PlantCheck 杀零掷，
              // 流位不动）
              this.squareTileFrameGen(nx, ny);
            }
            else if (this.lavaBurnDirtIds.has(t)) {
              st.setTile(nx, ny, this.mudId); // cs:1562 type=59（泥，非泥土0——曾误写 dirt）
              this.squareTileFrameGen(nx, ny);
            }
          }
        }
      } else if (st.liquidType[i5] === 3) {
        this.honeyCheck(x, y);
      } else if (st.liquidType[i5] === 4) {
        this.shimmerCheck(x, y); // Liquid.cs:1576-1579 tile4.shimmer() → ShimmerCheck
      }
    }
    // NetSendLiquid（Liquid.cs:1582-1584：DelWater 末尾、checkingLiquid(false) 前）
    this.netChangeSink?.(x, y);
    // swap-remove（Liquid.cs:1193-1197）：只搬 x/y/kill，delay 保留本槽旧值（原版语义）
    this.numLiquid--;
    this.checking[i5] = 0;
    const tail = this.liquids[this.numLiquid];
    e.x = tail.x; e.y = tail.y; e.kill = tail.kill;
    this.liquids.length = this.numLiquid;
    // DelWater 尾部（Liquid.cs:1607-1624）：出列格是草药 → CheckAlch 依附复查；
    // 是睡莲(518) → 快沉降/静水时 CheckLilyPad，否则仅 SquareTileFrame（本仓库帧为
    // 渲染期派生，该分支无操作）
    if (st.flags[i5]) {
      if (this.alchIds.has(st.type[i5])) this.checkAlch(x, y);
      else if (st.type[i5] === this.lilyPadId) {
        const iu = i5 - st.w;
        if (this.quickFall) this.checkLilyPad(x, y);
        else if (st.liquid[id] < 255 || st.liquid[iu] > 0) { /* SquareTileFrame：帧由渲染派生 */ }
        else this.checkLilyPad(x, y);
      }
    }
  }

  /** WorldGen.CheckAlch（WorldGen.cs:45981-46109）：液体退去后复查草药依附。
   *  frameX/18 = 生长阶段 0-6，各阶段允许的下方泥土不同；frameY 强制归 0；
   *  阶段 5 附带岩浆 bloom 切换（液体>16 → 83 成熟→84 绽放，反之退回） */
  private checkAlch(x: number, y: number) {
    const st = this.world.store;
    const i5 = this.idx(x, y);
    const id = this.idx(x, y + 1);
    let bad = false;
    if (!st.flags[id]) bad = true;      // 下方无 active tile
    if (st.half[id]) bad = true;        // halfBrick 不算依附面
    const stage = (st.frameX[i5] / 18) | 0;
    st.frameY[i5] = 0;
    if (!bad && stage >= 0 && stage < this.alchSoilIds.length) {
      if (!this.alchSoilIds[stage].has(st.type[id])) bad = true;
      // 药草泡岩浆必枯——★唯独 case 5 无此款（cs:46062-46065：雪族阶段以 bloom
      //  切换替代岩浆枯杀——82 豁免直 break，83↔84 随液位互转；XXXXX 批实证
      //  t82@fx90 三格 JS 误杀=金标存活）
      if (stage !== 5 && st.liquid[i5] > 0 && st.liquidType[i5] === 2) bad = true;
    }
    if (bad) { this.killTileAt(x, y); return; }
    // 阶段 5 bloom 切换（45981+ case 5 尾段）：Daybloom(82) 豁免，仅岩浆格生效
    // ★R8-22:anyLava()=liquid>0 && lava（Tile.cs:416-422,WG57:46451）——液退净残型
    // 岩浆不做 83↔84 互转
    if (stage !== 5) return;
    const t = st.type[i5];
    if (t === this.herbSproutId || !(st.liquid[i5] > 0 && st.liquidType[i5] === 2)) return;
    if (st.liquid[i5] > 16) {
      if (t === this.herbMatureId) st.setTile(x, y, this.herbBloomId, st.frameX[i5], st.frameY[i5]);
    } else if (t === this.herbBloomId) {
      st.setTile(x, y, this.herbMatureId, st.frameX[i5], st.frameY[i5]);
    }
  }

  /** WorldGen.CheckLilyPad（WorldGen.cs:59227-59324）：睡莲只能浮在水面——
   *  非水即 KillTile；frameY 按水底泥土族选行（0/18/36）；水位涨落整体上下移一格 */
  private checkLilyPad(x: number, y: number) {
    const st = this.world.store;
    const i5 = this.idx(x, y);
    if (st.liquidType[i5] !== 1) { this.killTileAt(x, y); return; } // 非水 → 掉落清除
    // 向下找第一个实心格（原版 tileSolid && !tileSolidTop；tileSolidTop 的家具族
    // 本仓库 defs 均 non-solid，platform 标志位近似）
    let fy = y;
    for (;;) {
      const fi = this.idx(x, fy);
      const d = TILE_DEFS[st.type[fi]];
      if (st.flags[fi] && d?.solid && !d.platform) break;
      if (fy >= st.h - 50) { this.killTileAt(x, y); return; } // 落不到底 → 清除
      fy++;
    }
    const floorSheet = TILE_DEFS[st.type[this.idx(x, fy)]]?.vanilla?.sheet ?? -1;
    let row = -1;
    for (const [sheets, r] of LILY_FLOOR_ROWS) {
      if (sheets.has(floorSheet)) { row = r; break; }
    }
    if (row < 0) { this.killTileAt(x, y); return; } // 水底不是泥土族 → 清除
    if (row !== st.frameY[i5]) st.frameY[i5] = row;
    const iu = i5 - st.w, ib = i5 + st.w;
    if (st.liquid[iu] > 0 && !st.flags[iu]) {
      // 上方涨水且为空 → 整个垫上移一格（59266-59281）
      st.setTile(x, y - 1, this.lilyPadId, st.frameX[i5], st.frameY[i5]);
      st.setTile(x, y, 0);
    } else {
      if (st.liquid[i5] !== 0) return; // 本格仍有液体 → 保持
      const belowDef = TILE_DEFS[st.type[ib]];
      if (!st.flags[ib]) {
        // 下方退水成空 → 下移一格（59289-59304）
        st.setTile(x, y + 1, this.lilyPadId, st.frameX[i5], st.frameY[i5]);
        st.setTile(x, y, 0);
      } else if (!belowDef?.platform && (!belowDef?.solid
        || LILY_SOLIDTOP_KILL.has(TILE_DEFS[st.type[ib]]?.vanilla?.sheet ?? -1))) {
        // 下方被非平台实心家具占据 → 掉落清除（59305-59312: !Platform &&
        // (!tileSolid || tileSolidTop)——solid∧solidTop∧非平台族仅 {239,380}
        // （Main.cs:9798/9800 梁/花箱,Platforms 表无之）;★R8-21 曾漏 solidTop 半边;
        //   门 10 tileSolidTop=false（Main.cs 无赋值）原版保垫——红队该半句有误）
        this.killTileAt(x, y);
      }
    }
  }

  // ================= 读档沉降：QuickWater（Liquid.cs:85-103 / 105-212） =================

  /** Liquid.tilesIgnoreWater（cs:68-72）：SetBoulderSolidity(!ignoreSolids) + tileSolid[546]。
   *  实现为 solidNP 原位翻转+备份恢复——等价原版全局 Main.tileSolid 改写（含
   *  LiquidCheck 侧 WorldGen.SolidTile 等全部读者）。SettleWaterAt 逐调用的
   *  首/尾再翻转（cs:119/211）在 quickWater 包裹下语义等价，不重复执行。 */
  private tilesIgnoreWater(ignoreSolids: boolean): void {
    if (ignoreSolids) {
      if (this.solidNPBackup) return;
      this.solidNPBackup = this.solidNP.slice();
      for (const id of this.boulderFamilyIds) this.solidNP[id] = 0;
      if (this.id546 >= 0) this.solidNP[this.id546] = 0;
    } else if (this.solidNPBackup) {
      this.solidNP.set(this.solidNPBackup);
      this.solidNPBackup = null;
    }
  }

  /** Liquid.worldGenTilesIgnoreWater（Liquid.cs:74-79）：生成期沉降 pass 全程把
   *  10/190/191/192 置非实心。原版在 pass 委托首尾调用（cs:21067/21110）——
   *  由 settleWorldLiquids('gen') 接线 */
  worldGenTilesIgnoreWater(ignoreSolids: boolean): void {
    if (ignoreSolids) {
      if (this.solidNPBackupWG) return;
      this.solidNPBackupWG = this.solidNP.slice();
      for (const id of this.worldGenIgnoreIds) this.solidNP[id] = 0;
    } else if (this.solidNPBackupWG) {
      this.solidNP.set(this.solidNPBackupWG);
      this.solidNPBackupWG = null;
    }
  }

  /** 生成期 tileSolid 覆写注入（原版 Main.tileSolid 在生成期被各 pass 直接改写：
   *  裂纹砖 481-483（SmoothWorld 尾起恒 false）、484 滚动仙人掌（恒 false）、
   *  192 活叶块（false）等——LiquidSim 的 solidNP LUT 取 TILE_DEFS 静态初值，
   *  不读 GenSolid 覆写表 → 生成期沉降把这些族当实心墙（#97 wc 相位 17 格：
   *  (343..359,880) 裂纹砖 170 液被误清零）。gen 模式沉降前由 settleWorldLiquids
   *  注入当前 GenSolid 快照；sim 用后即弃（dispose），无需还原 */
  applyGenSolidOverrides(overrides: Map<number, boolean>): void {
    for (const [id, solid] of overrides) this.solidNP[id] = solid ? 1 : 0;
  }

  /** 自底向上逐湿格直接搬运沉降（原版 QuickWater(verbose, -1, -1)：y 从 h-3 到 3）。
   *  生成期首尾各调一次 ShimmerRemoveWater（Liquid.cs:107/137 + WorldGen.cs:34859）；
   *  全程 tileSolid[379]=true + tilesIgnoreWater(true)（巨石家族非实心） */
  quickWater(minY = 3, maxY = -1) {
    const st = this.world.store;
    if (this.generatingWorld) this.shimmerRemoveWater();
    if (this.id379 >= 0) this.solidNP[this.id379] = 1; // Main.tileSolid[379]=true（原版持续不恢复）
    this.tilesIgnoreWater(true);
    const yMax = maxY < 0 ? st.h - 3 : maxY;
    for (let y = yMax; y >= minY; y--) {
      for (let x = 4; x < st.w - 4; x++) {
        if (st.liquid[this.idx(x, y)] !== 0) this.settleWaterAt(x, y);
      }
    }
    this.tilesIgnoreWater(false);
    if (this.generatingWorld) this.shimmerRemoveWater();
    if (this.generatingWorld) this.liquidInteractionsCleanup();
  }

  /** WorldGen.LiquidInteractionsCleanup（cs:23898-24015，QuickWater 尾 generatingWorld
   *  门）：黑曜石56/Aetherium659 活性格——先清自身液体；四邻（非活且湿才计数）按
   *  类型计数 water/lava/honey/shimmer；≥2 种异型邻 → 保持清空（continue）；否则整格
   *  ClearEverything 并注满 255 的对应类型（无湿邻：56→岩浆/659→微光——把生成期
   *  误产块还原成液体）。★原版笔误保留：上邻==3（微光）计入 num5（水）而非 num8 */
  private liquidInteractionsCleanup() {
    const st = this.world.store;
    for (let x = 1; x < st.w - 2; x++) {
      for (let y = 1; y < st.h - 2; y++) {
        const i = this.idx(x, y);
        if (!st.flags[i]) continue;
        const t = st.type[i];
        const sheet = SHEET_OF[t] ?? -1;
        if (sheet !== 56 && sheet !== 659) continue;
        st.liquid[i] = 0;
        st.liquidType[i] = 0;
        const l = this.idx(x - 1, y), r = this.idx(x + 1, y), u = this.idx(x, y - 1), d = this.idx(x, y + 1);
        const wet = (j: number) => (!st.flags[j] && st.liquid[j] > 0 ? st.liquidType[j] - 1 : -1); // 0基
        const num = wet(l), num2 = wet(r), num3 = wet(u), num4 = wet(d);
        let n5 = 0, n6 = 0, n7 = 0, n8 = 0;
        if (num === 0) n5++; if (num2 === 0) n5++; if (num3 === 0) n5++; if (num4 === 0) n5++;
        if (num === 1) n6++; if (num2 === 1) n6++; if (num3 === 1) n6++; if (num4 === 1) n6++;
        if (num === 2) n7++; if (num2 === 2) n7++; if (num3 === 2) n7++; if (num4 === 2) n7++;
        if (num === 3) n8++; if (num2 === 3) n8++;
        if (num3 === 3) n5++; // 原版笔误（cs:23968）：上邻微光计水
        if (num4 === 3) n8++;
        if ((n5 > 0 && (n6 > 0 || n7 > 0 || n8 > 0)) || (n6 > 0 && (n5 > 0 || n7 > 0 || n8 > 0))
          || (n7 > 0 && (n5 > 0 || n6 > 0 || n8 > 0)) || (n8 > 0 && (n5 > 0 || n6 > 0 || n7 > 0))) continue;
        let liquidType = 0;
        if (n5 === 0 && n6 === 0 && n7 === 0 && n8 === 0) liquidType = sheet === 56 ? 1 : 3;
        if (n5 > 0) liquidType = 0;
        else if (n6 > 0) liquidType = 1;
        else if (n7 > 0) liquidType = 2;
        else if (n8 > 0) liquidType = 3;
        // ClearEverything：活性/类型/墙/液体/线全清 + 注满 255
        st.setTileSilent(x, y, 0);
        st.wall[i] = 0;
        st.liquid[i] = 255;
        st.liquidType[i] = liquidType + 1;
      }
    }
  }

  /** WorldGen.ShimmerRemoveWater（cs:34859-34886）：以太腔 150 半径球内清除
   *  非微光液体 + 去活薄冰 162——防沉降期周边湖/洞穴水灌入腔体与微光互转 Aetherium */
  private shimmerRemoveWater() {
    const c = this.shimmerCenter;
    if (!c) return;
    const st = this.world.store;
    const R = 150;
    const x0 = c.x - R, x1 = c.x + R, y0 = c.y - R, y1 = c.y + R / 2;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!st.inBounds(x, y)) continue;
        // 原版 (int)Math.Sqrt(dx²+dy²) < 150（整数平方根比较）
        const dx = Math.abs(x - c.x), dy = Math.abs(y - c.y);
        if (Math.trunc(Math.sqrt(dx * dx + dy * dy)) >= R) continue;
        const i = st.idx(x, y);
        if (st.liquidType[i] !== 4) st.liquid[i] = 0;
        if (st.type[i] === THIN_ICE) st.flags[i] = 0; // active(false)——幽灵 type 由 finalize 归零
      }
    }
  }

  /** 单格液体直接搬到最终落点（Liquid.cs:105-212 逐行对照） */
  private settleWaterAt(originX: number, originY: number) {
    const st = this.world.store;
    const oi = this.idx(originX, originY);
    // cs:118-122：379（泡泡,QuickWater 已置实心）活性格液体原地保留不沉降
    if (st.flags[oi] && SHEET_OF[st.type[oi]] === 379) return;
    if (st.liquid[oi] === 0) return;
    let X = originX, Y = originY;
    const srcType = st.liquidType[oi];
    const originWall = st.wall[oi];
    let type = srcType;   // b：可变类型（下落越线转换后落点/配对判定用它）
    let liquid = st.liquid[oi];
    LiquidSim.settleEv?.('S', `${originX}|${originY}|${liquid}|${type}`);
    // ★IIIII70b 定点状态转储：指定 origin 调用前抓 129×129 邻域 13 通道（py 复刻器输入）
    if (globalThis.__sw76OrigSnap !== undefined && globalThis.__sw76OrigSnap === originX * st.h + originY && globalThis.__sw76Grab instanceof Function) {
      globalThis.__sw76Grab(originX, originY);
    }
    st.liquid[oi] = 0;
    let flag1 = true;
    let fellAny = false; // ★IIIII70b 取证钩伴生：全程是否发生过下落（观测用）
    for (;;) {
      LiquidSim.settleEv?.('O', `${X}|${Y}|${liquid}|${type}`);
      // 1) 垂直下落：下方空且可通行就一直落（Liquid.cs:121-130）
      let flag2 = false;
      while (Y < st.h - 5 && st.liquid[this.idx(X, Y + 1)] === 0 && !this.blocksLiquid(X, Y + 1)) {
        Y++;
        flag2 = true;
        flag1 = false;
      }
      // Liquid.cs:177-190：生成/读档期且本轮有下落、源非蜜非微光 →
      //   越过 GenVars.waterLine 落点转岩浆（b=1/本仓 2）；地牢墙豁免回水（b=0/本仓 1）
      // ★IIIII58 REMIX 分支（Liquid.cs:182-185 三元首臂）：remixWorldGen 时**恒改写**
      //   类型——(y>GenVars.lavaLine && (y<(int)Main.rockLayer-80 || y>maxTilesY-350)
      //   && !oceanDepths(x,y)) → 岩浆，否则**强制归水**（含原为岩浆的落体）。
      if (flag2 && this.isGeneratingOrLoadingWorld && srcType !== 3 && srcType !== 4) {
        if (this.remixWaterRule) {
          const ok = Y > this.remixLavaLine
            && (Y < this.remixRockLevel - 80 || Y > st.h - 350)
            && !(Y <= this.remixOceanLevel && (X < 380 || X > st.w - 380));
          type = ok ? 2 : 1;
        } else if (this.genWaterLine !== null && Y > this.genWaterLine) {
          type = 2;
        }
        if (this.generatingWorld && this.dungeonWaterExempt?.(X, Y, originWall)) type = 1;
      }
      // 2) 蛇形横向铺开（Liquid.cs:131-195）
      let dir = -1;          // num2：当前行走方向
      let step = 0;          // num3：当前行步数
      let lastDir = -1;      // num4：最后空位方向
      let lastStep = 0;      // num5：最后空位步数
      let hitL = false;      // flag4：左边界
      let hitR = false;      // flag3：右边界
      let dropped = false;   // flag5：本轮发生下落
      for (;;) {
        const probeX = X + step * dir;
        // 越界防护：原版 C# 越界会抛异常，JS 的 idx 会静默回绕到上一行——
        // 超出 [0, w-1] 的探测一律视为边界命中，不再读取
        if (probeX < 0 || probeX >= st.w) {
          if (dir === -1) hitL = true; else hitR = true;
          if (hitL && hitR) break;
          if (hitR) { dir = -1; step++; }
          else if (hitL) { if (dir === 1) step++; dir = 1; }
          else { if (dir === 1) step++; dir = -dir; }
          continue;
        }
        const ci = this.idx(probeX, Y);
        if (st.liquid[ci] === 0) { lastDir = dir; lastStep = step; }
        if (dir === -1 && probeX < 5) hitL = true;
        else if (dir === 1 && probeX > st.w - 5) hitR = true;
        const bi = this.idx(probeX, Y + 1);
        if (LiquidSim.trOn && originX === LiquidSim.trX && originY === LiquidSim.trY && LiquidSim.settleEv) {
          const ahx = X + (step + 1) * dir;
          const aIn = ahx >= 0 && ahx < st.w;
          LiquidSim.settleEv('P', `it${++LiquidSim.trSeq} probe=(${probeX},${Y}) below=(${probeX},${Y + 1}) bl=${st.liquid[bi]} bt=${SHEET_OF[st.type[bi]] ?? -1} act=${st.flags[bi] ? 1 : 0} blk=${this.blocksLiquid(probeX, Y + 1) ? 1 : 0} dir=${dir} st=${step} aheadT=${aIn ? (SHEET_OF[st.type[this.idx(ahx, Y)]] ?? -1) : -2} awet=${aIn ? st.liquid[this.idx(ahx, Y)] : -2} abl=${aIn && this.blocksLiquid(ahx, Y) ? 1 : 0} f3=${flag1 ? 1 : 0}`);
        }
        // 侧下方同类型未满 → 直接灌入（Liquid.cs:149-159；类型比较用转换后的 b）
        if (st.liquid[bi] !== 0 && st.liquid[bi] !== 255 && st.liquidType[bi] === type) {
          LiquidSim.settleEv?.('M', `${probeX}|${Y + 1}|${st.liquid[bi]}|${type - 1}`);
          let t = 255 - st.liquid[bi];
          if (LiquidSim.trOn && originX === LiquidSim.trX && originY === LiquidSim.trY && LiquidSim.settleEv) {
            LiquidSim.settleEv('P', `it${++LiquidSim.trSeq} MERGE@${probeX},${Y + 1} amt=${t} left=${liquid - t} step=${step} dir=${dir}`);
          }
          if (t > liquid) t = liquid;
          st.liquid[bi] += t;
          liquid -= t;
          if (liquid === 0) break;
        }
        if (Y >= st.h - 5 || st.liquid[bi] !== 0 || this.blocksLiquid(probeX, Y + 1)) {
          // 下方堵住 → 沿行继续 / 折返（Liquid.cs:162-191）
          const aheadX = X + (step + 1) * dir;
          const inRange = aheadX >= 0 && aheadX < st.w;
          const ni = inRange ? this.idx(aheadX, Y) : -1;
          const nAmt = ni >= 0 ? st.liquid[ni] : 0;
          const nSolid = inRange ? this.blocksLiquid(aheadX, Y) : true;
          if ((nAmt !== 0 && (!flag1 || dir !== 1)) || nSolid) {
            if (dir === 1) hitR = true; else hitL = true;
          }
          if (hitL && hitR) break;
          if (hitR) { dir = -1; step++; }
          else if (hitL) { if (dir === 1) step++; dir = 1; }
          else { if (dir === 1) step++; dir = -dir; }
        } else {
          dropped = true;
          break;
        }
      }
      if (flag2 || dropped) fellAny = true;
      // ★IIIII70b 微观测：指定 origin 的逐 probe 决策迹（SW_I76TRACEORG 配套）
      if (LiquidSim.trOn && originX === LiquidSim.trX && originY === LiquidSim.trY && LiquidSim.settleEv) {
        LiquidSim.settleEv('P', `it${++LiquidSim.trSeq} descEnd=${X},${Y} f1=${flag1 ? 1 : 0} dropped=${dropped ? 1 : 0} dir=${dir} step=${step} lastDir=${lastDir} lastStep=${lastStep} hitL=${hitL ? 1 : 0} hitR=${hitR ? 1 : 0}`);
      }
      // 落点写回钳制到有效列（防 lastDir/lastStep 记录异常时把液体写出世界）
      X = Math.max(2, Math.min(st.w - 3, X + lastStep * lastDir));
      if (liquid !== 0 && dropped) {
        Y++;
        LiquidSim.settleEv?.('F', `${X}|${Y}|${liquid}|${type}|${step}|${lastStep}|${lastDir}`);
      } else break;
    }
    // 3) 写回落点（Liquid.cs:204-205：类型用转换后的 b）
    const fi = this.idx(X, Y);
    LiquidSim.settleEv?.('L', `${X}|${Y}|${liquid}|${type}`);
    st.liquid[fi] = liquid;
    st.liquidType[fi] = type;
    if (LiquidSim.settleProbe !== null && liquid > 0 && this.inSettleBox(X, Y)) {
      LiquidSim.settleProbe('settle', originX, originY, X, Y, liquid, srcType, fellAny, originWall);
    }
    if (st.liquid[fi] > 0) {
      // 落地即交互（Liquid.cs:206-210 / AttemptToMoveLava/Honey/Shimmer 248-432）
      this.attemptToMoveLiquid(X, Y, srcType, 2);
      this.attemptToMoveLiquid(X, Y, srcType, 3);
      this.attemptToMoveLiquid(X, Y, srcType, 4);
    }
  }

  /** 落点与异种液体相邻时触发交互检查（Liquid.cs:248-432 AttemptToMoveLava/Honey/Shimmer 同构）。
   *  原版语义：邻居的 target 性 != 落点格的 target 性 才算"异种相遇"——
   *  水落水旁不算，水落岩浆旁才算（否则整片海洋互相当岩浆转黑曜石） */
  private attemptToMoveLiquid(X: number, Y: number, srcType: number, targetType: number) {
    const st = this.world.store;
    const srcIs = srcType === targetType;
    const check = targetType === 2 ? (x: number, y: number) => this.lavaCheck(x, y)
      : targetType === 3 ? (x: number, y: number) => this.honeyCheck(x, y)
      : (x: number, y: number) => this.shimmerCheck(x, y);
    const diff = (x: number, y: number) => {
      const i = this.idx(x, y);
      return st.liquid[i] > 0 && (st.liquidType[i] === targetType) !== srcIs;
    };
    if (diff(X - 1, Y)) { if (srcIs) check(X, Y); else check(X - 1, Y); }
    else if (diff(X + 1, Y)) { if (srcIs) check(X, Y); else check(X + 1, Y); }
    else if (diff(X, Y - 1)) { if (srcIs) check(X, Y); else check(X, Y - 1); }
    else if (diff(X, Y + 1)) { if (srcIs) check(X, Y); else check(X, Y + 1); }
  }

  // ================= WaterCheck（1456 WorldGen.cs:81154 / 1457 :81692） =================

  /** 全图自底向上重建活动列表：能流的/液面不齐的/岩浆旁有异种的都入列 */
  waterCheck() {
    // WorldGen.cs:81156：首尾 tilesIgnoreWater(true/false)——重建期间巨石家族/546
    // 非实心（液体可停留其内并入列）
    this.tilesIgnoreWater(true);
    try {
      this.waterCheckInner();
    } finally {
      this.tilesIgnoreWater(false);
    }
  }

  /** TileObjectData.CheckLavaDeath/CheckWaterDeath（cs:5064-5111）对象感知镜像：
   *  _data[type] 无条目或 UsesGlobalLiquidChecks → 全局表；否则按 (frameX,frameY)
   *  解析 style/alt 取对象值。style 解析用 C# int 除法（向零截断——frameX=-1 时
   *  floor 会差 1 档）。 */
  private diesIn(t: number, fx: number, fy: number, isLava: boolean): boolean {
    const rec: TodEntry | undefined = TILE_OBJECT_DEATH[SHEET_OF[t]!];
    if (rec === undefined || rec.d === null && !Object.keys(rec.subs).length && !rec.alts.length) {
      return isLava ? this.lavaDeathIds.has(t) : this.waterDeathIds.has(t);
    }
    const tr = (v: number, d: number) => Math.trunc(v / d);   // C# int 除法
    const num = tr(fx, rec.fw), num2 = tr(fy, rec.fh);
    const swl = rec.swl === 0 ? 1 : rec.swl;
    const n4 = rec.sh === 1 ? num2 * swl + num : num * swl + num2;
    let style = tr(n4, rec.sm), alt = ((n4 % rec.sm) + rec.sm) % rec.sm;
    if (rec.sls > 1) {
      if (rec.sh === 1) { style = tr(num2, rec.sls) * swl + num; alt = ((num2 % rec.sls) + rec.sls) % rec.sls; }
      else { style = tr(num, rec.sls) * swl + num2; alt = ((num % rec.sls) + rec.sls) % rec.sls; }
    }
    let d: readonly [number, number] | null = rec.d;
    let alts = rec.alts;
    const sub = rec.subs[String(style)];
    if (sub !== undefined) { d = sub.d; alts = sub.alts; }
    for (const a of alts) {
      if (a[0] <= alt && alt <= a[0] + a[1]) {
        d = [a[2] === null ? -1 : a[2], a[3] === null ? -1 : a[3]];
        break;
      }
    }
    if (d === null || d[isLava ? 0 : 1] === -1) {
      return isLava ? this.lavaDeathIds.has(t) : this.waterDeathIds.has(t);
    }
    return d[isLava ? 0 : 1] === 1;
  }

  private waterCheckInner() {
    const st = this.world.store;
    this.liquids.length = 0;
    this.numLiquid = 0;
    this.bufCount = 0; // 原版 WaterCheck 首行清 LiquidBuffer（1456 WorldGen.cs:81157）
    // ★IIIIIII4（ntb #98 掷窗分歧定罪修复）：checking 位必须【扫描到达时逐格清除】
    // （1456 WorldGen.cs:81160 / 1457 :81698——循环体内、谓词求值前
    // `tile.checkingLiquid(false)`），不能用全局 fill(0) 等价替换：
    // 同一次扫描里先行格的入列会把【未到达格】的 checking 置 1；原版在该格到达时
    // 先清位再评估自身下灌/侧流/岩浆四向三重入列门 ⇒ 自重新入列可达；旧 JS 却因
    // 残留位被 AddWater 头部拒收 → 重建表缺员/次序漂移（ntb #98 尾段 ±掷分歧源；
    // 同时已扫格外的残留位还污染邻居谓词 blocksLiquid 的通行性半边）。dry 格同样
    // 必须先清位（原版无 continue）。清扫域=内圈 [1..w-2]×[1..h-2] 与 AddWater 的
    // ≥5 边界守卫一致，边界带残留位不影响任何读者。
    for (let x = 1; x < st.w - 1; x++) {
      for (let y = st.h - 2; y > 0; y--) {
        const i = this.idx(x, y);
        this.checking[i] = 0; // 到场清位（1456 :81160 / 1457 :81698，dry/wet 一视同仁）
        if (st.liquid[i] === 0) continue;
        const t = st.type[i];
        const il = i - 1, ir = i + 1, iu = i - st.w, id = i + st.w;
        // ★VVV 批全量转写（1456 WorldGen.cs:81167-81220 / 1457 :81704-81757）：
        // 原版首分支谓词= liquid>0 ∧ nactive() ∧ Main.tileSolid ∧ !Main.tileSolidTop。
        // nactive()= active ∧ !checkingLiquid（Tile.cs:270）——因到场已清位，
        // 此处 checkingLiquid 恒 false ⇒ nactive ≡ active。★关键结构差异：不满足
        // 首分支（含【幽灵格 flags=0 但液体>0】与【在列 checking 格】）一律落 else-if，
        // 幽灵格虽跳过死亡检查、但下灌/侧流三重入列判定**照常执行**——JS 曾把
        // 整个 rebuild 尾段折进 active 门内，幽灵湿格整段漏重建 → 下一轮沉降活量/
        // 触点漂移（g#98 初轮 1283 格首见覆盖差 + 罐28×23 组/棺木42/丛林植物233
        // 孤儿块的全部直接根因；x86 W-probe 对拍实证）。
        // 379（泡泡,QuickWater 已置实心）例外保留液体且不复查（1456 :81170-74）。
        const nactive = st.flags[i] !== 0;
        let solidBr = false;
        if (t >= 0 && nactive && this.solidNP[t] === 1) {
          solidBr = true;
          if (SHEET_OF[t] !== 379) st.liquid[i] = 0;
        } else {
          if (st.flags[i] !== 0) {
            // 1456 WaterCheck L81172-81187：液体冲毁可死亡方块（走 KillTile）
            if (st.liquidType[i] === 2) { if (this.diesIn(t, st.frameX[i]!, st.frameY[i]!, true)) this.killTileAt(x, y); }
            else if (this.diesIn(t, st.frameX[i]!, st.frameY[i]!, false)) this.killTileAt(x, y);
          }
        }
        if (!solidBr) {
          // 下灌：下方可通且未满 → 液位 >250 直补满，否则当前格入列（cs:81190-81200）
          const dq = st.liquid[id];
          if (!this.blocksLiquid(x, y + 1) && dq < 255) {
            if (dq > 250) st.liquid[id] = 255;
            else this.addWater(x, y);
          }
          // 侧流：左或右液位不等 → 当前格入列（cs:81202-81204）
          if (!this.blocksLiquid(x - 1, y) && st.liquid[il] !== st.liquid[i]) this.addWater(x, y);
          else if (!this.blocksLiquid(x + 1, y) && st.liquid[ir] !== st.liquid[i]) this.addWater(x, y);
          // 岩浆旁异种液体四向复查（cs:81205-81217）
          if (st.liquidType[i] === 2) {
            if ((st.liquid[il] > 0 && st.liquidType[il] !== 2) ||
                (st.liquid[ir] > 0 && st.liquidType[ir] !== 2) ||
                (st.liquid[iu] > 0 && st.liquidType[iu] !== 2) ||
                (dq > 0 && st.liquidType[id] !== 2)) this.addWater(x, y);
          }
        }
      }
    }
  }
}
