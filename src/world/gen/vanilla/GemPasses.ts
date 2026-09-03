// 宝石系统世界生成（1.4.5.6 1:1）：
// - GemCaves 宝石洞（WorldGen.cs:17528-17572 选点 + gemCave :9657-9673 选池 +
//   Spread.Gem :3565-3651 BFS：**只沿无墙空气腔扩散**（有墙格不扩散——神庙/房屋
//   天然免疫），实心 Gemmable 自身+四邻 randGemTile（19:1 石:宝），无墙空气格
//   墙=48+池选、1/2 暴露晶簇；空气+有墙格原版在 if(tile.active()) 内才转——零操作零掷）
// - ExposedGems 暴露晶簇（冰系 :20842-20872 目标格自身为冰块 147/161/162/224，
//   先掷 4 个 Next(1,4) 窗口再掷 Next(12) style、逐行雪界 snowMinX/MaxX；
//   地下 :20874-20890 单格空气排除地牢墙/墙27；琥珀 :20891-20913 墙 187/216 不对称窗口）
// - SpeleothemsAndGemTrees 钟乳石+宝石树（:22196-22282）：先钟乳石扫描
//   （地下 j∈[ws,h-20) 空格 1/5 → 上下邻石族清坡+PlaceTight；地表 k∈[5,ws)
//   冰上/沙上下 1/5 → PlaceTight），同列随后宝石树段（RNG 序：树掷在钟乳石掷之前）
import type { RNG } from '../../../core/rng';
import { LIQUID_TYPE, TileStore } from '../../TileStore';   // ★IIIII210 TileStore.COAT_BLOCK_MASK（钟乳石涂层继承）
import { TILE_BY_KEY, TILE_DEFS } from '../../../data/tiles';
import type { GenState } from './GenState';
import { idsByVanillaSheet } from './TileRunner';
import { vanGenSolidType } from './GenSolid';
import { growGemTree } from './TreePass';
import { checkStalactite } from './ShimmerPass';
import { genSquareTileFrame } from './FinalCleanupPass';   // SSSS：placeExposed 邻帧杀引擎

const STALACTITE_TILE = TILE_BY_KEY['v_165_cave_decos']!;
const LARVA_TILE = TILE_BY_KEY['v_231_larva'] ?? 0;

/** PlaceTight（cs:38329，spiders=false）**初始列语义**副本（#103 专用，2026-08-17
 *  s111 定罪）：原版 PlaceUncheckedStalactite 写**初始列**——冰族(147/161/163/164/200)
 *  与石质族(1/苔/117/25/203)分别以 0 基/54 基落格（**117/25/203 初始也在 54 族**），
 *  随后的 CheckStalactite→UpdateStalagtiteStyle 对失配族（117/25/203、冰 163/164/200、
 *  墙62 垂挂双）掷 1×Next(3) 才重写为材质专属列（216/270/324/594/540/648/108）。
 *  曾直写最终列 → 失配族 style==desired 永不掷 → s111 #103 -848 掷流漂移 + 14.6k
 *  格 165 双向差。ShimmerPass.placeTight 属禁区不动，本副本按 cs:38355-38667 逐族
 *  1:1（含 ground 分支无冰族 + 225 单格）。 */
function placeTightInitial(st: TileStore, rng: RNG, x: number, y: number): void {
  const yi = st.idx(x, y);
  const liq = st.liquid[yi];
  if (liq > 0 && st.liquidType[yi] === 4 /* LIQ_SHIMMER（+1 编码） */) return;
  if (st.flags[yi] && st.type[yi] === LARVA_TILE) return;
  const preferSmall = rng.int(0, 1) === 0;   // genRand.Next(2) == 0
  const variation = rng.int(0, 2);           // genRand.Next(3)
  placeUncheckedInitial(st, x, y, preferSmall, variation);
  if (st.flags[yi] && st.type[yi] === STALACTITE_TILE) checkStalactite(st, rng, x, y);
}

/** PlaceUncheckedStalactite（cs:38355-38667，spiders=false）初始列 1:1 */
function placeUncheckedInitial(st: TileStore, x: number, y: number, preferSmall: boolean, variation: number): void {
  if (!st.inBounds(x, y) || !st.inBounds(x, y + 1)) return;
  const sheetOf = (xx: number, yy: number): number => {
    if (!st.inBounds(xx, yy)) return -1;
    const i = st.idx(xx, yy);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  // ★IIIII210（2026-09-03）：PlaceUncheckedStalactite 涂层继承——vanilla 每支写格尾
  //   `CopyPaintAndCoating(other)`（cs:38735 起 31 处；Tile.cs:869-873 color+
  //   invisibleBlock/fullbrightBlock 两轴），**上锚族 other=Main.tile[x,y-1]**、
  //   **下锚族 other2=Main.tile[x,y+1]**（cs:38906）。缺拷贝 → 泡泡块（379 带亮位）
  //   锚上落位的钟乳石丢亮涂层 → DoExtraLiquidFinish fullbright 支（cs:1852）不触发
  //   → waterpark #105 t165 残 L=Y0>0×12（vanilla 清液而 JS 留）。
  let anchorY = y - 1;   // 上锚族（other=tile[x, y-1]）
  const put = (xx: number, yy: number, fx: number, fy: number): void => {
    if (!st.inBounds(xx, yy)) return;
    const i = st.idx(xx, yy);
    // ★SSSSSSS：ClearSlope 全语义（Tile.cs:158-163 = slope(0)+halfBrick(false)）——
    //   曾只清 slope：非活性格残留 half=1 被钟乳石继承
    //   （s22222 #103 H0>1×1 @(2012,610) / const #103 H0>1×2 @(3209,417) 实锤）。
    st.type[i] = STALACTITE_TILE; st.flags[i] = 1; st.slope[i] = 0; st.half[i] = 0;
    st.frameX[i] = fx; st.frameY[i] = fy;
    if (st.inBounds(xx, anchorY)) {
      const ai = st.idx(xx, anchorY);
      st.paint[i] = st.paint[ai];
      st.coat[i] = (st.coat[i] & ~TileStore.COAT_BLOCK_MASK) | (st.coat[ai] & TileStore.COAT_BLOCK_MASK);
    }
  };
  if (solidTileAt(st, x, y - 1) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y + 1)]) {
    const above = sheetOf(x, y - 1);
    if (above === 147 || above === 161 || above === 163 || above === 164 || above === 200) {
      if (preferSmall) put(x, y, variation * 18, 72);
      else { put(x, y, variation * 18, 0); put(x, y + 1, variation * 18, 18); }
    }
    if (above === 1 || TILE_MOSS.has(above) || above === 117 || above === 25 || above === 203) {
      if (preferSmall) put(x, y, 54 + variation * 18, 72);
      else { put(x, y, 54 + variation * 18, 0); put(x, y + 1, 54 + variation * 18, 18); }
    }
    if (above === 225) put(x, y, 162 + variation * 18, 72);
    if (above === 396 || above === 397) {
      if (preferSmall) put(x, y, 378 + variation * 18, 72);
      else { put(x, y, 378 + variation * 18, 0); put(x, y + 1, 378 + variation * 18, 18); }
    }
    if (above === 368) {
      if (preferSmall) put(x, y, 432 + variation * 18, 72);
      else { put(x, y, 432 + variation * 18, 0); put(x, y + 1, 432 + variation * 18, 18); }
    }
    if (above === 367) {
      if (preferSmall) put(x, y, 486 + variation * 18, 72);
      else { put(x, y, 486 + variation * 18, 0); put(x, y + 1, 486 + variation * 18, 18); }
    }
    return;
  }
  if (!solidTileAt(st, x, y + 1) || st.flags[st.idx(x, y)] || st.flags[st.idx(x, y - 1)]) return;
  anchorY = y + 1;   // 下锚族（other2=tile[x, y+1]，vanilla cs:38906）
  const below = sheetOf(x, y + 1);
  if (below === 1 || TILE_MOSS.has(below) || below === 117 || below === 25 || below === 203) {
    if (preferSmall) put(x, y, 54 + variation * 18, 90);
    else { put(x, y - 1, 54 + variation * 18, 36); put(x, y, 54 + variation * 18, 54); }
  }
  if (below === 225) put(x, y, 162 + variation * 18, 90);
  if (below === 396 || below === 397) {
    if (preferSmall) put(x, y, 378 + variation * 18, 90);
    else { put(x, y - 1, 378 + variation * 18, 36); put(x, y, 378 + variation * 18, 54); }
  }
  if (below === 368) {
    if (preferSmall) put(x, y, 432 + variation * 18, 90);
    else { put(x, y - 1, 432 + variation * 18, 36); put(x, y, 432 + variation * 18, 54); }
  }
  if (below === 367) {
    if (preferSmall) put(x, y, 486 + variation * 18, 90);
    else { put(x, y - 1, 486 + variation * 18, 36); put(x, y, 486 + variation * 18, 54); }
  }
}

const EXPOSED = TILE_BY_KEY['v_178_gems']!;   // tile 178
const STONE = TILE_BY_KEY['stone']!;
/** Gemmable（WorldGen.cs:3762-3769）：0/1/40/59/60/70/147/161。
 *  ★0（泥土）也是 Gemmable：谓词 `type!=0&&type!=1&&…` 对 type==0 短路为假 →
 *  直接落到 return true——洞腔内泥土与石头同概率被 randGemTile 替换，曾漏 0 */
const GEMMABLE = idsByVanillaSheet(0, 1, 40, 59, 60, 70, 147, 161);
/** 冰系落脚（:20846）：雪砖/冰/薄冰/雪 147/161/162/224 */
const ICE_FLOOR = idsByVanillaSheet(147, 161, 162, 224);
/** countTiles 的 ice 计数只认 147/161（nextCount cs:9542：不含 162/224） */
const ICE_COUNT = idsByVanillaSheet(147, 161);
/** 宝石墙（WallID.cs:165-175）：AmethystUnsafe=48 … DiamondUnsafe=53（=48+序号）。
 *  序号 0-5 = 紫/黄/蓝/翠/红/钻（与 randGem/暴露晶簇 style 同序） */
const GEM_WALL_BASE = 48;
/** 宝石矿 tile 内部 id（序号同上） */
const GEM_TILES = ['gem_amethyst', 'gem_topaz', 'gem_sapphire', 'gem_emerald', 'gem_ruby', 'gem_diamond']
  .map((k) => TILE_BY_KEY[k]!);
/** 地牢墙（Main.wallDungeon）：7/8/9 + 94-99 */
const WALL_DUNGEON = new Set([7, 8, 9, 94, 95, 96, 97, 98, 99]);
/** 内部 tile id → 原版 sheet id */
const SHEET = new Int16Array(TILE_DEFS.length).fill(-1);
for (let i = 0; i < TILE_DEFS.length; i++) {
  const s = TILE_DEFS[i]?.vanilla?.sheet;
  if (typeof s === 'number') SHEET[i] = s;
}
/** 钟乳石清坡的"石族"（cs:22244-22265：1/147/161/25/203 + tileStone + tileMoss）。
 *  Main.tileStone（Main.cs:7378/7902-7922/…）只标 63-68/130/131/566 */
const STONE_FAMILY = new Set([1, 147, 161, 25, 203, 63, 64, 65, 66, 67, 68, 130, 131, 566]);
/** Main.tileMoss（按 sheet id） */
const TILE_MOSS = new Set([182, 180, 179, 381, 183, 181, 534, 536, 539, 625, 627]);

/** 暴露晶簇 style（:20857-20859 的 Next(12) 映射：紫 3/黄 3/蓝 2/翠 2/红 1/钻 1） */
function randGemStyle(rng: RNG): number {
  const r = rng.nextInt(12);
  if (r < 3) return 0;
  if (r < 6) return 1;
  if (r < 8) return 2;
  if (r < 10) return 3;
  if (r < 11) return 4;
  return 5;
}

// ---- PlaceTile(178) 锚定链（:59717-59725 + CheckAndAdjust :60338 + ValidAnchor :60321）----
// 原版 PlaceTile 的 num==178 分支：CheckAndAdjustMultiDirectionalTile 通过才放置
// （frameY=Next(3)*18 仅在成功时掷）——锚 = 四邻存在可贴的实心格。此前无条件直放 =
// 4763 vs 金标 816（5.8×）、悬空 774 vs 0（2026-08-12 用户标注"四处散布的宝石"）。
/** TileID.Sets.Boulders + type==10 门（:60324：巨石/门不可作锚） */
const ANCHOR_BANNED = idsByVanillaSheet(10, 138, 484, 664, 665, 711, 712, 713, 714, 715, 716);
/** type==380 特例（SolidTileAllowTopSlope cs:70325 的 type==380 旁路） */
const TYPE_380 = idsByVanillaSheet(380);

/** PlatformProperTopFrame（cs:70197-70209）：平台 frameX/PlatformFrameWidth()
 *  ∈[0,7]∪[12,16]∪[25,26] 视为"顶帧"。PlatformFrameWidth()=_data[19].
 *  CoordinateFullWidth（TileObjectData.cs:5112）=(16+2)×1=18——Tiles_19.png
 *  486px=27 帧×18px 实证。 */
function platformProperTopFrame(frameX: number): boolean {
  const n = Math.floor(frameX / 18);
  return (n >= 0 && n <= 7) || (n >= 12 && n <= 16) || (n >= 25 && n <= 26);
}

/** ValidAnchorForMultiDirectionalTile（:60321）：dir 0=上锚 1=下锚 2=左锚 3=右锚。
 *  生成期无 inActive；slope 原版编码（Tile.cs:320-350）：topSlope()=1|2、
 *  bottomSlope()=3|4——旧注释"1/2=底坡 3/4=顶坡"整体写反（代码同病，已一并纠正）；
 *  leftSlope()=2|4、rightSlope()=1|3（仓库原本即对）。 */
function validAnchor(st: TileStore, x: number, y: number, dir: 0 | 1 | 2 | 3): boolean {
  if (!st.inBounds(x, y)) return true; // Main.tile 索引器 null 防御 → true（随后 tileSolid 门拦截）
  const i = st.idx(x, y);
  const t = st.type[i];
  if (ANCHOR_BANNED.has(t)) return false;
  if (!st.flags[i]) return false;
  const d = TILE_DEFS[t];
  if (!d) return false;
  // ★OOOO：SolidTileAllow* 族读的是 Main.tileSolid=**生成期表**（G8 六族翻 false：
  // 190/225/226/481-483/659/484）——曾读静态 d.solid，地下/琥珀段（穿 226 蜥蜴砖、
  // 481-483 裂砖带）JS 多收锚 → 多放晶簇（#93 T178>0×273 主根因）；tileSolidTop/
  // 平台不翻表，d.platform 照用
  const solid = vanGenSolidType(t), platform = !!d.platform;
  const half = st.half[i] === 1, sl = st.slope[i];
  // ★G1：topSlope/bottomSlope 原来整体写反（旧 3|4/1|2）——Tile.cs:320-350 实为
  //   topSlope()=1|2、bottomSlope()=3|4，方向基带随之纠正
  const topSlope = sl === 1 || sl === 2, bottomSlope = sl === 3 || sl === 4;
  const leftSlope = sl === 2 || sl === 4, rightSlope = sl === 1 || sl === 3;
  if (dir === 0) {
    // SolidTileAllowTopSlope（cs:70325）：(tileSolid||380) && ((!平台&&!底坡)||(平台&&半砖))
    return (solid || TYPE_380.has(t)) && ((!platform && !bottomSlope) || (platform && half));
  }
  if (dir === 1) {
    // SolidTileAllowBottomSlope（cs:70211-70229）：(tileSolid||tileSolidTop近似平台) &&
    //  (!topSlope || (平台 && PlatformProperTopFrame(frameX))) && !半砖 && !inActive。
    //  ★G7：平台顶帧豁免曾缺失（只写 !topSlope 一刀切）——平台带顶坡时，frameX
    //  落在顶帧段仍可作下锚（cs:70223）
    return (solid || platform)
      && (!topSlope || (platform && platformProperTopFrame(st.frameX[i]))) && !half;
  }
  if (dir === 2) {
    // SolidTileAllowLeftSlope：tileSolid && !半砖 && !右坡 && !平台
    return solid && !half && !rightSlope && !platform;
  }
  // dir 3：SolidTileAllowRightSlope 镜像
  return solid && !half && !leftSlope && !platform;
}

/** CheckAndAdjustMultiDirectionalTile（:60338）：下>左>右>上优先，锚类型须 tileSolid&&!tileSolidTop。
 *  返回 newFrameDirection（0=下 1=上 2=左 3=右）——PlaceTile 178 分支本身丢弃它，
 *  但紧随的 SquareTileFrame → TileFrame case 178（:85844-85882）按它重写
 *  frameY = 方向基带 + 变体（基带 下0/上54/左108/右162）★此前漏移植 TileFrame 178
 *  → 全部 178 永远落地帧（0/18/36），侧锚/顶锚宝石渲染成悬空晶簇 */
function checkMultiDirAnchor(st: TileStore, i: number, j: number): number {
  const belowOk = validAnchor(st, i, j + 1, 1);
  const leftOk = validAnchor(st, i - 1, j, 2);
  const rightOk = validAnchor(st, i + 1, j, 3);
  const aboveOk = validAnchor(st, i, j - 1, 0);
  const solidNonTop = (x: number, y: number): boolean => {
    if (!st.inBounds(x, y)) return false;
    const k = st.idx(x, y);
    const d = TILE_DEFS[st.type[k]];
    return !!d && vanGenSolidType(st.type[k]) && !d.platform;   // 生成期 tileSolid（同上）
  };
  if (belowOk && solidNonTop(i, j + 1)) return 0;
  if (leftOk && solidNonTop(i - 1, j)) return 2;
  if (rightOk && solidNonTop(i + 1, j)) return 3;
  if (aboveOk && solidNonTop(i, j - 1)) return 1;
  return -1;
}

/** 放 1 格暴露晶簇（= PlaceTile 178 分支 + 两连 SquareTileFrame，掷骰序 1:1）：
 *  ① PlaceTile（cs:59717-59725）：CheckAndAdjust 通过才放置（失败不放置不掷骰），
 *     frameX=style*18、frameY=Next(3)*18（roll1）；
 *  ②③ cs:59724 显式 + cs:60275-60281 成功尾 `if (tile.active())` 两连 SquareTileFrame
 *     （cs:80924 列主序、中心第 5 位 resetFrame=true）：中心 178 是 tileFrameImportant
 *     （Main.cs:7362）→ TileFrameImportant case 178（cs:85843-85882）——CheckAndAdjust
 *     失败 KillTile；成功掷 num21=Next(3)*18（roll2/roll3）+ 带外基带覆写（roll3 时
 *     帧已在带内 → no-write 纯幽灵掷，OOOO 定谳）。八邻（resetFrame=false）走帧杀
 *     引擎级联（165/485 等锚定装饰——SSSS/RRRR 接入）。
 *  ★LLLLL（2026-08-19）：roll2/roll3 与方向基带覆写改由引擎 frame178Sweep（UUUU
 *    落地）产出——手写镜像系引擎 case 178 上线前的补偿，其保留=每颗宝石 +2 幽灵掷
 *    （UUUU 引擎上线后 #64 Gem_Caves 金标基座重放 A=317/T=953/W=2763 全站漂移、
 *    首差 (1969,592)，曾被误记"并行在途漂移带"）。尾帧以中心仍 active 为门（首帧
 *    帧杀成功则 vanilla 跳过尾帧，cs:60275）。 */
export function placeExposed(st: TileStore, rng: RNG, x: number, y: number, style: number): void {
  // PlaceTile 通用前置清（cs:59500 !active→Clear(Tile|TilePaint|Slope)，178 非液体
  // 拒绝表族故必达）：type/帧/半砖/坡/油漆归零——放置失败也清（OOOO #77 'i0' 同源）。
  // ★SSSS：#93 残 4 格 S0>1/S0>4 = 宝石落在带坡位的非活跃格，vanilla 清坡 JS 曾
  // 保留（(2516,480)/(3230,579)/(2648,699)/(4149,857) 实证）。
  const pi = st.idx(x, y);
  if (!st.flags[pi]) {
    st.type[pi] = 0; st.frameX[pi] = 0; st.frameY[pi] = 0;
    st.half[pi] = 0; st.slope[pi] = 0; st.paint[pi] = 0;
  }
  if (checkMultiDirAnchor(st, x, y) < 0) return;   // CheckAndAdjust 失败：不放置、不掷骰
  const roll1 = rng.nextInt(3) * 18;               // ① cs:59724
  st.setTile(x, y, EXPOSED, style * 18, roll1);
  // ② cs:59724 显式 SquareTileFrame：列主序八邻（帧杀级联）+ 中心（引擎 roll2 +
  //    CheckAndAdjust 方向基带覆写——frame178Sweep）。
  genSquareTileFrame(st, rng, x, y);
  // ③ cs:60281 成功尾 SquareTileFrame（`if (tile.active())` 门——首帧中心被杀则
  //    跳过）：八邻再访（首访击杀后二访级联复核——邻堆连杀/苔藓芽重掷语义，同
  //    PilesPass 双尾帧口径）+ 中心 roll3（带内 no-write 幽灵掷）。
  if (st.flags[pi]) genSquareTileFrame(st, rng, x, y);
}

// ============ GemCaves 宝石洞（:17528-17572 + gemCave + Spread.Gem 1:1） ============
/** Main.tileSolidTop（Main.cs:6764+ 全 86 项，U/EEEE 批同表副本——不 import 防耦合） */
const SOLID_TOP = new Set([14, 16, 18, 19, 87, 88, 101, 114, 134, 239, 275, 276, 277, 278, 279, 280, 281,
  285, 286, 296, 297, 298, 299, 309, 310, 339, 358, 359, 361, 362, 363, 364, 376, 380, 391, 392, 393, 394,
  405, 413, 414, 427, 469, 532, 533, 538, 542, 544, 550, 551, 553, 554, 555, 556, 558, 559, 582, 599, 600,
  601, 602, 603, 604, 605, 606, 607, 608, 609, 610, 611, 612, 619, 629, 632, 640, 643, 644, 645, 710]);
/** WorldGen.SolidTile（cs:70155-70172）1:1：active && 生成期 tileSolid && !tileSolidTop &&
 *  !halfBrick && slope==0 && !inActive；越界走 catch → false。
 *  ★G8（2026-08-18 IIII 批）：实心源必须用生成期 Main.tileSolid（vanGenSolidType）——
 *  静态 TILE_DEFS.solid 在本槽位与生成期表有 190 荧光蘑菇块/225 蜂巢块/226 蜥蜴砖/
 *  481-483 裂砖/659 以太块/484 仙人掌 六族差（UndergroundHouses 尾 cs:17220-23 等翻
 *  false），countTiles/Spread.Gem 曾以静态表把"原版可穿"的薄墙当实心 → 洪泛连通域
 *  破碎：JS 拒 vanilla 收（腔被割裂）或 JS 收 vanilla 拒（腔局部被困）。#64 首差即
 *  site#1 (1765,823) 荧光蘑菇块墙误挡——site#0 八通道逐位全对（流同源）而 site#1
 *  起整片错位实证。
 *  ★G4（旧案）：SOLID_LUT 只查 def.solid 丢 half/slope/solidTop 的历史教训保持。 */
function solidTileAt(st: TileStore, x: number, y: number): boolean {
  if (!st.inBounds(x, y)) return false;      // 索引越界 → catch → false（cs:70177）
  const i = st.idx(x, y);
  const t = st.type[i]!;
  return st.flags[i] !== 0 && vanGenSolidType(t) && !SOLID_TOP.has(SHEET[t] ?? -1)
    && st.half[i] === 0 && st.slope[i] === 0 && ((st.wire[i]! >>> 5) & 1) === 0;
}

export function runGemCavesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const g0 = globalThis as { __swGcCap?: (site: number, sx: number, sy: number, tries: number, x: number, y: number, air: number, lava: number, ice: number, rock: number) => void };
  // 裸 double 比较（cs:17534：`for i < w*0.003`）——不取整，12.6 也进 13 次。
  // ★R13-10（2026-08-24）：tenth ×1.5（cs:17551-17554）；starGame 倍率
  //  `×starGameMath(0.2)`=1.0+min(1,hit/200)×0.2（Main.cs:63791）是玩家点星交互量、
  //  生成期零击=1.0，非种子确定量不建模（zenith 域）。曾缺 tenth 档 → 十周年宝石洞少 1/3。
  const num = st.w * 0.003 * (gs.seedFlags?.tenthAnniversary ? 1.5 : 1);
  // nextCount（WorldGen.cs:9506-9581）：洪泛连通空气腔；wall!=0 即封顶；lavaOk=false
  // 时岩浆格 lavaCount++ 且立即封顶（含空气格岩浆）；ice 只认 147/161
  // ★零风险优化(2026-08-13):原 Set<number>+元组数组 → 平坦 Int32Array 栈 +
  // Uint8Array seen(visited 列表局部清除)。★R13-11 备案（2026-08-24）：本实现
  // 对**全部**访格（含实心）去重——实心格只计一次；原版 nextCount 的 CountedTiles.Add
  // 只在 !SolidTile 支内（cs:9581），实心格被 k 个空气邻格推入时重复访问、rock/ice
  // 计数器重复累加 k 次；且本栈式 DFS 出序 (y+1)(y-1)(x+1)(x-1) 与原版递归序
  // (x-1)(x+1)(y-1)(y+1) 相反（头注旧称"逐点保持"不准确）。不改的理由：本消费点
  // 只读 air∈[50,300)/lava==0/ice==0/rock>0 四个零阶谓词——air 计数两语义恒同
  // （空气格两边都去重），lava 格即返，rock/ice 只辨零/非零——accept/reject 逐点
  // 不变。若未来新消费点依赖 rock/ice 的**计数值**，须改回原版"实心可重复计数"
  // 语义（CaveWallsPass 同原语即原版语义，勿互搬）。
  const seenArr = new Uint8Array(st.w * st.h);
  const visited: number[] = [];
  const stackX = new Int32Array(4096);
  const stackY = new Int32Array(4096);
  const countTiles = (sx: number, sy: number): { air: number; lava: number; ice: number; rock: number } => {
    let air = 0, lava = 0, ice = 0, rock = 0;
    let sp = 0;
    stackX[sp] = sx; stackY[sp] = sy; sp++;
    while (sp > 0) {
      if (air >= 300) break;                                  // numTileCount >= maxTileCount(300)
      sp--;
      const x = stackX[sp], y = stackY[sp];
      if (x <= 1 || x >= st.w - 1 || y <= 1 || y >= st.h - 1) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      const ii = st.idx(x, y);
      if (seenArr[ii]) continue;
      seenArr[ii] = 1;
      visited.push(ii);
      if (st.wall[ii] === 244) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.SHIMMER) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      if (st.wall[ii] !== 0) {
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };                  // jungle=false
      }
      if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.LAVA) {
        lava++;
        for (const v of visited) seenArr[v] = 0;
        visited.length = 0;
        return { air: 300, lava, ice, rock };
      }
      if (st.flags[ii]) { // 实心：只计数不扩散
        if (ICE_COUNT.has(st.type[ii])) ice++;
        else if (st.type[ii] === STONE) rock++;
      }
      if (!solidTileAt(st, x, y)) {           // cs:9584 !SolidTile(x,y) → 计数+扩散
        air++;
        // 四邻入栈(与原 push 顺序一致,pop 取尾 = 下邻先访)。
        // 栈深上界 = 4×300(air≤300,超即 break,仅 air 格入栈)+1 < 4096,无需增长
        stackX[sp] = x - 1; stackY[sp] = y; sp++;
        stackX[sp] = x + 1; stackY[sp] = y; sp++;
        stackX[sp] = x; stackY[sp] = y - 1; sp++;
        stackX[sp] = x; stackY[sp] = y + 1; sp++;
      }
    }
    for (const v of visited) seenArr[v] = 0;
    visited.length = 0;
    return { air, lava, ice, rock };
  };
  for (let i = 0; i < num; i++) {
    // 选点（1457 cs:17563-17579；1458 同号）：x=Next(200,w-200)（:17563）后
    // y=Next(rock+30,h-230)（:17564）**先掷**，remix 下再补掷 y=Next(ws+30,rock-30)
    // （:17567）**覆写**——即 remix 每 pick 恒耗 3 骰（x+被弃 y+remix y），被弃 y 不是
    // 死分支是活掷（x86 taglog 实证：49 pick×3=147 全 lambda 帧，cave#1 于 roll148 起）。
    // 曾只掷 2 骰 → 每 pick 少 1 骰全 pass 流错位 871 骰（JS 20,382 vs x86 体 21,253），
    // 世界面=T178 族全站漂移。
    // ★IIII180：remix 三骰结构修复（上盖=R13-10 旧注「初选与重试同式」的 2 骰建模作废）。
    // 重试上限（:17570 `while (bad && num2<1000)`，重试掷 ：17573-17577）：num2 计**重试
    // 数**，P0 免计——总 pick 上限 1001（P0..P1000）；P1000 恒耗骰但 `if (num2<1000)`
    // 门（:17579）永不受理（收尾幻骰）。曾 `tries<1000` 少一档（满拒世界 P1000 幻骰缺）。
    const remixY = !!gs.seedFlags?.remix;
    let sx = -1, sy = -1;
    for (let tries = 0; tries <= 1000; tries++) {
      const x = rng.nextIntRange(200, st.w - 200);
      const y = remixY
        ? (rng.nextIntRange(gs.rockLevel + 30, st.h - 230),   // 被弃 y（活掷,cs:17559-17561）
          rng.nextIntRange(gs.worldSurface + 30, gs.rockLevel - 30))
        : rng.nextIntRange(gs.rockLevel + 30, st.h - 230);
      const c = countTiles(x, y);
      g0.__swGcCap?.(i, x, y, tries, x, y, c.air, c.lava, c.ice, c.rock);
      if (tries < 1000 && c.air >= 50 && c.air < 300 && c.lava === 0 && c.ice === 0 && c.rock > 0) { sx = x; sy = y; break; }
    }
    if (sx < 0) continue;
    // 选池（gemCave :9657-9673）：强制 1 种 + 各 1/6 追加（1~7 种）
    const gemOn = new Set<number>([rng.nextInt(6)]);
    for (let k = 0; k < 6; k++) if (rng.nextInt(6) === 0) gemOn.add(k);
    const randGem = () => { let n = rng.nextInt(6); while (!gemOn.has(n)) n = rng.nextInt(6); return n; };
    // randGemTile（:9685-9700）：19/20 石头，1/20 池内宝石
    const randGemTileId = () => (rng.nextInt(20) !== 0 ? STONE : GEM_TILES[randGem()]);
    // Spread.Gem（:3565-3651）1:1 BFS：
    //  实心格（或有墙空气格）→ 不扩散；仅 active 且 Gemmable 时自身+四邻转 randGemTile
    //  （空气+有墙格：if(tile.active()) 内零操作零掷，cs:3599-3619）；
    //  无墙空气格 → 墙 48+池选、1/2 暴露晶簇、四邻入队（神庙/房屋墙阻隔，天然不侵入）
    const seen = new Set<number>();
    let frontier: Array<[number, number]> = [[sx, sy]];
    while (frontier.length) {
      const next: Array<[number, number]> = [];
      for (const [x, y] of frontier) {
        // InWorld(x,y,1)（cs:3572：x<1||x>=w-1||y<1||y>=h-1 才出界——x==1 合法；
        //  countTiles 的 nextCount 边界是 x<=1（cs:9513），两处口径不同勿混）
        if (x < 1 || x >= st.w - 1 || y < 1 || y >= st.h - 1) continue;
        const ii = st.idx(x, y);
        // ★原版无处理时去重（cs:3605 hashSet.Add 幂等，无 Contains 短路）：同波双亲
        // 推入的重复点会被二次处理——纯空气格二访因首访已写 wall≠0 落入实心支
        // !active 早退（零掷 no-op）；但 active 格二访（含实心 Gemmable 与有墙非实心
        // 植物）会再次消费 randGemTile/四邻转换掷——曾 `if (seen.has(ii)) continue`
        // 吞掉这些掷，RNG 流分叉（#64 首差 W(3805,614) 族 2026-08-18）。
        seen.add(ii);
        if (solidTileAt(st, x, y) || st.wall[ii] !== 0) { // cs:3597 SolidTile||wall!=0
          if (!st.flags[ii]) continue;                    // 空气+有墙：零操作零掷
          if (GEMMABLE.has(st.type[ii])) st.type[ii] = randGemTileId();
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const nx = x + dx, ny = y + dy;
            if (!st.inBounds(nx, ny)) continue;
            const ni = st.idx(nx, ny);
            if (st.flags[ni] && GEMMABLE.has(st.type[ni])) st.type[ni] = randGemTileId();
          }
        } else {
          st.wall[ii] = GEM_WALL_BASE + randGem();
          // cs:3604：放置前另有 !tile.active() 门（&& 左求值，active 时不掷骰）——
          // 分支谓词改 SolidTile 后，半砖/坡/平台等 active 非实心格也会落到本分支，
          // 此门不可省（否则会覆盖活性格）
          if (!st.flags[ii] && rng.nextInt(2) === 0) placeExposed(st, rng, x, y, randGem());
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
            const ni = st.idx(x + dx, y + dy);
            if (!seen.has(ni)) next.push([x + dx, y + dy]);
          }
        }
      }
      frontier = next;
    }
  }
}

// ============ ExposedGems 暴露晶簇（:20842-20913） ============
// ★原版是【两个独立 GenPass】：ExposedGemsInIceBiome(:20842-20852+) 与
//   ExposedGemsUnderground(:20874-20913)——RunPass 每 pass 前重播种子
//   （WorldGenerator.cs:497），地下/琥珀段从【新流】起掷。曾合并为一函数一气流
//   → #93 掷流错位（WWW 批 2026-08-18 拆分；WorldGen.vanillaGems 槽内两调重播）。
export function runExposedGemsIcePass(st: TileStore, rng: RNG, gs: GenState): void {
  // 冰系（:20842-20872）：y∈[(ws+rl)/2, lavaLine)、x=逐行雪界 snowMinX/MaxX[y]；
  // 目标格自身为冰块（147/161/162/224）→ 先掷 4 个 Next(1,4) 窗口再掷 Next(12) style
  // （cs:20855-20859 掷序），周边不对称窗口的空气格放晶簇
  for (let i = 0; i < st.w * 0.25; i++) {
    // ★IIIII196（2026-09-03）REMIX #92 定罪修复：y 域 remix 支整缺（1457 cs:20851，
    //  1458 同号）`(!remix) ? Next((int)(ws+rock)/2, lavaLine) : Next((int)ws, maxY-300)`
    //  ——remix 冰晶簇全假地表带（ws..h-300）受理。x 掷仍无条件（snowMinX/MaxX 未填带
    //  读默认,两侧同构）。
    const y = gs.seedFlags.remix
      ? rng.nextIntRange(Math.floor(gs.worldSurface), st.h - 300)
      : rng.nextIntRange(Math.floor((gs.worldSurface + gs.rockLevel) / 2), gs.lavaLine);
    if (y < 0 || y >= st.h) continue;
    const minX = gs.snowMinX?.[y] ?? gs.snowOriginLeft;
    const maxX = gs.snowMaxX?.[y] ?? gs.snowOriginRight;
    // cs:20851：x 掷骰**无条件**（snowMinX/MaxX 只填到 lavaLine-140，未填带读默认 0
    // 仍掷，Next(0,0)=0）——旧 `maxX<=minX continue` 吞掉必掷一骰，RNG 流分叉
    const x = rng.nextIntRange(minX, maxX);
    const ii = st.idx(x, y);
    if (!st.flags[ii] || !ICE_FLOOR.has(st.type[ii])) continue;
    const wl = 1 + rng.nextInt(3);
    const wr = 1 + rng.nextInt(3);
    const wt = 1 + rng.nextInt(3);
    const wb = 1 + rng.nextInt(3);
    const style = randGemStyle(rng);
    for (let jx = x - wl; jx < x + wr; jx++) {
      for (let jy = y - wt; jy < y + wb; jy++) {
        if (jx < 40 || jx >= st.w - 40 || jy < 40 || jy >= st.h - 40) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, rng, jx, jy, style);
      }
    }
  }
}

/** ExposedGemsUnderground（cs:20874-20913）独立 pass：地下单格 + 琥珀簇两段 */
export function runExposedGemsUndergroundPass(st: TileStore, rng: RNG, gs: GenState): void {
  // 地下（:20874-20890）：w 次，x∈[20,w-20)、y∈[rockLevel, h-300)，空气+无岩浆+
  // 非地牢墙且墙≠27 → 单格（style=Next(12) 权重）——ExposedGemsUnderground 独立 pass
  // （新流起掷，与冰系段无关）
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 20);
    const y = rng.nextIntRange(gs.rockLevel, st.h - 300);
    if (y < 0) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.LAVA) continue; // anyLava（+1 编码）
    const wl = st.wall[ii];
    if (wl === 27 || WALL_DUNGEON.has(wl)) continue;
    placeExposed(st, rng, x, y, randGemStyle(rng));
  }
  // 琥珀（:20891-20913）：w 次，y∈[ws, h-300)，目标须空气+无岩浆+墙 187/216 →
  // 不对称窗口（各 1-3）的空气格放 style=6 晶簇。
  // 目标的 !active+!anyLava 门（cs:20901）曾缺失——实心沙岩也带 187/216 墙，
  // 命中率高一个数量级 → 琥珀簇 13× 金标（2026-08-12 用户标注）。
  for (let i = 0; i < st.w; i++) {
    const x = rng.nextIntRange(20, st.w - 20);
    const y = rng.nextIntRange(gs.worldSurface, st.h - 300);
    if (y < 0) continue;
    const ii = st.idx(x, y);
    if (st.flags[ii]) continue;
    if (st.liquid[ii] > 0 && st.liquidType[ii] === LIQUID_TYPE.LAVA) continue; // anyLava（+1 编码，勿写 0）
    const wl = st.wall[ii];
    if (wl !== 187 && wl !== 216) continue;
    const n14 = () => 1 + rng.nextInt(3);
    const al = n14(), ar = n14(), at = n14(), ab = n14();
    for (let jx = x - al; jx < x + ar; jx++) {
      for (let jy = y - at; jy < y + ab; jy++) {
        if (!st.inBounds(jx, jy)) continue;
        const ji = st.idx(jx, jy);
        if (!st.flags[ji]) placeExposed(st, rng, jx, jy, 6);
      }
    }
  }
}

/** 旧整段入口（冰+地下+琥珀一气流）——保留仅为兼容探针引用；管线走拆分两段+槽内重播 */
export function runExposedGemsPass(st: TileStore, rng: RNG, gs: GenState): void {
  runExposedGemsIcePass(st, rng, gs);
  runExposedGemsUndergroundPass(st, rng, gs);
}

// ============ SpeleothemsAndGemTrees 钟乳石+宝石树（:22196-22282） ============
export function runGemTreesPass(st: TileStore, rng: RNG, gs: GenState): void {
  const g0 = globalThis as { __swSpCap?: (gs: GenState, st: TileStore) => void; __swScanCap?: (x: number, y: number, phase: number) => void };
  try { g0.__swSpCap?.(gs, st); } catch { /* probe */ }
  const f = gs.seedFlags ?? {};
  const alwaysTry = !!(f.tenthAnniversary || f.drunkWorld);
  const oceanDepths = (x: number, y: number): boolean => {
    if (y > (gs.worldSurface + gs.rockLevel) / 2 + 40) return false;
    return x < gs.beachDistance || x > st.w - gs.beachDistance;
  };
  const sheetActive = (x: number, y: number): number => {
    if (!st.inBounds(x, y)) return -1;
    const i = st.idx(x, y);
    return st.flags[i] ? SHEET[st.type[i]] : -1;
  };
  const rockFamily = (s: number): boolean =>
    STONE_FAMILY.has(s) || TILE_MOSS.has(s);
  for (let x = 20; x < st.w - 20; x++) {
    for (let y = Math.floor(gs.worldSurface); y < st.h - 20; y++) {
      g0.__swScanCap?.(x, y, 0);
      // 宝石树段（:22208-22237）：掷骰在液体判定之前（短路与求值序 1:1）
      const treeRoll = alwaysTry ? true : rng.nextInt(5) === 0;
      if (treeRoll && st.liquid[st.idx(x, y - 1)] === 0) {
        const treeType = idsByVanillaSheet(583 + rng.nextInt(7)).values().next().value ?? 0;
        if (treeType) growGemTree(st, rng, x, y, treeType, 0, false, gs);
      }
      // 地下钟乳石（:22239-22262）：非海洋、空格、1/5 → 上下邻石族清坡 + PlaceTight
      //   ★AAAAAA：族判定读**裸 type**（ghost 含）——原版 `Main.tile[i, j±1].type == 1
      //   ||…` 不查 active()，非活性格的残留 type（(570,437) ghost s1 实证）也命中
      //   清坡；曾 sheetActive 只读活性 → 漏清 5 格 slope 残差（#103 尾差）。
      if (!oceanDepths(x, y) && !st.flags[st.idx(x, y)] && rng.nextInt(5) === 0) {
        const ghostSheet = (xx: number, yy: number): number => {
          if (!st.inBounds(xx, yy)) return -1;
          return SHEET[st.type[st.idx(xx, yy)]] ?? -1;
        };
        const above = ghostSheet(x, y - 1), below = ghostSheet(x, y + 1);
        if (rockFamily(above) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y + 1)]) {
          st.slope[st.idx(x, y - 1)] = 0;
        }
        if (rockFamily(below) && !st.flags[st.idx(x, y)] && !st.flags[st.idx(x, y - 1)]) {
          st.slope[st.idx(x, y + 1)] = 0;
        }
        placeTightInitial(st, rng, x, y);
      }
    }
    // 地表钟乳石（:22264-22278）：k∈[5, worldSurface)；冰上 147/161、沙 25/203 上/下
    for (let k = 5; k < gs.worldSurface; k++) {
      g0.__swScanCap?.(x, k, 1);
      const up = sheetActive(x, k - 1), down = sheetActive(x, k + 1);
      const clearAbove = () => {
        if (!st.flags[st.idx(x, k)] && !st.flags[st.idx(x, k + 1)]) st.slope[st.idx(x, k - 1)] = 0;
      };
      if ((up === 147 || up === 161) && rng.nextInt(5) === 0) {
        clearAbove();
        placeTightInitial(st, rng, x, k);
      }
      if ((up === 25 || up === 203) && rng.nextInt(5) === 0) {
        clearAbove();
        placeTightInitial(st, rng, x, k);
      }
      if ((down === 25 || down === 203) && rng.nextInt(5) === 0) {
        if (!st.flags[st.idx(x, k)] && !st.flags[st.idx(x, k - 1)]) st.slope[st.idx(x, k + 1)] = 0;
        placeTightInitial(st, rng, x, k);
      }
    }
  }
}

