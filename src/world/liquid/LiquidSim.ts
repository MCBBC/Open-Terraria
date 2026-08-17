// 液体模拟：Terraria 1.4.5.6（Terarria1456/Terraria/Liquid.cs）一比一移植。
// 核心结构（对照原版行号）：
//  - 活动液体列表 liquids[{x,y,kill,delay}] + checkingLiquid/skipLiquid 位图（Liquid.cs:37-40）
//  - UpdateLiquid() 分片调度 + kill 清扫（Liquid.cs:691-833）
//  - Update() 单格流程：实心格/地狱蒸发/岩浆蜂蜜降速与交互/下灌/侧向均流/kill 维护（Liquid.cs:298-674）
//  - LavaCheck/HoneyCheck：水+岩浆→黑曜石(56)、岩浆+蜂蜜→脆蜂蜜块(230)、水+蜂蜜→蜂蜜块(229)（Liquid.cs:888-1115）
//  - QuickWater/SettleWaterAt 读档沉降搬运（Liquid.cs:85-212）+ WaterCheck 重建列表（WorldGen.cs:48955）
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
import type { World } from '../World';

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

export class LiquidSim {
  world: World;
  /** 活动液体条目（原版 Main.liquid[]，dense 数组 + swap-remove） */
  private liquids: LiquidEntry[] = [];
  numLiquid = 0;
  /** tile.checkingLiquid / tile.skipLiquid 位图 */
  private checking: Uint8Array;
  private skip: Uint8Array;
  /** 调度参数（单机客户端高质量档：cycles = 17-10*1 = 7；Main.cs:12240-12243） */
  private cycles = 7;
  private curMaxLiquid = 25000;
  private wetCounter = 0;
  /** 读档沉降：quickSettle=true 时 cycles=1 全量处理、下灌快速补满（WorldFile.cs:365-389 / Main.cs:12251） */
  quickSettle = false;
  private quickFall = false;
  private stuck = false;
  private stuckCount = 0;
  private stuckAmount = 0; // 原版 ReInit 置 0（Liquid.cs:69）
  private disposed = false;
  /** LiquidBuffer 溢出缓冲（Liquid.cs:840-843 入队 / 799-807 清扫轮回灌，上限 49998）。
   *  定长 Int32Array 对 + head/tail 环形语义(非环形,tail 到顶即丢——原版上限语义)——
   *  ★曾用 Array.shift() 出队,O(n) × 万次回灌 = 沉降 O(n²) 主热点;头指针出队 O(1) */
  private static readonly BUFFER_CAP = 49998;
  private bufX = new Int32Array(LiquidSim.BUFFER_CAP);
  private bufY = new Int32Array(LiquidSim.BUFFER_CAP);
  private bufHead = 0;   // 下一个出队位
  private bufTail = 0;   // 下一个入队位(bufTail-bufHead = 元素数)
  /** 实心判定 LUT(热路径查表替代 TILE_DEFS 属性链;定义同源=构造时用原判定式逐 id 预计算):
   *  solidNP[id]=solid&&!platform(blocksLiquid/addWater/waterCheck 用);
   *  solidFull[id]=solid&&!platform&&!half&&!slope(solidTileFull 用) */
  private solidNP!: Uint8Array;
  private solidFull!: Uint8Array;
  /** 水死/岩浆死内部 tile id 集（Main.tileWaterDeath/tileLavaDeath 经 sheet 反查） */
  private readonly waterDeathIds: Set<number>;
  private readonly lavaDeathIds: Set<number>;
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
   *  mulberry32 与 world.seed 派生：同 seed 世界双路径沉降结果逐格一致） */
  private genState: number;
  private genRand(): number {
    this.genState = (this.genState + 0x6d2b79f5) | 0;
    let t = this.genState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** genRand.Next(max)（Liquid.cs:898 / KillTile 尘掷族）：pass 链钩优先，
   *  缺省回退私有 mulberry32（旧路径兼容，*[0,1) 采样与 Next 同耗 1 掷） */
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
  }

  /** KillTile 分发：运行期走 Game 注入钩子（掉落+帧刷新）；生成/读档沉降期
   *  （钩子缺位）走 killTileGen——原版 WaterCheck(:81172-81187 死亡表击杀)/
   *  LiquidCheck(:1288-1295 非水本格+下方裁切植物)/CreateLiquidMergeTile(:1370)
   *  三条触发链在沉降期同样生效（#97 vanilla 实测 KillTile 844 格） */
  private killTileAt(x: number, y: number): void {
    if (this.killTile) { this.killTile(x, y); return; }
    if (this.isGeneratingOrLoadingWorld) this.killTileGen(x, y);
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
  /** 地牢豁免（Liquid.cs:186-188：InAnyPotentialDungeonBounds(x,y) 且 origin 格墙
   *  为地牢墙族 → 保持水）。QuickWater 调用方按需接线；未接线=null 不豁免 */
  dungeonWaterExempt: ((x: number, y: number, originWall: number) => boolean) | null = null;
  /** tilesIgnoreWater 家族（Liquid.cs:68-72 → WorldGen.SetBoulderSolidity cs:11026）：
   *  138 巨石 / 484 滚动仙人掌 / 664 / 711-716（1.4.5 巨石家族）+ 546。
   *  QuickWater 全程全局置非实心（原版直接改写 Main.tileSolid——SettleWaterAt 通行
   *  门与 LiquidCheck 的 WorldGen.SolidTile 等一切读者同步生效）。484 活性格在
   *  地下沙漠大量存在：缺此翻转=沙漠水池沉降路径整体错位（#28 复验实测 430 格）。 */
  private readonly boulderFamilyIds: Set<number>;
  private readonly id546: number;
  private readonly id379: number;
  private solidNPBackup: Uint8Array | null = null;

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
    this.id546 = bySheet(new Set([546])).values().next().value ?? -1;
    this.id379 = bySheet(new Set([379])).values().next().value ?? -1;
    // genRand 初态：world.seed 派生（避免与生成管线的 genRand 状态纠缠，仅求双路径一致）
    this.genState = (world.seed ^ 0x9e3779b9) | 0;
    // 挖掘/放置唤醒：原版 SquareTileFrame 会对 3×3 内每格 TileFrame→AddWater（WorldGen.cs:49664）
    st.onTileChanged((x, y) => {
      if (this.disposed) return;
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
  }

  /** 溢出缓冲长度（Game 的生成期轮上限计算用，原版 LiquidBuffer.numLiquidBuffer） */
  get bufferLen(): number { return this.bufTail - this.bufHead; }

  /** 丢弃模拟器：预沉降临时实例调用，停止响应唤醒 */
  dispose() {
    this.disposed = true;
    this.liquids.length = 0;
    this.numLiquid = 0;
  }

  private idx(x: number, y: number): number { return y * this.world.store.w + x; }

  /** 格子是否阻挡液体（原版 nactive() && tileSolid && !tileSolidTop）。
   *  nactive() 要求 active 位——生成期 TileRunner 会在空气格写幽灵 type（flags=0），
   *  无 active 的一律视为空气（否则微光池会被 waterCheck 当实心格清零泄流） */
  private blocksLiquid(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    if (!st.flags[i]) return false;
    return this.solidNP[st.type[i]] === 1;
  }

  /** WorldGen.SolidTile 语义（WorldGen.cs:42370）：实心 && !平台 && !半砖 && !坡面。
   *  仅 LavaCheck/HoneyCheck/ShimmerCheck 入口使用——半砖格允许发生交互（Liquid.cs:898/1020） */
  private solidTileFull(x: number, y: number): boolean {
    const st = this.world.store;
    if (x < 0 || y < 0 || x >= st.w || y >= st.h) return true;
    const i = this.idx(x, y);
    if (!st.flags[i]) return false;
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
      if (this.solidNP[t] === 1) return;
    }
    if (this.numLiquid >= this.curMaxLiquid - 1) {
      // 原版走 LiquidBuffer 缓冲、清扫轮回灌（Liquid.cs:840-843），超缓冲上限才丢
      if (this.bufTail - this.bufHead < LiquidSim.BUFFER_CAP) {
        if (this.bufTail === LiquidSim.BUFFER_CAP) {
          // ★到顶且 head>0:前移压缩(原版 Array.shift 后 push 可重新装满;曾漏此步
          // → 越界写静默丢条目,与原版容量语义不等价,A/B 哈希报警)
          this.bufX.copyWithin(0, this.bufHead, this.bufTail);
          this.bufY.copyWithin(0, this.bufHead, this.bufTail);
          this.bufTail -= this.bufHead;
          this.bufHead = 0;
        }
        this.bufX[this.bufTail] = x;
        this.bufY[this.bufTail] = y;
        this.bufTail++;
        // LiquidBuffer.AddBuffer :115:入队即置 checkingLiquid——缺此则同 tick 同格
        // 二次 AddWater 会重复入队(原版经 :13 checkingLiquid 门拒绝;清扫 :380
        // 先清后 addWater 语义不变)
        this.checking[i] = 1;
      }
      return;
    }
    this.checking[i] = 1;
    this.skip[i] = 0;
    this.liquids[this.numLiquid] = { x, y, kill: 0, delay: 0 };
    this.numLiquid++;
    // 1456 AddWater 尾部（L1196-1211）：岩浆/水冲毁可死亡方块（火把/植物等 KillTile）。
    //  与 blocksLiquid 同理走 nactive（幽灵 type 不算实心）。★isGeneratingOrLoading
    //  World 门槛（L1199 `!tile.active() || isGeneratingOrLoadingWorld → return`）：
    //  生成/读档沉降期此链不发击杀（击杀走 WaterCheck/LiquidCheck 两链）
    if (!this.isGeneratingOrLoadingWorld && t !== 0 && st.flags[i]) {
      const isLava = st.liquidType[i] === 2;
      const dies = isLava ? this.lavaDeathIds.has(t) : this.waterDeathIds.has(t);
      if (dies) this.killTileAt(x, y);
    }
  }

  // ================= UpdateLiquid 调度（Liquid.cs:691-833） =================

  /** 每 2 个逻辑 tick 调一次（原版 WorldGen.UpdateWorld 内 skipCount 节流） */
  step() { this.updateLiquid(); }

  updateLiquid() {
    const st = this.world.store;
    const killThreshold = 8; // 单机 num（1456 Liquid.cs:995）
    // panic 模式（1456 Liquid.cs:1019-1070）：缓冲 ≥45000 持续 3600 次未解 →
    // 自底向上逐行 QuickWater 强制沉降，每次调用处理 5 行，到顶后 WaterCheck 退出
    if (!this.quickSettle) {
      if (!this.panicMode) {
        if (this.bufTail - this.bufHead >= 45000) {
          this.panicCounter++;
          if (this.panicCounter > 3600) {
            this.panicMode = true;
            this.panicCounter = 0;
            this.panicY = st.h - 3;
            this.liquids.length = 0;
            this.numLiquid = 0;
            this.bufHead = 0; this.bufTail = 0;
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
      // LiquidBuffer 回灌：按剩余空位逐个重新入列（Liquid.cs:799-807）
      if (this.bufTail > this.bufHead) {
        const free = Math.min(this.curMaxLiquid - this.numLiquid, this.bufTail - this.bufHead);
        for (let n = 0; n < free; n++) {
          const bx = this.bufX[this.bufHead];
          const by = this.bufY[this.bufHead];
          this.bufHead++;
          this.checking[this.idx(bx, by)] = 0;
          this.addWater(bx, by);
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
    // 1) 本格被实心方块占据 → 下轮必删（Liquid.cs:306-310）
    if (this.blocksLiquid(x, y)) { e.kill = 999; return; }
    const startAmt = st.liquid[i5];
    // 2) 地狱蒸发：水每 tick -2（Liquid.cs:314-320；UnderworldLayer ≈ h-200）
    if (y > h - 200 && st.liquidType[i5] === 1 && st.liquid[i5] > 0) {
      st.liquid[i5] = Math.max(0, st.liquid[i5] - 2);
    }
    if (st.liquid[i5] === 0) { e.kill = 999; return; }
    const myType = st.liquidType[i5];
    // 3) 岩浆/蜂蜜：先交互检查，再降速（Liquid.cs:327-373）
    if (myType === 2) {
      this.lavaCheck(x, y);
      if (!this.quickFall) {
        if (e.delay < 5) { e.delay++; return; }
        e.delay = 0;
      }
    } else {
      // 水格：唤醒岩浆邻居，让对方自己的 Update 处理交互（Liquid.cs:342-349）。
      // 标量展开(2026-08 审计 G4):元组数组+迭代器在此热路径 ≈2.5M 对象/s
      for (let t = 0; t < 4; t++) {
        const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
        const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = this.idx(nx, ny);
        if (st.liquid[ni] > 0 && st.liquidType[ni] === 2) this.addWater(nx, ny);
      }
      if (myType === 3) {
        this.honeyCheck(x, y);
        if (!this.quickFall) {
          if (e.delay < 10) { e.delay++; return; }
          e.delay = 0;
        }
      } else {
        // 唤醒蜂蜜邻居（Liquid.cs:365-372）——标量展开,同上
        for (let t = 0; t < 4; t++) {
          const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
          const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = this.idx(nx, ny);
          if (st.liquid[ni] > 0 && st.liquidType[ni] === 3) this.addWater(nx, ny);
        }
        if (myType === 4) {
          // 微光格：自检交互（Liquid.cs:543-546 tile5.shimmer() → ShimmerCheck），
          // 无降速 delay——流动性与水一致
          this.shimmerCheck(x, y);
        } else {
          // 水格：唤醒微光邻居，让对方自己的 Update 处理交互（Liquid.cs:549-564）
          for (let t = 0; t < 4; t++) {
            const nx = x + (t === 0 ? -1 : t === 1 ? 1 : 0);
            const ny = y + (t === 2 ? -1 : t === 3 ? 1 : 0);
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = this.idx(nx, ny);
            if (st.liquid[ni] > 0 && st.liquidType[ni] === 4) this.addWater(nx, ny);
          }
        }
      }
    }
    // 4) 向下全量下灌（Liquid.cs:375-397）
    {
      const bi = this.idx(x, y + 1);
      const belowAmt = st.liquid[bi];
      const belowType = st.liquidType[bi];
      const belowBlocks = y + 1 >= h ? true : this.blocksLiquid(x, y + 1);
      if (!belowBlocks && (belowAmt <= 0 || belowType === myType) && belowAmt < 255) {
        let t = 255 - belowAmt;
        if (t > st.liquid[i5]) t = st.liquid[i5];
        // 原版边界特性：缺口 1 且本格满格时不扣源（Liquid.cs:381-384）
        const flag = t === 1 && st.liquid[i5] === 255;
        if (!flag) st.liquid[i5] -= t;
        st.liquid[bi] += t;
        st.liquidType[bi] = myType;
        this.addWater(x, y + 1);
        this.skip[bi] = 1;
        this.skip[i5] = 1;
        if (this.quickSettle && st.liquid[i5] > 250) st.liquid[i5] = 255;
        else if (!flag) { this.addWater(x - 1, y); this.addWater(x + 1, y); }
      }
    }
    // 5) 侧向均流（Liquid.cs:398-651）
    if (st.liquid[i5] > 0) this.sideFlow(x, y, i5);
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
        // 3 格均分（Liquid.cs:613-628）：随机 254→255 补满
        let m = csRound((lq + rq + st.liquid[i5] + num1) / 3); // 1456 Math.Round=取偶
        if (m === 254 && this.roll(30) === 0) m = 255; // 原版 WorldGen.genRand.Next(30)==0（gen 期走 pass 链流）
        if (lq !== m) { st.liquidType[il] = myType; st.liquid[il] = m; this.addWater(x - 1, y); } else st.liquidType[il] = myType;
        if (rq !== m) { st.liquidType[ir] = myType; st.liquid[ir] = m; this.addWater(x + 1, y); } else st.liquidType[ir] = myType;
        st.liquid[i5] = m;
      }
    } else if (f1) {
      // 2 格：向左（Liquid.cs:633-639）
      const m = csRound((lq + st.liquid[i5] + num1) / 2); // 1456 Math.Round=取偶
      if (lq !== m) st.liquid[il] = m;
      st.liquidType[il] = myType;
      if (st.liquid[i5] !== m || st.liquid[il] !== m) this.addWater(x - 1, y);
      st.liquid[i5] = m;
    } else if (f2) {
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
   *  常规生成期交互不落块（strip 分支），唯独收尾这一次允许把残余接触转成块 */
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
          if (t === 2) this.lavaCheck(x, y);
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

  /** 岩浆格与水/蜂蜜/微光接触 → 黑曜石 56 / 脆蜂蜜块 230 / Aetherium 659（阈值 24） */
  private lavaCheck(x: number, y: number) {
    const st = this.world.store;
    // LavaCheck 头部沙漠分支（Liquid.cs:1457-1465）：生成期 + 7×7 含地下沙漠墙 →
    // 整块 7×7 液体**类型**转岩浆（lava(true) 不动量）——地下沙漠底岩浆池来源，且使
    // 沙漠内水岩接触不互湮（转同型后 LiquidCheck 无异种邻）。remixWorldGen/
    // dualDungeonsSeed 为特殊种子旗标，本工程不启用。须在 SolidTile 门之前（原版序）。
    if (this.generatingWorld && this.undergroundDesertCheck(x, y)) {
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
      if (lt === 3 || rt === 3 || ut === 3) { type = CRISPY_HONEY; mergeType = 3; }
      if (lt === 4 || rt === 4 || ut === 4) { type = AETHERIUM; mergeType = 4; } // 微光优先级最高（L1443-1451）
      if (sum < 24) return;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill（火把/植物被顶掉，非 decor 近似）
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      st.liquid[i5] = 0;
      st.liquidType[i5] = 0;
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
      // 非水本格 + 下方裁切植物 → 先 KillTile 掉落（Liquid.cs:1289-1295）
      if (selfT !== 1 && belowAct && this.cutIds.has(belowT)) this.killTileAt(x, y + 1);
      // 落块门（Liquid.cs:1294）：下方空 / tileObsidianKill / 容器位 三者其一
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 0; return; }
      const type = dt === 4 ? AETHERIUM : dt === 3 ? CRISPY_HONEY : OBSIDIAN;
      st.liquid[i5] = 0; st.liquidType[i5] = 0;
      st.liquid[id] = 0; st.liquidType[id] = 0;
      this.createMergeTile(x, y + 1, type, 2, dt);
    }
  }

  /** 蜂蜜格与水/岩浆/微光接触 → 蜂蜜块 229 / 脆蜂蜜块 230 / Aetherium 659（阈值 24）。
   *  触发门 = 任一邻格液体类型非蜂蜜（LiquidCheck L1244 `liquidType() != thisLiquidType`），
   *  此前只识别水邻——岩浆/微光邻漏触发，1456 对齐补齐 */
  private honeyCheck(x: number, y: number) {
    const st = this.world.store;
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
      const type = (lt === 4 || rt === 4 || ut === 4) ? AETHERIUM
        : (lt === 2 || rt === 2 || ut === 2) ? CRISPY_HONEY : HONEY_BLOCK;
      const mergeType = (lt === 4 || rt === 4 || ut === 4) ? 4 : (lt === 2 || rt === 2 || ut === 2) ? 2 : 1;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      st.liquid[i5] = 0;
      st.liquidType[i5] = 0;
      this.createMergeTile(x, y, type, 3, mergeType);
    } else {
      if (dq <= 0 || dt === 3) return;
      const selfAct = st.flags[i5] !== 0;
      const selfT = st.type[i5];
      const belowAct = st.flags[id] !== 0;
      const belowT = st.type[id];
      const containerOk = selfAct && this.containerIds.has(selfT) && !(belowAct && this.containerIds.has(belowT));
      // 非水本格 + 下方裁切植物 → 先 KillTile 掉落（Liquid.cs:1289-1295）
      if (selfT !== 1 && belowAct && this.cutIds.has(belowT)) this.killTileAt(x, y + 1);
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 0; return; } // 1456 统一 24
      const type = dt === 4 ? AETHERIUM : dt === 2 ? CRISPY_HONEY : HONEY_BLOCK;
      st.liquid[i5] = 0; st.liquidType[i5] = 0;
      st.liquid[id] = 0; st.liquidType[id] = 0;
      this.createMergeTile(x, y + 1, type, 3, dt);
    }
  }

  /** 微光格与水/岩浆/蜂蜜任一接触 → Aetherium 块 659（Liquid.cs:1475-1478 →
   *  LiquidCheck(thisLiquidType=3)；GetLiquidMergeTypes L1437-1452 微光行恒为 659） */
  private shimmerCheck(x: number, y: number) {
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
      // mergeType == thisType 门（L1269）：三邻中仍有微光 → 不产块（liquidMergeType 被拉回 3）
      if (sum < 24 || lt === 4 || rt === 4 || ut === 4) return;
      // 落块门（Liquid.cs:1269）：空格 或 tileObsidianKill
      const act = st.flags[i5] !== 0;
      if (act && !this.obsidianKillIds.has(st.type[i5])) return;
      st.liquid[i5] = 0;
      st.liquidType[i5] = 0;
      this.createMergeTile(x, y, AETHERIUM, 4, (lt !== 4 ? lt : rt !== 4 ? rt : ut) || 1);
    } else {
      if (dq <= 0 || dt === 4) return;
      // 情形 B：仅下方有异种液体 → 产物生成在下方格（Liquid.cs:1275-1317）
      const selfAct = st.flags[i5] !== 0;
      const selfT = st.type[i5];
      const belowAct = st.flags[id] !== 0;
      const belowT = st.type[id];
      const containerOk = selfAct && this.containerIds.has(selfT) && !(belowAct && this.containerIds.has(belowT));
      // 非水本格 + 下方裁切植物 → 先 KillTile 掉落（Liquid.cs:1289-1295）
      if (selfT !== 1 && belowAct && this.cutIds.has(belowT)) this.killTileAt(x, y + 1);
      if (st.flags[id] !== 0 && !this.obsidianKillIds.has(st.type[id]) && !containerOk) return;
      if (st.liquid[i5] < 24) { st.liquid[i5] = 0; st.liquidType[i5] = 0; return; }
      st.liquid[i5] = 0; st.liquidType[i5] = 0;
      st.liquid[id] = 0; st.liquidType[id] = 0;
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
      st.liquidType[i5] = 0;
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
            const t = st.type[ni];
            if (t === 0) continue;
            if (this.lavaBurnAirIds.has(t)) st.setTile(nx, ny, 0);
            else if (this.lavaBurnDirtIds.has(t)) st.setTile(nx, ny, this.mudId); // cs:1562 type=59（泥，非泥土0——曾误写 dirt）
          }
        }
      } else if (st.liquidType[i5] === 3) {
        this.honeyCheck(x, y);
      } else if (st.liquidType[i5] === 4) {
        this.shimmerCheck(x, y); // Liquid.cs:1576-1579 tile4.shimmer() → ShimmerCheck
      }
    }
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
      if (st.liquid[i5] > 0 && st.liquidType[i5] === 2) bad = true; // 草药泡岩浆必枯
    }
    if (bad) { this.killTileAt(x, y); return; }
    // 阶段 5 bloom 切换（45981+ case 5 尾段）：Daybloom(82) 豁免，仅岩浆格生效
    if (stage !== 5) return;
    const t = st.type[i5];
    if (t === this.herbSproutId || st.liquidType[i5] !== 2) return;
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
      } else if (!belowDef?.platform && (!belowDef?.solid)) {
        // 下方被非平台实心家具占据 → 掉落清除（59305-59312）
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
    if (st.liquid[oi] === 0) return;
    let X = originX, Y = originY;
    const srcType = st.liquidType[oi];
    const originWall = st.wall[oi];
    let type = srcType;   // b：可变类型（下落越线转换后落点/配对判定用它）
    let liquid = st.liquid[oi];
    st.liquid[oi] = 0;
    let flag1 = true;
    for (;;) {
      // 1) 垂直下落：下方空且可通行就一直落（Liquid.cs:121-130）
      let flag2 = false;
      while (Y < st.h - 5 && st.liquid[this.idx(X, Y + 1)] === 0 && !this.blocksLiquid(X, Y + 1)) {
        Y++;
        flag2 = true;
        flag1 = false;
      }
      // Liquid.cs:177-190：生成/读档期且本轮有下落、源非蜜非微光 →
      //   越过 GenVars.waterLine 落点转岩浆（b=1/本仓 2）；地牢墙豁免回水（b=0/本仓 1）
      if (flag2 && this.isGeneratingOrLoadingWorld && srcType !== 3 && srcType !== 4) {
        if (this.genWaterLine !== null && Y > this.genWaterLine) type = 2;
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
        // 侧下方同类型未满 → 直接灌入（Liquid.cs:149-159；类型比较用转换后的 b）
        if (st.liquid[bi] !== 0 && st.liquid[bi] !== 255 && st.liquidType[bi] === type) {
          let t = 255 - st.liquid[bi];
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
      // 落点写回钳制到有效列（防 lastDir/lastStep 记录异常时把液体写出世界）
      X = Math.max(2, Math.min(st.w - 3, X + lastStep * lastDir));
      if (liquid !== 0 && dropped) Y++;
      else break;
    }
    // 3) 写回落点（Liquid.cs:204-205：类型用转换后的 b）
    const fi = this.idx(X, Y);
    st.liquid[fi] = liquid;
    st.liquidType[fi] = type;
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

  // ================= WaterCheck（WorldGen.cs:48955-49009） =================

  /** 全图自底向上重建活动列表：能流的/液面不齐的/岩浆旁有异种的都入列 */
  waterCheck() {
    const st = this.world.store;
    this.liquids.length = 0;
    this.numLiquid = 0;
    this.bufHead = 0; this.bufTail = 0; // 原版 WaterCheck 首行清 LiquidBuffer（WorldGen.cs:48959）
    this.checking.fill(0);
    for (let x = 1; x < st.w - 1; x++) {
      for (let y = st.h - 2; y > 0; y--) {
        const i = this.idx(x, y);
        if (st.liquid[i] === 0) continue;
        const t = st.type[i];
        if (t !== 0 && st.flags[i]) {
          if (this.solidNP[t] === 1) { st.liquid[i] = 0; continue; } // 实心格内液体清零（1456 无 379 系统特例；nactive 门）
          // 1456 WaterCheck L81172-81187：液体冲毁可死亡方块（走 KillTile）
          if (st.liquidType[i] === 2) { if (this.lavaDeathIds.has(t)) this.killTileAt(x, y); }
          else if (this.waterDeathIds.has(t)) this.killTileAt(x, y);
        }
        const id = i + st.w;
        const dq = st.liquid[id];
        if (!this.blocksLiquid(x, y + 1) && dq < 255) {
          if (dq > 250) st.liquid[id] = 255;
          else this.addWater(x, y);
        }
        const il = i - 1, ir = i + 1;
        if (!this.blocksLiquid(x - 1, y) && st.liquid[il] !== st.liquid[i]) this.addWater(x, y);
        else if (!this.blocksLiquid(x + 1, y) && st.liquid[ir] !== st.liquid[i]) this.addWater(x, y);
        if (st.liquidType[i] === 2) {
          const iu = i - st.w;
          if ((st.liquid[il] > 0 && st.liquidType[il] !== 2) ||
              (st.liquid[ir] > 0 && st.liquidType[ir] !== 2) ||
              (st.liquid[iu] > 0 && st.liquidType[iu] !== 2) ||
              (dq > 0 && st.liquidType[id] !== 2)) this.addWater(x, y);
        }
      }
    }
  }
}
