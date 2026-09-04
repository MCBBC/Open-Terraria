// 原版 TrackGenerator 1:1 移植（Terraria.GameContent.Generation/TrackGenerator.cs 全文 +
// MicroBiomes pass 矿轨段 WorldGen.cs:22014-22091）。
// 长轨(LongTrackCount 1-2 ×WorldWidth,长 400-1000 ×WorldWidth)+ 标准轨
// (StandardTrackCount 4-7 ×WorldArea,长 150-300 ×WorldWidth)两段,tile 314。
//
// 算法是**自包含的确定性历史改写搜索**(非 AStar),除 PlacePath 外零掷骰:
//   CreateTrackStart:预填 4096 格历史(初始全部 Down 坡) → FindPath:
//     slope 追加(前一格 Up 则 Straight 否则 Down) → TryRewriteHistoryToAvoidTiles
//     (≤25 格回溯改坡避障) → 仍 Obstructed 则 CreateTunnel(隧道模式,最多 10 格) →
//     SmoothTrack(反向扫,15 格窗口内抹平洼地) → PlacePath(清轨巷 → 铺 314)。
// PlacePath 掷骰(cs:88-91/119-122):每列 Next(7),1/7 重掷 playerHeight=Next(5,9)。
// 铺轨与帧链交织:列 k 落块后即对列 k-1 上扫 8 格 TileFrame(frameNeighbors:true)
// (cs:150-153,邻格 184 苔藓 Next(3) 掷即此链),末列再收尾 playerHeight 格
// (cs:154-160);314 格自分派 frameTrack(= Minecart.FrameTrack,TileFrameImportant
// case 314 → WorldGen.cs:86033)写前/后轨连接 ID(frameX/frameY)。
//
// 已知近似(注明):
//  - SecretSeed.dualDungeons / errorWorld / notTheBees(225 豁免)分支未接
//  - PlaceTile(138) 式失败语义不可复现处均按"落块成功"处理(生成期轨道巷已掏空)
//  - KillTile 的 58 地狱
//    岩浆支/419 逻辑门/TruncatesWalls 族同 killTileGen 先例不移植(轨道巷不可达)
// 帧链与击杀链(AAAAA 批 1:1):巷道 KillTile = 尘掷+击杀+SquareTileFrame;
//  铺轨逐列 WorldUtils.TileFrame(frameNeighbors:true) 上扫 8 格(cs:150-153)
//  + 末列收尾 playerHeight 格(cs:154-160)+ 压板支 PlaceTile 尾部
//  SquareTileFrame(cs:60297)——复用 FinalCleanupPass 引擎(314 格自分派
//  frameTrack,引擎无 case 314 支)。
// 坡面修整链(FFFFF 批 1:1):Tile.SmoothSlope(X,Y+1)/(X,Y-playerHeight)
//  (cs:124-128,含邻 pass 与 CanPoundTile/CanKillTile 全门)——写坡/半砖状态,
//  本轨列帧链与后续轨 SolidTile 谓词都读(详文件中 SmoothSlope 节)。
import { TileStore } from '../../TileStore';
import type { RNG } from '../../../core/rng';
import type { GenState } from './GenState';
import { TILE_DEFS } from '../../../data/tiles';
import { idsByVanillaSheet } from './TileRunner';
import { genSquareTileFrame, genTileFrame } from './FinalCleanupPass';
import { TRACK_TILE, frameTrack } from '../../MinecartTrack';
import { vanGenSolidType } from './GenSolid';
import { hfIs1457 } from './HellFortPass';

/** FFFFF 探针:placePath 逐列步进钩(harness _wwwrep 经 __setTrackStepProbe 安装;
 *  缺省 undefined 零开销)。loop 1=清轨巷遍/2=铺轨遍。 */
let __trackStepProbe: ((loop: number, k: number, x: number, y: number, ph: number) => void) | undefined;
export function __setTrackStepProbe(fn: ((loop: number, k: number, x: number, y: number, ph: number) => void) | undefined): void {
  __trackStepProbe = fn;
}

/** FFFFF 探针:tf314 分派前活性格快照钩(harness 装卸;undefined 零开销) */
let __tfCellProbe: ((sheet: number, x: number, y: number, fx: number, fy: number) => void) | undefined;
export function __setTfCellProbe(fn: ((sheet: number, x: number, y: number, fx: number, fy: number) => void) | undefined): void {
  __tfCellProbe = fn;
}

/** IIII190 探针:killTileLane 入口逐杀钩(JJHook KLOG 同格式镜像;undefined 零开销)。
 *  签名 (draws, x, y, sheet, fx, fy)——draws=当前掷计数钩(由仪器注入,缺省 0)。 */
let __trackKillProbe: ((draws: number, x: number, y: number, sheet: number, fx: number, fy: number) => void) | undefined;
let __trackKillDraws: (() => number) | undefined;
export function __setTrackKillProbe(fn: ((draws: number, x: number, y: number, sheet: number, fx: number, fy: number) => void) | undefined, draws?: () => number): void {
  __trackKillProbe = fn;
  __trackKillDraws = draws;
}

/** ★IIIII209 探针:findPath 终态历史转储钩（x86 rig TH/TPFP 行同格式对拍;undefined 零开销）。
 *  tag: 'TPFS'（FindSuitableOrigin 失败,参数=调整后 origin）/ 'TPFP FAIL'|'TPFP OK'（len,dir）。 */
export interface TrackHistCell { x: number; y: number; slope: number; mode: number }
let __trackHistProbe: ((tag: string, hist: TrackHistCell[], len: number, dir: number, ox: number, oy: number) => void) | undefined;
export function __setTrackHistProbe(fn: ((tag: string, hist: TrackHistCell[], len: number, dir: number, ox: number, oy: number) => void) | undefined): void {
  __trackHistProbe = fn;
}

/** ★IIIII209 探针:placePath 逐列累计掷数钩（x86 rig P1/P2 行同口径=环起点起累计;undefined 零开销） */
let __trackColProbe: ((loop: number, k: number, x: number, y: number, ph: number, rc: number) => void) | undefined;
export function __setTrackColProbe(fn: ((loop: number, k: number, x: number, y: number, ph: number, rc: number) => void) | undefined): void {
  __trackColProbe = fn;
}
let __trackDraws: (() => number) | undefined;
export function __setTrackDraws(fn: (() => number) | undefined): void {
  __trackDraws = fn;
}

// ============================================================
// Tile.SmoothSlope 链(cs:822-888 + CanPoundTile cs:81434-81479 +
// CanKillTile cs:62249-62402)——FFFFF 批 1:1 补齐
// ★AAAAA 批曾按"RNG 零掷,帧链无关"整体省略 cs:124/127 两调——错在它**写坡/半砖
//   状态**:①本轨自己的列帧链(列 k-1 的 8 连 TileFrame)立刻读它(实测 #101 金标
//   种子:ice (1215,741) 被邻 pass 写 sl3 → 下帧 gem 178 CheckAndAdjust 锚败击杀,
//   掷侧零差——JS 因未写坡 gem 存活到 k=725 帧链 resetFrame=true → 多掷 5×Next(3)
//   = 掷流 166921 首差的真根);②后续轨的 SolidTile 谓词读坡(slope!=0 非实心)。
// ============================================================
/** CanPoundTile 型门(cs:81445-81453):门/助推轨/巨石族等禁 pounded 坡面(vanilla 型号) */
const POUND_BLOCK_SHEETS = new Set([10, 48, 137, 232, 380, 387, 388, 476, 484]);
/** ForbidsSloping(cs:81484-81504):上方挂靠这些型禁坡 */
const FORBIDS_SLOPING_SHEETS = new Set([21, 26, 77, 88, 235, 237, 441, 467, 468, 470, 475, 488, 597]);
/** TileID.Sets.Boulders(TileID.cs:195) */
const BOULDER_SS = new Set([138, 484, 664, 665, 711, 712, 713, 714, 715, 716]);
/** TileID.Sets.IsATreeTrunk(CanKillTile cs:62276 消费) */
const TREE_TRUNK_SS = new Set([5, 72, 583, 584, 585, 586, 587, 588, 589, 596, 616, 634]);
/** TileID.Sets.PreventsTileRemovalIfOnTopOfIt(TileID.cs:169;HasReasonToReturnEarly) */
const PREVENTS_REMOVAL_SS = new Set([5, 323, 72, 488, 26, 583, 584, 585, 586, 587, 588, 589, 596, 616, 470, 475, 634]);
/** TileID.Sets.IsAContainer(TileID.cs:405) */
const CONTAINER_SS = new Set([21, 467, 88]);
/** Main.tileMoss(Main.cs:6956-6996)——KillTile fail 支苔藓→石转换族 */
const TILE_MOSS_SS = new Set([179, 180, 181, 182, 183, 381, 534, 536, 539, 625, 627]);
/** TileID.Sets.tileMossBrick(TileID.cs:309)——fail 支 moss 砖→38(Stone Slab? cs:64246) */
const TILE_MOSS_BRICK_SS = new Set([512, 513, 514, 515, 516, 517, 535, 537, 540, 626, 628]);
/** sheet → 内部 id(单射假设下取首个;fail 支类型回退写用) */
const ID_OF_SHEET = new Map<number, number>();
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number' && !ID_OF_SHEET.has(s)) ID_OF_SHEET.set(s, i);
}
/** CheckPile 地基族带(TileID.cs:24-34):Snow/Ice/Sand/HardenedSand/Sandstone */
const SNOW_SS = new Set([147]);
const ICE_SS = new Set([161, 163, 164, 200]);
const SAND_SS = new Set([53, 112, 116, 234]);
const HARDSAND_SS = new Set([397, 398, 402, 399]);
const SANDSTONE_SS = new Set([396, 400, 403, 401]);
/** 单型号门用 vanilla 型号值(经 SHEET_OF 比较) */
const S_DOOR = 10, S_MUSICBOX = 235, S_CHEST = 21, S_CHEST2 = 467, S_CHEST3 = 88;
const S_PALM = 72, S_MUSH = 26, S_TABLE = 77, S_DRESSER = 88, S_SAPLING = 467, S_PINE = 488;
const S_CACTUS = 80, S_PALM_SAP = 323, S_OLDSAND = 190, S_MUD = 30;

/** type → vanilla sheet(FinalCleanupPass.SWEEP_SHEET 同构;私有不可导出) */
const SHEET_OF = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET_OF[i] = s;
}

/** ★III12：生成期 Main.tileSolid 直读镜像（Main.cs:7995 tileSolid[0]=true，全树无复位）。
 *  原版 CheckTileBreakability(cs:62432)/SolidOrSlopedTile/SolidTileAllowBottomSlope/
 *  AllowTop-Left-RightSlope 族都直读该可变数组——本仓转译域 x86 真 sheet0(土)全部
 *  落内部 id0+active（见 MicroBiomesPass.mbTileSolidGen 同构注释），曾用 vanGenSolidType
 *  → 轨道避障/坡面门在 alias 土格语义翻转，LTRK 单次成功 place 差 −13 掷。
 *  生产域 id1('dirt') 本就 solid=true、真空格 flags=0 不入 active 门——两侧等价。 */
const __trkMirrorOn = typeof process === 'undefined' || process.env.SW_MB_MIRROR !== 'off';
function trkTileSolidGen(t: number): boolean {
  if (!__trkMirrorOn) return vanGenSolidType(t);
  if (t === 0 || (SHEET_OF[t] ?? -1) === 0) return true;
  return vanGenSolidType(t);
}

// ============================================================
// KillTile 尘掷表(RRRR 批 2026-08-19 实测定谳,与 FinalCleanupPass 同源;
// killTileGen 私有不可导出——全表复刻。轨道巷语境 404 化石连锁/58 地狱岩浆/
// 419 逻辑门/TruncatesWalls 族不可达,同 killTileGen 先例不移植)
// ============================================================
/** KillTile_GetTileDustAmount(cs:66654)。fail 参数=1457 全档:true 支(cs:67119-67208)
 *  default→3 / 231→3 / 534·536·539·625·627→3 / 184(fx/22<5)→3——IIII26 批按反编译源
 *  补齐 fail 档(轨道巷 brk==1 走此分支;brk==0 与旧表一致)。 */
function killTileDustAmount(sheet: number, fx: number, fail = false): number {
  const small = fail ? 3 : 10;
  if (sheet === 654 || sheet === 630 || sheet === 631) return 0;
  if (sheet === 125 || sheet === 138 || sheet === 172 || sheet === 287
    || (sheet >= 300 && sheet <= 308) || sheet === 354 || sheet === 355
    || (sheet >= 373 && sheet <= 376) || sheet === 461 || sheet === 484 || sheet === 499
    || sheet === 564 || sheet === 565 || sheet === 593 || sheet === 594 || sheet === 617
    || sheet === 664 || sheet === 665 || sheet === 699 || sheet === 709
    || (sheet >= 711 && sheet <= 716)) return 0;
  if (sheet === 231) return fail ? 3 : 6;
  if (sheet >= 481 && sheet <= 483) return 3;
  if (sheet === 541) return 1;
  if (sheet === 549) return 2;
  if (sheet === 534 || sheet === 536 || sheet === 539 || sheet === 625 || sheet === 627) return fail ? 3 : 5;
  if (sheet === 184) return Math.floor(fx / 22) >= 5 ? 5 : small;
  return small;
}
/** MakeTileDust 每调的 genRand 掷(cs:66744+,RRRR 实测表) */
const FURNITURE_DUST = new Set([
  358, 359, 360, 361, 362, 363, 364, 275, 276, 277, 278, 279, 280, 281, 282, 285, 286,
  288, 289, 290, 291, 292, 293, 294, 295, 296, 297, 316, 317, 318, 298, 299, 309, 310,
  339, 538, 413, 414, 505, 521, 522, 523, 524, 525, 526, 527, 532, 543, 544, 550, 551,
  533, 553, 554, 555, 556, 558, 559, 542, 391, 392, 393, 394, 568, 569, 570, 582, 580,
  598, 599, 600, 601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 620,
  629, 632, 640, 643, 644, 645, 710,
]);
function makeTileDustRoll(rng: RNG, sheet: number, fx: number): void {
  switch (sheet) {
    case 2: case 477: case 27: case 243: case 244: case 204: case 478:
    case 641: case 370: case 171:
    // ★IIIII209 补族（cs:69461-69522 if 链逐字;REMIX #97 定罪=661 缺掷致 track2
    //   placePath 少掷 31/列,轨域全错位）：23/24/661 腐化草族、58/76/77/684 神圣草族、
    //   37/32 草族、25/31/696 泥族(31/696 fx≥36 免掷)、109/492、34/42（与
    //   FinalCleanupPass 副本对齐）
    case 23: case 24: case 661:
    case 58: case 76: case 77: case 684:
    case 37: case 32:
    case 25: case 109: case 492:
    case 34: case 42:
      rng.nextInt(2);
      return;
    case 31: case 696:                       // cs:69519 (31||696)&&fx≥36 → 免掷
      if (fx < 36) rng.nextInt(2);
      return;
    case 35:                                 // cs:68831 fx<36 短路与掷同支
      if (fx < 36) rng.nextInt(2);
      return;
    case 26: case 695:
      if (fx < 54) rng.nextInt(2);
      return;
    case 583: case 584: case 585: case 586: case 587: case 588: case 589:
      rng.nextInt(10);
      return;
    case 633:
      rng.nextInt(6);
      return;
    case 634:
      rng.nextInt(10);
      rng.nextInt(12);
      return;
    case 238:
      rng.nextInt(3);
      return;
    case 231:                                // cs:69225 num=153 后恒掷 Next(3)
      rng.nextInt(3);
      return;
    case 385:
      rng.nextIntRange(68, 71);
      return;
    // ★III122 档位（cs:68839-68871）：<72 零掷 / <108 Next(3) / <144 Next(2) / else Next(4)
    // ——曾用旧错档(<72 Next(3)),与 FinalCleanupPass 副本不一致
    case 254:
      if (fx >= 72) {
        if (fx < 108) rng.nextInt(3);
        else if (fx < 144) rng.nextInt(2);
        else rng.nextInt(4);
      }
      return;
    // ★IIIII101d（cs:69707-69713 尾支 Dust.NewDust(…,213, Next(-2,3)×2)+fadeIn Next(0,51)
    //   =每粒 3 掷；graveyard #97 STRK 巷 × LTRK#2 旧轨交叠 8 列每列恰 1 粒 314 轨块被
    //   巷杀（GetTileDustAmount default 10）⇒ 每列 30 掷——JS 旧表整缺 ⇒ 每处少 30×列数）：
    //   x86 rig 掷栈+P1 逐列 Δ 实证（/tmp/iii129-out）。
    case 314:
      rng.int(-2, 2);
      rng.int(-2, 2);
      rng.int(0, 50);
      return;
    default:
      if (FURNITURE_DUST.has(sheet)) rng.nextInt(3);
  }
}

/** TrackGenerator.InvalidWalls(TrackGenerator.cs:44-48)。
 *  ★SSSSSSS：NTB 豁免 wall!=108(cs:460 `(!notTheBees || wall != 108)`,1456/1457 同款)
 *  曾漏接——消费在 isLocationInvalid。 */
const INVALID_WALLS = new Set([7, 94, 95, 8, 98, 99, 9, 96, 97, 3, 83, 68, 62, 78, 87, 86, 42, 74, 27, 149]);
/** NTB 豁免墙(108=grass wall 族):notTheBees 世界不因该墙拒位 */
const NTB_EXEMPT_WALL = 108;
/** TrackGenerator.InvalidTiles(cs:50-56)。
 *  ★SSSSSSS 定罪(#97 矿轨掷差 long Δ+63/std Δ−174 的第一环)：JS 曾按 1456 的
 *  37 项表移植;1457 在表尾追加 {141 Explosives, 411 Detonator, 21 Chest,
 *  467 Containers2(DeadMan'sChest), 88 Dressers}(TrackGenerator.cs:50-57,1457 形
 *  =42 项)。认证口径 SW_MB_1457=1 下缺项 → 含这五型的格 JS 判 Available 而 x86 判
 *  Invalid → findPath 历史改写路径分叉(金标种子实测首差格 (829,717)=Detonator:
 *  x86 r2/JS r0,事件流第 777 位分叉)→ PlacePath 掷耗 ±漂移并级联 std-track/lava。
 *  双态门 hfIs1457():1456 缺省形保持旧 37 项(与 VVVVVV 迁移战役约定一致)。 */
const INVALID_TILES_1456 = idsByVanillaSheet(
  383, 384, 15, 304, 30, 321, 245, 246, 240, 241, 242, 16, 34, 158, 377, 94, 10, 19, 86, 219,
  484, 190, 664, 665, 41, 43, 44, 226, 237, 711, 712, 713, 714, 715, 716, 379, 314);
const INVALID_TILES_1457_EXTRA = idsByVanillaSheet(141, 411, 21, 467, 88);
/** TileID.Sets.GeneralPlacementTiles = false 全集(TileID.cs:311,default true) */
const PLACEMENT_BLOCKED = idsByVanillaSheet(
  225, 41, 481, 43, 482, 44, 483, 226, 203, 112, 25, 70, 151, 21, 31, 696, 467, 12, 665, 639,
  138, 664, 711, 712, 713, 714, 715, 716);
/** KillTile 豁免格(cs:111 `type != 379`)与压板探测(cs:107 `type == 135`) */
const BUBBLE = idsByVanillaSheet(379);
const PLATE = idsByVanillaSheet(135);
/** ★IIIII223：KillTile 尾冰族灌水臂成员（=HalfBrickPass.ICE_WATER_TAIL 同表：
 *  TileID.Sets.Ices{161,200,163,164}∪{147 Snow,224 PurpleIce},cs:64418-64419） */
const LANE_ICE_WATER_TAIL = idsByVanillaSheet(147, 224, 161, 200, 163, 164);
/** WorldGen.shimmerSafetyDistance = 150(cs:4104);轨道用其半宽盒判断(cs:442) */
const SHIMMER_SAFETY = 150;

// TrackPlacementState
const AVAILABLE = 0, OBSTRUCTED = 1, INVALID = 2;
// TrackSlope / TrackMode
const UP = -1, STRAIGHT = 0, DOWN = 1;
const MODE_NORMAL = 0, MODE_TUNNEL = 1;

interface TrackHistory { x: number; y: number; slope: number; mode: number }

const HISTORY_SIZE = 4096;   // _history
const REWRITE_SIZE = 25;     // _rewriteHistory

/** 原版 SolidTile(i,j)(WorldGen.cs:70487-70513):active && **Main.tileSolid[type] 直读**
 *  && !tileSolidTop && !halfBrick && slope==0 && !inActive()。
 *  ★III12：tileSolid 经 trkTileSolidGen（Main.cs:7995 tileSolid[0]=true 缺镜像案——
 *  calcState 下沉判实心在 alias 土格晚 9 行 → LTRK 起点 Y +9、单次 place 掷 −13）。 */
function solidTile(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;
  const i = st.idx(x, y);
  // !inActive ≈ 未致动(生成期恒无致动位);tileSolidTop 近似 = platform
  return !!st.flags[i] && trkTileSolidGen(st.type[i]) && !TILE_DEFS[st.type[i]]?.platform
    && st.half[i] === 0 && st.slope[i] === 0;
}

export class TrackGenerator {
  private readonly st: TileStore;
  private readonly gs: GenState;
  private readonly hist: TrackHistory[] = new Array(HISTORY_SIZE);
  private readonly rewrite: TrackHistory[] = new Array(REWRITE_SIZE);
  private xDir = 0;
  private len = 0;
  /** playerHeight 是实例字段(cs:66)——长短两段共用一个实例时跨 Place 残留,保持 1:1 */
  private playerHeight = 6;
  /** 全图已存在轨道格数(构造时扫一遍 + PlacePath 累加)。
   *  为 0 时 IsTileNearby 恒 false——语义等价的纯加速 */
  private trackCount = 0;
  /** 轨道格空间索引(64×64 桶):IsTileNearby 的 61×61 全扫替代。
   *  findPath 期间地图只读,索引跨 Place 调用按 placePath 落块增量维护,结果恒等 */
  private readonly trackBuckets = new Map<number, number[]>();
  /** CalculateStateForLocation 结果缓存(单次 Place 内有效——findPath 期地图只读) */
  private readonly stateCache = new Map<number, number>();
  /** 有货箱锚位格(CanDestroyChest=false 集;smoothSlope→CanKillTile 消费) */
  private readonly blockedChestAnchors = new Set<number>();
  /** WorldGen.destroyObject 实例旗(check2x1Track 双杀门;vanilla static,巷内等价) */
  private destroyObj = false;
  /** WorldGen.fossilBreak 实例旗(attemptFossilShatter 递归门) */
  private fossilBreak = false;
  /** IsLocationInvalid 的 InvalidTiles 表(SSSSSSS 双态):1457 追加五型 */
  private readonly invalidTiles: Set<number>;

  constructor(st: TileStore, gs: GenState, chests?: ReadonlyArray<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>) {
    this.st = st;
    this.gs = gs;
    this.invalidTiles = hfIs1457()
      ? new Set([...INVALID_TILES_1456, ...INVALID_TILES_1457_EXTRA])
      : INVALID_TILES_1456;
    // CanDestroyChest(cs:590-607)镜像:锚位格 → 是否有货箱(CanKillTile 箱支消费;
    // 生成期箱皆有货 → 恒"不可毁"——保守按有货判,箱族/音乐盒 235 帧锚位入表)
    if (chests) {
      for (const c of chests) {
        // ★IIII102c：跳洞（稀疏 sink）
        if (!c) continue;
        if (c.items.some((it) => it && it.id > 0 && it.stack > 0)) this.blockedChestAnchors.add(c.x * 16384 + c.y);
      }
    }
    for (let y = 0; y < st.h; y++) {
      for (let x = 0; x < st.w; x++) {
        const i = st.idx(x, y);
        if (st.flags[i] && st.type[i] === TRACK_TILE) this.addTrackCell(x, y);
      }
    }
  }

  private addTrackCell(x: number, y: number): void {
    this.trackCount++;
    const key = this.bucketKey(x, y);
    const list = this.trackBuckets.get(key);
    if (list) list.push(this.packCell(x, y));
    else this.trackBuckets.set(key, [this.packCell(x, y)]);
  }

  private packCell(x: number, y: number): number {
    return (x << 14) | y;   // y < 16384(世界高上限 2400)
  }

  private bucketKey(x: number, y: number): number {
    return ((y >> 6) << 16) | (x >> 6);
  }

  /** TrackGenerator.Place(cs:68-81) */
  place(originX: number, originY: number, minLength: number, maxLength: number, rng: RNG): boolean {
    this.stateCache.clear();   // 地图在上一 Place 的 placePath 中被写穿,缓存按次失效
    const origin = this.findSuitableOrigin(originX, originY);
    if (!origin) return false;
    this.createTrackStart(origin.x, origin.y);
    if (!this.findPath(minLength, maxLength)) {
      __trackHistProbe?.('TPFP FAIL', this.hist, this.len, this.xDir, origin.x, origin.y);
      return false;
    }
    __trackHistProbe?.('TPFP OK', this.hist, this.len, this.xDir, origin.x, origin.y);
    this.placePath(rng);
    return true;
  }

  /** FindSuitableOrigin(cs:382-395):向下找 Obstructed(地表),其上一格须 Available */
  private findSuitableOrigin(ox: number, oy: number): { x: number; y: number } | null {
    let x = ox, y = oy;
    let state = this.stateAt(x, y);
    while (state !== OBSTRUCTED) {
      y++;
      if (state === INVALID) {
        __trackHistProbe?.('TPFS', [], 0, 0, x, y);   // ★IIIII209:x86 rig 同 tag(调整后 origin)
        return null;
      }
      if (y >= this.st.h - 1) return null; // 安全护栏(原版越界由 Main.tile null 吸收)
      state = this.stateAt(x, y);
    }
    y--;
    if (this.stateAt(x, y) !== AVAILABLE) {
      __trackHistProbe?.('TPFS', [], 0, 0, x, y);   // ★IIIII209:退格后非 Available(x86 rig TPFS 同位)
      return null;
    }
    return { x, y };
  }

  /** CreateTrackStart(cs:164-172) */
  private createTrackStart(x: number, y: number): void {
    this.xDir = x <= this.st.w / 2 ? 1 : -1;
    this.len = 1;
    for (let i = 0; i < HISTORY_SIZE; i++) {
      this.hist[i] = { x: x + i * this.xDir, y: y + i, slope: DOWN, mode: MODE_NORMAL };
    }
  }

  /** FindPath(cs:174-209) */
  private findPath(minLength: number, maxLength: number): boolean {
    let length = this.len;
    while (this.len < HISTORY_SIZE - 100) {
      const slope = this.hist[this.len - 1].slope !== UP ? DOWN : STRAIGHT;
      this.appendToHistory(slope);
      const state = this.tryRewriteHistoryToAvoidTiles();
      if (state === INVALID) break;
      length = this.len;
      let state2 = state;
      while (state2 !== AVAILABLE) {
        state2 = this.createTunnel();
        if (state2 === INVALID) break;
        length = this.len;
      }
      if (this.len >= maxLength) break;
    }
    this.len = Math.min(maxLength, length);
    if (this.len < minLength) return false;
    this.smoothTrack();
    return this.segmentState(0, this.len) !== INVALID;
  }

  /** CreateTunnel(cs:211-255) */
  private createTunnel(): number {
    let slope = STRAIGHT;
    let num = 10;
    let result = INVALID;
    const x = this.hist[this.len - 1].x;
    const y = this.hist[this.len - 1].y;
    for (let s2 = UP; s2 <= DOWN; s2++) {
      let last = INVALID;
      for (let i = 1; i < num; i++) {
        last = this.stateAt(x + i * this.xDir, y + i * s2);
        if (last === OBSTRUCTED) continue;
        // Available:记录该斜坡为当前最优;Invalid:只终止扫描不记录(cs:222-237)
        if (last === AVAILABLE) { slope = s2; num = i; result = last; }
        break;
      }
      if (result !== AVAILABLE && last === OBSTRUCTED && (result !== OBSTRUCTED || slope !== STRAIGHT)) {
        slope = s2; num = 10; result = last;
      }
    }
    if (this.len === 0 || !canSlopesTouch(this.hist[this.len - 1].slope, slope)) {
      this.rewriteSlope(this.len - 1, STRAIGHT);
    }
    this.hist[this.len - 1].mode = MODE_TUNNEL;
    for (let j = 1; j < num; j++) this.appendToHistory(slope, MODE_TUNNEL);
    return result;
  }

  /** AppendToHistory(cs:257-262) */
  private appendToHistory(slope: number, mode = MODE_NORMAL): void {
    this.hist[this.len] = {
      x: this.hist[this.len - 1].x + this.xDir,
      y: this.hist[this.len - 1].y + slope,
      slope, mode,
    };
    this.len++;
  }

  /** TryRewriteHistoryToAvoidTiles(cs:264-307)。
   *  注意 C# TrackHistory 是 struct(值语义),快照/回填必须深拷贝 */
  private tryRewriteHistoryToAvoidTiles(): number {
    const start = this.len - 1;
    const size = Math.min(this.len, REWRITE_SIZE);
    for (let i = 0; i < size; i++) this.rewrite[i] = { ...this.hist[start - i] };
    let num = start;
    while (num >= this.len - size) {
      if (this.hist[num].slope === DOWN) {
        const state = this.segmentState(num, this.len - num);
        if (state === AVAILABLE) return state;
        this.rewriteSlope(num, STRAIGHT);
      }
      num--;
    }
    if (this.segmentState(num + 1, this.len - (num + 1)) === AVAILABLE) return AVAILABLE;
    for (let m = this.len - 1; m >= this.len - size + 1; m--) {
      if (this.hist[m].slope === STRAIGHT) {
        const state = this.segmentState(this.len - size, size);
        if (state === AVAILABLE) return state;
        this.rewriteSlope(m, UP);
      }
    }
    for (let j = 0; j < size; j++) this.hist[this.len - 1 - j] = { ...this.rewrite[j] };
    this.rewriteSlope(this.len - 1, STRAIGHT);
    // ★FFFFF:C# 第二个 for 复用 num 作循环变量(cs:289),退栈值 = _length - num2
    //   ——终评段 [_length-num2+1, _length-1];曾误用第一 while 的残留值(len-size-1
    //   → 多评一格首格)。金标种子未触发值分叉,属潜伏逐位债
    return this.segmentState(this.len - size + 1, size - 1);
  }

  /** RewriteSlopeDirection(cs:309-317) */
  private rewriteSlope(index: number, slope: number): void {
    const delta = slope - this.hist[index].slope;
    this.hist[index].slope = slope;
    for (let i = index; i < this.len; i++) this.hist[i].y += delta;
  }

  /** GetHistorySegmentPlacementState(cs:319-338) */
  private segmentState(startIndex: number, length: number): number {
    let result = AVAILABLE;
    for (let i = startIndex; i < startIndex + length; i++) {
      const state = this.stateAt(this.hist[i].x, this.hist[i].y);
      if (state === INVALID) return INVALID;
      if (state === OBSTRUCTED && this.hist[i].mode !== MODE_TUNNEL) result = OBSTRUCTED;
    }
    return result;
  }

  /** SmoothTrack(cs:340-371) */
  private smoothTrack(): void {
    let anchor = this.len - 1;
    let flag = false;
    for (let i = this.len - 1; i >= 0; i--) {
      if (flag) {
        anchor = Math.min(i + 15, anchor);
        if (this.hist[i].y >= this.hist[anchor].y) {
          for (let k = i + 1; this.hist[k].y > this.hist[i].y; k++) {
            this.hist[k].y = this.hist[i].y;
            this.hist[k].slope = STRAIGHT;
          }
          if (this.hist[i].y === this.hist[anchor].y) flag = false;
        }
      } else if (this.hist[i].y > this.hist[anchor].y) flag = true;
      else anchor = i;
    }
  }

  /** PlacePath(cs:83-162):清轨巷 + 铺 314 + 帧链(AAAAA 批 1:1 镜像) */
  private placePath(rng: RNG): void {
    const st = this.st;
    const pressure = new Uint8Array(this.len);
    const p1d0 = __trackDraws?.() ?? 0;   // ★IIIII209:累计掷基线(x86 P1 同口径)
    // 第一遍:清轨巷(cs:85-116)
    for (let i = 0; i < this.len; i++) {
      if (rng.int(0, 6) === 0) this.playerHeight = rng.int(5, 8);   // Next(7) / Next(5,9)
      __trackStepProbe?.(1, i, this.hist[i]!.x, this.hist[i]!.y, this.playerHeight);
      const th = this.hist[i];
      for (let j = 0; j < this.playerHeight; j++) {
        for (let dy = -1; dy <= 1; dy++) {                            // wall 244 清除(cs:95-106)
          const yy = th.y - j + dy;
          if (st.inBounds(th.x, yy) && st.wall[st.idx(th.x, yy)] === 244) st.wall[st.idx(th.x, yy)] = 0;
        }
        if (!st.inBounds(th.x, th.y - j)) continue;
        const idx = st.idx(th.x, th.y - j);
        if (st.flags[idx] && PLATE.has(st.type[idx])) pressure[i] = 1;
        // KillTile(noItem)——379 泡泡豁免(cs:111-114)
        if (!BUBBLE.has(st.type[idx])) this.killTileLane(rng, th.x, th.y - j);
      }
      __trackColProbe?.(1, i, th.x, th.y, this.playerHeight, (__trackDraws?.() ?? 0) - p1d0);
    }
    // 第二遍:铺轨 + 帧链(cs:117-161)
    const p2d0 = __trackDraws?.() ?? 0;   // ★IIIII209:累计掷基线(x86 P2 同口径)
    for (let k = 0; k < this.len; k++) {
      if (rng.int(0, 6) === 0) this.playerHeight = rng.int(5, 8);
      __trackStepProbe?.(2, k, this.hist[k]!.x, this.hist[k]!.y, this.playerHeight);
      const th = this.hist[k];
      // Tile.SmoothSlope(X, Y+1)(cs:124)与门控 (X, Y-playerHeight)(cs:125-128)
      // ——FFFFF 补:写坡/半砖(见文件头 SmoothSlope 节;邻 pass 先行 cs:825-829)
      this.smoothSlope(th.x, th.y + 1, true);
      {
        const ci = st.inBounds(th.x, th.y - this.playerHeight) ? st.idx(th.x, th.y - this.playerHeight) : -1;
        if (ci < 0 || !st.flags[ci] || SHEET_OF[st.type[ci]!] !== 379) {
          this.smoothSlope(th.x, th.y - this.playerHeight, true);
        }
      }
      if (!st.inBounds(th.x, th.y)) continue;
      const idx = st.idx(th.x, th.y);
      const wireBits = st.wire[idx] & 15;   // 四色线暂存(cs:129-132)
      if (pressure[k] && k > 0
        && this.hist[k - 1].y === th.y && this.hist[k + 1].y === th.y) {
        // ClearEverything(cs:135):type/wall/liquid/headers/帧全清(墙漆随墙清)
        //   ★IIIII210：bTileHeader3=0 含涂层四位全擦（Tile.cs:112-123）——漏擦则
        //   泡泡方块（379 全方格 fullbrightBlock）内铺轨保留亮位 → DoExtraLiquidFinish
        //   fullbright 支误清轨周岩浆/误杀滴头（waterpark #105 Y2>0/A,T 残差源）
        st.setWallSilent(th.x, th.y, 0);
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
        st.wire[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; st.paint[idx] = 0;
        st.coat[idx] = 0;
        // PlaceTile(314, forced, style 1)(cs:136)= Minecart.PlaceTrack:
        // active/type=314/frameY=-1/frameX=_firstPressureFrame(=20)+ 尾部
        // SquareTileFrame 九宫(cs:60297;TruncatesWalls[314]=false 无墙帧,零掷)
        st.setTileSilent(th.x, th.y, TRACK_TILE, 20, 0xFFFF);
        this.squareTileFrame314(rng, th.x, th.y);
      } else {
        // ResetToType(314)(cs:140):liquid=0、headers=32(线/致动/坡/半砖清、墙保留)、帧 0/0
        //   ★IIIII210：bTileHeader3=0 同擦涂层四位（Tile.cs:251-261 ResetToType）——同上
        st.liquid[idx] = 0; st.liquidType[idx] = 0;
        st.wire[idx] = 0; st.half[idx] = 0; st.slope[idx] = 0; st.paint[idx] = 0;
        st.coat[idx] = 0;
        st.setTileSilent(th.x, th.y, TRACK_TILE, 0, 0);
      }
      st.wire[idx] = wireBits;             // 四色线精确还原,致动位不还原(cs:142-145)
      this.addTrackCell(th.x, th.y);       // IsTileNearby 索引同步(帧链只读 st,时点无关)
      if (k === 0) continue;               // cs:146-149
      for (let l = 0; l < 8; l++) {        // cs:150-153:列 k-1 上扫 8 格(含 l=0 轨道格)
        this.wuTileFrame(rng, this.hist[k - 1].x, this.hist[k - 1].y - l);
      }
      if (k === this.len - 1) {            // cs:154-160:末列收尾(本次迭代重掷后的 playerHeight)
        for (let m = 0; m < this.playerHeight; m++) {
          this.wuTileFrame(rng, th.x, th.y - m);
        }
      }
      if (k > 0) __trackColProbe?.(2, k, th.x, th.y, this.playerHeight, (__trackDraws?.() ?? 0) - p2d0);
    }
  }

  /** 生成期 KillTile(cs:63559,fail=false 档)——轨道巷版:尘埃掷(cs:63747-51)
   *  + 击杀写 + 尾部 SquareTileFrame(cs:63967)。!active 早退零掷零帧(cs:63575)。
   *  九宫(squareFrameTrack)内不可达 314(轨迹未铺,IsTileNearby 30 格隔离) */
  private killTileLane(rng: RNG, x: number, y: number): void {
    const st = this.st;
    if (!st.inBounds(x, y)) return;
    const i = st.idx(x, y);
    __trackKillProbe?.(__trackKillDraws?.() ?? 0, x, y, SHEET_OF[st.type[i]!] ?? -1, st.frameX[i]!, st.frameY[i]!);
    if (!st.flags[i]) return;
    const sheet = SHEET_OF[st.type[i]!];
    if (sheet < 0) return;
    // CheckTileBreakability(cs:63591→62403):2=整跳(实心格上有树干/箱/锁门等
    // PreventsTileRemovalIfOnTopOfIt 族);1=fail 支(锁门/巨石压箱——类型转换+帧,不杀)
    const brk = this.checkTileBreakability(x, y);
    if (brk === 2) return;
    if (brk === 1) {
      // fail 支(cs:63757-63773):★IIII26 定谳——vanilla KillTile 里 CheckTileBreakability==1
      // 只置 fail=true,**尘埃/化石链在类型回退之前照常执行**(cs:64204 dust loop +
      // cs:64208 AttemptFossilShattering(fail)),随后才做草/苔类型回退 + SquareTileFrame
      // 后 return。旧 JS fail 支整体跳过尘掷 + 跳过 tileMossBrick→38 回退,与源不符。
      // 尘掷量用 GetTileDustAmount(fail:true)(default→3 等),dustType 用原 type 选——
      // moss 族(179-183/381/534..627)/184 的 per-particle 选型零 genRand(cs:67336
      // tileMoss 公式 / case184 switch),掷源只在家具族 FURNITURE_DUST 与少量表列型。
      const fx = st.frameX[i]!;
      const dustFail = killTileDustAmount(sheet, fx, true);
      for (let k = 0; k < dustFail; k++) makeTileDustRoll(rng, sheet, fx);
      this.attemptFossilShatter(rng, x, y, sheet, true);
      // ShakeTree 门(netMode!=1&&IsShakeable)——fail 触发族{10锁门,138巨石}非
      // shakeable,巷内不可达不移植
      const sh = SHEET_OF[st.type[i]!] ?? -1;
      if (sh === 2 || sh === 23 || sh === 109 || sh === 199 || sh === 477 || sh === 492) st.type[i] = ID_OF_SHEET.get(0)!;
      else if (sh === 633) st.type[i] = ID_OF_SHEET.get(57)!;
      else if (sh === 60 || sh === 661 || sh === 662 || sh === 70) st.type[i] = ID_OF_SHEET.get(59)!;
      if (TILE_MOSS_SS.has(SHEET_OF[st.type[i]!] ?? -1)) st.type[i] = ID_OF_SHEET.get(1)!;
      else if (TILE_MOSS_BRICK_SS.has(SHEET_OF[st.type[i]!] ?? -1)) st.type[i] = ID_OF_SHEET.get(38)!;
      this.squareFrameTrack(rng, x, y);
      return;
    }
    const fx = st.frameX[i]!;
    const dust = killTileDustAmount(sheet, fx);
    for (let k = 0; k < dust; k++) makeTileDustRoll(rng, sheet, fx);
    this.attemptFossilShatter(rng, x, y, sheet, false);   // cs:63756(FFFFF 补:#101 巷内 404 可达——曾误判不可达)
    // ★IIII110b：getGoodWorld 灰烬崩塌级联(Terarria1458/Terraria/WorldGen.cs:64259 分支头,
    //   体 :64260-64306;与 IIII67b 引擎侧 HalfBrickPass.killTile 同支——
    //   本巷内 killTileLane 为独立复刻,同支曾按"getGoodWorld 门不适用"误判缺漏)。
    //   x86 定罪:FTW 短轨 seq#128 STRK(824,946) 巷内 43 枚活性灰烬(57)击杀逐格
    //   8 邻 Next(2) 短路掷合计 201 样本(JS 曾零掷),即 XXXIII §①「净多掷 +1」
    //   (奇性一致)与 §④ killTileLane 家族三候选中 killTileLane 支的真源点。
    if (this.gs.seedFlags.getGoodWorld && sheet === 57) {
      for (let m = 0; m < 8; m++) {
        let qx = x;
        let qy = y;
        switch (m) {          // 邻序 L,R,U,D,UL,UR,DL,DR(cs 原文序)
          case 0: qx--; break;
          case 1: qx++; break;
          case 2: qy--; break;
          case 3: qy++; break;
          case 4: qx--; qy--; break;
          case 5: qx++; qy--; break;
          case 6: qx--; qy++; break;
          case 7: qx++; qy++; break;
        }
        if (!st.inBounds(qx, qy)) continue;               // 原版 Main.tile OOB=null→!active,不掷
        const qi = st.idx(qx, qy);
        // 短路序与 cs 逐项一致:active && Next(2)==0 && 邻为 57 && 下方非实心
        if (st.flags[qi] && rng.nextInt(2) === 0 && SHEET_OF[st.type[qi]!] === 57
          && !solidTile(st, qx, qy + 1)) {
          this.killTileLane(rng, qx, qy);
          // Projectile(40 落灰)/NetMessage:零 genRand、八通道不可见,不移植
        }
      }
    }
    // ★IIIII110b(涂装链)：ShouldTileSurvive 箱存活门(cs:64365→CheckTileBreakability2
    //   cs:62986-63031)——BasicChest{21,467}/梳妆台 88 有货箱锚位=DestroyChest false→
    //   ShouldTileSurvive true→击杀早退(尘掷/化石已照序执行,与原版同序;早退点在
    //   SquareTileFrame 之前,箱帧不动)。xrayvision #097 (2500,769) T21>0×4 定罪：
    //   轨巷清扫 KT 到有货金箱,x86 靠本门存活而 JS 曾整杀。空箱/不在表→可杀
    //   (原版 DestroyChest true 侧随带 RemoveChest——ChestSink 登记面本巷不可达,备案)。
    //   470/475(人偶/帽架 IsBreakable=TileEntity 面)生成期无实体不移植。
    if (sheet === 21 || sheet === 467 || sheet === 88) {
      const fyv = st.frameY[i]!;
      if (sheet === 88) {
        const dx = Math.trunc(fx / 18) % 3;
        if (this.blockedChestAnchors.has((x - dx) * 16384 + (y - Math.trunc(fyv / 18)))) return;
      } else {
        let dx = Math.trunc(fx / 18);
        while (dx > 1) dx -= 2;
        if (this.blockedChestAnchors.has((x - dx) * 16384 + (y - Math.trunc(fyv / 18)))) return;
      }
    }
    // ★IIIII199（2026-09-03）：蛛网落罐判定掷（rig 1457 cs:64619≡1458 同位——
    //   `if (tile.type == 51 && tile.wall == 62 && genRand.Next(4) != 0) noItem = true;`）。
    //   生成期 noItem 虽恒 true,但 **该掷照耗**（结果只门掉落,掷位在 ShouldTileSurvive
    //   之后、击杀写之前）。FinalCleanupPass 头注曾以「本扫 KillTile 目标族均不命中」
    //   跳过本掷——该枚举对 FinalCleanup 大循环成立,对轨巷 killTileLane 不成立：
    //   蛛网洞/蛛石墙(62)域的轨巷清扫恒可杀活蛛网（tooeasy #097 轨道首 attempt
    //   x2090 巷 (2090,635) t51 wall62 实证）,缺掷=±1 掷位漂移→轨巷 ph 重掷位
    //   重排→杀带分歧（#097 T 簇 30 格真凶域,帧维+杀流双仪定谳）。
    if (sheet === 51 && st.wall[i] === 62) rng.int(0, 3);
    // ★IIIII223（2026-09-03）：KillTile 尾液体灌入族三臂（1457 cs:64405-64420 ≡1458
    //   同位；=HalfBrickPass.killTile 主副本/FinalCleanupPass 巷外副本同源——**四副本
    //   纪律**：本巷内副本曾整缺，IIII187 只补了 FinalCleanup 大循环副本）。
    //   原版序：51/62 掷（上）→ tile.active(false)+frameX/Y=-1（cs:64398-64403）→
    //   三臂互斥 else-if（读 tile.type,型清零前）→ type=0 → SquareTileFrame。JS 侧
    //   setTileSilent 即 deactivate+清型,故三臂置其前、squareFrameTrack 前与主副本同构。
    //   ①58 狱石 于 UnderworldLayer(=h-200) 之下 → 灌岩浆 128（无掷；文件头
    //     「轨道巷不可达」旧备案撤銷——1:1 补全,长轨锚窗可达 h-230 邻域）
    //   ②230 脆蜂蜜块 && Main.getGoodWorld → Next(2)==0 灌岩浆 128。短路序
    //     type==230 && getGoodWorld 先于 Next ⇒ **每个 230 击杀无条件占 1 流位**
    //     （掷值只决定灌否）。GFB getGoodWorld=true 全程活性——轨巷穿脆蜂蜜块即触发
    //     （XCVII 移交刀②；vanilla 侧 83 格 230>air+LAVA 128 家族即本臂写面）。
    //   ③冰族 LANE_ICE_WATER_TAIL && getGoodWorld && remixWorld && !drunkWorld →
    //     Next(2)==0 灌水 64——GFB drunkWorld=true ⇒ 第三腿恒假（掷不消耗）,remix 链
    //     无 getGoodWorld 同惰性;按原文补全防未来种子组合（与主副本同注）。
    //   灌液体写在 setTileSilent 之前（liquid 通道不经 setTileSilent,主副本同法）。
    if (sheet === 58 && y > st.h - 200) {
      st.liquid[i] = 128;
      st.liquidType[i] = 2;
    } else if (sheet === 230 && !!this.gs.seedFlags.getGoodWorld) {
      if (rng.nextInt(2) === 0) {
        st.liquid[i] = 128;
        st.liquidType[i] = 2;
      }
    } else if (LANE_ICE_WATER_TAIL.has(sheet) && !!this.gs.seedFlags.getGoodWorld
      && !!this.gs.seedFlags.remix && !this.gs.seedFlags.drunkWorld) {
      if (rng.nextInt(2) === 0) {
        st.liquid[i] = 64;
        st.liquidType[i] = 1;
      }
    }
    st.setTileSilent(x, y, 0);
    this.squareFrameTrack(rng, x, y);
  }

  /** WorldGen.CheckTileBreakability(cs:62403-62490)——0 可杀/1 fail/2 整跳 */
  private checkTileBreakability(x: number, y: number): number {
    const st = this.st;
    const i = st.idx(x, y);
    const sh = SHEET_OF[st.type[i]!] ?? -1;
    if (y >= 1 && y <= st.h - 1) {
      const below = st.inBounds(x, y + 1) ? st.idx(x, y + 1) : -1;
      if (below >= 0 && st.flags[below] && this.isLockedDoor(x, y + 1)) return 2;
      // 非实心非 solidTop(树干/装饰族)恒可杀(cs:62432)
      if (!(trkTileSolidGen(st.type[i]!) || TILE_DEFS[st.type[i]!]?.platform === true)) return 0;
      const up = st.inBounds(x, y - 1) ? st.idx(x, y - 1) : -1;
      if (up >= 0 && st.flags[up]) {
        const shUp = SHEET_OF[st.type[up]!] ?? -1;
        const fxu = st.frameX[up]!, fyu = st.frameY[up]!;
        // flag=IsAContainer(本格);HasReason(scanForContainer=!flag)
        const flag = CONTAINER_SS.has(sh);
        if (this.hasReasonToReturnEarlyAt(st.type[i]!, x, y - 1, !flag)) {
          if (TREE_TRUNK_SS.has(shUp)) {
            if ((fxu === 66 && fyu >= 0 && fyu <= 44) || (fxu === 88 && fyu >= 66 && fyu <= 110) || fyu >= 198) return 0;
            return 2;
          }
          if (shUp === S_PALM_SAP) {
            if (fxu === 66 || fxu === 220) return 2;
            return 0;
          }
          return 2;
        }
        if (shUp === S_CACTUS && st.type[up] !== st.type[i]) {
          const num = Math.trunc(fxu / 18);
          if (num === 0 || num === 1 || num === 4 || num === 5) return 2;
        }
        if (sh === S_DOOR && this.isLockedDoor(x, y)) return 1;
        if (BOULDER_SS.has(sh)) {
          if (this.checkBoulderChest(x, y, st.frameX[i]!, st.frameY[i]!, st.type[i]!)) return 1;
          return 0;
        }
      }
      if (sh === S_MUSICBOX) {
        const num2 = x - Math.trunc(st.frameX[i]! % 54 / 18);
        for (let k = 0; k < 3; k++) {
          if (this.hasReasonToReturnEarlyAt(st.type[i]!, num2 + k, y - 1)) return 2;
        }
      }
    }
    return 0;
  }

  /** IsAContainer 型判定(单格) */
  private containerAt(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return st.flags[i] !== 0 && CONTAINER_SS.has(SHEET_OF[st.type[i]!] ?? -1);
  }

  /** AttemptFossilShattering(cs:63526-63554)——404 化石 3×3 邻格掷(Next(15)/
   *  Next(4))+递归杀。fossilBreak 递归门=实例旗(vanilla static) */
  private attemptFossilShatter(rng: RNG, i: number, j: number, sheet: number, fail = false): void {
    if (sheet !== 404 || this.fossilBreak) return;
    this.fossilBreak = true;
    const st = this.st;
    for (let k = i - 1; k <= i + 1; k++) {
      for (let l = j - 1; l <= j + 1; l++) {
        let maxValue = 15;
        if (!solidTile(st, k, l + 1)) maxValue = 4;
        else if (k === i && l === j - 1 && !fail) maxValue = 4;        // cs:64006 `else if(k==i&&l==j-1&&!fail)`——IIII26 补 fail 位
        if ((k !== i || l !== j) && st.inBounds(k, l)) {
          const ki = st.idx(k, l);
          if (st.flags[ki] && SHEET_OF[st.type[ki]!] === 404 && rng.nextInt(maxValue) === 0) {
            this.killTileLane(rng, k, l);
          }
        }
      }
    }
    this.fossilBreak = false;
  }

  /** Tile.SmoothSlope(cs:822-888)。applyToNeighbors 四邻先行(递归 false 档);
   *  中心:CanPoundTile && SolidOrSlopedTile 双门 → flag 族 → case 写。写侧零掷 */
  private smoothSlope(x: number, y: number, applyToNeighbors: boolean): void {
    if (applyToNeighbors) {
      this.smoothSlope(x + 1, y, false);
      this.smoothSlope(x - 1, y, false);
      this.smoothSlope(x, y + 1, false);
      this.smoothSlope(x, y - 1, false);
    }
    const st = this.st;
    if (!st.inBounds(x, y)) return;   // 原版 TileMap 占位格:inactive→SolidOrSlopedTile 早退,等价
    if (!this.canPoundTile(x, y) || !this.solidOrSlopedAt(x, y)) return;
    const i = st.idx(x, y);
    const flag = this.activeAt(x, y - 1);                      // !TileEmpty(cs:70037)
    const flag2 = !this.solidOrSlopedAt(x, y - 1) && flag;
    const flag3 = this.solidOrSlopedAt(x, y + 1);
    const flag4 = this.solidOrSlopedAt(x - 1, y);
    const flag5 = this.solidOrSlopedAt(x + 1, y);
    const num = ((flag ? 1 : 0) << 3) | ((flag3 ? 1 : 0) << 2) | ((flag4 ? 1 : 0) << 1) | (flag5 ? 1 : 0);
    switch (num) {
      case 10: if (!flag2) { st.half[i] = 0; st.slope[i] = 3; } break;
      case 9: if (!flag2) { st.half[i] = 0; st.slope[i] = 4; } break;
      case 6: st.half[i] = 0; st.slope[i] = 1; break;
      case 5: st.half[i] = 0; st.slope[i] = 2; break;
      case 4: st.slope[i] = 0; st.half[i] = 1; break;
      default: st.half[i] = 0; st.slope[i] = 0; break;
    }
  }

  /** WorldGen.SolidOrSlopedTile(cs:70046/70064):active && 生成期 tileSolid &&
   *  !tileSolidTop && !inActive(生成期恒真)——半砖/坡不排除 */
  private solidOrSlopedAt(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    return st.flags[i] !== 0 && trkTileSolidGen(st.type[i]!) && !TILE_DEFS[st.type[i]!]?.platform;
  }

  /** Tile.active() && !inActive()(生成期 inActive 恒假) */
  private activeAt(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    return st.flags[st.idx(x, y)] !== 0;
  }

  /** WorldGen.CanPoundTile(cs:81434-81479) */
  private canPoundTile(x: number, y: number): boolean {
    const st = this.st;
    const i = st.idx(x, y);
    const sh = SHEET_OF[st.type[i]!] ?? -1;
    if (POUND_BLOCK_SHEETS.has(sh)) return false;
    if (sh >= 0 && BOULDER_SS.has(sh)) return false;
    // isGeneratingOrLoadingWorld 恒真(cs:81467-81474)
    if (sh === S_OLDSAND || sh === S_MUD) return false;
    if (this.activeAt(x, y - 1) && this.forbidsSloping(x, y - 1)) return false;
    return this.canKillTile(x, y);
  }

  /** WorldGen.ForbidsSloping(cs:81484-81504)——按型(sheet)表 */
  private forbidsSloping(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const sh = SHEET_OF[st.type[st.idx(x, y)]!] ?? -1;
    return FORBIDS_SLOPING_SHEETS.has(sh);
  }

  /** WorldGen.CanKillTile(i,j)(cs:62249-62402)——smoothSlope 语境镜像
   *  (blockDamaged 出参无消费方,略)。生成期 KillTile 的 noItem 强制置真在
   *  KillTile 体(掷/掉落链与本处无关)。 */
  private canKillTile(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;                       // cs:62262 !active
    if (st.wall[i] === 350) return false;                 // cs:62266
    const sh = SHEET_OF[st.type[i]!] ?? -1;
    const fx = st.frameX[i]!, fy = st.frameY[i]!;
    const up = st.inBounds(x, y - 1) ? st.idx(x, y - 1) : -1;
    if (up >= 0 && st.flags[up]) {
      const shUp = SHEET_OF[st.type[up]!] ?? -1;
      const fxu = st.frameX[up]!, fyu = st.frameY[up]!;
      if (TREE_TRUNK_SS.has(shUp) && st.type[up] !== st.type[i]
        && !(fxu === 66 && fyu >= 0 && fyu <= 44) && !(fxu === 88 && fyu >= 66 && fyu <= 110) && fyu < 198) return false;
      if (shUp === S_PALM_SAP && st.type[up] !== st.type[i] && (fxu === 66 || fxu === 220)) return false;
      if ((shUp === S_CHEST || shUp === S_MUSH || shUp === S_PALM || shUp === S_TABLE
        || shUp === S_DRESSER || shUp === S_SAPLING || shUp === S_PINE) && st.type[up] !== st.type[i]) return false;
      if (shUp === S_CACTUS && st.type[up] !== st.type[i]) {
        const num = Math.trunc(fxu / 18);
        if (num === 0 || num === 1 || num === 4 || num === 5) return false;
      }
    }
    if (BOULDER_SS.has(sh) && this.checkBoulderChest(x, y, fx, fy, st.type[i]!)) return false;
    if (sh === S_DOOR && this.isLockedDoor(x, y)) return false;
    if (sh === S_MUSICBOX) {
      const num2 = x - Math.trunc(fx % 54 / 18);          // cs:62328
      for (let k = 0; k < 3; k++) {
        if (this.hasReasonToReturnEarlyAt(st.type[i]!, num2 + k, y - 1)) return false;
      }
    }
    if (sh === S_CHEST || sh === S_SAPLING) {
      if (!this.canDestroyChest(x - (Math.trunc(fx / 18) % 2), y - Math.trunc(fy / 18))) return false;
    } else if (sh === S_CHEST3) {
      if (!this.canDestroyChest(x - (Math.trunc(fx / 18) % 3), y - Math.trunc(fy / 18))) return false;
    }
    return true;
  }

  /** CheckTileBreakability_HasReasonToReturnEarly(cs:62491-62509;hardMode 生成期假) */
  private hasReasonToReturnEarlyAt(ignoreTypeId: number, x: number, y: number, scanForContainer = true): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const sh = SHEET_OF[st.type[i]!] ?? -1;
    if (st.type[i] !== ignoreTypeId && (sh === S_TABLE || PREVENTS_REMOVAL_SS.has(sh))) return true;
    if (this.isLockedDoor(x, y)) return true;
    return scanForContainer && CONTAINER_SS.has(sh);
  }

  /** Chest.CanDestroyChest(cs:590-607):无箱或有空箱才可毁 */
  private canDestroyChest(x: number, y: number): boolean {
    return !this.blockedChestAnchors.has(x * 16384 + y);
  }

  /** WorldGen.IsLockedDoor(Tile)(cs:69248-69256) */
  private isLockedDoor(x: number, y: number): boolean {
    const st = this.st;
    const i = st.idx(x, y);
    if (SHEET_OF[st.type[i]!] !== S_DOOR) return false;
    const fy = st.frameY[i]!;
    return fy >= 594 && fy <= 646 && st.frameX[i]! < 54;
  }

  /** WorldGen.CheckBoulderChest(cs:48810-48833)——巨石帧锚反解+上两格门 */
  private checkBoulderChest(i: number, j: number, fx: number, fy: number, typeId: number): boolean {
    let num = Math.trunc(fx / 18) * -1;
    if (num < -1) num += 2;
    num += i;
    let num2 = fy;
    while (num2 >= 36) num2 -= 36;
    num2 = j - Math.trunc(num2 / 18);
    if (this.hasReasonToReturnEarlyAt(typeId, num, num2 - 1)) return true;
    if (this.hasReasonToReturnEarlyAt(typeId, num + 1, num2 - 1)) return true;
    return false;
  }

  /** WorldUtils.TileFrame(x, y, frameNeighbors:true)(WorldUtils.cs:79-89):
   *  中心+四邻五连 resetFrame=true,固定序 中心→+x→-x→+y→-y */
  private wuTileFrame(rng: RNG, x: number, y: number): void {
    this.tf314(rng, x, y);
    this.tf314(rng, x + 1, y);
    this.tf314(rng, x - 1, y);
    this.tf314(rng, x, y + 1);
    this.tf314(rng, x, y - 1);
  }

  /** WorldGen.SquareTileFrame(cs:80924/60297)本地统一入口(314/178 分派见
   *  tileFrameTrack) */
  private squareTileFrame314(rng: RNG, x: number, y: number): void {
    this.squareFrameTrack(rng, x, y);
  }

  /** WorldGen.TileFrame(i, j, resetFrame) 单格(cs:82067) */
  private tf314(rng: RNG, x: number, y: number): void {
    this.tileFrameTrack(rng, x, y, true);
  }

  /** WorldGen.TileFrame 单格本地分派:314(自分派)+ **178 本地分派**+其余走引擎。
   *  ★FFFFF:引擎 solidAllowSide 的左右坡排除项与原版 leftSlope({2,4})/rightSlope
   *  ({1,3}) 不符(各漏排一项)——178 锚判在轨道巷语境取本地原版判(#101 金标 gem
   *  (1320,776) 右邻 s4 冰被误放行定罪);引擎侧修复属 FinalCleanup 域,备案移交。
   *  resetFrame 在 TileFrameImportant 仅 case 178 消费(cs:85850 唯一位)⇒ 其余
   *  sheet 走引擎(reset=true 入口)恒等 */
  private tileFrameTrack(rng: RNG, x: number, y: number, reset: boolean): void {
    const st = this.st;
    if (x <= 5 || y <= 5 || x >= st.w - 5 || y >= st.h - 5) return;   // cs:82070 边距 5 早退
    const i = st.idx(x, y);
    if (!st.flags[i]) {                                                // cs:82078-82082 !active 清 half/slope/漆
      st.half[i] = 0; st.slope[i] = 0; st.paint[i] = 0;
      return;
    }
    const t = st.type[i]!;
    if (t === TRACK_TILE) { frameTrack(st, x, y); return; }            // case 314(cs:86033)——零掷
    if (__tfCellProbe) __tfCellProbe(SHEET_OF[t] ?? -1, x, y, st.frameX[i] ?? 0, st.frameY[i] ?? 0);
    if (SHEET_OF[t] === 178) { this.frame178(rng, x, y, reset); return; }
    if (SHEET_OF[t] === 185) { this.checkPileTrack(rng, x, y); return; }
    genTileFrame(st, rng, x, y);                                       // 其余全族(184 苔藓 Next(3) 掷等)
  }

  /** CheckPile(cs:46891-46974)本地镜像(sheet 185)——frameY==18 → Check2x1(内容
   *  掉落掷);否则支撑/地基族杀。★FFFFF:引擎 check2x1Sweep 缺 185 内容掉落掷
   *  段(cs:47137-47232 frameX 带 Next(1,4)/Next(10,100) 族——#101 轨巷砸双高堆
   *  实测掷 'b 1 4' 定罪),FinalCleanup 域备案,轨道巷语境本地取全 */
  private checkPileTrack(rng: RNG, x: number, y: number): void {
    const st = this.st;
    const i = st.idx(x, y);
    if (st.frameY[i] === 18 || SHEET_OF[st.type[i]!] === 649) {
      this.check2x1Track(rng, x, y, SHEET_OF[st.type[i]!]!);
      return;
    }
    if (!this.allowBottom(x, y + 1)) { this.killTileLane(rng, x, y); return; }
    const fx18 = Math.trunc(st.frameX[i]! / 18);
    const belowSh = st.inBounds(x, y + 1) && st.flags[st.idx(x, y + 1)] ? SHEET_OF[st.type[st.idx(x, y + 1)]!] ?? -1 : -1;
    if (belowSh < 0) return;
    if (fx18 >= 36 && fx18 <= 47) {                                    // 雪堆带(cs:46948-55)
      if (!(SNOW_SS.has(belowSh) || ICE_SS.has(belowSh) || belowSh === 147 || belowSh === 161
        || belowSh === 163 || belowSh === 164 || belowSh === 200 || belowSh === 162 || belowSh === 224)) {
        this.killTileLane(rng, x, y);
      }
    } else if ((fx18 >= 54 && fx18 <= 59) || fx18 >= 73) {             // 沙堆带(cs:46956-68;60-72 无查)
      if (!(SAND_SS.has(belowSh) || HARDSAND_SS.has(belowSh) || SANDSTONE_SS.has(belowSh))) {
        this.killTileLane(rng, x, y);
      }
    }
  }

  /** Check2x1(cs:46989-47369)本地镜像(185/649)——完整性+支撑门 → 双杀+内容掉落
   *  掷+尾双 SquareTileFrame。destroyObject 门=实例旗(vanilla static,本巷内等价) */
  private check2x1Track(rng: RNG, x: number, y: number, sheet: number): void {
    if (this.destroyObj) return;
    const st = this.st;
    const i = st.idx(x, y);
    const num = x - (Math.trunc(st.frameX[i]! / 18) % 2);
    let flag = true;
    if (st.inBounds(num + 1, y)) {
      const l = st.idx(num, y), r = st.idx(num + 1, y);
      if (st.frameX[r] === st.frameX[l]! + 18 && SHEET_OF[st.type[l]!] === sheet
        && SHEET_OF[st.type[r]!] === sheet && st.flags[l] && st.flags[r]) flag = false;
    }
    if (!st.inBounds(num + 1, y + 1)) flag = true;                     // 越界=AllowBottom 早退真
    else {
      if (!this.allowBottom(num, y + 1)) flag = true;
      if (!this.allowBottom(num + 1, y + 1)) flag = true;
    }
    if (sheet === 185) {
      const l = st.idx(num, y), r = st.idx(num + 1, y);
      if (st.frameX[l]! >= 1368 && st.frameX[l]! <= 1458) {            // cs:47050-54 伪堆帧回正
        const bl = st.idx(num, y + 1), br = st.idx(num + 1, y + 1);
        if (SHEET_OF[st.type[bl]!] !== 2 && SHEET_OF[st.type[br]!] !== 2
          && SHEET_OF[st.type[bl]!] !== 477 && SHEET_OF[st.type[br]!] !== 477
          && SHEET_OF[st.type[bl]!] !== 492 && SHEET_OF[st.type[br]!] !== 492) {
          st.frameX[l] = st.frameX[l]! - 1368;
          st.frameX[r] = st.frameX[r]! - 1368;
        }
      }
      const num5 = Math.trunc(st.frameX[st.idx(num, y)]! / 36)
        + (Math.trunc(st.frameY[st.idx(num, y)]! / 18) - 1) * 52;
      for (let j = num; j < num + 2; j++) {
        if (!st.inBounds(j, y + 1)) break;
        const bi = st.idx(j, y + 1);
        if (st.flags[bi] && BOULDER_SS.has(SHEET_OF[st.type[bi]!] ?? -1)) { flag = true; break; }   // InvalidTileForPilesOrSpeleothems(cs:39005)
        if (!st.flags[bi]) continue;
        const type2 = SHEET_OF[st.type[bi]!] ?? -1;
        if (num5 >= 25 && num5 <= 30) {                                 // 雪带(cs:47072-80)
          if (!(type2 === 147 || ICE_SS.has(type2) || type2 === 162 || type2 === 224)) flag = true;
        } else if ((num5 >= 41 && num5 <= 46) || (num5 >= 62 && num5 <= 64)) {   // 沙带(cs:47081-91)
          if (!(SAND_SS.has(type2) || HARDSAND_SS.has(type2) || SANDSTONE_SS.has(type2))) flag = true;
        }
      }
    }
    if (!flag) return;
    let dropFx = st.frameX[st.idx(num, y)] ?? 0;                        // cs:47105-47109
    if (!st.flags[st.idx(num, y)]) dropFx = st.frameX[st.idx(num + 1, y)] ?? 0;
    this.destroyObj = true;
    if (SHEET_OF[st.type[st.idx(num, y)]!] === sheet) this.killTileLane(rng, num, y);
    if (SHEET_OF[st.type[st.idx(num + 1, y)]!] === sheet) this.killTileLane(rng, num + 1, y);
    if (sheet === 185) this.pileDropRolls(rng, dropFx);                 // cs:47137-47232 内容掉落掷
    this.destroyObj = false;
    this.squareFrameTrack(rng, num, y);                                 // cs:47366-47368
    this.squareFrameTrack(rng, num + 1, y);
  }

  /** Check2x1 type==185 内容掉落掷(cs:47137-47232)——Item.NewItem 侧产物不可见
   *  (八通道),掷序/值域 1:1(条件掷按原值门) */
  private pileDropRolls(rng: RNG, fx: number): void {
    if (fx >= 576 && fx <= 610) {            // 明胶(71)
      rng.nextIntRange(10, 100);
      rng.nextIntRange(20, 100);
      if (rng.nextInt(3) !== 0) rng.nextIntRange(10, 100);
      if (rng.nextInt(3) !== 0) rng.nextIntRange(20, 100);
      if (rng.nextInt(2) === 0) rng.nextIntRange(10, 100);
      if (rng.nextInt(2) === 0) rng.nextIntRange(20, 100);
      if (rng.nextInt(3) === 0) rng.nextIntRange(10, 100);
      if (rng.nextInt(3) === 0) rng.nextIntRange(20, 100);
      if (rng.nextInt(4) === 0) rng.nextIntRange(10, 100);
      if (rng.nextInt(4) === 0) rng.nextIntRange(20, 100);
      if (rng.nextInt(5) === 0) rng.nextIntRange(10, 100);
      if (rng.nextInt(5) === 0) rng.nextIntRange(20, 100);
    } else if (fx >= 612 && fx <= 646) {     // 火把堆?(72)
      rng.nextIntRange(10, 100);
      if (rng.nextInt(2) === 0) rng.nextIntRange(20, 100);
      if (rng.nextInt(3) === 0) rng.nextIntRange(30, 100);
    } else if (fx >= 648 && fx <= 682) {     // 炸弹堆(73)
      rng.nextIntRange(1, 6);
      if (rng.nextInt(2) === 0) rng.nextIntRange(2, 6);
      if (rng.nextInt(3) === 0) rng.nextIntRange(3, 6);
    } else if ((fx >= 684 && fx <= 718) || (fx >= 720 && fx <= 754) || (fx >= 756 && fx <= 790)
      || (fx >= 792 && fx <= 826) || (fx >= 828 && fx <= 862) || (fx >= 864 && fx <= 898)) {
      rng.nextIntRange(1, 4);                // 181/180/177/179/178/182 六带同掷
    }
  }

  /** SolidTileAllowBottomSlope(cs:70211-70233):(solid||solidTop) &&
   *  (!topSlope{1,2}||(plat&&properTop)) && !half(生成期 !inActive 恒真) */
  private allowBottom(x: number, y: number): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return true;      // 原版 !InWorld → true
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const sh = SHEET_OF[st.type[i]!] ?? -1;
    const plat = TILE_DEFS[st.type[i]!]?.platform === true;
    const solid = trkTileSolidGen(st.type[i]!);
    const sl = st.slope[i]!;
    return (solid || plat) && ((sl !== 1 && sl !== 2) || (plat && this.platformProperTop(st.frameX[i]!))) && st.half[i] === 0;
  }

  /** WorldGen.SquareTileFrame(cs:80924)本地版:九宫固定序、仅中心 resetFrame=true */
  private squareFrameTrack(rng: RNG, x: number, y: number): void {
    this.tileFrameTrack(rng, x - 1, y - 1, false);
    this.tileFrameTrack(rng, x - 1, y, false);
    this.tileFrameTrack(rng, x - 1, y + 1, false);
    this.tileFrameTrack(rng, x, y - 1, false);
    this.tileFrameTrack(rng, x, y, true);
    this.tileFrameTrack(rng, x, y + 1, false);
    this.tileFrameTrack(rng, x + 1, y - 1, false);
    this.tileFrameTrack(rng, x + 1, y, false);
    this.tileFrameTrack(rng, x + 1, y + 1, false);
  }

  /** TileFrameImportant case 178(cs:85843-85876)本地镜像 */
  private frame178(rng: RNG, x: number, y: number, reset: boolean): void {
    const st = this.st;
    const i = st.idx(x, y);
    const frameY2 = st.frameY[i]!;
    const dir = this.checkAndAdjustGem(x, y);
    if (dir < 0) { this.killTileLane(rng, x, y); return; }
    const num21 = reset ? rng.nextInt(3) * 18 : frameY2 % 54;
    let num22 = -1;
    if (dir === 0 && (frameY2 < 0 || frameY2 > 36)) num22 = 0;
    else if (dir === 1 && (frameY2 < 54 || frameY2 > 90)) num22 = 54;
    else if (dir === 2 && (frameY2 < 108 || frameY2 > 144)) num22 = 108;
    else if (dir === 3 && (frameY2 < 162 || frameY2 > 198)) num22 = 162;
    if (num22 > -1) st.frameY[i] = num22 + num21;
  }

  /** CheckAndAdjustMultiDirectionalTile(cs:60338-60390)——宝石语境(方向/失败 -1)。
   *  vanilla 四锚 ValidAnchor 后统一 tileSolid&&!tileSolidTop 复检(全方向同式),
   *  已并入 gemAnchor */
  private checkAndAdjustGem(x: number, y: number): number {
    if (x < 2 || y < 2 || x >= this.st.w - 2 || y >= this.st.h - 2) return -1;   // InWorld(i,j,2)
    if (this.gemAnchor(x, y + 1, 1)) return 0;    // 下锚(ValidAnchor dir 1→AllowBottomSlope,cs:60351)
    if (this.gemAnchor(x - 1, y, 2)) return 2;    // 左锚(dir 2→AllowLeftSlope)
    if (this.gemAnchor(x + 1, y, 3)) return 3;    // 右锚(dir 3→AllowRightSlope)
    if (this.gemAnchor(x, y - 1, 0)) return 1;    // 上锚(dir 0→AllowTopSlope,cs:60348)
    return -1;
  }

  /** ValidAnchorForMultiDirectionalTile(cs:60317-60336)+SolidTileAllow*Slope
   *  (cs:70211/70325/70345/70365)全门镜像(生成期 inActive 恒假)。
   *  slope 半代码:1/2=topSlope、3/4=bottomSlope、2/4=leftSlope、1/3=rightSlope */
  private gemAnchor(x: number, y: number, dir: 0 | 1 | 2 | 3): boolean {
    const st = this.st;
    if (!st.inBounds(x, y)) return false;
    const i = st.idx(x, y);
    if (!st.flags[i]) return false;
    const sh = SHEET_OF[st.type[i]!] ?? -1;
    if (sh < 0 || BOULDER_SS.has(sh) || sh === S_DOOR) return false;   // cs:60320 预门
    const sl = st.slope[i]!, half = st.half[i]!;
    const plat = TILE_DEFS[st.type[i]!]?.platform === true;
    const solid = trkTileSolidGen(st.type[i]!);
    switch (dir) {
      case 0:  // AllowTopSlope:(solid||380) && ((!plat&&!bottomSlope) || (plat&&half))
        return (solid || sh === 380) && ((!plat && sl !== 3 && sl !== 4) || (plat && half !== 0));
      case 1:  // AllowBottomSlope:(solid||solidTop) && (!topSlope||(plat&&properTop)) && !half
        return (solid || plat) && ((sl !== 1 && sl !== 2) || (plat && this.platformProperTop(st.frameX[i]!))) && half === 0;
      case 2:  // AllowLeftSlope:solid && !half && !rightSlope{1,3} && !plat
        return solid && half === 0 && sl !== 1 && sl !== 3 && !plat;
      default: // AllowRightSlope:solid && !half && !leftSlope{2,4} && !plat
        return solid && half === 0 && sl !== 2 && sl !== 4 && !plat;
    }
  }

  /** PlatformProperTopFrame(cs:70197):num=frameX/18 ∈ [0,7]∪[12,16]∪[25,26] */
  private platformProperTop(frameX: number): boolean {
    const num = Math.trunc(frameX / 18);
    if ((num < 0 || num > 7) && (num < 12 || num > 16)) return num >= 25 && num <= 26;
    return true;
  }

  /** CalculateStateForLocation(cs:397-425)。
   *  带单次 Place 内的结果缓存(findPath 期地图只读,重写扫描高度重复) */
  private stateAt(x: number, y: number): number {
    const key = (x << 14) | y;
    const cached = this.stateCache.get(key);
    if (cached !== undefined) return cached;
    const state = this.calcState(x, y);
    this.stateCache.set(key, state);
    return state;
  }



  private calcState(x: number, y: number): number {
    for (let i = 0; i < 6; i++) {
      if (this.isLocationInvalid(x, y - i)) return INVALID;
    }
    const st = this.st;
    for (let j = 0; j < 6; j++) {
      if (!st.inBounds(x, y + j)) return INVALID;
      const idx = st.idx(x, y + j);
      if (st.flags[idx] && st.type[idx] === TRACK_TILE) return INVALID;
    }
    for (let k = 0; k < 6; k++) {
      if (solidTile(st, x, y - k)) return OBSTRUCTED;
    }
    if (this.isTrackNearby(x, y, 30)) return INVALID;
    return AVAILABLE;
  }

  /** WorldGen.IsTileNearby(x, y, 314, 30)(WorldGen.cs:8828)。
   *  61×61 全扫 → 64×64 桶索引(桶 ≥ 查询盒,最多 2×2 桶),布尔结果恒等 */
  private isTrackNearby(x: number, y: number, distance: number): boolean {
    if (this.trackCount === 0) return false;
    const x0 = x - distance, x1 = x + distance;
    const y0 = y - distance, y1 = y + distance;
    const gx0 = x0 >> 6, gx1 = x1 >> 6;
    const gy0 = y0 >> 6, gy1 = y1 >> 6;
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const list = this.trackBuckets.get((gy << 16) | gx);
        if (!list) continue;
        for (const cell of list) {
          const cx = cell >> 14, cy = cell & 0x3fff;
          if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) return true;
        }
      }
    }
    return false;
  }

  /** IsLocationInvalid(cs:436-478) */
  private isLocationInvalid(x: number, y: number): boolean {
    const st = this.st;
    const gs = this.gs;
    // y > UnderworldLayer(h-200) / 边距 5 / 地表以上(cs:438)
    if (y > st.h - 200 || x < 5 || y < Math.floor(gs.worldSurface) || x > st.w - 5) return true;
    // 微光安全盒(shimmerSafetyDistance/2 = 75,cs:442-445)
    if (gs.shimmerX >= 0 && Math.abs(x - gs.shimmerX) < SHIMMER_SAFETY / 2
      && Math.abs(y - gs.shimmerY) < SHIMMER_SAFETY / 2) return true;
    // oceanDepths(cs:446-448):y ≤ oceanLevel 且在海滩带
    const oceanLevel = (gs.worldSurface + gs.rockLevel) / 2 + 40;
    if (y <= oceanLevel && (x < gs.beachDistance || x > st.w - gs.beachDistance)) return true;
    // dualDungeons 分支未接(无 DungeonUtils)
    const idx = st.inBounds(x, y) ? st.idx(x, y) : -1;
    // NTB 豁免:wall 108 不拒位(cs:458-464 `(!notTheBees || wall != 108)`)
    if (idx >= 0 && INVALID_WALLS.has(st.wall[idx])
      && !(gs.seedFlags.notTheBees && st.wall[idx] === NTB_EXEMPT_WALL)) return true;
    if (idx >= 0 && st.flags[idx] && this.invalidTiles.has(st.type[idx])) return true;
    // 邻列 general placement 屏蔽(cs:470-476);NTB 豁免 225(cs:472 同款三目)
    for (let k = -1; k <= 1; k++) {
      if (!st.inBounds(x + k, y)) return true;
      const nidx = st.idx(x + k, y);
      if (st.flags[nidx] && st.type[nidx] !== TRACK_TILE && PLACEMENT_BLOCKED.has(st.type[nidx])
        && !(gs.seedFlags.notTheBees && SHEET_OF[st.type[nidx]!] === 225)) return true;
    }
    return false;
  }
}

/** CanSlopesTouch(cs:373-380) */
function canSlopesTouch(left: number, right: number): boolean {
  if (left !== right && left !== STRAIGHT) return right === STRAIGHT;
  return true;
}
